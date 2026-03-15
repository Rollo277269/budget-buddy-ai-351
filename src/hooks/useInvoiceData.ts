import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

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
  const match = desc.match(/CIG[:\s]*([A-Z0-9]+)/i);
  return match ? match[1] : "";
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
    const riga: SaleInvoiceRiga = {
      descrizione: desc, imponibile: parseNumber(r[22]),
      imposta: parseNumber(r[23]), totale: parseNumber(r[21]),
      cig: extractCIG(desc), cup: extractCUP(desc),
    };
    if (invoiceMap.has(key)) {
      invoiceMap.get(key)!.righe.push(riga);
    } else {
      invoiceMap.set(key, {
        tipo, anno, numero, data: formatDate(r[4]),
        cliente: String(r[6] || ""), partitaIva: String(r[8] || ""),
        totale: parseNumber(r[21]), imponibile: parseNumber(r[22]),
        imposta: parseNumber(r[23]), descrizione: desc,
        cig: extractCIG(desc), cup: extractCUP(desc),
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
      cig: extractCIG(desc), cup: extractCUP(desc),
      stato: String(r[46] || ""), scadenza: String(r[11] || ""),
      pagamento: String(r[12] || ""),
    });
  }
  return invoices;
}

// ── DB helpers ──

async function loadSalesFromDb(): Promise<SaleInvoice[]> {
  const allRows: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("fatture_vendita" as any)
      .select("*")
      .order("anno", { ascending: true })
      .order("numero", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) { console.error("Error loading sales:", error); break; }
    if (!data || data.length === 0) break;
    allRows.push(...(data as any[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return allRows.map((d: any) => ({
    tipo: d.tipo, anno: d.anno, numero: d.numero, data: d.data,
    cliente: d.cliente, partitaIva: d.partita_iva,
    totale: Number(d.totale), imponibile: Number(d.imponibile), imposta: Number(d.imposta),
    descrizione: d.descrizione, cig: d.cig, cup: d.cup,
    stato: d.stato, scadenza: d.scadenza, pagamento: d.pagamento,
    righe: (typeof d.righe === "string" ? JSON.parse(d.righe) : d.righe || []) as SaleInvoiceRiga[],
  }));
}

async function loadPurchasesFromDb(): Promise<PurchaseInvoice[]> {
  const allRows: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("fatture_acquisto" as any)
      .select("*")
      .order("anno", { ascending: true })
      .order("numero", { ascending: true })
      .range(from, from + PAGE - 1);
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
  const rows = salesData.map(s => ({
    tipo: s.tipo, anno: s.anno, numero: s.numero, data: s.data,
    cliente: s.cliente, partita_iva: s.partitaIva,
    totale: s.totale, imponibile: s.imponibile, imposta: s.imposta,
    descrizione: s.descrizione, cig: s.cig, cup: s.cup,
    stato: s.stato, scadenza: s.scadenza, pagamento: s.pagamento,
    righe: JSON.stringify(s.righe), source_file: sourceFile,
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase.from("fatture_vendita" as any).upsert(batch as any, { onConflict: "anno,numero,tipo" });
    if (error) console.error("Seed sales error:", error);
  }
}

export async function seedPurchasesFromExcel(purchasesData: PurchaseInvoice[], sourceFile: string) {
  const rows = purchasesData.map(p => ({
    tipo: p.tipo, anno: p.anno, numero: p.numero, data: p.data,
    fornitore: p.fornitore, partita_iva: p.partitaIva,
    totale: p.totale, imponibile: p.imponibile, imposta: p.imposta,
    cassa: p.cassa, ritenute: p.ritenute,
    descrizione: p.descrizione, cig: p.cig, cup: p.cup,
    stato: p.stato, scadenza: p.scadenza, pagamento: p.pagamento,
    source_file: sourceFile,
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase.from("fatture_acquisto" as any).upsert(batch as any, { onConflict: "anno,numero" });
    if (error) console.error("Seed purchases error:", error);
  }
}

// ── Cache ──
let cachedSales: SaleInvoice[] | null = null;
let cachedPurchases: PurchaseInvoice[] | null = null;
let loadPromise: Promise<void> | null = null;

export function invalidateInvoiceCache() {
  cachedSales = null;
  cachedPurchases = null;
  loadPromise = null;
}

async function loadAll() {
  // Try DB first
  const [dbSales, dbPurchases] = await Promise.all([loadSalesFromDb(), loadPurchasesFromDb()]);

  if (dbSales.length > 0 || dbPurchases.length > 0) {
    cachedSales = dbSales;
    cachedPurchases = dbPurchases;
    return;
  }

  // DB empty → seed from static Excel files
  console.log("[InvoiceData] DB empty, seeding from Excel files...");
  const [salesRows, purchaseRows] = await Promise.all([
    loadExcel("/data/Fatture_Full.xlsx"),
    loadExcel("/data/FattureAcquisto_Full.xlsx"),
  ]);
  const sales = parseExcelSales(salesRows);
  const purchases = parseExcelPurchases(purchaseRows);

  // Save to DB
  await Promise.all([
    seedSalesFromExcel(sales, "Fatture_Full.xlsx"),
    seedPurchasesFromExcel(purchases, "FattureAcquisto_Full.xlsx"),
  ]);

  cachedSales = sales;
  cachedPurchases = purchases;
  console.log(`[InvoiceData] Seeded ${sales.length} sales + ${purchases.length} purchases`);
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
    setLoading(true);
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

  const filterOptions = useMemo(() => {
    const years = new Set<number>();
    const clients = new Set<string>();
    const suppliers = new Set<string>();
    const cigs = new Set<string>();
    sales.forEach((s) => { if (s.anno) years.add(s.anno); if (s.cliente) clients.add(s.cliente); if (s.cig) cigs.add(s.cig); });
    purchases.forEach((p) => { if (p.anno) years.add(p.anno); if (p.fornitore) suppliers.add(p.fornitore); if (p.cig) cigs.add(p.cig); });
    return {
      years: Array.from(years).filter(y => !isNaN(y)).sort((a, b) => b - a),
      clients: Array.from(clients).filter(Boolean).sort(),
      suppliers: Array.from(suppliers).filter(Boolean).sort(),
      cigs: Array.from(cigs).filter(Boolean).sort(),
    };
  }, [sales, purchases]);

  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (filters.anno && s.anno !== parseInt(filters.anno)) return false;
      if (filters.cliente && s.cliente !== filters.cliente) return false;
      if (filters.cig && s.cig !== filters.cig) return false;
      return true;
    });
  }, [sales, filters]);

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
    allSales: sales,
    allPurchases: purchases,
    loading,
    filters,
    setFilters,
    filterOptions,
    refresh,
  };
}
