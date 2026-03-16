import React from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { BankMovement } from "@/hooks/useBankData";
import { useMemo } from "react";
import { formatCurrency } from "@/lib/format";

interface Props {
  sales: SaleInvoice[];
  purchases: PurchaseInvoice[];
  movements?: BankMovement[];
}

export const MonthlyChart = React.memo(function MonthlyChart({ sales, purchases, movements = [] }: Props) {
  const data = useMemo(() => {
    const months: Record<string, { vendite: number; acquisti: number; incassato: number; pagato: number }> = {};

    const getMonthKey = (data: string, _anno: number): string | null => {
      const parts = data.split("/");
      if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}`;
      }
      const serial = parseFloat(data);
      if (!isNaN(serial) && serial > 30000) {
        const d = new Date((serial - 25569) * 86400 * 1000);
        const m = String(d.getMonth() + 1).padStart(2, "0");
        return `${m}/${d.getFullYear()}`;
      }
      return null;
    };

    const ensure = (key: string) => {
      if (!months[key]) months[key] = { vendite: 0, acquisti: 0, incassato: 0, pagato: 0 };
    };

    sales.forEach((s) => {
      const key = getMonthKey(s.data, s.anno);
      if (key) { ensure(key); months[key].vendite += s.totale; }
    });

    purchases.forEach((p) => {
      const key = getMonthKey(p.data, p.anno);
      if (key) { ensure(key); months[key].acquisti += p.totale; }
    });

    movements.forEach((m) => {
      const key = getMonthKey(m.data, 0);
      if (key) {
        ensure(key);
        if (m.importo > 0) months[key].incassato += m.importo;
        else months[key].pagato += Math.abs(m.importo);
      }
    });

    return Object.entries(months)
      .sort(([a], [b]) => {
        const [ma, ya] = a.split("/").map(Number);
        const [mb, yb] = b.split("/").map(Number);
        return ya !== yb ? ya - yb : ma - mb;
      })
      .map(([month, vals]) => ({
        mese: month,
        Vendite: Math.round(vals.vendite),
        Acquisti: Math.round(vals.acquisti),
        "Ricavi-Costi": Math.round(vals.vendite - vals.acquisti),
        "Incassato-Pagato": Math.round(vals.incassato - vals.pagato),
      }));
  }, [sales, purchases, movements]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        Nessun dato disponibile
      </div>
    );
  }

  const hasBank = movements.length > 0;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <XAxis dataKey="mese" tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 11 }}
          width={50}
        />
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          contentStyle={{
            borderRadius: "0.5rem",
            border: "1px solid hsl(220 14% 89%)",
            fontSize: "0.8rem",
          }}
        />
        <Legend wrapperStyle={{ fontSize: "0.8rem" }} />
        <Bar dataKey="Vendite" fill="hsl(152 60% 36%)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Acquisti" fill="hsl(0 72% 51%)" radius={[4, 4, 0, 0]} />
        <Line
          type="monotone"
          dataKey="Ricavi-Costi"
          stroke="hsl(210 80% 50%)"
          strokeWidth={2}
          dot={{ r: 3 }}
          name="Ricavi-Costi"
        />
        {hasBank && (
          <Line
            type="monotone"
            dataKey="Incassato-Pagato"
            stroke="hsl(30 90% 50%)"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 3 }}
            name="Incassato-Pagato"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
});
