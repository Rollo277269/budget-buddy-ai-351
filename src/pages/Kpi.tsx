import { useEffect, useMemo, useState } from "react";
import { useInvoiceData, SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { useRubrica } from "@/hooks/useRubrica";
import { formatCurrency } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  Legend, LineChart, Line, ReferenceLine, Cell,
} from "recharts";

const norm = (s: string) => (s || "").trim().toLowerCase();
const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
const fmt = (v: number) => (Math.abs(v) < 0.005 ? "—" : formatCurrency(v));

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--income))",
  "hsl(var(--expense))",
  "hsl(var(--chart-4, 38 92% 50%))",
  "hsl(var(--chart-5, 280 70% 55%))",
  "hsl(var(--chart-6, 180 70% 45%))",
  "hsl(var(--chart-7, 340 75% 55%))",
  "hsl(var(--chart-8, 220 70% 55%))",
];

export default function KpiPage() {
  const { contatti, loading: loadingRubrica } = useRubrica();
  const { allSales, allPurchases, loading: loadingInvoices } = useInvoiceData();

  const allYears = useMemo(() => {
    const ys = new Set<number>();
    allSales.forEach((s) => s.anno && ys.add(s.anno));
    allPurchases.forEach((p) => p.anno && ys.add(p.anno));
    return Array.from(ys).sort((a, b) => a - b);
  }, [allSales, allPurchases]);

  const [yearStr, setYearStr] = useState<string>("__all__");
  const focusYear = yearStr === "__all__" ? null : parseInt(yearStr, 10);

  const soci = useMemo(
    () => contatti
      .filter((c) => (c.tipo || "").toLowerCase().split(",").map((t) => t.trim()).includes("socio"))
      .sort((a, b) => a.denominazione.localeCompare(b.denominazione, "it")),
    [contatti]
  );

  // Matcher per socio
  const matchers = useMemo(() => soci.map((socio) => {
    const nameKey = norm(socio.denominazione);
    const pivaKey = (socio.partita_iva || "").trim();
    return {
      socio,
      matchSale: (s: SaleInvoice) =>
        norm(s.cliente) === nameKey || (!!pivaKey && ((s as any).partitaIva || "").trim() === pivaKey),
      matchPurchase: (p: PurchaseInvoice) =>
        norm(p.fornitore) === nameKey || (!!pivaKey && ((p as any).partitaIva || "").trim() === pivaKey),
    };
  }), [soci]);

  // Aggregati per anno
  const perYear = useMemo(() => {
    return allYears.map((y) => {
      const ys = allSales.filter((s) => s.anno === y);
      const yp = allPurchases.filter((p) => p.anno === y);
      const totV = ys.reduce((a, s) => a + (s.totale || 0), 0);
      const totA = yp.reduce((a, p) => a + (p.totale || 0), 0);
      const sociData = matchers.map(({ socio, matchSale, matchPurchase }) => ({
        id: socio.id,
        nome: socio.denominazione,
        vendite: ys.filter(matchSale).reduce((a, s) => a + (s.totale || 0), 0),
        acquisti: yp.filter(matchPurchase).reduce((a, p) => a + (p.totale || 0), 0),
      }));
      const totVSoci = sociData.reduce((a, x) => a + x.vendite, 0);
      const totASoci = sociData.reduce((a, x) => a + x.acquisti, 0);
      return {
        anno: y,
        totV, totA, totVSoci, totASoci,
        quotaV: totV > 0 ? totVSoci / totV : 0,
        quotaA: totA > 0 ? totASoci / totA : 0,
        sociAttivi: sociData.filter((s) => s.vendite > 0 || s.acquisti > 0).length,
        sociData,
      };
    });
  }, [allYears, allSales, allPurchases, matchers]);

  const currentYearAgg = useMemo(() => {
    if (focusYear == null) {
      // aggregato totale
      const tot = perYear.reduce((acc, y) => {
        acc.totV += y.totV; acc.totA += y.totA;
        acc.totVSoci += y.totVSoci; acc.totASoci += y.totASoci;
        y.sociData.forEach((s) => {
          const ex = acc.bySocio.get(s.id);
          if (ex) { ex.vendite += s.vendite; ex.acquisti += s.acquisti; }
          else acc.bySocio.set(s.id, { ...s });
        });
        return acc;
      }, { totV: 0, totA: 0, totVSoci: 0, totASoci: 0, bySocio: new Map<string, { id: string; nome: string; vendite: number; acquisti: number }>() });
      const sociData = Array.from(tot.bySocio.values()).sort((a, b) => b.vendite - a.vendite);
      return {
        totV: tot.totV, totA: tot.totA, totVSoci: tot.totVSoci, totASoci: tot.totASoci,
        quotaV: tot.totV > 0 ? tot.totVSoci / tot.totV : 0,
        quotaA: tot.totA > 0 ? tot.totASoci / tot.totA : 0,
        sociData,
        sociAttivi: sociData.filter((s) => s.vendite > 0 || s.acquisti > 0).length,
      };
    }
    const y = perYear.find((p) => p.anno === focusYear);
    if (!y) return null;
    return {
      ...y,
      sociData: [...y.sociData].sort((a, b) => b.vendite - a.vendite),
    };
  }, [perYear, focusYear]);

  const loading = loadingRubrica || loadingInvoices;

  // Chart data
  const trendData = perYear.map((y) => ({
    anno: String(y.anno),
    "Quota Soci Vendite": +(y.quotaV * 100).toFixed(2),
    "Quota Soci Acquisti": +(y.quotaA * 100).toFixed(2),
    "Soci attivi": y.sociAttivi,
  }));

  const quotaLavoriData = (currentYearAgg?.sociData || [])
    .filter((s) => s.vendite > 0)
    .map((s) => ({
      nome: s.nome.length > 20 ? s.nome.slice(0, 20) + "…" : s.nome,
      nomeFull: s.nome,
      vendite: s.vendite,
      quota: currentYearAgg!.totV > 0 ? +(s.vendite / currentYearAgg!.totV * 100).toFixed(2) : 0,
    }));

  const sociPerYearStack = perYear.map((y) => {
    const row: any = { anno: String(y.anno) };
    y.sociData.forEach((s) => { row[s.nome] = s.vendite; });
    return row;
  });
  const allSociNames = Array.from(new Set(perYear.flatMap((y) => y.sociData.map((s) => s.nome))));

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">KPI Direzione</h1>
          <p className="text-xs text-muted-foreground">
            Indicatori chiave derivati da fatture e Rubrica
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Anno</span>
          <Select value={yearStr} onValueChange={setYearStr}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="text-xs">Tutti gli anni</SelectItem>
              {[...allYears].reverse().map((y) => (
                <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && <div className="text-xs text-muted-foreground">Caricamento…</div>}

      {!loading && currentYearAgg && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              title="Quota Soci su Vendite"
              value={pct(currentYearAgg.quotaV)}
              hint={`${fmt(currentYearAgg.totVSoci)} / ${fmt(currentYearAgg.totV)}`}
            />
            <KpiCard
              title="Quota Soci su Acquisti"
              value={pct(currentYearAgg.quotaA)}
              hint={`${fmt(currentYearAgg.totASoci)} / ${fmt(currentYearAgg.totA)}`}
            />
            <KpiCard
              title="Soci attivi"
              value={String(currentYearAgg.sociAttivi)}
              hint={`su ${soci.length} totali`}
            />
            <KpiCard
              title="Quota Ammissione / Avvalimenti"
              value="N/D"
              hint="Manca dato dedicato in archivio"
              info="Per attivare questi KPI serve una tabella dedicata (quota_ammissione, quota_avvalimenti per socio/anno) o un import periodico."
              muted
            />
          </div>

          {/* Grafici */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold">
                  Quota lavori per Socio {focusYear ? `· ${focusYear}` : "(tutti gli anni)"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 h-72">
                {quotaLavoriData.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-8 text-center">Nessun dato.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={quotaLavoriData} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tickFormatter={(v) => `${v}%`} fontSize={10} />
                      <YAxis type="category" dataKey="nome" width={140} fontSize={10} />
                      <RTooltip
                        formatter={(v: any, _n, item: any) => [`${v}% · ${fmt(item.payload.vendite)}`, item.payload.nomeFull]}
                      />
                      <ReferenceLine x={0} stroke="hsl(var(--border))" />
                      <Bar dataKey="quota" radius={[0, 4, 4, 0]}>
                        {quotaLavoriData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold">
                  Trend Quote Soci (% per anno)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 h-72">
                {trendData.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-8 text-center">Nessun dato.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ left: 0, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="anno" fontSize={10} />
                      <YAxis tickFormatter={(v) => `${v}%`} fontSize={10} />
                      <RTooltip formatter={(v: any) => `${v}%`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine y={0} stroke="hsl(var(--border))" />
                      <Line type="monotone" dataKey="Quota Soci Vendite" stroke="hsl(var(--income))" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Quota Soci Acquisti" stroke="hsl(var(--expense))" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold">
                  Vendite per Socio · Storico per anno
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 h-80">
                {sociPerYearStack.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-8 text-center">Nessun dato.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sociPerYearStack} margin={{ left: 0, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="anno" fontSize={10} />
                      <YAxis tickFormatter={(v) => formatCurrency(v as number)} fontSize={10} width={90} />
                      <RTooltip formatter={(v: any, n) => [fmt(v as number), n]} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <ReferenceLine y={0} stroke="hsl(var(--border))" />
                      {allSociNames.map((nome, i) => (
                        <Bar key={nome} dataKey={nome} stackId="soci" fill={COLORS[i % COLORS.length]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tabella dettaglio quote */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold">
                Dettaglio quote per Socio {focusYear ? `· ${focusYear}` : "(aggregato)"}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-semibold">Socio</th>
                      <th className="text-right px-2 py-1.5 font-semibold">Vendite</th>
                      <th className="text-right px-2 py-1.5 font-semibold">Quota V.</th>
                      <th className="text-right px-2 py-1.5 font-semibold">Acquisti</th>
                      <th className="text-right px-2 py-1.5 font-semibold">Quota A.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentYearAgg.sociData.map((s) => {
                      const qv = currentYearAgg.totV > 0 ? s.vendite / currentYearAgg.totV : 0;
                      const qa = currentYearAgg.totA > 0 ? s.acquisti / currentYearAgg.totA : 0;
                      return (
                        <tr key={s.id} className="border-b hover:bg-muted/30">
                          <td className="px-2 py-1">{s.nome}</td>
                          <td className="text-right px-2 py-1 font-mono text-income">{fmt(s.vendite)}</td>
                          <td className="text-right px-2 py-1 font-mono">{pct(qv)}</td>
                          <td className="text-right px-2 py-1 font-mono text-expense">{fmt(s.acquisti)}</td>
                          <td className="text-right px-2 py-1 font-mono">{pct(qa)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-primary/5 font-semibold border-t-2 border-primary/40">
                      <td className="px-2 py-1.5">Totale Soci</td>
                      <td className="text-right px-2 py-1.5 font-mono text-income">{fmt(currentYearAgg.totVSoci)}</td>
                      <td className="text-right px-2 py-1.5 font-mono">{pct(currentYearAgg.quotaV)}</td>
                      <td className="text-right px-2 py-1.5 font-mono text-expense">{fmt(currentYearAgg.totASoci)}</td>
                      <td className="text-right px-2 py-1.5 font-mono">{pct(currentYearAgg.quotaA)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({
  title, value, hint, info, muted,
}: { title: string; value: string; hint?: string; info?: string; muted?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1">
          {title}
          {info && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-xs">{info}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className={`text-2xl font-bold font-mono ${muted ? "text-muted-foreground" : ""}`}>{value}</div>
        {hint && <div className="text-[10px] text-muted-foreground font-mono">{hint}</div>}
      </CardContent>
    </Card>
  );
}