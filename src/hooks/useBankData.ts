import { useState, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import { SaleInvoice, PurchaseInvoice } from "./useInvoiceData";

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface BankMovement {
  id: string;
  data: string;
  dataValuta: string;
  descrizione: string;
  importo: number;
  saldo: number;
  cig: string;
  matchedType: "vendita" | "acquisto" | "";
  matchedAnno: number;
  matchedNumero: number;
  matchConfidence: "auto" | "manual" | "none";
}

export interface Reconciliation {
  movementId: string;
  invoiceType: "vendita" | "acquisto";
  invoiceAnno: number;
  invoiceNumero: number;
}

const STORAGE_KEY = "bank-reconciliations";

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
  const match = text.match(/CIG[:\s]*([A-Z0-9]+)/i);
  return match ? match[1] : "";
}

function parseDate(val: any): string {
  if (!val) return "";
  if (typeof val === "string" && val.includes("/")) return val;
  const serial = parseFloat(String(val));
  if (!isNaN(serial) && serial > 30000) {
    const d = new Date((serial - 25569) * 86400 * 1000);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return String(val);
}

function parseNum(val: any): number {
  if (val == null || val === "") return 0;
  if (typeof val === "number") return val;
  const s = String(val).replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
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
  data: number; dataValuta: number; descrizione: number;
  dare: number; avere: number; importo: number; saldo: number;
} {
  const result = { data: -1, dataValuta: -1, descrizione: -1, dare: -1, avere: -1, importo: -1, saldo: -1 };
  for (let i = 0; i < header.length; i++) {
    const h = normalise(String(header[i] || ""));
    if (h.includes("data") && h.includes("valut")) result.dataValuta = i;
    else if (h.includes("data") && result.data === -1) result.data = i;
    else if (h.includes("descri") || h.includes("causal") || h.includes("moviment")) result.descrizione = i;
    else if (h.includes("dare") || h.includes("addebit") || h.includes("uscit")) result.dare = i;
    else if (h.includes("avere") || h.includes("accredit") || h.includes("entrat")) result.avere = i;
    else if (h.includes("import") && !h.includes("iva")) result.importo = i;
    else if (h.includes("saldo")) result.saldo = i;
  }
  return result;
}

async function parsePdfToRows(buffer: ArrayBuffer): Promise<any[][]> {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const allLines: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Group text items by Y position to reconstruct rows
    const itemsByY = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const y = Math.round((item as any).transform[5]);
      if (!itemsByY.has(y)) itemsByY.set(y, []);
      itemsByY.get(y)!.push({ x: (item as any).transform[4], str: item.str });
    }

    // Sort by Y descending (PDF coords), then by X
    const sortedYs = Array.from(itemsByY.keys()).sort((a, b) => b - a);
    for (const y of sortedYs) {
      const items = itemsByY.get(y)!.sort((a, b) => a.x - b.x);
      allLines.push(items.map((i) => i.str.trim()).join("\t"));
    }
  }

  // Parse lines into rows by splitting on tabs/multiple spaces
  const rows: any[][] = [];
  for (const line of allLines) {
    if (!line.trim()) continue;
    // Split on tab or 3+ spaces
    const cells = line.split(/\t|   +/).map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 2) {
      rows.push(cells);
    }
  }
  return rows;
}

function parseBank(rows: any[]): Omit<BankMovement, "matchedType" | "matchedAnno" | "matchedNumero" | "matchConfidence">[] {
  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (!row) continue;
    const joined = row.map((c: any) => normalise(String(c || ""))).join(" ");
    if (joined.includes("data") && (joined.includes("descri") || joined.includes("causal") || joined.includes("import") || joined.includes("dare") || joined.includes("avere"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1 && rows.length > 0) headerIdx = 0;

  const cols = detectColumns(rows[headerIdx] || []);
  const movements: Omit<BankMovement, "matchedType" | "matchedAnno" | "matchedNumero" | "matchConfidence">[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c: any) => c == null || c === "")) continue;

    const desc = String(r[cols.descrizione] ?? r[1] ?? "");
    let importo = 0;
    if (cols.importo >= 0) {
      importo = parseNum(r[cols.importo]);
    } else if (cols.avere >= 0 || cols.dare >= 0) {
      const avere = cols.avere >= 0 ? parseNum(r[cols.avere]) : 0;
      const dare = cols.dare >= 0 ? parseNum(r[cols.dare]) : 0;
      importo = avere > 0 ? avere : -dare;
    }

    if (importo === 0 && !desc) continue;

    movements.push({
      id: `bank-${i}`,
      data: parseDate(r[cols.data >= 0 ? cols.data : 0]),
      dataValuta: cols.dataValuta >= 0 ? parseDate(r[cols.dataValuta]) : "",
      descrizione: desc,
      importo,
      saldo: cols.saldo >= 0 ? parseNum(r[cols.saldo]) : 0,
      cig: extractCIG(desc),
    });
  }
  return movements;
}

function autoMatch(
  movements: Omit<BankMovement, "matchedType" | "matchedAnno" | "matchedNumero" | "matchConfidence">[],
  sales: SaleInvoice[],
  purchases: PurchaseInvoice[],
  manualRecs: Reconciliation[]
): BankMovement[] {
  const manualMap = new Map(manualRecs.map((r) => [r.movementId, r]));

  return movements.map((m) => {
    // Check manual first
    const manual = manualMap.get(m.id);
    if (manual) {
      return {
        ...m,
        matchedType: manual.invoiceType,
        matchedAnno: manual.invoiceAnno,
        matchedNumero: manual.invoiceNumero,
        matchConfidence: "manual" as const,
      };
    }

    // 1. Match by CIG
    if (m.cig) {
      if (m.importo > 0) {
        const match = sales.find((s) => s.cig === m.cig && Math.abs(s.totale - m.importo) < 0.02);
        if (match) return { ...m, matchedType: "vendita" as const, matchedAnno: match.anno, matchedNumero: match.numero, matchConfidence: "auto" as const };
      } else {
        const match = purchases.find((p) => p.cig === m.cig && Math.abs(p.totale - Math.abs(m.importo)) < 0.02);
        if (match) return { ...m, matchedType: "acquisto" as const, matchedAnno: match.anno, matchedNumero: match.numero, matchConfidence: "auto" as const };
      }
      // CIG match without exact amount
      if (m.importo > 0) {
        const match = sales.find((s) => s.cig === m.cig);
        if (match) return { ...m, matchedType: "vendita" as const, matchedAnno: match.anno, matchedNumero: match.numero, matchConfidence: "auto" as const };
      } else {
        const match = purchases.find((p) => p.cig === m.cig);
        if (match) return { ...m, matchedType: "acquisto" as const, matchedAnno: match.anno, matchedNumero: match.numero, matchConfidence: "auto" as const };
      }
    }

    // 2. Match by amount + name similarity
    const tolerance = 0.02;
    if (m.importo > 0) {
      const candidates = sales.filter((s) => Math.abs(s.totale - m.importo) < tolerance);
      if (candidates.length === 1) {
        return { ...m, matchedType: "vendita" as const, matchedAnno: candidates[0].anno, matchedNumero: candidates[0].numero, matchConfidence: "auto" as const };
      }
      // Try name similarity
      const best = candidates.reduce<{ inv: SaleInvoice | null; score: number }>((acc, s) => {
        const score = nameSimilarity(m.descrizione, s.cliente);
        return score > acc.score ? { inv: s, score } : acc;
      }, { inv: null, score: 0 });
      if (best.inv && best.score >= 0.4) {
        return { ...m, matchedType: "vendita" as const, matchedAnno: best.inv.anno, matchedNumero: best.inv.numero, matchConfidence: "auto" as const };
      }
    } else if (m.importo < 0) {
      const absAmt = Math.abs(m.importo);
      const candidates = purchases.filter((p) => Math.abs(p.totale - absAmt) < tolerance);
      if (candidates.length === 1) {
        return { ...m, matchedType: "acquisto" as const, matchedAnno: candidates[0].anno, matchedNumero: candidates[0].numero, matchConfidence: "auto" as const };
      }
      const best = candidates.reduce<{ inv: PurchaseInvoice | null; score: number }>((acc, p) => {
        const score = nameSimilarity(m.descrizione, p.fornitore);
        return score > acc.score ? { inv: p, score } : acc;
      }, { inv: null, score: 0 });
      if (best.inv && best.score >= 0.4) {
        return { ...m, matchedType: "acquisto" as const, matchedAnno: best.inv.anno, matchedNumero: best.inv.numero, matchConfidence: "auto" as const };
      }
    }

    return { ...m, matchedType: "" as const, matchedAnno: 0, matchedNumero: 0, matchConfidence: "none" as const };
  });
}

export function useBankData(sales: SaleInvoice[], purchases: PurchaseInvoice[]) {
  const [rawMovements, setRawMovements] = useState<Omit<BankMovement, "matchedType" | "matchedAnno" | "matchedNumero" | "matchConfidence">[]>([]);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>(loadReconciliations);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");

  const handleFileUpload = useCallback(async (file: File) => {
    setLoading(true);
    setFileName(file.name);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let newMovements: Omit<BankMovement, "matchedType" | "matchedAnno" | "matchedNumero" | "matchConfidence">[];
      if (ext === "pdf") {
        const buf = await file.arrayBuffer();
        const rows = await parsePdfToRows(buf);
        newMovements = parseBank(rows);
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }) as any[];
        newMovements = parseBank(rows);
      }

      // Merge with existing movements, keeping already-loaded rows on duplicates
      setRawMovements((prev) => {
        if (prev.length === 0) return newMovements;
        const fingerprint = (m: typeof prev[0]) => `${m.data}|${m.descrizione}|${m.importo}`;
        const existingKeys = new Set(prev.map(fingerprint));
        const unique = newMovements.filter((m) => !existingKeys.has(fingerprint(m)));
        // Re-index ids to avoid collisions
        const offset = prev.length;
        const reindexed = unique.map((m, i) => ({ ...m, id: `bank-${offset + i}` }));
        return [...prev, ...reindexed];
      });
    } catch (err) {
      console.error("Errore parsing file bancario:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const movements = useMemo(
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

  return { movements, loading, fileName, handleFileUpload, addReconciliation, removeReconciliation, stats };
}
