import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { useMemo } from "react";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

interface Props {
  sales: SaleInvoice[];
  purchases: PurchaseInvoice[];
}

export function MonthlyChart({ sales, purchases }: Props) {
  const data = useMemo(() => {
    const months: Record<string, { vendite: number; acquisti: number }> = {};

    const getMonthKey = (data: string, anno: number): string | null => {
      // Handle dd/mm/yyyy format
      const parts = data.split("/");
      if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}`;
      }
      // Handle serial date number from Excel
      const serial = parseFloat(data);
      if (!isNaN(serial) && serial > 30000) {
        const d = new Date((serial - 25569) * 86400 * 1000);
        const m = String(d.getMonth() + 1).padStart(2, "0");
        return `${m}/${d.getFullYear()}`;
      }
      return null;
    };

    sales.forEach((s) => {
      const key = getMonthKey(s.data, s.anno);
      if (key) {
        if (!months[key]) months[key] = { vendite: 0, acquisti: 0 };
        months[key].vendite += s.totale;
      }
    });

    purchases.forEach((p) => {
      const key = getMonthKey(p.data, p.anno);
      if (key) {
        if (!months[key]) months[key] = { vendite: 0, acquisti: 0 };
        months[key].acquisti += p.totale;
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
      }));
  }, [sales, purchases]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        Nessun dato disponibile
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
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
      </BarChart>
    </ResponsiveContainer>
  );
}
