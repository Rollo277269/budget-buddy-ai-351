import { useMemo, useState, useCallback } from "react";
import { useInvoiceData, SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { useCentriData, loadCentri } from "@/hooks/useCentri";
import { StatCard } from "@/components/StatCard";
import { formatCurrency } from "@/lib/format";
import { TrendingUp, TrendingDown, Scale, Percent, BarChart3, Loader2, Printer } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, PieChart, Pie,
} from "recharts";

/* ────────── helpers ────────── */

function loadCentroMap(tipo: "costo" | "ricavo", context: "vendite" | "acquisti"): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(`centro-map-${tipo}-${context}`) || "{}");
  } catch {
    return {};
  }
}

interface YearSummary {
  anno: number;
  ricavi: number;
  costi: number;
  ivaRicavi: number;
  ivaCosti: number;
  saldo: number;
  marginePercent: number;
  numVendite: number;
  numAcquisti: number;
}

function buildYearSummaries(sales: SaleInvoice[], purchases: PurchaseInvoice[]): YearSummary[] {
  const map = new Map<number, YearSummary>();
  const ensure = (a: number) => {
    if (!map.has(a)) map.set(a, { anno: a, ricavi: 0, costi: 0, ivaRicavi: 0, ivaCosti: 0, saldo: 0, marginePercent: 0, numVendite: 0, numAcquisti: 0 });
    return map.get(a)!;
  };
  sales.forEach((s) => { const y = ensure(s.anno); y.ricavi += s.imponibile; y.ivaRicavi += s.imposta; y.numVendite++; });
  purchases.forEach((p) => { const y = ensure(p.anno); y.costi += p.imponibile; y.ivaCosti += p.imposta; y.numAcquisti++; });
  map.forEach((y) => { y.saldo = y.ricavi - y.costi; y.marginePercent = y.ricavi ? (y.saldo / y.ricavi) * 100 : 0; });
  return Array.from(map.values()).sort((a, b) => a.anno - b.anno);
}

interface CentroAgg {
  codice: string;
  descrizione: string;
  importo: number;
}

function aggregateByCentro(
  invoices: (SaleInvoice | PurchaseInvoice)[],
  centroMap: Record<string, string>,
  centri: { codice: string; descrizione: string }[],
  anno?: number
): CentroAgg[] {
  const agg = new Map<string, number>();
  const filtered = anno ? invoices.filter((i) => i.anno === anno) : invoices;
  filtered.forEach((inv) => {
    const k = `${inv.anno}-${inv.numero}`;
    const codice = centroMap[k] || "__unassigned__";
    agg.set(codice, (agg.get(codice) || 0) + inv.imponibile);
  });

  const centroLookup = new Map(centri.map((c) => [c.codice, c.descrizione]));
  return Array.from(agg.entries())
    .map(([codice, importo]) => ({
      codice,
      descrizione: codice === "__unassigned__" ? "Non classificate" : centroLookup.get(codice) || codice,
      importo,
    }))
    .sort((a, b) => b.importo - a.importo);
}

/* ────────── palette ────────── */
const COLORS_RICAVO = [
  "hsl(152, 60%, 36%)", "hsl(152, 50%, 45%)", "hsl(152, 40%, 55%)",
  "hsl(170, 50%, 40%)", "hsl(140, 45%, 50%)", "hsl(160, 55%, 42%)",
  "hsl(130, 40%, 48%)", "hsl(180, 45%, 38%)",
];
const COLORS_COSTO = [
  "hsl(0, 72%, 51%)", "hsl(0, 60%, 58%)", "hsl(10, 65%, 50%)",
  "hsl(20, 60%, 55%)", "hsl(350, 55%, 48%)", "hsl(5, 50%, 55%)",
  "hsl(15, 55%, 50%)", "hsl(340, 50%, 52%)",
];

const tooltipFormatter = (val: number) => formatCurrency(val);

/* ────────── component ────────── */

export default function BilancioPage() {
  const { allSales, allPurchases, loading, filterOptions } = useInvoiceData();
  const { centri } = useCentriData();
  const [selectedAnno, setSelectedAnno] = useState<string>("all");

  const ricavoMapVendite = useMemo(() => loadCentroMap("ricavo", "vendite"), []);
  const costoMapAcquisti = useMemo(() => loadCentroMap("costo", "acquisti"), []);

  const years = filterOptions.years;

  const yearSummaries = useMemo(() => buildYearSummaries(allSales, allPurchases), [allSales, allPurchases]);

  const annoFilter = selectedAnno !== "all" ? parseInt(selectedAnno) : undefined;

  const globalKpis = useMemo(() => {
    const src = annoFilter ? yearSummaries.filter((y) => y.anno === annoFilter) : yearSummaries;
    const ricavi = src.reduce((s, y) => s + y.ricavi, 0);
    const costi = src.reduce((s, y) => s + y.costi, 0);
    const saldo = ricavi - costi;
    const margine = ricavi ? (saldo / ricavi) * 100 : 0;
    const numVendite = src.reduce((s, y) => s + y.numVendite, 0);
    const numAcquisti = src.reduce((s, y) => s + y.numAcquisti, 0);
    return { ricavi, costi, saldo, margine, numVendite, numAcquisti };
  }, [yearSummaries, annoFilter]);

  const centriRicavo = useMemo(() => centri.filter((c) => c.tipo === "ricavo"), [centri]);
  const centriCosto = useMemo(() => centri.filter((c) => c.tipo === "costo"), [centri]);

  const ricavoBreakdown = useMemo(
    () => aggregateByCentro(allSales, ricavoMapVendite, centriRicavo, annoFilter),
    [allSales, ricavoMapVendite, centriRicavo, annoFilter]
  );
  const costoBreakdown = useMemo(
    () => aggregateByCentro(allPurchases, costoMapAcquisti, centriCosto, annoFilter),
    [allPurchases, costoMapAcquisti, centriCosto, annoFilter]
  );

  const barData = useMemo(() => {
    const data = annoFilter
      ? yearSummaries.filter((y) => y.anno === annoFilter)
      : yearSummaries;
    return data.map((y) => ({
      name: String(y.anno),
      Ricavi: y.ricavi,
      Costi: y.costi,
      Saldo: y.saldo,
    }));
  }, [yearSummaries, annoFilter]);

  const handleExportPdf = useCallback(() => {
    document.body.classList.add("print-report");
    setTimeout(() => {
      window.print();
      document.body.classList.remove("print-report");
    }, 100);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const annoLabel = annoFilter ? String(annoFilter) : "Tutti gli anni";
  const now = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Bilancio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Riepilogo costi e ricavi con ripartizione per centri di competenza</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPdf} className="no-print">
            <Printer className="h-4 w-4 mr-1" /> Stampa PDF
          </Button>
          <Select value={selectedAnno} onValueChange={setSelectedAnno}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Anno" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli anni</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Totale Ricavi"
          value={formatCurrency(globalKpis.ricavi)}
          subtitle={`${globalKpis.numVendite} fatture`}
          icon={TrendingUp}
          variant="income"
        />
        <StatCard
          title="Totale Costi"
          value={formatCurrency(globalKpis.costi)}
          subtitle={`${globalKpis.numAcquisti} fatture`}
          icon={TrendingDown}
          variant="expense"
        />
        <StatCard
          title="Risultato"
          value={formatCurrency(globalKpis.saldo)}
          subtitle={globalKpis.saldo >= 0 ? "Utile" : "Perdita"}
          icon={Scale}
          variant={globalKpis.saldo >= 0 ? "balance" : "expense"}
        />
        <StatCard
          title="Margine"
          value={`${globalKpis.margine.toFixed(1)}%`}
          subtitle="Ricavi − Costi / Ricavi"
          icon={Percent}
          variant="neutral"
        />
      </div>

      {/* Yearly comparison chart */}
      {barData.length > 1 && (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Confronto annuale
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={tooltipFormatter} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Ricavi" fill="hsl(152, 60%, 36%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Costi" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Saldo" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Year table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30">
          <h2 className="text-sm font-semibold text-foreground">Dettaglio per anno</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Anno</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Ricavi</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Costi</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Risultato</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Margine %</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">N° Vendite</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">N° Acquisti</th>
              </tr>
            </thead>
            <tbody>
              {yearSummaries.map((y) => (
                <tr
                  key={y.anno}
                  className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${annoFilter === y.anno ? "bg-primary/5" : ""}`}
                  onClick={() => setSelectedAnno(selectedAnno === String(y.anno) ? "all" : String(y.anno))}
                  style={{ cursor: "pointer" }}
                >
                  <td className="px-4 py-2.5 font-semibold font-mono">{y.anno}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-income">{formatCurrency(y.ricavi)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-expense">{formatCurrency(y.costi)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${y.saldo >= 0 ? "text-income" : "text-expense"}`}>{formatCurrency(y.saldo)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${y.marginePercent >= 0 ? "text-income" : "text-expense"}`}>{y.marginePercent.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{y.numVendite}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{y.numAcquisti}</td>
                </tr>
              ))}
              {yearSummaries.length > 1 && (
                <tr className="bg-muted/40 font-semibold border-t-2 border-foreground/20">
                  <td className="px-4 py-2.5">TOTALE</td>
                  <td className="px-4 py-2.5 text-right font-mono text-income">{formatCurrency(globalKpis.ricavi)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-expense">{formatCurrency(globalKpis.costi)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${globalKpis.saldo >= 0 ? "text-income" : "text-expense"}`}>{formatCurrency(globalKpis.saldo)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${globalKpis.margine >= 0 ? "text-income" : "text-expense"}`}>{globalKpis.margine.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{globalKpis.numVendite}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{globalKpis.numAcquisti}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Centro breakdown */}
      <Tabs defaultValue="ricavi" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ricavi">Centri di Ricavo</TabsTrigger>
          <TabsTrigger value="costi">Centri di Costo</TabsTrigger>
        </TabsList>

        <TabsContent value="ricavi">
          <CentroBreakdownCard
            title="Ripartizione Ricavi per Centro"
            data={ricavoBreakdown}
            colors={COLORS_RICAVO}
            total={globalKpis.ricavi}
            emptyMessage="Nessun centro di ricavo configurato o fatture non classificate"
          />
        </TabsContent>

        <TabsContent value="costi">
          <CentroBreakdownCard
            title="Ripartizione Costi per Centro"
            data={costoBreakdown}
            colors={COLORS_COSTO}
            total={globalKpis.costi}
            emptyMessage="Nessun centro di costo configurato o fatture non classificate"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ────────── Centro breakdown sub-component ────────── */

function CentroBreakdownCard({
  title,
  data,
  colors,
  total,
  emptyMessage,
}: {
  title: string;
  data: CentroAgg[];
  colors: string[];
  total: number;
  emptyMessage: string;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground text-sm">
        {emptyMessage}
      </div>
    );
  }

  const pieData = data.map((d, i) => ({
    name: d.descrizione,
    value: d.importo,
    fill: colors[i % colors.length],
  }));

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        {/* Pie chart */}
        <div className="p-4 flex items-center justify-center">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={50}
                paddingAngle={2}
                label={({ name, percent }) => `${name.substring(0, 16)}${name.length > 16 ? "…" : ""} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 0.5 }}
                style={{ fontSize: 10 }}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={tooltipFormatter} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Table */}
        <div className="border-l border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Centro</th>
                <th className="text-right px-4 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Importo</th>
                <th className="text-right px-4 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">%</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={d.codice} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-2 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
                    <span className="text-xs font-medium truncate">{d.descrizione}</span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{formatCurrency(d.importo)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                    {total > 0 ? ((d.importo / total) * 100).toFixed(1) : "0.0"}%
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-semibold">
                <td className="px-4 py-2 text-xs">TOTALE</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{formatCurrency(data.reduce((s, d) => s + d.importo, 0))}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
