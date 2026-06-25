import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList } from "recharts";
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
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-card p-2.5 shadow-md text-xs min-w-[220px]">
      <p className="font-semibold mb-1">{label}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Posizione</span>
        <span className="font-semibold">#{d.rank} di {d.total}</span>
      </div>
      <div className="border-t my-1.5" />
      <div className="flex items-center justify-between gap-3">
        <span className="text-income">Totale Vendite</span>
        <span className="font-mono">{formatCurrency(d.vendite)}</span>
      </div>
      <div className="text-[10px] text-muted-foreground text-right">{d.venditeCount} fatture</div>
      <div className="flex items-center justify-between gap-3 mt-1">
        <span className="text-expense">Totale Acquisti</span>
        <span className="font-mono">{formatCurrency(d.acquisti)}</span>
      </div>
      <div className="text-[10px] text-muted-foreground text-right">{d.acquistiCount} fatture</div>
      <div className="border-t my-1.5" />
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Saldo</span>
        <span className="font-mono font-semibold">{formatCurrency(d.vendite - d.acquisti)}</span>
      </div>
    </div>
  );
}

export const SociBarChart = React.memo(function SociBarChart({
  sales, purchases, mode, title, subtitle, topN = 15, onBarClick,
}: Props) {
  const { contatti } = useRubrica();

  const data = useMemo(() => {
    const allSoci = contatti.filter((c) =>
      (c.tipo || "").toLowerCase().split(",").map((t) => t.trim()).includes("socio")
    );
    // Dedup per partita IVA: stesso soggetto registrato con denominazioni diverse
    const seen = new Set<string>();
    const soci = allSoci.filter((c) => {
      const piva = (c.partita_iva || "").trim();
      if (!piva) return true;
      if (seen.has(piva)) return false;
      seen.add(piva);
      return true;
    });
    const rows = soci.map((socio) => {
      const nameKey = norm(socio.denominazione);
      const piva = (socio.partita_iva || "").trim();
      const sList = sales.filter((s) =>
        norm(s.cliente) === nameKey || (!!piva && ((s as any).partitaIva || "").trim() === piva)
      );
      const pList = purchases.filter((p) =>
        norm(p.fornitore) === nameKey || (!!piva && ((p as any).partitaIva || "").trim() === piva)
      );
      const vendite = sList.reduce((a, s) => a + (s.totale || 0), 0);
      const acquisti = pList.reduce((a, p) => a + (p.totale || 0), 0);
      return {
        id: socio.id,
        name: socio.denominazione,
        vendite,
        acquisti,
        venditeCount: sList.length,
        acquistiCount: pList.length,
        value: mode === "vendite" ? vendite : acquisti,
      };
    });
    const filtered = rows
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = filtered.length;
    return filtered.slice(0, topN).map((r, i) => ({ ...r, rank: i + 1, total }));
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
          <h3 className="text-sm font-bold text-black">{headerTitle}</h3>
          <p className="text-[11px] font-semibold text-black">{headerSub}</p>
        </div>
        <div className="text-xs font-semibold text-black">
          Totale: <span className="font-mono font-bold text-black">{formatCurrency(total)}</span>
          <span className="ml-2">({data.length} soci)</span>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="text-center text-xs text-muted-foreground py-10 border rounded-md">Nessun dato disponibile</div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(220, data.length * 28 + 40)}>
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 90, left: 8, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#000", fontWeight: 700 }} tickFormatter={(v) => formatCurrency(v as number).replace(/\s?€/, "")} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#000", fontWeight: 700 }} width={180} interval={0}
              tickFormatter={(s: string) => (s.length > 26 ? s.slice(0, 26) + "…" : s)} />
            <ReferenceLine x={0} stroke="hsl(var(--border))" />
            <Tooltip content={<Tip />} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}
              onClick={(d: any) => onBarClick?.(d.id, d.name)}
              style={{ cursor: onBarClick ? "pointer" : "default" }}>
              {data.map((_, i) => (
                <Cell key={i} fill={color} fillOpacity={1 - i * 0.04} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                formatter={(v: number) => formatCurrency(v).replace(/\s?€/, "")}
                style={{ fontSize: 10, fill: "#000", fillOpacity: 1, opacity: 1, fontFamily: "ui-monospace, monospace", fontWeight: 700 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
});