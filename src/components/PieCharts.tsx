import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { loadCentri } from "@/hooks/useCentri";
import { useMemo } from "react";

import { formatCurrency } from "@/lib/format";

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

export const ClientPieChart = React.memo(function ClientPieChart({ sales }: { sales: SaleInvoice[] }) {
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
});

export const SupplierPieChart = React.memo(function SupplierPieChart({ purchases }: { purchases: PurchaseInvoice[] }) {
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

const COLORS_CENTRI = [
  "hsl(152 60% 36%)", "hsl(200 50% 45%)", "hsl(270 45% 50%)",
  "hsl(30 65% 48%)", "hsl(340 50% 55%)", "hsl(180 45% 40%)",
  "hsl(60 50% 42%)", "hsl(120 40% 45%)", "hsl(300 40% 50%)",
  "hsl(0 50% 50%)",
];

export function CentroRicavoChart({ sales }: { sales: SaleInvoice[] }) {
  const data = useMemo(() => {
    const centri = loadCentri().filter((c) => c.tipo === "ricavo");
    if (centri.length === 0) return [];

    let mapRaw: Record<string, string> = {};
    try {
      mapRaw = JSON.parse(localStorage.getItem("centro-map-ricavo-vendite") || "{}");
    } catch {}

    const totals: Record<string, number> = {};
    let nonClassificato = 0;

    sales.forEach((s) => {
      const key = `${s.anno}-${s.numero}`;
      const codice = mapRaw[key];
      if (codice) {
        const centro = centri.find((c) => c.codice === codice);
        const label = centro ? `${centro.codice} - ${centro.descrizione}` : codice;
        totals[label] = (totals[label] || 0) + s.totale;
      } else {
        nonClassificato += s.totale;
      }
    });

    const sorted = Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    if (nonClassificato > 0) {
      sorted.push({ name: "Non classificato", value: nonClassificato });
    }

    return sorted;
  }, [sales]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        Nessun centro di ricavo definito
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
        <XAxis
          type="number"
          tickFormatter={(v) => formatCurrency(v)}
          style={{ fontSize: "10px" }}
          stroke="hsl(var(--muted-foreground))"
        />
        <YAxis
          type="category"
          dataKey="name"
          width={160}
          tick={{ fontSize: 11 }}
          stroke="hsl(var(--muted-foreground))"
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.name === "Non classificato" ? "hsl(var(--muted-foreground))" : COLORS_CENTRI[i % COLORS_CENTRI.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
