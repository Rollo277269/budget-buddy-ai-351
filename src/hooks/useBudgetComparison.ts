import { useMemo } from "react";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import { useCssrCommesse } from "@/hooks/useCssrCommesse";
import { useRateFinanziamento } from "@/hooks/useRateFinanziamento";
import { useDocumentiAcquisto, DocumentoAcquisto } from "@/hooks/useDocumentiAcquisto";
import {
  BudgetAssumptions,
  BudgetMonth,
  forecastCommesseRevenue,
  historicalMonthlyAverage,
  distributeFlat,
  addValues,
  subValues,
  scaleValues,
  parseDateItOrIso,
} from "@/lib/budgetEngine";

const MESI_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function buildYearMonths(year: number): BudgetMonth[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, i, 1);
    return {
      key: `${year}-${String(i + 1).padStart(2, "0")}`,
      date: d,
      label: `${MESI_SHORT[i]} ${String(year).slice(-2)}`,
      year,
      month: i + 1,
    };
  });
}

function emptyValues(months: BudgetMonth[]): Record<string, number> {
  return months.reduce<Record<string, number>>((acc, m) => { acc[m.key] = 0; return acc; }, {});
}

function bucketByDate<T>(
  items: T[],
  getDate: (i: T) => string | null | undefined,
  getAmount: (i: T) => number,
  months: BudgetMonth[],
): Record<string, number> {
  const out = emptyValues(months);
  items.forEach((it) => {
    const d = parseDateItOrIso(getDate(it) || "");
    if (!d) return;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (k in out) out[k] += getAmount(it) || 0;
  });
  return out;
}

export interface ComparisonRow {
  key: string;
  label: string;
  kind: "section" | "line" | "subtotal" | "total";
  sign: 1 | -1 | 0;
  actual: Record<string, number>;
  forecast: Record<string, number>;
}

export function useBudgetComparison(year: number, assumptions: BudgetAssumptions) {
  const { allSales, allPurchases, loading: loadingInv } = useInvoiceData();
  const { commesse, loading: loadingCommesse } = useCssrCommesse();
  const { rate, loading: loadingRate } = useRateFinanziamento();
  const { documenti: documentiAcq } = useDocumentiAcquisto("acquisto");

  const months = useMemo(() => buildYearMonths(year), [year]);

  const data = useMemo(() => {
    // ===== ACTUAL (storico anno selezionato) =====
    const ricaviCommesseAct = bucketByDate(
      allSales.filter((s) => !!s.cig),
      (s) => s.data,
      (s) => s.imponibile || 0,
      months,
    );
    const ricaviAltriAct = bucketByDate(
      allSales.filter((s) => !s.cig),
      (s) => s.data,
      (s) => s.imponibile || 0,
      months,
    );
    const ricaviTotAct = addValues(ricaviCommesseAct, ricaviAltriAct);

    const costiDirettiAct = bucketByDate(
      allPurchases.filter((p) => !!p.cig),
      (p) => p.data,
      (p) => (p.imponibile || 0) + (p.cassa || 0),
      months,
    );
    const margineContribAct = subValues(ricaviTotAct, costiDirettiAct);

    const costiStrutturaAct = bucketByDate(
      allPurchases.filter((p) => !p.cig),
      (p) => p.data,
      (p) => (p.imponibile || 0) + (p.cassa || 0),
      months,
    );
    const polizzeAct = bucketByDate(
      documentiAcq.filter((d: DocumentoAcquisto) => (d.tipo_documento || "").toLowerCase() === "polizza"),
      (d) => d.data_scadenza || null,
      (d) => Number(d.importo || 0),
      months,
    );
    const totFissiAct = addValues(costiStrutturaAct, polizzeAct);
    const ebitdaAct = subValues(margineContribAct, totFissiAct);

    const interessiAct = emptyValues(months);
    rate.filter((r) => r.pagata).forEach((r) => {
      const d = parseDateItOrIso(r.data_scadenza);
      if (!d) return;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (k in interessiAct) interessiAct[k] += r.importo_interessi || 0;
    });
    const risultatoAct = subValues(ebitdaAct, interessiAct);

    // ===== FORECAST (previsionale per i mesi dell'anno selezionato) =====
    const commesseForecast = forecastCommesseRevenue(commesse, allSales, months);
    const ricaviCommesseFc = commesseForecast.total;

    const altriRicaviSrc = allSales
      .filter((s) => !s.cig)
      .map((s) => ({ data: s.data, amount: s.imponibile || 0 }));
    const altriAvg = historicalMonthlyAverage(altriRicaviSrc, assumptions.historyYears, 0);
    const ricaviAltriFc = distributeFlat(altriAvg, months);

    const ricaviTotFc = addValues(ricaviCommesseFc, ricaviAltriFc);
    const costiDirettiFc = scaleValues(ricaviCommesseFc, assumptions.directCostPct / 100);
    const margineContribFc = subValues(ricaviTotFc, costiDirettiFc);

    const costiStrutturaSrc = allPurchases
      .filter((p) => !p.cig)
      .map((p) => ({ data: p.data, amount: (p.imponibile || 0) + (p.cassa || 0) }));
    const strutturaAvg = historicalMonthlyAverage(costiStrutturaSrc, assumptions.historyYears, assumptions.inflationPct);
    const costiStrutturaFc = distributeFlat(strutturaAvg, months);

    const polizze = documentiAcq.filter((d: DocumentoAcquisto) => (d.tipo_documento || "").toLowerCase() === "polizza");
    const polizzeAnnuo = polizze.reduce((s, p) => s + Number(p.importo || 0), 0);
    const polizzeFc = distributeFlat(polizzeAnnuo / 12, months);
    const totFissiFc = addValues(costiStrutturaFc, polizzeFc);
    const ebitdaFc = subValues(margineContribFc, totFissiFc);

    const interessiFc = emptyValues(months);
    rate.forEach((r) => {
      const d = parseDateItOrIso(r.data_scadenza);
      if (!d) return;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (k in interessiFc) interessiFc[k] += r.importo_interessi || 0;
    });
    const risultatoFc = subValues(ebitdaFc, interessiFc);

    const rows: ComparisonRow[] = [
      { key: "ric-comm", label: "Ricavi da commesse", kind: "line", sign: 1, actual: ricaviCommesseAct, forecast: ricaviCommesseFc },
      { key: "ric-altri", label: "Altri ricavi", kind: "line", sign: 1, actual: ricaviAltriAct, forecast: ricaviAltriFc },
      { key: "tot-ric", label: "Totale ricavi", kind: "subtotal", sign: 1, actual: ricaviTotAct, forecast: ricaviTotFc },
      { key: "c-dir", label: "Costi diretti commessa", kind: "line", sign: -1, actual: costiDirettiAct, forecast: costiDirettiFc },
      { key: "marg-c", label: "Margine di contribuzione", kind: "subtotal", sign: 1, actual: margineContribAct, forecast: margineContribFc },
      { key: "c-strut", label: "Costi di struttura", kind: "line", sign: -1, actual: costiStrutturaAct, forecast: costiStrutturaFc },
      { key: "c-poliz", label: "Polizze", kind: "line", sign: -1, actual: polizzeAct, forecast: polizzeFc },
      { key: "tot-fissi", label: "Totale costi fissi", kind: "subtotal", sign: -1, actual: totFissiAct, forecast: totFissiFc },
      { key: "ebitda", label: "EBITDA", kind: "subtotal", sign: 1, actual: ebitdaAct, forecast: ebitdaFc },
      { key: "interessi", label: "Oneri finanziari", kind: "line", sign: -1, actual: interessiAct, forecast: interessiFc },
      { key: "risultato", label: "Risultato ante imposte", kind: "total", sign: 1, actual: risultatoAct, forecast: risultatoFc },
    ];

    return { rows };
  }, [allSales, allPurchases, commesse, rate, documentiAcq, months, assumptions]);

  // available years derived from invoice data
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    allSales.forEach((s) => { const d = parseDateItOrIso(s.data); if (d) set.add(d.getFullYear()); });
    allPurchases.forEach((p) => { const d = parseDateItOrIso(p.data); if (d) set.add(d.getFullYear()); });
    const now = new Date().getFullYear();
    set.add(now);
    return Array.from(set).sort((a, b) => b - a);
  }, [allSales, allPurchases]);

  return {
    months,
    rows: data.rows,
    availableYears,
    loading: loadingInv || loadingCommesse || loadingRate,
  };
}