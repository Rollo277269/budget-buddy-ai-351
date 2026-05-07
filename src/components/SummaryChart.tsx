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
  selectedYear?: string;
}

export const MonthlyChart = React.memo(function MonthlyChart({ sales, purchases, movements = [], selectedYear }: Props) {
  const aggregateByYear = !selectedYear;

  const data = useMemo(() => {
    const buckets: Record<string, { vendite: number; acquisti: number; incassato: number; pagato: number }> = {};

    const parseDate = (data: string): { m: number; y: number } | null => {
      const parts = data.split("/");
      if (parts.length === 3) {
        return { m: Number(parts[1]), y: Number(parts[2]) };
      }
      const serial = parseFloat(data);
      if (!isNaN(serial) && serial > 30000) {
        const d = new Date((serial - 25569) * 86400 * 1000);
        return { m: d.getMonth() + 1, y: d.getFullYear() };
      }
      return null;
    };

    const getKey = (data: string): string | null => {
      const p = parseDate(data);
      if (!p) return null;
      if (aggregateByYear) return String(p.y);
      return `${String(p.m).padStart(2, "0")}/${p.y}`;
    };

    const ensure = (key: string) => {
      if (!buckets[key]) buckets[key] = { vendite: 0, acquisti: 0, incassato: 0, pagato: 0 };
    };

    sales.forEach((s) => {
      const key = getKey(s.data);
      if (key) { ensure(key); buckets[key].vendite += s.totale; }
    });

    purchases.forEach((p) => {
      const key = getKey(p.data);
      if (key) { ensure(key); buckets[key].acquisti += p.totale; }
    });

    movements.forEach((m) => {
      const key = getKey(m.data);
      if (key) {
        ensure(key);
        if (m.importo > 0) buckets[key].incassato += m.importo;
        else buckets[key].pagato += Math.abs(m.importo);
      }
    });

    // If a year is selected, ensure all 12 months are present
    if (selectedYear && !aggregateByYear) {
      const y = selectedYear;
      for (let m = 1; m <= 12; m++) {
        const key = `${String(m).padStart(2, "0")}/${y}`;
        ensure(key);
      }
    }

    return Object.entries(buckets)
      .filter(([key]) => {
        if (aggregateByYear) return true;
        if (!selectedYear) return true;
        return key.endsWith(`/${selectedYear}`);
      })
      .sort(([a], [b]) => {
        if (aggregateByYear) return Number(a) - Number(b);
        const [ma, ya] = a.split("/").map(Number);
        const [mb, yb] = b.split("/").map(Number);
        return ya !== yb ? ya - yb : ma - mb;
      })
      .map(([label, vals]) => ({
        mese: label,
        Vendite: Math.round(vals.vendite),
        Acquisti: Math.round(vals.acquisti),
        "Ricavi-Costi": Math.round(vals.vendite - vals.acquisti),
        "Incassato-Pagato": Math.round(vals.incassato - vals.pagato),
      }));
  }, [sales, purchases, movements, selectedYear, aggregateByYear]);

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
        <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={2} />
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
