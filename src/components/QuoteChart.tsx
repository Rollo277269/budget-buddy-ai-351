import React, { useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Line,
} from "recharts";
import { SaleInvoice } from "@/hooks/useInvoiceData";
import { formatCurrency } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  sales: SaleInvoice[];
  selectedYear?: string;
}

const CODICE_LAVORI = "RG2";
const CODICE_AVVALIMENTI = "RG3";

async function fetchAssignmentMap() {
  const map: Record<string, string> = {};
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("centro_assignments" as any)
      .select("invoice_key, centro_codice")
      .eq("tipo", "ricavo")
      .eq("context", "vendite")
      .range(from, from + pageSize - 1);
    if (error) break;
    for (const d of (data as any[] || [])) map[d.invoice_key] = d.centro_codice;
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

function parseDate(data: string): { m: number; y: number } | null {
  const parts = data.split("/");
  if (parts.length === 3) return { m: Number(parts[1]), y: Number(parts[2]) };
  const serial = parseFloat(data);
  if (!isNaN(serial) && serial > 30000) {
    const d = new Date((serial - 25569) * 86400 * 1000);
    return { m: d.getMonth() + 1, y: d.getFullYear() };
  }
  return null;
}

export const QuoteChart = React.memo(function QuoteChart({ sales, selectedYear }: Props) {
  const [mapRaw, setMapRaw] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchAssignmentMap().then(setMapRaw);
  }, []);

  const aggregateByYear = !selectedYear;

  const data = useMemo(() => {
    const buckets: Record<string, { lavori: number; avvalimenti: number }> = {};
    const ensure = (k: string) => {
      if (!buckets[k]) buckets[k] = { lavori: 0, avvalimenti: 0 };
    };
    const getKey = (d: string): string | null => {
      const p = parseDate(d);
      if (!p) return null;
      return aggregateByYear ? String(p.y) : `${String(p.m).padStart(2, "0")}/${p.y}`;
    };
    const add = (key: string, code: string, amt: number) => {
      if (!amt) return;
      ensure(key);
      if (code === CODICE_LAVORI) buckets[key].lavori += amt;
      else if (code === CODICE_AVVALIMENTI) buckets[key].avvalimenti += amt;
    };

    sales.forEach((s) => {
      const key = getKey(s.data);
      if (!key) return;
      const headerKey = `${s.anno}-${s.numero}`;
      const headerCode = mapRaw[headerKey];
      const baseAmount = (s.imponibile ?? 0) !== 0 ? s.imponibile : s.totale;
      if (headerCode === CODICE_LAVORI || headerCode === CODICE_AVVALIMENTI) {
        add(key, headerCode, baseAmount);
        return;
      }
      const righe: any[] = Array.isArray((s as any).righe) ? (s as any).righe : [];
      righe.forEach((r, idx) => {
        const amt = (r?.imponibile ?? r?.totale ?? 0) || 0;
        if (!amt) return;
        const code = mapRaw[`${headerKey}-${idx}`];
        if (code === CODICE_LAVORI || code === CODICE_AVVALIMENTI) add(key, code, amt);
      });
    });

    if (selectedYear && !aggregateByYear) {
      for (let m = 1; m <= 12; m++) ensure(`${String(m).padStart(2, "0")}/${selectedYear}`);
    }

    return Object.entries(buckets)
      .filter(([k]) => (aggregateByYear ? true : k.endsWith(`/${selectedYear}`)))
      .sort(([a], [b]) => {
        if (aggregateByYear) return Number(a) - Number(b);
        const [ma, ya] = a.split("/").map(Number);
        const [mb, yb] = b.split("/").map(Number);
        return ya !== yb ? ya - yb : ma - mb;
      })
      .map(([label, v]) => ({
        label,
        "Quota lavori": Math.round(v.lavori),
        "Quota avvalimenti": Math.round(v.avvalimenti),
        Totale: Math.round(v.lavori + v.avvalimenti),
      }));
  }, [sales, mapRaw, aggregateByYear, selectedYear]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        Nessun dato disponibile
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={50} />
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          contentStyle={{ borderRadius: "0.5rem", border: "1px solid hsl(220 14% 89%)", fontSize: "0.8rem" }}
        />
        <Legend wrapperStyle={{ fontSize: "0.8rem" }} />
        <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={2} />
        <Bar dataKey="Quota lavori" stackId="q" fill="hsl(152 60% 36%)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="Quota avvalimenti" stackId="q" fill="hsl(30 80% 50%)" radius={[4, 4, 0, 0]} />
        <Line type="monotone" dataKey="Totale" stroke="hsl(210 80% 50%)" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
});