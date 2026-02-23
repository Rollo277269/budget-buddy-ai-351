import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { useMemo } from "react";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

const COLORS_SALES = [
  "hsl(152 60% 36%)", "hsl(152 50% 46%)", "hsl(180 45% 40%)",
  "hsl(200 50% 45%)", "hsl(220 50% 50%)", "hsl(240 40% 55%)",
  "hsl(160 40% 50%)", "hsl(190 50% 42%)", "hsl(210 45% 48%)",
  "hsl(170 35% 55%)",
];

const COLORS_PURCHASES = [
  "hsl(0 72% 51%)", "hsl(10 65% 55%)", "hsl(20 70% 50%)",
  "hsl(30 65% 48%)", "hsl(350 55% 52%)", "hsl(340 50% 55%)",
  "hsl(5 60% 58%)", "hsl(15 55% 52%)", "hsl(25 60% 45%)",
  "hsl(355 50% 48%)",
];

interface PieData {
  name: string;
  value: number;
}

function truncate(s: string, max = 28) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border bg-card p-2.5 shadow-md text-xs">
      <p className="font-medium mb-0.5">{d.name}</p>
      <p className="font-mono">{formatCurrency(d.value)}</p>
    </div>
  );
}

export function ClientPieChart({ sales }: { sales: SaleInvoice[] }) {
  const data = useMemo(() => {
    const map: Record<string, number> = {};
    sales.forEach((s) => {
      if (!s.cliente) return;
      map[s.cliente] = (map[s.cliente] || 0) + s.totale;
    });
    const sorted = Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    if (sorted.length <= 8) return sorted;
    const top = sorted.slice(0, 7);
    const others = sorted.slice(7).reduce((a, b) => a + b.value, 0);
    return [...top, { name: "Altri", value: others }];
  }, [sales]);

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">Nessun dato</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={110}
          innerRadius={55}
          dataKey="value"
          nameKey="name"
          paddingAngle={2}
          label={({ name, percent }) => `${truncate(name, 18)} ${(percent * 100).toFixed(0)}%`}
          labelLine={{ strokeWidth: 1 }}
          style={{ fontSize: "10px" }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS_SALES[i % COLORS_SALES.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SupplierPieChart({ purchases }: { purchases: PurchaseInvoice[] }) {
  const data = useMemo(() => {
    const map: Record<string, number> = {};
    purchases.forEach((p) => {
      if (!p.fornitore) return;
      map[p.fornitore] = (map[p.fornitore] || 0) + p.totale;
    });
    const sorted = Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    if (sorted.length <= 8) return sorted;
    const top = sorted.slice(0, 7);
    const others = sorted.slice(7).reduce((a, b) => a + b.value, 0);
    return [...top, { name: "Altri", value: others }];
  }, [purchases]);

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">Nessun dato</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={110}
          innerRadius={55}
          dataKey="value"
          nameKey="name"
          paddingAngle={2}
          label={({ name, percent }) => `${truncate(name, 18)} ${(percent * 100).toFixed(0)}%`}
          labelLine={{ strokeWidth: 1 }}
          style={{ fontSize: "10px" }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS_PURCHASES[i % COLORS_PURCHASES.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
