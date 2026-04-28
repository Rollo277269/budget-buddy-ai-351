import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { XmlInvoiceRecord } from "@/hooks/useXmlInvoices";

export interface MatchSuggestion {
  invoice: { anno: number; numero: number; label: string; totale: number; data: string; cliente?: string; fornitore?: string; tipo?: string };
  score: number;
  reasons: string[];
}

function normalizeStr(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

function parseDateMs(d: string): number | null {
  if (!d) return null;
  // dd/mm/yyyy
  const parts = d.split("/");
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    const t = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));
    return isNaN(t) ? null : t;
  }
  const t = Date.parse(d);
  return isNaN(t) ? null : t;
}

// Per-invoice precomputed cache (keyed by reference identity)
const invoiceMetaCache = new WeakMap<object, {
  nameNorm: string;
  dateMs: number | null;
  isNC: boolean;
}>();

function getInvoiceMeta(inv: SaleInvoice | PurchaseInvoice, tipo: "vendita" | "acquisto") {
  let m = invoiceMetaCache.get(inv as unknown as object);
  if (m) return m;
  const invName = tipo === "vendita" ? (inv as SaleInvoice).cliente : (inv as PurchaseInvoice).fornitore;
  const tipoStr = ((inv as SaleInvoice).tipo || "").toLowerCase();
  m = {
    nameNorm: normalizeStr(invName || ""),
    dateMs: parseDateMs(inv.data),
    isNC: tipoStr.includes("nota") && tipoStr.includes("credito"),
  };
  invoiceMetaCache.set(inv as unknown as object, m);
  return m;
}

// Result cache per (record, invoices ref, xmlMap size, tipo)
const suggestionsCache = new WeakMap<XmlInvoiceRecord, {
  invoicesRef: object;
  invoicesLen: number;
  xmlMapSize: number;
  tipo: string;
  result: MatchSuggestion[];
}>();

export function computeSuggestions(
  record: XmlInvoiceRecord,
  invoices: (SaleInvoice | PurchaseInvoice)[],
  xmlMap: Map<string, XmlInvoiceRecord>,
  tipo: "vendita" | "acquisto",
  maxResults = 5
): MatchSuggestion[] {
  // Memoization: skip recompute when inputs haven't changed
  const cached = suggestionsCache.get(record);
  if (
    cached &&
    cached.invoicesRef === (invoices as unknown as object) &&
    cached.invoicesLen === invoices.length &&
    cached.xmlMapSize === xmlMap.size &&
    cached.tipo === tipo
  ) {
    return cached.result;
  }

  const xmlNameRaw = tipo === "vendita" ? record.cessionario_denominazione : record.cedente_denominazione;
  const xmlNameNorm = normalizeStr(xmlNameRaw || "");
  const xmlDateMs = parseDateMs(record.data_fattura || "");
  const xmlTipoDoc = (record as any).parsed_data?.tipoDocumento || "";
  const xmlIsNC = xmlTipoDoc.toUpperCase() === "TD04";
  const xmlImporto = record.importo_totale || 0;

  const results: MatchSuggestion[] = [];

  for (const inv of invoices) {
    // Skip already matched
    if (xmlMap.has(`${inv.anno}-${inv.numero}`)) continue;

    // Cheap prefilter: must share at least one strong signal
    // (same year OR amount within 15% OR name overlap)
    const sameYear = !!record.anno && inv.anno === record.anno;
    const amtClose = xmlImporto && inv.totale
      ? Math.abs(xmlImporto - inv.totale) / Math.max(inv.totale, 0.01) < 0.15
      : false;
    const meta = getInvoiceMeta(inv, tipo);
    const nameOverlap = !!xmlNameNorm && !!meta.nameNorm &&
      (xmlNameNorm.includes(meta.nameNorm) || meta.nameNorm.includes(xmlNameNorm));
    if (!sameYear && !amtClose && !nameOverlap) continue;

    let score = 0;
    const reasons: string[] = [];

    if (sameYear) {
      score += 10;
      reasons.push("Stesso anno");
    }

    if (xmlImporto && inv.totale) {
      const diff = Math.abs(xmlImporto - inv.totale) / Math.max(inv.totale, 0.01);
      if (diff < 0.01) {
        score += 40;
        reasons.push("Importo identico");
      } else if (diff < 0.05) {
        score += 30;
        reasons.push("Importo simile (±5%)");
      } else if (diff < 0.15) {
        score += 10;
        reasons.push("Importo vicino");
      }
    }

    if (xmlDateMs !== null && meta.dateMs !== null) {
      const days = Math.abs((xmlDateMs - meta.dateMs) / 86400000);
        if (days === 0) {
          score += 20;
          reasons.push("Stessa data");
        } else if (days <= 7) {
          score += 15;
          reasons.push("Data vicina (±7gg)");
        } else if (days <= 30) {
          score += 5;
          reasons.push("Data entro 30gg");
        }
    }

    if (nameOverlap) {
      score += 30;
      reasons.push(tipo === "vendita" ? "Stesso cliente" : "Stesso fornitore");
    }

    if (tipo === "vendita") {
      if (xmlIsNC === meta.isNC) {
        score += 15;
        reasons.push(xmlIsNC ? "Entrambe NC" : "Entrambe fatture");
      } else {
        score -= 20;
        reasons.push(xmlIsNC ? "XML è NC, fattura no" : "Fattura è NC, XML no");
      }
    }

    if (score > 0) {
      results.push({
        invoice: {
          anno: inv.anno,
          numero: inv.numero,
          label: `${inv.numero}/${inv.anno}`,
          totale: inv.totale,
          data: inv.data,
          tipo: inv.tipo,
          ...(tipo === "vendita" ? { cliente: (inv as SaleInvoice).cliente } : { fornitore: (inv as PurchaseInvoice).fornitore }),
        },
        score,
        reasons,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const sliced = results.slice(0, maxResults);
  suggestionsCache.set(record, {
    invoicesRef: invoices as unknown as object,
    invoicesLen: invoices.length,
    xmlMapSize: xmlMap.size,
    tipo,
    result: sliced,
  });
  return sliced;
}
