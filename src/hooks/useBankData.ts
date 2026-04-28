import { useState, useMemo, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SaleInvoice, PurchaseInvoice } from "./useInvoiceData";

async function getXLSX() {
  return await import("xlsx");
}

async function getPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  return pdfjsLib;
}

export interface MatchedInvoice {
  type: "vendita" | "acquisto" | "documento";
  anno: number;
  numero: number;
  documentoId?: string;
  documentoLabel?: string;
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
  matchedType: "vendita" | "acquisto" | "documento" | "";
  matchedAnno: number;
  matchedNumero: number;
}

export interface Reconciliation {
  movementId: string;
  invoiceType: "vendita" | "acquisto" | "documento";
  invoiceAnno: number;
  invoiceNumero: number;
  documentoId?: string;
}

async function loadReconciliationsFromDb(): Promise<Reconciliation[]> {
  const all: any[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("bank_reconciliations" as any)
      .select("*")
      .range(offset, offset + PAGE - 1);
    if (error) { console.error("Error loading reconciliations:", error); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all.map((d: any) => ({
    movementId: d.movement_id,
    invoiceType: d.invoice_type ?? (d.documento_id ? "documento" : ""),
    invoiceAnno: d.invoice_anno ?? 0,
    invoiceNumero: d.invoice_numero ?? 0,
    documentoId: d.documento_id ?? undefined,
  }));
}

async function saveReconciliationToDb(rec: Reconciliation, movementDbId: string) {
  if (rec.documentoId) {
    await supabase.from("bank_reconciliations" as any).insert({
      movement_id: movementDbId,
      documento_id: rec.documentoId,
    } as any);
  } else {
    await supabase.from("bank_reconciliations" as any).insert({
      movement_id: movementDbId,
      invoice_type: rec.invoiceType,
      invoice_anno: rec.invoiceAnno,
      invoice_numero: rec.invoiceNumero,
    } as any);
  }
}

async function deleteReconciliationFromDb(movementDbId: string, invoiceKey?: string) {
  if (!invoiceKey) {
    await supabase.from("bank_reconciliations" as any).delete().eq("movement_id", movementDbId);
    return;
  }
  // Parse invoiceKey to delete specific reconciliation
  if (invoiceKey.startsWith("documento-")) {
    const docId = invoiceKey.replace("documento-", "");
    await supabase.from("bank_reconciliations" as any).delete().eq("movement_id", movementDbId).eq("documento_id", docId);
  } else {
    const parts = invoiceKey.split("-");
    if (parts.length >= 3) {
      const tipo = parts[0];
      const anno = parseInt(parts[1], 10);
      const numero = parseInt(parts[2], 10);
      await supabase.from("bank_reconciliations" as any).delete()
        .eq("movement_id", movementDbId)
        .eq("invoice_type", tipo)
        .eq("invoice_anno", anno)
        .eq("invoice_numero", numero);
    } else {
      await supabase.from("bank_reconciliations" as any).delete().eq("movement_id", movementDbId);
    }
  }
}

function extractCIG(text: string): string {
  if (!text) return "";
  // 1. Explicit CIG label
  const labeled = text.match(/CIG[:\s]*([A-Z0-9]{10})\b/i);
  if (labeled) return labeled[1].toUpperCase();
  // 2. Standalone 10-char alphanumeric code starting with a letter (typical CIG pattern: e.g. Z2B3456789, A0B1C2D3E4)
  const standalone = text.match(/\b([A-Z][A-Z0-9]{9})\b/gi);
  if (standalone) {
    for (const candidate of standalone) {
      const upper = candidate.toUpperCase();
      // Skip common false positives (IBANs segments, words, etc.)
      if (/^[A-Z]{10}$/.test(upper)) continue; // all letters = likely a word
      if (/^\d{10}$/.test(upper)) continue; // all digits = not CIG
      // Must contain both letters and digits
      if (/[A-Z]/.test(upper) && /\d/.test(upper)) return upper;
    }
  }
  return "";
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
  const pdfjsLib = await getPdfjs();
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
  inv: { totale: number; cig: string; numero: number; anno: number; partitaIva: string; imponibile?: number; cassa?: number; ritenute?: number },
  name: string
): number {
  let score = 0;
  const absImporto = Math.abs(m.importo);

  // CIG match (strongest signal)
  if (m.cig && inv.cig && m.cig.toLowerCase() === inv.cig.toLowerCase()) {
    score += 40;
  }

  // Amount match with graduated tolerance.
  // Per professionisti/fornitori con ritenuta d'acconto il bonifico effettivo
  // è imponibile + cassa - ritenute (importo "da pagare"), non il totale lordo.
  const ritenute = inv.ritenute || 0;
  const cassa = inv.cassa || 0;
  const imponibile = inv.imponibile || 0;
  const daPagare = ritenute > 0 ? Math.max(0, imponibile + cassa - ritenute) : inv.totale;
  const candidates = [inv.totale, daPagare];
  const diff = Math.min(...candidates.map((v) => Math.abs(v - absImporto)));
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
  // Group manual reconciliations by movementId (supports multiple per movement)
  const manualGrouped = new Map<string, Reconciliation[]>();
  for (const r of manualRecs) {
    const list = manualGrouped.get(r.movementId) || [];
    list.push(r);
    manualGrouped.set(r.movementId, list);
  }
  const usedSales = new Set<string>();
  const usedPurchases = new Set<string>();

  const scored = movements.map((m) => {
    const manuals = manualGrouped.get(m.id);
    if (manuals && manuals.length > 0) {
      const invoices: MatchedInvoice[] = manuals.map((r) => {
        if (r.documentoId) {
          return { type: "documento" as const, anno: 0, numero: 0, documentoId: r.documentoId };
        }
        const key = `${r.invoiceAnno}-${r.invoiceNumero}`;
        if (r.invoiceType === "vendita") usedSales.add(key);
        else if (r.invoiceType === "acquisto") usedPurchases.add(key);
        return { type: r.invoiceType, anno: r.invoiceAnno, numero: r.invoiceNumero };
      });
      return {
        movement: m,
        invoices,
        bestType: invoices[0].type,
        bestAnno: invoices[0].anno,
        bestNumero: invoices[0].numero,
        bestScore: 999,
        confidence: "manual" as const,
      };
    }

    let bestScore = 0;
    let bestType: "vendita" | "acquisto" | "documento" = "vendita";
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

    return {
      movement: m,
      invoices: [] as MatchedInvoice[],
      bestType: bestType as "vendita" | "acquisto" | "documento",
      bestAnno, bestNumero, bestScore,
      confidence: "none" as "none" | "auto" | "manual",
    };
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
      scored[idx] = {
        ...s,
        invoices: [{ type: s.bestType, anno: s.bestAnno, numero: s.bestNumero }],
        confidence: "auto" as const,
      };
    }
  }

  return scored.map((s) => ({
    ...s.movement,
    matchedInvoices: s.invoices,
    matchedType: s.confidence !== "none" ? s.bestType : ("" as const),
    matchedAnno: s.confidence !== "none" ? s.bestAnno : 0,
    matchedNumero: s.confidence !== "none" ? s.bestNumero : 0,
    matchConfidence: s.confidence,
  }));
}

async function loadMovementsFromDb(): Promise<RawMovement[]> {
  const all: any[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("bank_movements" as any)
      .select("*")
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) { console.error("Error loading movements:", error); return all.map(mapMovement); }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all.map(mapMovement);
}

function mapMovement(d: any): RawMovement {
  return {
    id: d.id,
    accountId: d.account_id || "default",
    sourceFile: d.source_file || "",
    data: d.data || "",
    dataValuta: d.data_valuta || "",
    causale: d.causale || "",
    descrizione: d.descrizione || "",
    importo: Number(d.importo) || 0,
    saldo: Number(d.saldo) || 0,
    cig: d.cig || "",
  };
}

async function insertMovementsToDb(movements: RawMovement[]) {
  const rows = movements.map(m => ({
    account_id: m.accountId,
    source_file: m.sourceFile,
    data: m.data,
    data_valuta: m.dataValuta,
    causale: m.causale,
    descrizione: m.descrizione,
    importo: m.importo,
    saldo: m.saldo,
    cig: m.cig,
  }));
  const { data } = await supabase.from("bank_movements" as any).insert(rows as any).select("id");
  return (data as any[] || []).map((d: any) => d.id as string);
}

export type RawMovement = Omit<BankMovement, "matchedInvoices" | "matchedType" | "matchedAnno" | "matchedNumero" | "matchConfidence">;

export interface DuplicateInfo {
  duplicates: RawMovement[];
  unique: RawMovement[];
  fileName: string;
}

export function useBankData(sales: SaleInvoice[], purchases: PurchaseInvoice[]) {
  const [rawMovements, setRawMovements] = useState<RawMovement[]>([]);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>("default");
  const [pendingDuplicates, setPendingDuplicates] = useState<DuplicateInfo | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load from DB on mount
  useEffect(() => {
    Promise.all([loadMovementsFromDb(), loadReconciliationsFromDb()]).then(([movs, recs]) => {
      setRawMovements(movs);
      setFileNames([...new Set(movs.map(m => m.sourceFile).filter(Boolean))]);
      setReconciliations(recs);
      setLoading(false);
    });
  }, []);

  const refreshAutoMatch = useCallback((): number => {
    // Identify movements that already have a reconciliation in DB — never touch them
    const reconciledMovementIds = new Set(reconciliations.map(r => r.movementId));

    // Only run auto-match on orphan movements (no existing reconciliation)
    const scope = (activeAccountId === "all" ? rawMovements : rawMovements.filter(m => (m.accountId || "default") === activeAccountId))
      .filter(m => !reconciledMovementIds.has(m.id));

    if (scope.length === 0) {
      setRefreshKey((k) => k + 1);
      return 0;
    }

    const matched = autoMatch(scope, sales, purchases, reconciliations);
    const newRecs: Reconciliation[] = [];
    for (const m of matched) {
      if (m.matchConfidence === "auto" && m.matchedInvoices.length > 0) {
        for (const inv of m.matchedInvoices) {
          newRecs.push({ movementId: m.id, invoiceType: inv.type, invoiceAnno: inv.anno, invoiceNumero: inv.numero });
        }
      }
    }
    if (newRecs.length > 0) {
      setReconciliations((prev) => {
        const existing = new Set(prev.map(r => `${r.movementId}|${r.invoiceType}|${r.invoiceAnno}|${r.invoiceNumero}`));
        const toAdd = newRecs.filter(r => !existing.has(`${r.movementId}|${r.invoiceType}|${r.invoiceAnno}|${r.invoiceNumero}`));
        // Save new recs to DB
        toAdd.forEach(r => saveReconciliationToDb(r, r.movementId));
        return [...prev, ...toAdd];
      });
    }
    setRefreshKey((k) => k + 1);
    return newRecs.length;
  }, [rawMovements, sales, purchases, reconciliations, activeAccountId]);

  const fingerprint = (m: Pick<RawMovement, "accountId" | "data" | "dataValuta" | "descrizione" | "importo">) =>
    `${m.accountId}|${m.data}|${m.dataValuta}|${m.descrizione}|${m.importo}`;

  const appendMovements = useCallback(async (movs: RawMovement[]) => {
    const ids = await insertMovementsToDb(movs);
    const withIds = movs.map((m, i) => ({ ...m, id: ids[i] || m.id }));
    setRawMovements((prev) => [...prev, ...withIds]);
  }, []);

  // Find and remove duplicate movements already in the DB
  const deduplicateExisting = useCallback(async () => {
    const seen = new Map<string, string>(); // fingerprint → first id
    const dupeIds: string[] = [];
    for (const m of rawMovements) {
      const fp = fingerprint(m);
      if (seen.has(fp)) {
        dupeIds.push(m.id);
      } else {
        seen.set(fp, m.id);
      }
    }
    if (dupeIds.length === 0) return 0;
    // Delete from DB in batches
    const BATCH = 200;
    for (let i = 0; i < dupeIds.length; i += BATCH) {
      await supabase.from("bank_movements" as any).delete().in("id", dupeIds.slice(i, i + BATCH));
    }
    const idSet = new Set(dupeIds);
    setRawMovements((prev) => prev.filter((m) => !idSet.has(m.id)));
    setReconciliations((prev) => prev.filter((r) => !idSet.has(r.movementId)));
    return dupeIds.length;
  }, [rawMovements]);

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
        const XLSX = await getXLSX();
        const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }) as any[];
        newMovements = parseBank(rows).map(m => ({ ...m, accountId: acctId, sourceFile: file.name }));
      }

      const existingKeys = new Set(rawMovements.map(fingerprint));
      const unique = newMovements.filter((m) => !existingKeys.has(fingerprint(m)));
      const dupes = newMovements.filter((m) => existingKeys.has(fingerprint(m)));

      if (dupes.length > 0) {
        setPendingDuplicates({ duplicates: dupes, unique, fileName: file.name });
      }

      if (unique.length > 0) {
        const ids = await insertMovementsToDb(unique);
        const withIds = unique.map((m, i) => ({ ...m, id: ids[i] || m.id }));
        setRawMovements((prev) => [...prev, ...withIds]);
      }

      setFileNames((prev) => prev.includes(file.name) ? prev : [...prev, file.name]);
    } catch (err) {
      console.error("Errore parsing file bancario:", err);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, rawMovements]);

  const clearMovements = useCallback(async () => {
    setRawMovements([]);
    setFileNames([]);
    setReconciliations([]);
    await supabase.from("bank_reconciliations" as any).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("bank_movements" as any).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }, []);

  const deleteFileMovements = useCallback(async (fileName: string) => {
    const toDelete = rawMovements.filter(m => (m.sourceFile || "") === fileName);
    const ids = toDelete.map(m => m.id);
    setRawMovements((prev) => prev.filter((m) => !ids.includes(m.id)));
    setFileNames((prev) => prev.filter((f) => f !== fileName));
    if (ids.length > 0) {
      // Reconciliations cascade-delete with movements
      await supabase.from("bank_movements" as any).delete().in("id", ids);
    }
  }, [rawMovements]);

  const deleteMovements = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    setRawMovements((prev) => prev.filter((m) => !idSet.has(m.id)));
    setReconciliations((prev) => prev.filter((r) => !idSet.has(r.movementId)));
    await supabase.from("bank_movements" as any).delete().in("id", ids);
  }, []);

  // Filter movements by active account
  const accountMovements = useMemo(() => {
    if (activeAccountId === "all") return rawMovements;
    return rawMovements.filter(m => (m.accountId || "default") === activeAccountId);
  }, [rawMovements, activeAccountId]);

  const movements = useMemo(
    () => autoMatch(accountMovements, sales, purchases, reconciliations),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountMovements, sales, purchases, reconciliations, refreshKey]
  );

  const allMovements = useMemo(
    () => autoMatch(rawMovements, sales, purchases, reconciliations),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawMovements, sales, purchases, reconciliations, refreshKey]
  );

  const addReconciliation = useCallback(async (rec: Reconciliation | Reconciliation[]) => {
    const recs = Array.isArray(rec) ? rec : [rec];
    if (recs.length === 0) return;
    const movementId = recs[0].movementId;
    // Remove old recs for this movement
    await deleteReconciliationFromDb(movementId);
    // Insert new ones
    for (const r of recs) {
      await saveReconciliationToDb(r, movementId);
    }
    setReconciliations((prev) => [...prev.filter((r) => r.movementId !== movementId), ...recs]);
  }, []);

  const removeReconciliation = useCallback(async (movementId: string, invoiceKey?: string) => {
    await deleteReconciliationFromDb(movementId, invoiceKey);
    setReconciliations((prev) => {
      if (invoiceKey) {
        return prev.filter((r) => {
          if (r.movementId !== movementId) return true;
          if (r.documentoId) return `documento-${r.documentoId}` !== invoiceKey;
          return `${r.invoiceType}-${r.invoiceAnno}-${r.invoiceNumero}` !== invoiceKey;
        });
      }
      return prev.filter((r) => r.movementId !== movementId);
    });
  }, []);

  const stats = useMemo(() => {
    const total = movements.length;
    const matched = movements.filter((m) => m.matchConfidence !== "none").length;
    const entrate = movements.filter((m) => m.importo > 0).reduce((s, m) => s + m.importo, 0);
    const uscite = movements.filter((m) => m.importo < 0).reduce((s, m) => s + Math.abs(m.importo), 0);
    return { total, matched, unmatched: total - matched, entrate, uscite };
  }, [movements]);

  const bulkUpdateCIG = useCallback(async () => {
    const noCig = rawMovements.filter(m => !m.cig);
    let updated = 0;
    const updatedMovements = [...rawMovements];
    for (const m of noCig) {
      const fullText = `${m.causale} ${m.descrizione}`.trim();
      const cig = extractCIG(fullText);
      if (cig) {
        await supabase.from("bank_movements" as any).update({ cig }).eq("id", m.id);
        const idx = updatedMovements.findIndex(rm => rm.id === m.id);
        if (idx >= 0) updatedMovements[idx] = { ...updatedMovements[idx], cig };
        updated++;
      }
    }
    if (updated > 0) setRawMovements(updatedMovements);
    return updated;
  }, [rawMovements]);

  const updateMovementCig = useCallback(async (movementId: string, cig: string) => {
    const trimmed = cig.trim().toUpperCase();
    await supabase.from("bank_movements" as any).update({ cig: trimmed }).eq("id", movementId);
    setRawMovements(prev => prev.map(m => m.id === movementId ? { ...m, cig: trimmed } : m));
  }, []);

  return {
    movements, allMovements, rawMovements, loading, fileNames, handleFileUpload,
    addReconciliation, removeReconciliation, clearMovements, deleteMovements, deleteFileMovements,
    stats, activeAccountId, setActiveAccountId,
    pendingDuplicates, confirmDuplicates, dismissDuplicates, refreshAutoMatch,
    deduplicateExisting, bulkUpdateCIG, updateMovementCig,
  };
}
