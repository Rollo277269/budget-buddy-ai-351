import { BudgetMonth, BudgetRow } from "@/lib/budgetEngine";
import { BudgetTable } from "./BudgetTable";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Legend } from "recharts";
import { AlertTriangle } from "lucide-react";

interface Props {
  months: BudgetMonth[];
  rows: BudgetRow[];
  initialBalance: number;
}

export function CashFlowPrevisionale({ months, rows, initialBalance }: Props) {
  const incassi = rows.find((r) => r.key === "cf-incassi")?.values || {};
  const credFisc = rows.find((r) => r.key === "cf-cred-fisc")?.values || {};
  const pagamenti = rows.find((r) => r.key === "cf-pagamenti")?.values || {};
  const rate = rows.find((r) => r.key === "cf-rate")?.values || {};
  const polizze = rows.find((r) => r.key === "cf-polizze")?.values || {};
  const saldo = rows.find((r) => r.key === "cf-saldo")?.values || {};

  const chartData = months.map((m) => ({
    mese: m.label,
    Incassi: (incassi[m.key] || 0) + (credFisc[m.key] || 0),
    Uscite: -((pagamenti[m.key] || 0) + (rate[m.key] || 0) + (polizze[m.key] || 0)),
    Saldo: saldo[m.key] || 0,
  }));

  const mesiNegativi = chartData.filter((d) => d.Saldo < 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo iniziale</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(initialBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo finale previsto</p>
            <p className={`text-lg font-bold font-mono ${(saldo[months[months.length-1].key] || 0) < 0 ? "text-expense" : "text-income"}`}>
              {formatCurrency(saldo[months[months.length-1].key] || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mesi in tensione</p>
            <p className={`text-lg font-bold ${mesiNegativi.length > 0 ? "text-destructive" : ""}`}>
              {mesiNegativi.length}
              {mesiNegativi.length > 0 && <AlertTriangle className="inline h-4 w-4 ml-2" />}
            </p>
            {mesiNegativi.length > 0 && (
              <p className="text-[10px] text-muted-foreground">Saldo previsto sotto zero</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo minimo periodo</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(Math.min(...chartData.map((d) => d.Saldo)))}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-3">
          <h3 className="text-xs font-semibold mb-2">Flussi di cassa mensili — andamento saldo</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mese" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Incassi" fill="hsl(var(--income))" stackId="flussi" />
              <Bar dataKey="Uscite" fill="hsl(var(--expense))" stackId="flussi" />
              <Line type="monotone" dataKey="Saldo" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <BudgetTable months={months} rows={rows} showTotal={false} />
    </div>
  );
}