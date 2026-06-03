import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { fetchCentriFromDb, CentroCR } from "@/hooks/useCentri";
import { useState, useEffect } from "react";
import { useMemo } from "react";

import { formatCurrency } from "@/lib/format";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

async function fetchCentroAssignmentMap(tipo: "costo" | "ricavo", context: "vendite" | "acquisti") {
  const { supabase } = await import("@/integrations/supabase/client");
  const map: Record<string, string> = {};
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("centro_assignments" as any)
      .select("invoice_key, centro_codice")
      .eq("tipo", tipo)
      .eq("context", context)
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("Error loading centro assignments:", error);
      break;
    }

    for (const d of (data as any[] || [])) map[d.invoice_key] = d.centro_codice;
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return map;
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
    fetchCentroAssignmentMap("ricavo", "vendite").then(setMapRaw);
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

export const NonClassificatoList = React.memo(function NonClassificatoList({ sales, onRowClick }: { sales: SaleInvoice[]; onRowClick?: (invoice: SaleInvoice) => void }) {
  const [centri, setCentri] = useState<CentroCR[]>([]);
  const [mapRaw, setMapRaw] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchCentriFromDb().then((all) => setCentri(all.filter((c) => c.tipo === "ricavo")));
    fetchCentroAssignmentMap("ricavo", "vendite").then(setMapRaw);
  }, []);

  const rows = useMemo(() => {
    if (centri.length === 0) return [];
    const out: { anno: number; numero: number; idx: number | null; cliente: string; importo: number; motivo: string; invoice: SaleInvoice }[] = [];
    sales.forEach((s) => {
      const headerKey = `${s.anno}-${s.numero}`;
      if (mapRaw[headerKey]) return;
      const righe: any[] = Array.isArray((s as any).righe) ? (s as any).righe : [];
      const baseAmount = (s.imponibile ?? 0) !== 0 ? s.imponibile : s.totale;
      if (righe.length === 0) {
        if (baseAmount === 0) return;
        out.push({ anno: s.anno, numero: s.numero, idx: null, cliente: s.cliente || "—", importo: baseAmount, motivo: "Fattura senza righe e nessun centro assegnato in testata", invoice: s });
        return;
      }
      righe.forEach((r, idx) => {
        const amt = (r?.imponibile ?? r?.totale ?? 0) || 0;
        if (amt === 0) return;
        if (mapRaw[`${headerKey}-${idx}`]) return;
        out.push({
          anno: s.anno,
          numero: s.numero,
          idx,
          cliente: s.cliente || "—",
          importo: amt,
          motivo: "Nessun centro assegnato né alla riga né alla testata",
          invoice: s,
        });
      });
    });
    return out.sort((a, b) => b.importo - a.importo);
  }, [sales, centri, mapRaw]);

  if (rows.length === 0) return null;

  const total = rows.reduce((a, r) => a + r.importo, 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-4 rounded-lg border bg-muted/30">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/50">
        <span>
          Righe "Non classificato": <span className="font-mono">{rows.length}</span> — totale{" "}
          <span className="font-mono">{formatCurrency(total)}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card border-b">
              <tr className="text-left text-muted-foreground">
                <th className="px-2 py-1 font-medium">Anno</th>
                <th className="px-2 py-1 font-medium">Numero</th>
                <th className="px-2 py-1 font-medium">Riga</th>
                <th className="px-2 py-1 font-medium">Cliente</th>
                <th className="px-2 py-1 font-medium text-right">Importo</th>
                <th className="px-2 py-1 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={i}
                  className={`border-b last:border-b-0 hover:bg-muted/40 ${onRowClick ? "cursor-pointer" : ""}`}
                  onClick={() => onRowClick?.(r.invoice)}
                >
                  <td className="px-2 py-1 font-mono">{r.anno}</td>
                  <td className="px-2 py-1 font-mono">{r.numero}</td>
                  <td className="px-2 py-1 font-mono">{r.idx === null ? "—" : r.idx}</td>
                  <td className="px-2 py-1 truncate max-w-[260px]">{r.cliente}</td>
                  <td className="px-2 py-1 font-mono text-right">{formatCurrency(r.importo)}</td>
                  <td className="px-2 py-1 text-muted-foreground">{r.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});
