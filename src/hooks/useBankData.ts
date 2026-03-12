import { useState, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import { SaleInvoice, PurchaseInvoice } from "./useInvoiceData";

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface MatchedInvoice {
  type: "vendita" | "acquisto";
  anno: number;
  numero: number;
}

export interface BankMovement {
  id: string;
  accountId: string;
  sourceFile: string;
  data: string;
  dataValuta: string;
  causale: string;
  descrizione: string;
  importo: number;
  saldo: number;
  cig: string;
  matchedInvoices: MatchedInvoice[];
  matchConfidence: "auto" | "manual" | "none";
  // Legacy compat - derived from matchedInvoices[0]
  matchedType: "vendita" | "acquisto" | "";
  matchedAnno: number;
  matchedNumero: number;
}

export interface Reconciliation {
  movementId: string;
  invoiceType: "vendita" | "acquisto";
  invoiceAnno: number;
  invoiceNumero: number;
}

const STORAGE_KEY = "bank-reconciliations";
const MOVEMENTS_KEY = "bank-movements";
const FILES_KEY = "bank-file-names";

function loadReconciliations(): Reconciliation[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveReconciliations(recs: Reconciliation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recs));
}

function extractCIG(text: string): string {
  if (!text) return "";
  const match = text.match(/CIG[:\s]*([A-Z0-9]{10})/i);
  return match ? match[1] : "";
}

// Extract possible invoice numbers from bank description
function extractInvoiceNumbers(text: string): number[] {
  if (!text) return [];
  const matches = text.match(/(?:fatt|ft|inv|doc|n)[.°:\s]*(\d{1,6})/gi);
  if (!matches) return [];
  return matches.map(m => {
    const num = m.match(/(\d+)/);
    return num ? parseInt(num[1], 10) : 0;
  }).filter(n => n > 0);
}

// Extract possible partita IVA from description
function extractPartitaIva(text: string): string {
  if (!text) return "";
  const match = text.match(/\b(\d{11})\b/);
  return match ? match[1] : "";
}

function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function isValidDateString(value: string): boolean {
  return /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/.test(value);
}

function parseDate(val: any): string {
  if (val == null || val === "") return "";

  if (val instanceof Date && !isNaN(val.getTime())) {
    return formatDate(val);
  }

  if (typeof val === "number" && val > 25000 && val < 70000) {
    const d = new Date((val - 25569) * 86400 * 1000);
    return formatDate(d);
  }

  const str = String(val).trim();
  if (!str) return "";

  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[3].padStart(2, "0")}/${iso[2].padStart(2, "0")}/${iso[1]}`;
  }

  const dmy = str.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (dmy) {
    const yy = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${dmy[1].padStart(2, "0")}/${dmy[2].padStart(2, "0")}/${yy}`;
  }

  return "";
}

function parseNum(val: any): number {
  if (val == null || val === "") return 0;
  if (typeof val === "number") return val;

  const raw = String(val).trim();
  if (!raw) return 0;

  const negative = raw.startsWith("-") || raw.endsWith("-") || (raw.startsWith("(") && raw.endsWith(")"));
  let s = raw.replace(/[€$\s]/g, "").replace(/[()]/g, "").replace(/^-/, "").replace(/-$/, "");

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandsSep = decimalSep === "," ? "." : ",";
    s = s.replace(new RegExp(`\\${thousandsSep}`, "g"), "").replace(decimalSep, ".");
  } else if (lastComma >= 0) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }

  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return negative ? -n : n;
}

function looksLikeAmount(val: any): boolean {
  if (typeof val === "number") return true;
  const s = String(val ?? "").trim();
  if (!s) return false;
  return /^\(?-?\d{1,3}([.\s]\d{3})*([,.]\d{2})?\)?-?$/.test(s) || /^\(?-?\d+([,.]\d{2})\)?-?$/.test(s);
}

function inferDescrizione(row: any[], cols: { data: number; dataValuta: number; causale: number; descrizione: number; dare: number; avere: number; importo: number; saldo: number }): string {
  const ignored = new Set([cols.data, cols.dataValuta, cols.causale, cols.descrizione, cols.dare, cols.avere, cols.importo, cols.saldo].filter((i) => i >= 0));
  return row
    .map((c) => String(c ?? "").trim())
    .filter((text, idx) => {
      if (!text) return false;
      if (ignored.has(idx)) return false;
      if (isValidDateString(parseDate(text))) return false;
      if (looksLikeAmount(text)) return false;
      return true;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function nameSimilarity(a: string, b: string): number {
  const na = normalise(a);
  const nb = normalise(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const wordsA = na.split(" ");
  const wordsB = nb.split(" ");
  const common = wordsA.filter((w) => wordsB.includes(w)).length;
  return common / Math.max(wordsA.length, wordsB.length);
}

// Try to detect columns from header row
function detectColumns(header: any[]): {
  data: number; dataValuta: number; causale: number; descrizione: number;
  dare: number; avere: number; importo: number; saldo: number;
} {
  const result = { data: -1, dataValuta: -1, causale: -1, descrizione: -1, dare: -1, avere: -1, importo: -1, saldo: -1 };
  for (let i = 0; i < header.length; i++) {
    const h = normalise(String(header[i] || ""));

    // Amount columns first
    if (h.includes("dare") || h.includes("addebit") || h.includes("uscit")) { result.dare = i; continue; }
    if (h.includes("avere") || h.includes("accredit") || h.includes("entrat")) { result.avere = i; continue; }

    // Date columns
    if (h.includes("data") && h.includes("valut")) { result.dataValuta = i; continue; }
    if ((h === "valuta" || h.startsWith("valuta ") || h.includes("data valuta")) && result.dataValuta === -1) { result.dataValuta = i; continue; }
    if ((h.includes("data operaz") || h.includes("data contab") || h === "data") && result.data === -1) { result.data = i; continue; }
    if ((h.includes("operaz") && result.data === -1)) { result.data = i; continue; }
    if (h.includes("data") && result.data === -1) { result.data = i; continue; }

    // Causale = bank code (short), Descrizione = full text description
    if (h === "causale" || h === "caus" || h === "tipo" || h === "tipo operazione" || h === "cod" || h === "codice") {
      result.causale = i; continue;
    }
    if ((h.includes("descri") || h.includes("dettaglio") || h.includes("beneficiari") || h.includes("ordinant")) && result.descrizione === -1) {
      result.descrizione = i; continue;
    }
    // "causale" in compound headers like "causale/descrizione" → treat as descrizione
    if (h.includes("causal") && result.causale === -1 && result.descrizione === -1) {
      result.causale = i; continue;
    }
    if ((h.includes("operazion") && !h.includes("data")) && result.descrizione === -1) {
      result.descrizione = i; continue;
    }

    if ((h.includes("import") || h.includes("ammontare") || h === "eur" || h === "euro") && !h.includes("iva")) { result.importo = i; continue; }
    if (h.includes("saldo")) { result.saldo = i; continue; }
  }
  return result;
}

async function parsePdfToRows(buffer: ArrayBuffer): Promise<any[][]> {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const allLines: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Collect all text items with coordinates
    const items: { x: number; y: number; str: string }[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      items.push({
        x: (item as any).transform[4],
        y: (item as any).transform[5],
        str: item.str,
      });
    }

    // Group by Y with tolerance (items within 3px are on the same row)
    const Y_TOLERANCE = 3;
    items.sort((a, b) => b.y - a.y); // descending Y
    const groups: { y: number; items: { x: number; str: string }[] }[] = [];
    for (const item of items) {
      const existing = groups.find((g) => Math.abs(g.y - item.y) <= Y_TOLERANCE);
      if (existing) {
        existing.items.push({ x: item.x, str: item.str });
      } else {
        groups.push({ y: item.y, items: [{ x: item.x, str: item.str }] });
      }
    }

    // Sort groups by Y descending (top of page first), items within by X
    groups.sort((a, b) => b.y - a.y);
    for (const g of groups) {
      g.items.sort((a, b) => a.x - b.x);
      allLines.push(g.items.map((i) => i.str.trim()).join("\t"));
    }
  }

  // Filter out page headers/footers before parsing
  const skipPatterns = [
    /pagina\s+\d+\s*(di|\/)\s*\d+/i,
    /\b[A-Z]{2}\d{2}[A-Z0-9]{10,27}\b/,  // IBAN
    /estratto\s+conto/i,
    /lista\s+movimenti/i,
  ];

  // Parse lines into rows by splitting on tabs
  const rows: any[][] = [];
  for (const line of allLines) {
    if (!line.trim()) continue;
    if (skipPatterns.some(p => p.test(line))) continue;
    const cells = line.split(/\t/).map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 2) {
      rows.push(cells);
    }
  }

  console.log("[PDF Parser] Extracted rows:", rows.length, "Sample:", rows.slice(0, 5));
  return rows;
}

function parseBank(rows: any[]): Omit<BankMovement, "matchedInvoices" | "matchedType" | "matchedAnno" | "matchedNumero" | "matchConfidence">[] {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i];
    if (!row) continue;
    const joined = row.map((c: any) => normalise(String(c || ""))).join(" ");
    if (joined.includes("data") && (joined.includes("descri") || joined.includes("causal") || joined.includes("import") || joined.includes("dare") || joined.includes("avere") || joined.includes("saldo"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1 && rows.length > 0) headerIdx = 0;

  const cols = detectColumns(rows[headerIdx] || []);
  console.log("[Bank Parser] Header at row:", headerIdx, "Columns:", cols, "Header:", rows[headerIdx]);
  const movements: Omit<BankMovement, "matchedInvoices" | "matchedType" | "matchedAnno" | "matchedNumero" | "matchConfidence">[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c: any) => c == null || String(c).trim() === "")) continue;

    const dateCandidates = r
      .map((cell: any, idx: number) => ({ idx, value: parseDate(cell) }))
      .filter((d: { idx: number; value: string }) => isValidDateString(d.value));

    const dataFromCol = cols.data >= 0 ? parseDate(r[cols.data]) : "";
    const valutaFromCol = cols.dataValuta >= 0 ? parseDate(r[cols.dataValuta]) : "";
    const dataOperazione = isValidDateString(dataFromCol) ? dataFromCol : (dateCandidates[0]?.value ?? "");
    const dataValuta = isValidDateString(valutaFromCol) ? valutaFromCol : (dateCandidates[1]?.value ?? "");

    // Causale = bank code (short identifier)
    let causale = cols.causale >= 0 ? String(r[cols.causale] ?? "").trim() : "";

    // Descrizione = full text description
    let descrizione = cols.descrizione >= 0 ? String(r[cols.descrizione] ?? "").trim() : "";

    // If no dedicated descrizione column, infer from remaining text columns
    if (!descrizione) {
      descrizione = inferDescrizione(r, cols);
    }

    // If we only have one text field detected as causale but it's long, it's likely the description
    if (!descrizione && causale.length > 20) {
      descrizione = causale;
      causale = "";
    }

    const fullText = `${causale} ${descrizione}`.trim();
    const fullTextLower = fullText.toLowerCase();
    const saldoPatterns = [
      "saldo iniziale", "saldo finale", "saldo al ", "saldo contabile", "saldo disponibile",
      "totale movimenti", "saldo precedente", "riporto", "saldo liquido",
    ];
    if (saldoPatterns.some((p) => fullTextLower.includes(p))) continue;

    if (!isValidDateString(dataOperazione)) {
      if (fullText && movements.length > 0) {
        const last = movements[movements.length - 1];
        last.descrizione = `${last.descrizione} ${fullText}`.replace(/\s+/g, " ").trim();
        last.cig = extractCIG(last.descrizione) || last.cig;
      }
      continue;
    }

    // --- Importo: dare = negative (uscita), avere = positive (entrata) ---
    let importo = 0;
    if (cols.dare >= 0 || cols.avere >= 0) {
      const dareRaw = cols.dare >= 0 ? r[cols.dare] : null;
      const avereRaw = cols.avere >= 0 ? r[cols.avere] : null;
      const dareVal = Math.abs(parseNum(dareRaw));
      const avereVal = Math.abs(parseNum(avereRaw));
      if (avereVal > 0) {
        importo = avereVal;  // entrata → positivo
      } else if (dareVal > 0) {
        importo = -dareVal;  // uscita → negativo
      }
    } else if (cols.importo >= 0) {
      importo = parseNum(r[cols.importo]);
    }

    // Fallback: scan for amounts in remaining cells
    if (importo === 0) {
      const excluded = new Set<number>(
        [cols.data, cols.dataValuta, cols.saldo, cols.causale, cols.descrizione].filter((idx) => idx >= 0)
      );
      dateCandidates.forEach((d: { idx: number; value: string }) => excluded.add(d.idx));

      const amountCandidates = r
        .map((cell: any, idx: number) => ({ idx, raw: cell, value: parseNum(cell) }))
        .filter((n: { idx: number; raw: any; value: number }) => !excluded.has(n.idx) && n.value !== 0 && looksLikeAmount(n.raw));

      if (amountCandidates.length >= 2) {
        // Two amount columns → likely dare/avere
        const first = amountCandidates[0].value;
        const second = amountCandidates[1].value;
        if (Math.abs(second) > 0) importo = Math.abs(second);
        else importo = -Math.abs(first);
      } else if (amountCandidates.length === 1) {
        importo = amountCandidates[0].value;
      }
    }

    if (importo === 0 && !fullText) continue;

    movements.push({
      id: `bank-${i}`,
      accountId: "",
      sourceFile: "",
      data: dataOperazione,
      dataValuta: dataValuta || dataOperazione,
      causale,
      descrizione: descrizione || causale,
      importo,
      saldo: cols.saldo >= 0 ? parseNum(r[cols.saldo]) : 0,
      cig: extractCIG(fullText),
    });
  }

  return movements;
}

// Compute a relevance score (0-100) for a movement-invoice pair
export function scoreMatch(
  m: { importo: number; descrizione: string; cig: string },
  inv: { totale: number; cig: string; numero: number; anno: number; partitaIva: string },
  name: string
): number {
  let score = 0;
  const absImporto = Math.abs(m.importo);

  // CIG match (strongest signal)
  if (m.cig && inv.cig && m.cig.toLowerCase() === inv.cig.toLowerCase()) {
    score += 40;
  }

  // Amount match with graduated tolerance
  const diff = Math.abs(inv.totale - absImporto);
  if (diff < 0.02) score += 30;
  else if (diff < 1) score += 25;
  else if (absImporto > 0 && diff < absImporto * 0.01) score += 20;
  else if (absImporto > 0 && diff < absImporto * 0.05) score += 10;

  // Invoice number in description
  const invNums = extractInvoiceNumbers(m.descrizione);
  if (invNums.includes(inv.numero)) score += 15;

  // Name similarity
  const ns = nameSimilarity(m.descrizione, name);
  score += Math.round(ns * 15);

  // Partita IVA match
  const descPiva = extractPartitaIva(m.descrizione);
  if (descPiva && inv.partitaIva && descPiva === inv.partitaIva) score += 10;

  return Math.min(score, 100);
}

function autoMatch(
  movements: Omit<BankMovement, "matchedInvoices" | "matchedType" | "matchedAnno" | "matchedNumero" | "matchConfidence">[],
  sales: SaleInvoice[],
  purchases: PurchaseInvoice[],
  manualRecs: Reconciliation[]
): BankMovement[] {
  const manualMap = new Map(manualRecs.map((r) => [r.movementId, r]));
  const usedSales = new Set<string>();
  const usedPurchases = new Set<string>();

  const scored = movements.map((m) => {
    const manual = manualMap.get(m.id);
    if (manual) {
      const key = `${manual.invoiceAnno}-${manual.invoiceNumero}`;
      if (manual.invoiceType === "vendita") usedSales.add(key);
      else usedPurchases.add(key);
      return {
        movement: m,
        bestType: manual.invoiceType as "vendita" | "acquisto",
        bestAnno: manual.invoiceAnno,
        bestNumero: manual.invoiceNumero,
        bestScore: 999,
        confidence: "manual" as const,
      };
    }

    let bestScore = 0;
    let bestType: "vendita" | "acquisto" = "vendita";
    let bestAnno = 0;
    let bestNumero = 0;

    if (m.importo >= 0) {
      for (const s of sales) {
        const sc = scoreMatch(m, s, s.cliente);
        if (sc > bestScore) { bestScore = sc; bestType = "vendita"; bestAnno = s.anno; bestNumero = s.numero; }
      }
    }
    if (m.importo <= 0) {
      for (const p of purchases) {
        const sc = scoreMatch(m, p, p.fornitore);
        if (sc > bestScore) { bestScore = sc; bestType = "acquisto"; bestAnno = p.anno; bestNumero = p.numero; }
      }
    }

    return { movement: m, bestType, bestAnno, bestNumero, bestScore, confidence: "none" as "none" | "auto" | "manual" };
  });

  const sortedIndices = scored
    .map((_, i) => i)
    .filter((i) => scored[i].confidence !== "manual")
    .sort((a, b) => scored[b].bestScore - scored[a].bestScore);

  const AUTO_THRESHOLD = 35;

  for (const idx of sortedIndices) {
    const s = scored[idx];
    if (s.bestScore < AUTO_THRESHOLD) continue;
    const key = `${s.bestAnno}-${s.bestNumero}`;
    const usedSet = s.bestType === "vendita" ? usedSales : usedPurchases;
    if (!usedSet.has(key)) {
      usedSet.add(key);
      scored[idx] = { ...s, confidence: "auto" as const };
    }
  }

  return scored.map((s) => ({
    ...s.movement,
    matchedType: s.confidence !== "none" ? s.bestType : ("" as const),
    matchedAnno: s.confidence !== "none" ? s.bestAnno : 0,
    matchedNumero: s.confidence !== "none" ? s.bestNumero : 0,
    matchConfidence: s.confidence,
  }));
}

function loadMovements(): Omit<BankMovement, "matchedInvoices" | "matchedType" | "matchedAnno" | "matchedNumero" | "matchConfidence">[] {
  try { return JSON.parse(localStorage.getItem(MOVEMENTS_KEY) || "[]"); } catch { return []; }
}
function saveMovements(m: Omit<BankMovement, "matchedInvoices" | "matchedType" | "matchedAnno" | "matchedNumero" | "matchConfidence">[]) {
  localStorage.setItem(MOVEMENTS_KEY, JSON.stringify(m));
}
function loadFileNames(): string[] {
  try { return JSON.parse(localStorage.getItem(FILES_KEY) || "[]"); } catch { return []; }
}
function saveFileNames(names: string[]) {
  localStorage.setItem(FILES_KEY, JSON.stringify(names));
}

export type RawMovement = Omit<BankMovement, "matchedInvoices" | "matchedType" | "matchedAnno" | "matchedNumero" | "matchConfidence">;

export interface DuplicateInfo {
  duplicates: RawMovement[];
  unique: RawMovement[];
  fileName: string;
}

export function useBankData(sales: SaleInvoice[], purchases: PurchaseInvoice[]) {
  const [rawMovements, setRawMovements] = useState(loadMovements);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>(loadReconciliations);
  const [loading, setLoading] = useState(false);
  const [fileNames, setFileNames] = useState<string[]>(loadFileNames);
  const [activeAccountId, setActiveAccountId] = useState<string>("default");
  const [pendingDuplicates, setPendingDuplicates] = useState<DuplicateInfo | null>(null);

  const fingerprint = (m: RawMovement) => `${m.accountId}|${m.data}|${m.descrizione}|${m.importo}`;

  const appendMovements = useCallback((movs: RawMovement[]) => {
    setRawMovements((prev) => {
      const offset = prev.length;
      const reindexed = movs.map((m, i) => ({ ...m, id: `bank-${offset + i}` }));
      const merged = [...prev, ...reindexed];
      saveMovements(merged);
      return merged;
    });
  }, []);

  const confirmDuplicates = useCallback(() => {
    if (!pendingDuplicates) return;
    appendMovements(pendingDuplicates.duplicates);
    setPendingDuplicates(null);
  }, [pendingDuplicates, appendMovements]);

  const dismissDuplicates = useCallback(() => {
    setPendingDuplicates(null);
  }, []);

  const handleFileUpload = useCallback(async (file: File, accountId?: string) => {
    setLoading(true);
    const acctId = accountId || activeAccountId;
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let newMovements: RawMovement[];
      if (ext === "pdf") {
        const buf = await file.arrayBuffer();
        const rows = await parsePdfToRows(buf);
        newMovements = parseBank(rows).map(m => ({ ...m, accountId: acctId, sourceFile: file.name }));
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }) as any[];
        newMovements = parseBank(rows).map(m => ({ ...m, accountId: acctId, sourceFile: file.name }));
      }

      setRawMovements((prev) => {
        if (prev.length === 0) {
          saveMovements(newMovements);
          return newMovements;
        }
        const existingKeys = new Set(prev.map(fingerprint));
        const unique = newMovements.filter((m) => !existingKeys.has(fingerprint(m)));
        const dupes = newMovements.filter((m) => existingKeys.has(fingerprint(m)));

        if (dupes.length > 0) {
          setPendingDuplicates({ duplicates: dupes, unique, fileName: file.name });
        }

        if (unique.length > 0) {
          const offset = prev.length;
          const reindexed = unique.map((m, i) => ({ ...m, id: `bank-${offset + i}` }));
          const merged = [...prev, ...reindexed];
          saveMovements(merged);
          return merged;
        }

        if (dupes.length > 0 && unique.length === 0) {
          // All duplicates — don't change state but still show dialog
          return prev;
        }

        return prev;
      });

      setFileNames((prev) => {
        const next = prev.includes(file.name) ? prev : [...prev, file.name];
        saveFileNames(next);
        return next;
      });
    } catch (err) {
      console.error("Errore parsing file bancario:", err);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId]);

  const clearMovements = useCallback(() => {
    setRawMovements([]);
    setFileNames([]);
    setReconciliations([]);
    saveMovements([]);
    saveFileNames([]);
    saveReconciliations([]);
  }, []);

  const deleteFileMovements = useCallback((fileName: string) => {
    setRawMovements((prev) => {
      const next = prev.filter((m) => (m.sourceFile || "") !== fileName);
      saveMovements(next);
      return next;
    });
    setFileNames((prev) => {
      const next = prev.filter((f) => f !== fileName);
      saveFileNames(next);
      return next;
    });
    setReconciliations((prev) => {
      // We need to clean up reconciliations for removed movements
      // but we don't have the IDs here easily, so we'll let autoMatch handle it
      return prev;
    });
  }, []);

  const deleteMovements = useCallback((ids: string[]) => {
    setRawMovements((prev) => {
      const idSet = new Set(ids);
      const next = prev.filter((m) => !idSet.has(m.id));
      saveMovements(next);
      return next;
    });
    // Also remove any reconciliations for deleted movements
    setReconciliations((prev) => {
      const idSet = new Set(ids);
      const next = prev.filter((r) => !idSet.has(r.movementId));
      saveReconciliations(next);
      return next;
    });
  }, []);

  // Filter movements by active account
  const accountMovements = useMemo(() => {
    if (activeAccountId === "all") return rawMovements;
    return rawMovements.filter(m => (m.accountId || "default") === activeAccountId);
  }, [rawMovements, activeAccountId]);

  const movements = useMemo(
    () => autoMatch(accountMovements, sales, purchases, reconciliations),
    [accountMovements, sales, purchases, reconciliations]
  );

  const allMovements = useMemo(
    () => autoMatch(rawMovements, sales, purchases, reconciliations),
    [rawMovements, sales, purchases, reconciliations]
  );

  const addReconciliation = useCallback((rec: Reconciliation) => {
    setReconciliations((prev) => {
      const next = [...prev.filter((r) => r.movementId !== rec.movementId), rec];
      saveReconciliations(next);
      return next;
    });
  }, []);

  const removeReconciliation = useCallback((movementId: string) => {
    setReconciliations((prev) => {
      const next = prev.filter((r) => r.movementId !== movementId);
      saveReconciliations(next);
      return next;
    });
  }, []);

  const stats = useMemo(() => {
    const total = movements.length;
    const matched = movements.filter((m) => m.matchConfidence !== "none").length;
    const entrate = movements.filter((m) => m.importo > 0).reduce((s, m) => s + m.importo, 0);
    const uscite = movements.filter((m) => m.importo < 0).reduce((s, m) => s + Math.abs(m.importo), 0);
    return { total, matched, unmatched: total - matched, entrate, uscite };
  }, [movements]);

  return {
    movements, allMovements, rawMovements, loading, fileNames, handleFileUpload,
    addReconciliation, removeReconciliation, clearMovements, deleteMovements, deleteFileMovements,
    stats, activeAccountId, setActiveAccountId,
    pendingDuplicates, confirmDuplicates, dismissDuplicates,
  };
}
