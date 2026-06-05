import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import { useCssrCommesse } from "@/hooks/useCssrCommesse";
import { useRateFinanziamento } from "@/hooks/useRateFinanziamento";
import { useContiCorrenti } from "@/hooks/useContiCorrenti";
import { useDocumentiAcquisto, DocumentoAcquisto } from "@/hooks/useDocumentiAcquisto";
import {
  BudgetAssumptions,
  BudgetRow,
  buildRollingMonths,
  forecastCommesseRevenue,
  historicalMonthlyAverage,
  distributeFlat,
  buildCashFlowSchedule,
  applyOverrides,
  addValues,
  subValues,
  scaleValues,
  parseDateItOrIso,
} from "@/lib/budgetEngine";

const ASSUMPTIONS_KEY = "budget-assumptions-v1";

export function loadAssumptions(): BudgetAssumptions {
  try {
    const raw = localStorage.getItem(ASSUMPTIONS_KEY);
    if (!raw) return { historyYears: 2, inflationPct: 2, directCostPct: 65, overrides: {} };
    const parsed = JSON.parse(raw);
    return {
      historyYears: parsed.historyYears ?? 2,
      inflationPct: parsed.inflationPct ?? 2,
      directCostPct: parsed.directCostPct ?? 65,
      startMonth: parsed.startMonth,
      overrides: parsed.overrides || {},
    };
  } catch {
    return { historyYears: 2, inflationPct: 2, directCostPct: 65, overrides: {} };
  }
}

export function saveAssumptions(a: BudgetAssumptions): void {
  localStorage.setItem(ASSUMPTIONS_KEY, JSON.stringify(a));
}

async function loadBankInitialBalance(): Promise<number> {
  try {
    const { data } = await supabase
      .from("bank_movements" as any)
      .select("account_id, data, saldo")
      .order("data", { ascending: false })
      .limit(2000);
    if (!data) return 0;
    const seen = new Set<string>();
    let total = 0;
    for (const row of data as any[]) {
      if (seen.has(row.account_id)) continue;
      seen.add(row.account_id);
      total += Number(row.saldo) || 0;
    }
    return total;
  } catch {
    return 0;
  }
}

export function useBudgetData(assumptions: BudgetAssumptions) {
  const { allSales, allPurchases, loading: loadingInv } = useInvoiceData();
  const { commesse, loading: loadingCommesse } = useCssrCommesse();
  const { rate, loading: loadingRate } = useRateFinanziamento();
  const { conti } = useContiCorrenti();
  const { documenti: documentiAcq } = useDocumentiAcquisto("acquisto");

  const [initialBalance, setInitialBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState(true);

  useEffect(() => {
    loadBankInitialBalance().then((b) => {
      setInitialBalance(b);
      setLoadingBalance(false);
    });
  }, []);

  const months = useMemo(() => {
    let start: Date;
    if (assumptions.startMonth) {
      const [y, m] = assumptions.startMonth.split("-").map(Number);
      start = new Date(y, m - 1, 1);
    } else {
      start = new Date();
    }
    return buildRollingMonths(start, 12);
  }, [assumptions.startMonth]);

  const ceData = useMemo(() => {
    // === REVENUE ===
    const commesseForecast = forecastCommesseRevenue(commesse, allSales, months);

    // Altri ricavi = vendite senza CIG, media storica
    const altriRicaviSrc = allSales
      .filter((s) => !s.cig)
      .map((s) => ({ data: s.data, amount: s.imponibile || 0 }));
    const altriRicaviAvg = historicalMonthlyAverage(altriRicaviSrc, assumptions.historyYears, 0);
    const altriRicaviValues = distributeFlat(altriRicaviAvg, months);

    const ricaviTot = addValues(commesseForecast.total, altriRicaviValues);

    // === COSTI DIRETTI (variabili) ===
    const costiDiretti = scaleValues(commesseForecast.total, assumptions.directCostPct / 100);

    const margineContribuzione = subValues(ricaviTot, costiDiretti);

    // === COSTI STRUTTURA (fissi) - media storica costi acquisti senza CIG ===
    const costiStrutturaSrc = allPurchases
      .filter((p) => !p.cig)
      .map((p) => ({ data: p.data, amount: (p.imponibile || 0) + (p.cassa || 0) }));
    const costiStrutturaAvg = historicalMonthlyAverage(costiStrutturaSrc, assumptions.historyYears, assumptions.inflationPct);
    const costiStrutturaValues = distributeFlat(costiStrutturaAvg, months);

    // Polizze: quote mensili (premio / 12 distribuito su tutti i mesi)
    const polizze = documentiAcq.filter((d: DocumentoAcquisto) => (d.tipo_documento || "").toLowerCase() === "polizza");
    const polizzeAnnuo = polizze.reduce((s, p) => s + Number(p.importo || 0), 0);
    const polizzeQuota = distributeFlat(polizzeAnnuo / 12, months);

    const totCostiFissi = addValues(costiStrutturaValues, polizzeQuota);

    const ebitda = subValues(margineContribuzione, totCostiFissi);

    // === Ammortamenti / interessi - stima da rate finanziamento (parte interessi) ===
    const interessiValues: Record<string, number> = months.reduce<Record<string, number>>((acc, m) => { acc[m.key] = 0; return acc; }, {});
    rate.filter((r) => !r.pagata).forEach((r) => {
      const d = parseDateItOrIso(r.data_scadenza);
      if (!d) return;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (k in interessiValues) interessiValues[k] += r.importo_interessi || 0;
    });

    const risultato = subValues(ebitda, interessiValues);

    const rows: BudgetRow[] = [
      { key: "sec-ricavi", label: "RICAVI", kind: "section", sign: 0, values: {} },
      { key: "ricavi-commesse", label: "Ricavi da commesse aperte", kind: "line", sign: 1, values: commesseForecast.total, source: `${commesseForecast.perCommessa.length} commesse residue` },
      { key: "ricavi-altri", label: "Altri ricavi (media storica)", kind: "line", sign: 1, values: altriRicaviValues, source: `Media ${assumptions.historyYears} anni` },
      { key: "tot-ricavi", label: "A. Totale ricavi", kind: "subtotal", sign: 1, values: ricaviTot },

      { key: "sec-costi-var", label: "COSTI VARIABILI", kind: "section", sign: 0, values: {} },
      { key: "costi-diretti", label: `Costi diretti commessa (${assumptions.directCostPct}%)`, kind: "line", sign: -1, values: costiDiretti, source: "% sui ricavi commesse" },
      { key: "margine-contrib", label: "B. Margine di contribuzione", kind: "subtotal", sign: 1, values: margineContribuzione },

      { key: "sec-costi-fissi", label: "COSTI FISSI / STRUTTURA", kind: "section", sign: 0, values: {} },
      { key: "costi-struttura", label: "Costi di struttura", kind: "line", sign: -1, values: costiStrutturaValues, source: `Media ${assumptions.historyYears} anni +${assumptions.inflationPct}%` },
      { key: "polizze-quota", label: "Polizze (quote mensili)", kind: "line", sign: -1, values: polizzeQuota, source: `${polizze.length} polizze, ${polizzeAnnuo.toFixed(0)} €/anno` },
      { key: "tot-costi-fissi", label: "C. Totale costi fissi", kind: "subtotal", sign: -1, values: totCostiFissi },

      { key: "ebitda", label: "D. EBITDA", kind: "subtotal", sign: 1, values: ebitda },
      { key: "interessi", label: "Oneri finanziari (interessi rate)", kind: "line", sign: -1, values: interessiValues, source: "Da piani ammortamento" },
      { key: "risultato", label: "E. Risultato ante imposte", kind: "total", sign: 1, values: risultato },
    ];

    return { rows: applyOverrides(rows, assumptions.overrides), commesseDetail: commesseForecast.perCommessa };
  }, [commesse, allSales, allPurchases, rate, documentiAcq, months, assumptions]);

  const cashFlowData = useMemo(() => {
    const polizze = documentiAcq.filter((d: DocumentoAcquisto) => (d.tipo_documento || "").toLowerCase() === "polizza");
    const cf = buildCashFlowSchedule(allSales, allPurchases, rate, conti, polizze, months, initialBalance);

    const rows: BudgetRow[] = [
      { key: "cf-incassi", label: "(+) Incassi attesi da clienti", kind: "line", sign: 1, values: cf.incassiAttesi, source: "Scadenzario fatture vendita aperte" },
      { key: "cf-cred-fisc", label: "(+) Crediti fiscali (rate)", kind: "line", sign: 1, values: cf.rateCredFiscali, source: "Rate non pagate su conti crediti fiscali" },
      { key: "cf-pagamenti", label: "(−) Pagamenti fornitori", kind: "line", sign: -1, values: cf.pagamentiAttesi, source: "Scadenzario fatture acquisto aperte" },
      { key: "cf-rate", label: "(−) Rate finanziamenti", kind: "line", sign: -1, values: cf.rateFinanz, source: "Rate non pagate su conti finanziamento" },
      { key: "cf-polizze", label: "(−) Polizze", kind: "line", sign: -1, values: cf.polizzeOut, source: "Premio alla scadenza" },
      { key: "cf-saldo", label: "= Saldo finale liquidità", kind: "total", sign: 1, values: cf.saldoFinale, source: `Saldo iniziale: ${initialBalance.toFixed(2)} €` },
    ];

    return { rows: applyOverrides(rows, assumptions.overrides), initialBalance: cf.initialBalance };
  }, [allSales, allPurchases, rate, conti, documentiAcq, months, initialBalance, assumptions.overrides]);

  return {
    months,
    ceRows: ceData.rows,
    commesseDetail: ceData.commesseDetail,
    cashFlowRows: cashFlowData.rows,
    initialBalance: cashFlowData.initialBalance,
    loading: loadingInv || loadingCommesse || loadingRate || loadingBalance,
  };
}