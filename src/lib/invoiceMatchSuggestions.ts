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

function dateDiffDays(d1: string, d2: string): number | null {
  try {
    const a = new Date(d1.split("/").reverse().join("-"));
    const b = new Date(d2.split("/").reverse().join("-"));
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    return Math.abs((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

export function computeSuggestions(
  record: XmlInvoiceRecord,
  invoices: (SaleInvoice | PurchaseInvoice)[],
  xmlMap: Map<string, XmlInvoiceRecord>,
  tipo: "vendita" | "acquisto",
  maxResults = 5
): MatchSuggestion[] {
  // Only suggest invoices not already matched to an XML
  const available = invoices.filter((inv) => !xmlMap.has(`${inv.anno}-${inv.numero}`));

  const results: MatchSuggestion[] = [];

  for (const inv of available) {
    let score = 0;
    const reasons: string[] = [];

    // Year match
    if (record.anno && inv.anno === record.anno) {
      score += 10;
      reasons.push("Stesso anno");
    }

    // Amount similarity (±5%)
    if (record.importo_totale && inv.totale) {
      const diff = Math.abs(record.importo_totale - inv.totale) / Math.max(inv.totale, 0.01);
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

    // Date proximity
    if (record.data_fattura && inv.data) {
      const days = dateDiffDays(record.data_fattura, inv.data);
      if (days !== null) {
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
    }

    // Name match
    const xmlName = tipo === "vendita" ? record.cessionario_denominazione : record.cedente_denominazione;
    const invName = tipo === "vendita" ? (inv as SaleInvoice).cliente : (inv as PurchaseInvoice).fornitore;
    if (xmlName && invName && fuzzyMatch(xmlName, invName)) {
      score += 30;
      reasons.push(tipo === "vendita" ? "Stesso cliente" : "Stesso fornitore");
    }

    if (score > 0) {
      results.push({
        invoice: {
          anno: inv.anno,
          numero: inv.numero,
          label: `${inv.numero}/${inv.anno}`,
          totale: inv.totale,
          data: inv.data,
          ...(tipo === "vendita" ? { cliente: (inv as SaleInvoice).cliente } : { fornitore: (inv as PurchaseInvoice).fornitore }),
        },
        score,
        reasons,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}
