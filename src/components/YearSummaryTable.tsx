import { useMemo } from "react";
import { formatCurrency } from "@/lib/format";
import type { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";

interface YearSummary {
  anno: number;
  ricavi: number;
  costi: number;
  saldo: number;
  marginePercent: number;
  numVendite: number;
  numAcquisti: number;
}

function buildYearSummaries(sales: SaleInvoice[], purchases: PurchaseInvoice[]): YearSummary[] {
  const map = new Map<number, YearSummary>();
  const ensure = (a: number) => {
    if (!map.has(a)) map.set(a, { anno: a, ricavi: 0, costi: 0, saldo: 0, marginePercent: 0, numVendite: 0, numAcquisti: 0 });
    return map.get(a)!;
  };
  sales.forEach((s) => { const y = ensure(s.anno); y.ricavi += s.imponibile; y.numVendite++; });
  purchases.forEach((p) => { const y = ensure(p.anno); y.costi += p.imponibile; y.numAcquisti++; });
  map.forEach((y) => { y.saldo = y.ricavi - y.costi; y.marginePercent = y.ricavi ? (y.saldo / y.ricavi) * 100 : 0; });
  return Array.from(map.values()).sort((a, b) => a.anno - b.anno);
}

export function YearSummaryTable({ allSales, allPurchases }: { allSales: SaleInvoice[]; allPurchases: PurchaseInvoice[] }) {
  const yearSummaries = useMemo(() => buildYearSummaries(allSales, allPurchases), [allSales, allPurchases]);

  const totals = useMemo(() => {
    const ricavi = yearSummaries.reduce((s, y) => s + y.ricavi, 0);
    const costi = yearSummaries.reduce((s, y) => s + y.costi, 0);
    const saldo = ricavi - costi;
    const margine = ricavi ? (saldo / ricavi) * 100 : 0;
    const numVendite = yearSummaries.reduce((s, y) => s + y.numVendite, 0);
    const numAcquisti = yearSummaries.reduce((s, y) => s + y.numAcquisti, 0);
    return { ricavi, costi, saldo, margine, numVendite, numAcquisti };
  }, [yearSummaries]);

  if (yearSummaries.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <h2 className="text-sm font-semibold text-foreground">Dettaglio per anno</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Anno</th>
              <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Ricavi</th>
              <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Costi</th>
              <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Risultato</th>
              <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Margine %</th>
              <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">N° Vendite</th>
              <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">N° Acquisti</th>
            </tr>
          </thead>
          <tbody>
            {yearSummaries.map((y) => (
              <tr key={y.anno} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 font-semibold font-mono">{y.anno}</td>
                <td className="px-4 py-2.5 text-right font-mono text-income">{formatCurrency(y.ricavi)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-expense">{formatCurrency(y.costi)}</td>
                <td className={`px-4 py-2.5 text-right font-mono font-semibold ${y.saldo >= 0 ? "text-income" : "text-expense"}`}>{formatCurrency(y.saldo)}</td>
                <td className={`px-4 py-2.5 text-right font-mono ${y.marginePercent >= 0 ? "text-income" : "text-expense"}`}>{y.marginePercent.toFixed(1)}%</td>
                <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{y.numVendite}</td>
                <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{y.numAcquisti}</td>
              </tr>
            ))}
            {yearSummaries.length > 1 && (
              <tr className="bg-muted/40 font-semibold border-t-2 border-foreground/20">
                <td className="px-4 py-2.5">TOTALE</td>
                <td className="px-4 py-2.5 text-right font-mono text-income">{formatCurrency(totals.ricavi)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-expense">{formatCurrency(totals.costi)}</td>
                <td className={`px-4 py-2.5 text-right font-mono ${totals.saldo >= 0 ? "text-income" : "text-expense"}`}>{formatCurrency(totals.saldo)}</td>
                <td className={`px-4 py-2.5 text-right font-mono ${totals.margine >= 0 ? "text-income" : "text-expense"}`}>{totals.margine.toFixed(1)}%</td>
                <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{totals.numVendite}</td>
                <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{totals.numAcquisti}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
