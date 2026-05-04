import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type * as XLSXType from "xlsx";
import { idbGet, idbSet, CACHE_KEYS } from "@/lib/idbCache";

async function getXLSX(): Promise<typeof XLSXType> {
  return await import("xlsx");
}

export interface SaleInvoiceRiga {
  descrizione: string;
  imponibile: number;
  imposta: number;
  totale: number;
  cig: string;
  cup: string;
}

export interface SaleInvoice {
  tipo: string;
  anno: number;
  numero: number;
  suffisso: string;
  data: string;
  cliente: string;
  partitaIva: string;
  totale: number;
  imponibile: number;
  imposta: number;
  descrizione: string;
  cig: string;
  cup: string;
  stato: string;
  scadenza: string;
  pagamento: string;
  righe: SaleInvoiceRiga[];
}

export function getIssuedInvoiceRows(righe: SaleInvoiceRiga[] = []): { riga: SaleInvoiceRiga; idx: number }[] {
  const indexedRows = (Array.isArray(righe) ? righe : []).map((riga, idx) => ({ riga, idx }));
  const firstDescriptiveIdx = indexedRows.findIndex(({ riga }) =>
    parseNumber(riga.imponibile) === 0 && parseNumber(riga.imposta) === 0 && parseNumber(riga.totale) === 0 && !!String(riga.descrizione || "").trim()
  );

  return firstDescriptiveIdx >= indexedRows.length / 2 ? indexedRows.slice().reverse() : indexedRows;
}

export interface PurchaseInvoice {
  tipo: string;
  anno: number;
  numero: number;
  data: string;
  fornitore: string;
  partitaIva: string;
  totale: number;
  imponibile: number;
  imposta: number;
  cassa: number;
  ritenute: number;
  descrizione: string;
  cig: string;
  cup: string;
  stato: string;
  scadenza: string;
  pagamento: string;
}

function parseNumber(val: any): number {
  if (val == null || val === "") return 0;
  if (typeof val === "number") return val;
  const s = String(val).replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function formatDate(val: any): string {
  if (!val) return "";
  if (typeof val === "string" && val.includes("/")) return val;
  const serial = parseFloat(String(val));
  if (!isNaN(serial) && serial > 30000) {
    const d = new Date((serial - 25569) * 86400 * 1000);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return String(val);
}

function extractCIG(desc: string): string {
  if (!desc) return "";
  const match = desc.match(/CIG[:\s]*([A-Z0-9]{10})/i);
  return match ? match[1] : "";
}

/** Search for CIG pattern across all columns in a row */
function extractCIGFromRow(row: any[]): string {
  for (let c = 0; c < row.length; c++) {
    const val = String(row[c] || "");
    const match = val.match(/CIG[:\s]*([A-Z0-9]{10})/i);
    if (match) return match[1];
  }
  // Second pass: look for standalone 10-char alphanumeric codes that look like CIG
  for (let c = 0; c < row.length; c++) {
    const val = String(row[c] || "").trim();
    if (/^[A-Z0-9]{10}$/i.test(val) && /[A-Z]/i.test(val) && /\d/.test(val)) {
      return val.toUpperCase();
    }
  }
  return "";
}

function extractCUP(desc: string): string {
  if (!desc) return "";
  const match = desc.match(/CUP[:\s]*([A-Z0-9]+)/i);
  return match ? match[1] : "";
}

// ── Excel parsing (used for seeding and uploads) ──

async function loadExcel(url: string): Promise<any[]> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const XLSX = await getXLSX();
  const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
}

export function parseExcelSales(rows: any[]): SaleInvoice[] {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (rows[i] && String(rows[i][0]).includes("Tipo Documento")) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return [];

  const invoiceMap = new Map<string, SaleInvoice>();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const tipo = String(r[0]);
    const anno = parseInt(String(r[1]));
    const numero = parseInt(String(r[2]));
    const suffisso = String(r[3] || "").trim();
    const key = `${anno}-${numero}-${suffisso}-${tipo}`;
    const desc = String(r[13] || "");
    const prezzoTotRiga = parseNumber(r[18]);
    const aliquotaStr = String(r[19] || "");
    // Il "Prezzo Tot." è l'imponibile di riga; l'imposta si calcola applicando l'aliquota
    const aliquotaMatch = aliquotaStr.match(/(\d+)/);
    const aliquotaPct = aliquotaMatch ? parseInt(aliquotaMatch[1]) : 0;
    const rigaImponibile = prezzoTotRiga;
    const rigaImposta = aliquotaPct > 0 ? prezzoTotRiga * (aliquotaPct / 100) : 0;
    const riga: SaleInvoiceRiga = {
      descrizione: desc, imponibile: Math.round(rigaImponibile * 100) / 100,
      imposta: Math.round(rigaImposta * 100) / 100, totale: Math.round((rigaImponibile + rigaImposta) * 100) / 100,
      cig: extractCIG(desc), cup: extractCUP(desc),
    };
    if (invoiceMap.has(key)) {
      invoiceMap.get(key)!.righe.push(riga);
    } else {
      invoiceMap.set(key, {
        tipo, anno, numero, suffisso, data: formatDate(r[4]),
        cliente: String(r[6] || ""), partitaIva: String(r[8] || ""),
        totale: parseNumber(r[21]), imponibile: parseNumber(r[22]),
        imposta: parseNumber(r[23]), descrizione: desc,
        cig: extractCIG(desc) || extractCIGFromRow(r), cup: extractCUP(desc),
        stato: String(r[44] || ""), scadenza: String(r[9] || ""),
        pagamento: String(r[10] || ""), righe: [riga],
      });
    }
  }
  return Array.from(invoiceMap.values());
}

export function parseExcelPurchases(rows: any[]): PurchaseInvoice[] {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (rows[i] && String(rows[i][0]).includes("Tipo Documento")) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return [];

  const invoices: PurchaseInvoice[] = [];
  const seen = new Set<string>();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const anno = parseInt(String(r[1]));
    const numero = parseInt(String(r[2]));
    const key = `${anno}-${numero}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const desc = String(r[15] || "");
    invoices.push({
      tipo: String(r[0]), anno, numero, data: formatDate(r[4]),
      fornitore: String(r[8] || ""), partitaIva: String(r[10] || ""),
      totale: parseNumber(r[23]), imponibile: parseNumber(r[24]),
      imposta: parseNumber(r[25]),
      cassa: parseNumber(r[28]),
      ritenute: parseNumber(r[31]),
      descrizione: desc,
      cig: extractCIG(desc) || extractCIGFromRow(r), cup: extractCUP(desc),
      stato: String(r[46] || ""), scadenza: String(r[11] || ""),
      pagamento: String(r[12] || ""),
    });
  }
  return invoices;
}

// ── DB helpers ──

/**
 * Default window of recent years loaded at startup. Older years are fetched
 * on-demand (e.g. when the user filters by an older year).
 */
const RECENT_YEARS = 5;

async function loadSalesFromDb(minYear?: number, exactYear?: number): Promise<SaleInvoice[]> {
  const allRows: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    let q = supabase
      .from("fatture_vendita" as any)
      .select("tipo,anno,numero,suffisso,data,cliente,partita_iva,totale,imponibile,imposta,descrizione,cig,cup,stato,scadenza,pagamento,righe")
      .order("anno", { ascending: true })
      .order("numero", { ascending: true })
      .range(from, from + PAGE - 1);
    if (exactYear !== undefined) q = q.eq("anno", exactYear);
    else if (minYear !== undefined) q = q.gte("anno", minYear);
    const { data, error } = await q;
    if (error) { console.error("Error loading sales:", error); break; }
    if (!data || data.length === 0) break;
    allRows.push(...(data as any[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return allRows.map((d: any) => ({
    tipo: d.tipo, anno: d.anno, numero: d.numero, suffisso: d.suffisso || "", data: d.data,
    cliente: d.cliente, partitaIva: d.partita_iva,
    totale: Number(d.totale), imponibile: Number(d.imponibile), imposta: Number(d.imposta),
    descrizione: d.descrizione, cig: d.cig, cup: d.cup,
    stato: d.stato, scadenza: d.scadenza, pagamento: d.pagamento,
    righe: (typeof d.righe === "string" ? JSON.parse(d.righe) : d.righe || []) as SaleInvoiceRiga[],
  }));
}

async function loadPurchasesFromDb(minYear?: number, exactYear?: number): Promise<PurchaseInvoice[]> {
  const allRows: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    let q = supabase
      .from("fatture_acquisto" as any)
      .select("tipo,anno,numero,data,fornitore,partita_iva,totale,imponibile,imposta,cassa,ritenute,descrizione,cig,cup,stato,scadenza,pagamento")
      .order("anno", { ascending: true })
      .order("numero", { ascending: true })
      .range(from, from + PAGE - 1);
    if (exactYear !== undefined) q = q.eq("anno", exactYear);
    else if (minYear !== undefined) q = q.gte("anno", minYear);
    const { data, error } = await q;
    if (error) { console.error("Error loading purchases:", error); break; }
    if (!data || data.length === 0) break;
    allRows.push(...(data as any[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return allRows.map((d: any) => ({
    tipo: d.tipo, anno: d.anno, numero: d.numero, data: d.data,
    fornitore: d.fornitore, partitaIva: d.partita_iva,
    totale: Number(d.totale), imponibile: Number(d.imponibile), imposta: Number(d.imposta),
    cassa: Number(d.cassa || 0), ritenute: Number(d.ritenute || 0),
    descrizione: d.descrizione, cig: d.cig, cup: d.cup,
    stato: d.stato, scadenza: d.scadenza, pagamento: d.pagamento,
  }));
}

export async function seedSalesFromExcel(salesData: SaleInvoice[], sourceFile: string) {
  const { detectCigDiscrepancy } = await import("@/lib/cigCoherence");
  const discrepancies = salesData
    .map((s) => detectCigDiscrepancy({
      cigSalvato: s.cig,
      descrizione: s.descrizione,
      invoiceType: "vendita",
      anno: s.anno,
      numero: s.numero,
      suffisso: s.suffisso,
      label: s.cliente,
      source: "excel",
    }))
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const rows = salesData.map(s => ({
    tipo: s.tipo, anno: s.anno, numero: s.numero, suffisso: s.suffisso, data: s.data,
    cliente: s.cliente, partita_iva: s.partitaIva,
    totale: s.totale, imponibile: s.imponibile, imposta: s.imposta,
    descrizione: s.descrizione, cig: s.cig, cup: s.cup,
    stato: s.stato, scadenza: s.scadenza, pagamento: s.pagamento,
    righe: JSON.stringify(s.righe),
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase.from("fatture_vendita" as any).upsert(batch as any, { onConflict: "anno,numero,suffisso,tipo" });
    if (error) console.error("Seed sales error:", error);
  }
  return { discrepancies };
}

export async function seedPurchasesFromExcel(purchasesData: PurchaseInvoice[], _sourceFile?: string) {
  const { detectCigDiscrepancy } = await import("@/lib/cigCoherence");
  const discrepancies = purchasesData
    .map((p) => detectCigDiscrepancy({
      cigSalvato: p.cig,
      descrizione: p.descrizione,
      invoiceType: "acquisto",
      anno: p.anno,
      numero: p.numero,
      label: p.fornitore,
      source: "excel",
    }))
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const rows = purchasesData.map(p => ({
    tipo: p.tipo, anno: p.anno, numero: p.numero, data: p.data,
    fornitore: p.fornitore, partita_iva: p.partitaIva,
    totale: p.totale, imponibile: p.imponibile, imposta: p.imposta,
    cassa: p.cassa, ritenute: p.ritenute,
    descrizione: p.descrizione, cig: p.cig, cup: p.cup,
    stato: p.stato, scadenza: p.scadenza, pagamento: p.pagamento,
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase.from("fatture_acquisto" as any).upsert(batch as any, { onConflict: "anno,numero" });
    if (error) console.error("Seed purchases error:", error);
  }
  return { discrepancies };
}

// ── Cache ──
let cachedSales: SaleInvoice[] | null = null;
let cachedPurchases: PurchaseInvoice[] | null = null;
let loadPromise: Promise<void> | null = null;
// True when in-memory caches come only from IDB and a fresh DB fetch hasn't completed yet.
let cacheNeedsRevalidation = false;

export function invalidateInvoiceCache() {
  cachedSales = null;
  cachedPurchases = null;
  loadPromise = null;
}

export async function prefetchInvoices(): Promise<void> {
  if (cachedSales && cachedPurchases) return;
  if (loadPromise) return loadPromise;
  loadPromise = loadAll();
  return loadPromise;
}

/**
 * Hydrate in-memory invoice caches from IndexedDB. The fresh DB fetch is
 * triggered separately by `prefetchInvoices` (stale-while-revalidate).
 */
export async function hydrateInvoicesFromIdb(): Promise<void> {
  const [s, p] = await Promise.all([
    idbGet<SaleInvoice[]>(CACHE_KEYS.sales),
    idbGet<PurchaseInvoice[]>(CACHE_KEYS.purchases),
  ]);
  if (s && !cachedSales) { cachedSales = s; cacheNeedsRevalidation = true; }
  if (p && !cachedPurchases) { cachedPurchases = p; cacheNeedsRevalidation = true; }
}

async function loadAll() {
  // Try DB first
  const [dbSales, dbPurchases] = await Promise.all([loadSalesFromDb(), loadPurchasesFromDb()]);

  if (dbSales.length > 0 || dbPurchases.length > 0) {
    cachedSales = dbSales;
    cachedPurchases = dbPurchases;
    cacheNeedsRevalidation = false;
    idbSet(CACHE_KEYS.sales, dbSales);
    idbSet(CACHE_KEYS.purchases, dbPurchases);
    return;
  }

  // DB empty → try seeding from static Excel files (if they exist)
  console.log("[InvoiceData] DB empty, attempting seed from Excel files...");
  try {
    const [salesRes, purchasesRes] = await Promise.all([
      fetch("/data/Fatture_Full.xlsx"),
      fetch("/data/FattureAcquisto_Full.xlsx"),
    ]);
    if (!salesRes.ok && !purchasesRes.ok) {
      console.warn("[InvoiceData] Excel files not found — data must be imported from Strumenti.");
      cachedSales = [];
      cachedPurchases = [];
      return;
    }
    const [salesBuf, purchasesBuf] = await Promise.all([
      salesRes.ok ? salesRes.arrayBuffer() : Promise.resolve(null),
      purchasesRes.ok ? purchasesRes.arrayBuffer() : Promise.resolve(null),
    ]);
    const XLSX = await getXLSX();
    const toRows = (buf: ArrayBuffer | null) => {
      if (!buf) return [];
      const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });
      return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true });
    };
    const sales = parseExcelSales(toRows(salesBuf));
    const purchases = parseExcelPurchases(toRows(purchasesBuf));

    await Promise.all([
      sales.length > 0 ? seedSalesFromExcel(sales, "Fatture_Full.xlsx") : Promise.resolve(),
      purchases.length > 0 ? seedPurchasesFromExcel(purchases, "FattureAcquisto_Full.xlsx") : Promise.resolve(),
    ]);

    cachedSales = sales;
    cachedPurchases = purchases;
    idbSet(CACHE_KEYS.sales, sales);
    idbSet(CACHE_KEYS.purchases, purchases);
    console.log(`[InvoiceData] Seeded ${sales.length} sales + ${purchases.length} purchases`);
  } catch (err) {
    console.warn("[InvoiceData] Seeding failed:", err);
    cachedSales = [];
    cachedPurchases = [];
  }
}

export interface Filters {
  anno: string;
  cliente: string;
  fornitore: string;
  cig: string;
  centroCosto: string;
  centroRicavo: string;
}

export function useInvoiceData() {
  const [sales, setSales] = useState<SaleInvoice[]>([]);
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    anno: "", cliente: "", fornitore: "", cig: "", centroCosto: "", centroRicavo: "",
  });

  const refresh = useCallback(() => {
    invalidateInvoiceCache();
    loadPromise = loadAll();
    loadPromise.then(() => {
      setSales(cachedSales!);
      setPurchases(cachedPurchases!);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (cachedSales && cachedPurchases) {
      setSales(cachedSales);
      setPurchases(cachedPurchases);
      setLoading(false);
      // Stale-while-revalidate: if the in-memory cache came from IDB only,
      // fetch fresh data in the background and update state when ready.
      if (cacheNeedsRevalidation && !loadPromise) {
        loadPromise = loadAll();
        loadPromise.then(() => {
          setSales(cachedSales!);
          setPurchases(cachedPurchases!);
        });
      }
      return;
    }
    if (!loadPromise) {
      loadPromise = loadAll();
    }
    loadPromise.then(() => {
      setSales(cachedSales!);
      setPurchases(cachedPurchases!);
      setLoading(false);
    });
  }, []);

  const normalizedSales = useMemo(() => {
    return sales.map((invoice) => {
      const righe = Array.isArray(invoice.righe) ? invoice.righe : [];

      // Fallback CIG/CUP: se l'header non ha CIG/CUP, ereditali dalla prima riga che ne contiene uno.
      // Tipicamente l'ultima riga "Gara/Oggetto" della fattura emessa contiene CIG/CUP estratti dal parser.
      let inheritedCig = invoice.cig || "";
      let inheritedCup = invoice.cup || "";
      if (!inheritedCig || !inheritedCup) {
        for (const riga of righe) {
          if (!inheritedCig && riga.cig) inheritedCig = riga.cig;
          if (!inheritedCup && riga.cup) inheritedCup = riga.cup;
          if (inheritedCig && inheritedCup) break;
        }
      }
      const headerEnriched =
        inheritedCig !== (invoice.cig || "") || inheritedCup !== (invoice.cup || "")
          ? { ...invoice, cig: inheritedCig, cup: inheritedCup }
          : invoice;

      if (righe.length === 0) return headerEnriched;

      const sumRowsImponibile = righe.reduce((sum, riga) => sum + parseNumber(riga.imponibile), 0);
      const sumRowsTotale = righe.reduce((sum, riga) => sum + parseNumber(riga.totale), 0);
      const hasLegacyRowAmounts =
        Math.abs(sumRowsTotale - headerEnriched.imponibile) < 0.05 &&
        Math.abs(sumRowsImponibile - headerEnriched.imponibile) > 0.05;

      if (!hasLegacyRowAmounts) return headerEnriched;

      return {
        ...headerEnriched,
        righe: righe.map((riga) => {
          const imponibile = parseNumber(riga.imponibile);
          const imposta = parseNumber(riga.imposta);
          const totale = parseNumber(riga.totale);

          if (imponibile <= 0 || totale <= 0) return riga;

          const aliquota = imponibile > 0 ? imposta / imponibile : 0;
          const nextImponibile = Math.round(totale * 100) / 100;
          const nextImposta = Math.round(nextImponibile * aliquota * 100) / 100;
          const nextTotale = Math.round((nextImponibile + nextImposta) * 100) / 100;

          return {
            ...riga,
            imponibile: nextImponibile,
            imposta: nextImposta,
            totale: nextTotale,
          };
        }),
      };
    });
  }, [sales]);

  const filterOptions = useMemo(() => {
    const years = new Set<number>();
    const clients = new Set<string>();
    const suppliers = new Set<string>();
    const cigs = new Set<string>();
    normalizedSales.forEach((s) => { if (s.anno) years.add(s.anno); if (s.cliente) clients.add(s.cliente); if (s.cig) cigs.add(s.cig); });
    purchases.forEach((p) => { if (p.anno) years.add(p.anno); if (p.fornitore) suppliers.add(p.fornitore); if (p.cig) cigs.add(p.cig); });
    return {
      years: Array.from(years).filter(y => !isNaN(y)).sort((a, b) => b - a),
      clients: Array.from(clients).filter(Boolean).sort(),
      suppliers: Array.from(suppliers).filter(Boolean).sort(),
      cigs: Array.from(cigs).filter(Boolean).sort(),
    };
  }, [normalizedSales, purchases]);

  const filteredSales = useMemo(() => {
    return normalizedSales.filter((s) => {
      if (filters.anno && s.anno !== parseInt(filters.anno)) return false;
      if (filters.cliente && s.cliente !== filters.cliente) return false;
      if (filters.cig && s.cig !== filters.cig) return false;
      return true;
    });
  }, [normalizedSales, filters]);

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      if (filters.anno && p.anno !== parseInt(filters.anno)) return false;
      if (filters.fornitore && p.fornitore !== filters.fornitore) return false;
      if (filters.cig && p.cig !== filters.cig) return false;
      return true;
    });
  }, [purchases, filters]);

  return {
    sales: filteredSales,
    purchases: filteredPurchases,
    allSales: normalizedSales,
    allPurchases: purchases,
    loading,
    filters,
    setFilters,
    filterOptions,
    refresh,
  };
}
