import { useState, useMemo } from "react";
import { BudgetAssumptions } from "@/lib/budgetEngine";
import { useBudgetComparison, ComparisonRow } from "@/hooks/useBudgetComparison";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";
import { Loader2 } from "lucide-react";

interface Props {
  assumptions: BudgetAssumptions;
}

function sumRow(values: Record<string, number>): number {
  return Object.values(values).reduce((s, v) => s + v, 0);
}

function fmt(v: number): string {
  if (!v || Math.abs(v) < 0.005) return "—";
  return formatCurrency(v);
}

function variance(actual: number, forecast: number): { delta: number; pct: number } {
  const delta = actual - forecast;
  const pct = forecast !== 0 ? (delta / Math.abs(forecast)) * 100 : 0;
  return { delta, pct };
}

export function ConfrontoStoricoPrevisionale({ assumptions }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const { months, rows, availableYears, loading } = useBudgetComparison(year, assumptions);

  const chartData = useMemo(() => {
    const ric = rows.find((r) => r.key === "tot-ric");
    const ebitda = rows.find((r) => r.key === "ebitda");
    const ris = rows.find((r) => r.key === "risultato");
    return months.map((m) => ({
      mese: m.label,
      "Ricavi storico": ric?.actual[m.key] || 0,
      "Ricavi previsto": ric?.forecast[m.key] || 0,
      "EBITDA storico": ebitda?.actual[m.key] || 0,
      "EBITDA previsto": ebitda?.forecast[m.key] || 0,
      "Risultato storico": ris?.actual[m.key] || 0,
      "Risultato previsto": ris?.forecast[m.key] || 0,
    }));
  }, [rows, months]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Calcolo confronto...</span>
      </div>
    );
  }

  const summary = ["tot-ric", "ebitda", "risultato"].map((k) => {
    const r = rows.find((x) => x.key === k)!;
    const a = sumRow(r.actual);
    const f = sumRow(r.forecast);
    return { label: r.label, actual: a, forecast: f, ...variance(a, f) };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="text-xs text-muted-foreground">Anno di confronto</label>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableYears.map((y) => (
              <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground italic">
          Storico = dati reali registrati nell'anno. Previsionale = stima ricostruita applicando il modello (commesse residue, medie storiche, assunzioni correnti) sui mesi dell'anno selezionato.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {summary.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <div className="grid grid-cols-2 gap-1 mt-1">
                <div>
                  <p className="text-[9px] text-muted-foreground">Storico</p>
                  <p className="text-sm font-bold font-mono">{fmt(s.actual)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground">Previsto</p>
                  <p className="text-sm font-bold font-mono text-muted-foreground">{fmt(s.forecast)}</p>
                </div>
              </div>
              <div className="flex items-baseline justify-between mt-1 pt-1 border-t">
                <span className="text-[9px] text-muted-foreground">Δ</span>
                <span className={cn("text-xs font-mono font-semibold", s.delta < 0 ? "text-expense" : "text-income")}>
                  {s.delta >= 0 ? "+" : ""}{fmt(s.delta)} ({s.pct >= 0 ? "+" : ""}{s.pct.toFixed(1)}%)
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="border rounded-md bg-card p-2">
        <h3 className="text-xs font-semibold mb-1 px-1">Andamento mensile — Storico vs Previsionale</h3>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="mese" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Tooltip
              formatter={(v: number) => formatCurrency(v)}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="Ricavi storico" fill="hsl(var(--income))" opacity={0.85} />
            <Bar dataKey="Ricavi previsto" fill="hsl(var(--income))" opacity={0.35} />
            <Line type="monotone" dataKey="EBITDA storico" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="EBITDA previsto" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="4 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ComparisonTable rows={rows} months={months} />
    </div>
  );
}

function ComparisonTable({ rows, months }: { rows: ComparisonRow[]; months: { key: string; label: string }[] }) {
  return (
    <div className="overflow-x-auto border rounded-md bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            <th rowSpan={2} className="text-left px-2 py-1.5 font-semibold sticky left-0 bg-muted/50 z-10 min-w-[200px] align-bottom">
              Voce
            </th>
            {months.map((m) => (
              <th key={m.key} colSpan={3} className="text-center px-2 py-1 font-semibold border-l whitespace-nowrap">
                {m.label}
              </th>
            ))}
            <th colSpan={3} className="text-center px-2 py-1 font-semibold border-l bg-muted whitespace-nowrap">
              Totale anno
            </th>
          </tr>
          <tr>
            {months.map((m) => (
              <>
                <th key={`${m.key}-a`} className="text-right px-1 py-1 font-normal text-[9px] text-muted-foreground border-l">Stor.</th>
                <th key={`${m.key}-f`} className="text-right px-1 py-1 font-normal text-[9px] text-muted-foreground">Prev.</th>
                <th key={`${m.key}-d`} className="text-right px-1 py-1 font-normal text-[9px] text-muted-foreground">Δ%</th>
              </>
            ))}
            <th className="text-right px-1 py-1 font-normal text-[9px] text-muted-foreground border-l bg-muted">Stor.</th>
            <th className="text-right px-1 py-1 font-normal text-[9px] text-muted-foreground bg-muted">Prev.</th>
            <th className="text-right px-1 py-1 font-normal text-[9px] text-muted-foreground bg-muted">Δ%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isSub = r.kind === "subtotal";
            const isTot = r.kind === "total";
            const totA = sumRow(r.actual);
            const totF = sumRow(r.forecast);
            const totV = variance(totA, totF);
            return (
              <tr
                key={r.key}
                className={cn(
                  "border-b",
                  isSub && "bg-muted/20 font-semibold",
                  isTot && "bg-primary/5 font-bold border-t-2 border-primary/40",
                )}
              >
                <td className={cn(
                  "px-2 py-1 sticky left-0 z-10 whitespace-nowrap",
                  isSub ? "bg-muted/20" : isTot ? "bg-primary/5" : "bg-card",
                )}>
                  {r.label}
                </td>
                {months.map((m) => {
                  const a = r.actual[m.key] || 0;
                  const f = r.forecast[m.key] || 0;
                  const v = variance(a, f);
                  const sa = r.sign === -1 ? -Math.abs(a) : a;
                  const sf = r.sign === -1 ? -Math.abs(f) : f;
                  return (
                    <>
                      <td key={`${m.key}-a`} className={cn("text-right px-1 py-1 font-mono whitespace-nowrap border-l", sa < 0 && "text-expense", sa > 0 && r.sign === 1 && "text-income")}>{fmt(sa)}</td>
                      <td key={`${m.key}-f`} className="text-right px-1 py-1 font-mono whitespace-nowrap text-muted-foreground">{fmt(sf)}</td>
                      <td key={`${m.key}-d`} className={cn("text-right px-1 py-1 font-mono text-[10px] whitespace-nowrap", v.delta < 0 && r.sign === 1 && "text-expense", v.delta > 0 && r.sign === 1 && "text-income", v.delta > 0 && r.sign === -1 && "text-expense", v.delta < 0 && r.sign === -1 && "text-income")}>
                        {a === 0 && f === 0 ? "—" : `${v.pct >= 0 ? "+" : ""}${v.pct.toFixed(0)}%`}
                      </td>
                    </>
                  );
                })}
                <td className={cn("text-right px-1 py-1 font-mono font-semibold whitespace-nowrap border-l bg-muted/30", (r.sign === -1 ? -Math.abs(totA) : totA) < 0 && "text-expense", (r.sign === -1 ? -Math.abs(totA) : totA) > 0 && r.sign === 1 && "text-income")}>
                  {fmt(r.sign === -1 ? -Math.abs(totA) : totA)}
                </td>
                <td className="text-right px-1 py-1 font-mono font-semibold whitespace-nowrap bg-muted/30 text-muted-foreground">
                  {fmt(r.sign === -1 ? -Math.abs(totF) : totF)}
                </td>
                <td className={cn("text-right px-1 py-1 font-mono font-semibold text-[10px] whitespace-nowrap bg-muted/30", totV.delta < 0 && r.sign === 1 && "text-expense", totV.delta > 0 && r.sign === 1 && "text-income", totV.delta > 0 && r.sign === -1 && "text-expense", totV.delta < 0 && r.sign === -1 && "text-income")}>
                  {totA === 0 && totF === 0 ? "—" : `${totV.pct >= 0 ? "+" : ""}${totV.pct.toFixed(0)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}