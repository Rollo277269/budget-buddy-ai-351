import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import type { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { useRubrica } from "@/hooks/useRubrica";
import { formatCurrency } from "@/lib/format";

const norm = (s: string) => (s || "").trim().toLowerCase();

type Mode = "vendite" | "acquisti";

interface Props {
  sales: SaleInvoice[];
  purchases: PurchaseInvoice[];
  mode: Mode;
  title?: string;
  subtitle?: string;
  topN?: number;
  onBarClick?: (socioId: string, denominazione: string) => void;
}

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card p-2.5 shadow-md text-xs">
      <p className="font-medium mb-0.5">{label}</p>
      <p className="font-mono">{formatCurrency(payload[0].value as number)}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{payload[0].payload.count} fatture</p>
    </div>
  );
}

export const SociBarChart = React.memo(function SociBarChart({
  sales, purchases, mode, title, subtitle, topN = 15, onBarClick,
}: Props) {
  const { contatti } = useRubrica();

  const data = useMemo(() => {
    const soci = contatti.filter((c) =>
      (c.tipo || "").toLowerCase().split(",").map((t) => t.trim()).includes("socio")
    );
    const rows = soci.map((socio) => {
      const nameKey = norm(socio.denominazione);
      const piva = (socio.partita_iva || "").trim();
      if (mode === "vendite") {
        const list = sales.filter((s) =>
          norm(s.cliente) === nameKey || (!!piva && ((s as any).partitaIva || "").trim() === piva)
        );
        return { id: socio.id, name: socio.denominazione, value: list.reduce((a, s) => a + (s.totale || 0), 0), count: list.length };
      }
      const list = purchases.filter((p) =>
        norm(p.fornitore) === nameKey || (!!piva && ((p as any).partitaIva || "").trim() === piva)
      );
      return { id: socio.id, name: socio.denominazione, value: list.reduce((a, p) => a + (p.totale || 0), 0), count: list.length };
    });
    return rows
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, topN);
  }, [contatti, sales, purchases, mode, topN]);

  const total = useMemo(() => data.reduce((a, r) => a + r.value, 0), [data]);

  const color = mode === "vendite" ? "hsl(152 60% 36%)" : "hsl(0 72% 51%)";
  const headerTitle = title ?? (mode === "vendite" ? "Soci per Vendite (contributo al Consorzio)" : "Soci per Acquisti (utilizzo del Consorzio)");
  const headerSub = subtitle ?? (mode === "vendite"
    ? "Indicatore del coinvolgimento e del contributo economico al sostentamento"
    : "Indicatore di quanto il Consorzio venga utilizzato per eseguire lavori");

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{headerTitle}</h3>
          <p className="text-[11px] text-muted-foreground">{headerSub}</p>
        </div>
        <div className="text-xs text-muted-foreground">
          Totale: <span className="font-mono font-semibold text-foreground">{formatCurrency(total)}</span>
          <span className="ml-2">({data.length} soci)</span>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="text-center text-xs text-muted-foreground py-10 border rounded-md">Nessun dato disponibile</div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(220, data.length * 28 + 40)}>
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 24, left: 8, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v as number).replace(/\s?€/, "")} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={180} interval={0}
              tickFormatter={(s: string) => (s.length > 26 ? s.slice(0, 26) + "…" : s)} />
            <ReferenceLine x={0} stroke="hsl(var(--border))" />
            <Tooltip content={<Tip />} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}
              onClick={(d: any) => onBarClick?.(d.id, d.name)}
              style={{ cursor: onBarClick ? "pointer" : "default" }}>
              {data.map((_, i) => (
                <Cell key={i} fill={color} fillOpacity={1 - i * 0.04} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
});