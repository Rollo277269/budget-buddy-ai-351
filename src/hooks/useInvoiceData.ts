import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";

export interface SaleInvoice {
  tipo: string;
  anno: number;
  numero: number;
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

// Cache parsed Excel data across component mounts to avoid re-parsing on navigation
let cachedSales: SaleInvoice[] | null = null;
let cachedPurchases: PurchaseInvoice[] | null = null;
let loadPromise: Promise<void> | null = null;

async function loadExcel(url: string): Promise<any[]> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
}

function parseSales(rows: any[]): SaleInvoice[] {
  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (rows[i] && String(rows[i][0]).includes("Tipo Documento")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const invoices: SaleInvoice[] = [];
  const seen = new Set<string>();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const anno = parseInt(String(r[1]));
    const numero = parseInt(String(r[2]));
    const key = `${anno}-${numero}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const desc = String(r[13] || "");
    invoices.push({
      tipo: String(r[0]),
      anno,
      numero,
      data: formatDate(r[4]),
      cliente: String(r[6] || ""),
      partitaIva: String(r[8] || ""),
      totale: parseNumber(r[21]),
      imponibile: parseNumber(r[22]),
      imposta: parseNumber(r[23]),
      descrizione: desc,
      cig: extractCIG(desc),
      cup: extractCUP(desc),
      stato: String(r[44] || ""),
      scadenza: String(r[9] || ""),
      pagamento: String(r[10] || ""),
    });
  }
  return invoices;
}

function parsePurchases(rows: any[]): PurchaseInvoice[] {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (rows[i] && String(rows[i][0]).includes("Tipo Documento")) {
      headerIdx = i;
      break;
    }
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
      tipo: String(r[0]),
      anno,
      numero,
      data: formatDate(r[4]),
      fornitore: String(r[8] || ""),
      partitaIva: String(r[10] || ""),
      totale: parseNumber(r[23]),
      imponibile: parseNumber(r[24]),
      imposta: parseNumber(r[25]),
      descrizione: desc,
      cig: extractCIG(desc),
      cup: extractCUP(desc),
      stato: String(r[46] || ""),
      scadenza: String(r[11] || ""),
      pagamento: String(r[12] || ""),
    });
  }
  return invoices;
}

export interface Filters {
  anno: string;
  cliente: string;
  fornitore: string;
  cig: string;
}

export function useInvoiceData() {
  const [sales, setSales] = useState<SaleInvoice[]>([]);
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    anno: "",
    cliente: "",
    fornitore: "",
    cig: "",
  });

  useEffect(() => {
    Promise.all([
      loadExcel("/data/Fatture_Full.xlsx"),
      loadExcel("/data/FattureAcquisto_Full.xlsx"),
    ]).then(([salesRows, purchaseRows]) => {
      setSales(parseSales(salesRows));
      setPurchases(parsePurchases(purchaseRows));
      setLoading(false);
    });
  }, []);

  const filterOptions = useMemo(() => {
    const years = new Set<number>();
    const clients = new Set<string>();
    const suppliers = new Set<string>();
    const cigs = new Set<string>();

    sales.forEach((s) => {
      if (s.anno) years.add(s.anno);
      if (s.cliente) clients.add(s.cliente);
      if (s.cig) cigs.add(s.cig);
    });
    purchases.forEach((p) => {
      if (p.anno) years.add(p.anno);
      if (p.fornitore) suppliers.add(p.fornitore);
      if (p.cig) cigs.add(p.cig);
    });

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
  };
}
