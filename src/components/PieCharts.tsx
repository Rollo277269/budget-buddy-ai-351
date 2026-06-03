import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { fetchCentriFromDb, CentroCR } from "@/hooks/useCentri";
import { useState, useEffect } from "react";
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
});

const COLORS_CENTRI = [
  "hsl(152 60% 36%)", "hsl(200 50% 45%)", "hsl(270 45% 50%)",
  "hsl(30 65% 48%)", "hsl(340 50% 55%)", "hsl(180 45% 40%)",
  "hsl(60 50% 42%)", "hsl(120 40% 45%)", "hsl(300 40% 50%)",
  "hsl(0 50% 50%)",
];

export const CentroRicavoChart = React.memo(function CentroRicavoChart({ sales }: { sales: SaleInvoice[] }) {
  const [centri, setCentri] = useState<CentroCR[]>([]);
  const [mapRaw, setMapRaw] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchCentriFromDb().then((all) => setCentri(all.filter((c) => c.tipo === "ricavo")));
    import("@/integrations/supabase/client").then(({ supabase }) => {
      supabase.from("centro_assignments" as any).select("invoice_key, centro_codice").eq("tipo", "ricavo").eq("context", "vendite").then(({ data }) => {
        const m: Record<string, string> = {};
        for (const d of (data as any[] || [])) m[d.invoice_key] = d.centro_codice;
        setMapRaw(m);
      });
    });
  }, []);

  const data = useMemo(() => {
    if (centri.length === 0) return [];

    const totals: Record<string, number> = {};
    let nonClassificato = 0;

    sales.forEach((s) => {
      const headerKey = `${s.anno}-${s.numero}`;
      const headerCodice = mapRaw[headerKey];
      const labelFor = (codice: string) => {
        const c = centri.find((x) => x.codice === codice);
        return c ? `${c.codice} - ${c.descrizione}` : codice;
      };
      // Reverse-charge: imponibile=0 ma totale != 0
      const baseAmount = (s.imponibile ?? 0) !== 0 ? s.imponibile : s.totale;

      if (headerCodice) {
        const lbl = labelFor(headerCodice);
        totals[lbl] = (totals[lbl] || 0) + baseAmount;
        return;
      }

      const righe: any[] = Array.isArray((s as any).righe) ? (s as any).righe : [];
      if (righe.length > 0) {
        righe.forEach((r, idx) => {
          const amt = (r?.imponibile ?? r?.totale ?? 0) || 0;
          if (amt === 0) return;
          const code = mapRaw[`${headerKey}-${idx}`];
          if (code) {
            const lbl = labelFor(code);
            totals[lbl] = (totals[lbl] || 0) + amt;
          } else {
            nonClassificato += amt;
          }
        });
      } else {
        nonClassificato += baseAmount;
      }
    });

    const sorted = Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    if (nonClassificato > 0) {
      sorted.push({ name: "Non classificato", value: nonClassificato });
    }

    return sorted;
  }, [sales, centri, mapRaw]);

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
        <ReferenceLine x={0} stroke="hsl(var(--foreground))" strokeWidth={2} />
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
});
