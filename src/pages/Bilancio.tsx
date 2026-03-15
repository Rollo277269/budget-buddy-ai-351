import { useMemo, useState, useCallback, useEffect, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { useInvoiceData, SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { useCentriData, CategoriaCentro, CentroCR } from "@/hooks/useCentri";
import { StatCard } from "@/components/StatCard";
import { formatCurrency } from "@/lib/format";
import { TrendingUp, TrendingDown, Scale, Percent, BarChart3, Loader2, Printer, ChevronRight, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from
"recharts";

/* ────────── helpers ────────── */

async function loadCentroMap(tipo: "costo" | "ricavo", context: "vendite" | "acquisti"): Promise<Record<string, string>> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await (supabase as any).from("centro_assignments").select("invoice_key, centro_codice").eq("tipo", tipo).eq("context", context);
  const map: Record<string, string> = {};
  for (const d of (data || [])) map[d.invoice_key] = d.centro_codice;
  return map;
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
  sales.forEach((s) => {const y = ensure(s.anno);y.ricavi += s.imponibile;y.ivaRicavi += s.imposta;y.numVendite++;});
  purchases.forEach((p) => {const y = ensure(p.anno);y.costi += p.imponibile;y.ivaCosti += p.imposta;y.numAcquisti++;});
  map.forEach((y) => {y.saldo = y.ricavi - y.costi;y.marginePercent = y.ricavi ? y.saldo / y.ricavi * 100 : 0;});
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
centri: {codice: string;descrizione: string;}[],
anno?: number)
: CentroAgg[] {
  const agg = new Map<string, number>();
  const filtered = anno ? invoices.filter((i) => i.anno === anno) : invoices;
  filtered.forEach((inv) => {
    const k = `${inv.anno}-${inv.numero}`;
    const codice = centroMap[k] || "__unassigned__";
    agg.set(codice, (agg.get(codice) || 0) + inv.imponibile);
  });

  const centroLookup = new Map(centri.map((c) => [c.codice, c.descrizione]));
  return Array.from(agg.entries()).
  map(([codice, importo]) => ({
    codice,
    descrizione: codice === "__unassigned__" ? "Non classificate" : centroLookup.get(codice) || codice,
    importo
  })).
  sort((a, b) => b.importo - a.importo);
}

const tooltipFormatter = (val: number) => formatCurrency(val);

/* ────────── component ────────── */

export default function BilancioPage() {
  const navigate = useNavigate();
  const { allSales, allPurchases, loading, filterOptions } = useInvoiceData();
  const { centri, categorie } = useCentriData();
  const [selectedAnno, setSelectedAnno] = useState<string>("all");

  const [ricavoMapVendite, setRicavoMapVendite] = useState<Record<string, string>>({});
  const [costoMapAcquisti, setCostoMapAcquisti] = useState<Record<string, string>>({});

  // Load maps from DB
  useEffect(() => {
    const refresh = async () => {
      setRicavoMapVendite(await loadCentroMap("ricavo", "vendite"));
      setCostoMapAcquisti(await loadCentroMap("costo", "acquisti"));
    };
    refresh();
    const onFocus = () => { refresh(); };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      
    };
  }, []);

  const years = filterOptions.years;

  const yearSummaries = useMemo(() => buildYearSummaries(allSales, allPurchases), [allSales, allPurchases]);

  const annoFilter = selectedAnno !== "all" ? parseInt(selectedAnno) : undefined;

  const globalKpis = useMemo(() => {
    const src = annoFilter ? yearSummaries.filter((y) => y.anno === annoFilter) : yearSummaries;
    const ricavi = src.reduce((s, y) => s + y.ricavi, 0);
    const costi = src.reduce((s, y) => s + y.costi, 0);
    const saldo = ricavi - costi;
    const margine = ricavi ? saldo / ricavi * 100 : 0;
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
    const data = annoFilter ?
    yearSummaries.filter((y) => y.anno === annoFilter) :
    yearSummaries;
    return data.map((y) => ({
      name: String(y.anno),
      Ricavi: y.ricavi,
      Costi: y.costi,
      Saldo: y.saldo
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
      </div>);

  }

  const annoLabel = annoFilter ? String(annoFilter) : "Tutti gli anni";
  const now = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          
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
              {years.map((y) =>
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              )}
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
          variant="income" />
        
        <StatCard
          title="Totale Costi"
          value={formatCurrency(globalKpis.costi)}
          subtitle={`${globalKpis.numAcquisti} fatture`}
          icon={TrendingDown}
          variant="expense" />
        
        <StatCard
          title="Risultato"
          value={formatCurrency(globalKpis.saldo)}
          subtitle={globalKpis.saldo >= 0 ? "Utile" : "Perdita"}
          icon={Scale}
          variant={globalKpis.saldo >= 0 ? "balance" : "expense"} />
        
        <StatCard
          title="Margine"
          value={`${globalKpis.margine.toFixed(1)}%`}
          subtitle="Ricavi − Costi / Ricavi"
          icon={Percent}
          variant="neutral" />
        
      </div>

      {/* Yearly comparison chart */}
      {barData.length > 1 &&
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
      }



      {/* Centro breakdown — side by side, drag to reorder */}
      <CentriSideBySide
        ricavoBreakdown={ricavoBreakdown}
        costoBreakdown={costoBreakdown}
        totalRicavi={globalKpis.ricavi}
        totalCosti={globalKpis.costi}
        centri={centri}
        categorie={categorie}
        onRowClick={(codice, tipo) => {
          if (codice === "__unassigned__") return;
          if (tipo === "ricavo") navigate(`/vendite?centroRicavo=${encodeURIComponent(codice)}`);else
          navigate(`/acquisti?centroCosto=${encodeURIComponent(codice)}`);
        }} />
      

      {/* ── Hidden PDF Report ── */}
      <div className="pdf-report">
        <div className="pdf-header">
          <div className="pdf-header-text">
            <h1>Bilancio — {annoLabel}</h1>
            <p>Riepilogo costi e ricavi con ripartizione per centri di competenza</p>
          </div>
        </div>
        <div className="pdf-meta">
          <span>Generato il {now}</span>
          <span>•</span>
          <span>{globalKpis.numVendite} fatture vendita — {globalKpis.numAcquisti} fatture acquisto</span>
        </div>

        {/* KPIs */}
        <div className="pdf-kpi-grid">
          <div className="pdf-kpi-card">
            <p className="pdf-kpi-label">Totale Ricavi</p>
            <p className="pdf-kpi-value is-positive">{formatCurrency(globalKpis.ricavi)}</p>
            <p className="pdf-kpi-sub">{globalKpis.numVendite} fatture</p>
          </div>
          <div className="pdf-kpi-card">
            <p className="pdf-kpi-label">Totale Costi</p>
            <p className="pdf-kpi-value is-negative">{formatCurrency(globalKpis.costi)}</p>
            <p className="pdf-kpi-sub">{globalKpis.numAcquisti} fatture</p>
          </div>
          <div className="pdf-kpi-card">
            <p className="pdf-kpi-label">Risultato</p>
            <p className={`pdf-kpi-value ${globalKpis.saldo >= 0 ? "is-positive" : "is-negative"}`}>{formatCurrency(globalKpis.saldo)}</p>
            <p className="pdf-kpi-sub">{globalKpis.saldo >= 0 ? "Utile" : "Perdita"}</p>
          </div>
          <div className="pdf-kpi-card">
            <p className="pdf-kpi-label">Margine</p>
            <p className={`pdf-kpi-value ${globalKpis.margine >= 0 ? "is-positive" : "is-negative"}`}>{globalKpis.margine.toFixed(1)}%</p>
            <p className="pdf-kpi-sub">Ricavi − Costi / Ricavi</p>
          </div>
        </div>

        {/* Year bar chart (pure HTML) */}
        {yearSummaries.length > 1 &&
        <div className="pdf-section pdf-full-width">
            <h2>Confronto Annuale</h2>
            <div className="pdf-bar-chart">
              {yearSummaries.map((y) => {
              const maxVal = Math.max(...yearSummaries.map((s) => Math.max(s.ricavi, s.costi)));
              return (
                <div className="pdf-bar-row" key={y.anno}>
                    <span className="pdf-bar-label">{y.anno}</span>
                    <div className="pdf-bar-tracks">
                      <div className="pdf-bar is-positive" style={{ width: `${maxVal > 0 ? y.ricavi / maxVal * 100 : 0}%` }}>
                        <span className="pdf-bar-value">{formatCurrency(y.ricavi)}</span>
                      </div>
                      <div className="pdf-bar is-negative" style={{ width: `${maxVal > 0 ? y.costi / maxVal * 100 : 0}%` }}>
                        <span className="pdf-bar-value">{formatCurrency(y.costi)}</span>
                      </div>
                    </div>
                  </div>);

            })}
              <div className="pdf-bar-legend">
                <span className="pdf-legend-item"><span className="pdf-legend-swatch is-positive" /> Ricavi</span>
                <span className="pdf-legend-item"><span className="pdf-legend-swatch is-negative" /> Costi</span>
              </div>
            </div>
          </div>
        }

        {/* Year detail table */}
        <div className="pdf-section pdf-full-width">
          <h2>Dettaglio per Anno</h2>
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Anno</th>
                <th className="is-right">Ricavi</th>
                <th className="is-right">Costi</th>
                <th className="is-right">Risultato</th>
                <th className="is-right">Margine %</th>
                <th className="is-right">N° Vendite</th>
                <th className="is-right">N° Acquisti</th>
              </tr>
            </thead>
            <tbody>
              {yearSummaries.map((y) =>
              <tr key={y.anno}>
                  <td style={{ fontWeight: 600 }}>{y.anno}</td>
                  <td className="is-right is-positive">{formatCurrency(y.ricavi)}</td>
                  <td className="is-right is-negative">{formatCurrency(y.costi)}</td>
                  <td className={`is-right ${y.saldo >= 0 ? "is-positive" : "is-negative"}`} style={{ fontWeight: 600 }}>{formatCurrency(y.saldo)}</td>
                  <td className={`is-right ${y.marginePercent >= 0 ? "is-positive" : "is-negative"}`}>{y.marginePercent.toFixed(1)}%</td>
                  <td className="is-right">{y.numVendite}</td>
                  <td className="is-right">{y.numAcquisti}</td>
                </tr>
              )}
              {yearSummaries.length > 1 &&
              <tr className="pdf-table-total">
                  <td>TOTALE</td>
                  <td className="is-right is-positive">{formatCurrency(globalKpis.ricavi)}</td>
                  <td className="is-right is-negative">{formatCurrency(globalKpis.costi)}</td>
                  <td className={`is-right ${globalKpis.saldo >= 0 ? "is-positive" : "is-negative"}`}>{formatCurrency(globalKpis.saldo)}</td>
                  <td className={`is-right ${globalKpis.margine >= 0 ? "is-positive" : "is-negative"}`}>{globalKpis.margine.toFixed(1)}%</td>
                  <td className="is-right">{globalKpis.numVendite}</td>
                  <td className="is-right">{globalKpis.numAcquisti}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        {/* Centro breakdown tables */}
        <div className="pdf-table-grid">
          <PdfCentroTable title="Centri di Ricavo" data={ricavoBreakdown} total={globalKpis.ricavi} />
          <PdfCentroTable title="Centri di Costo" data={costoBreakdown} total={globalKpis.costi} />
        </div>

        <div className="pdf-footer">
          <span className="pdf-footer-left">Bilancio — {annoLabel}</span>
          <span className="pdf-footer-center">Generato il {now}</span>
          <span className="pdf-footer-right">Pag. <span className="pdf-page-number" /></span>
        </div>
      </div>
    </div>);

}

/* ────────── Side-by-side centro tables with category grouping ────────── */

interface CategoryGroup {
  categoria: CategoriaCentro;
  items: CentroAgg[];
  subtotal: number;
}

function CentriSideBySide({
  ricavoBreakdown, costoBreakdown, totalRicavi, totalCosti, onRowClick, centri, categorie
}: {ricavoBreakdown: CentroAgg[];costoBreakdown: CentroAgg[];totalRicavi: number;totalCosti: number;onRowClick?: (codice: string, tipo: "ricavo" | "costo") => void; centri: CentroCR[]; categorie: CategoriaCentro[];}) {
  const categorieRicavo = useMemo(() => categorie.filter(c => c.tipo === "ricavo"), [categorie]);
  const categorieCosto = useMemo(() => categorie.filter(c => c.tipo === "costo"), [categorie]);
  const centriRicavo = useMemo(() => centri.filter(c => c.tipo === "ricavo"), [centri]);
  const centriCosto = useMemo(() => centri.filter(c => c.tipo === "costo"), [centri]);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <CentroTableCard title="Centri di Ricavo" data={ricavoBreakdown} total={totalRicavi} accentClass="text-income" onRowClick={onRowClick ? (codice) => onRowClick(codice, "ricavo") : undefined} categorie={categorieRicavo} centri={centriRicavo} />
      <CentroTableCard title="Centri di Costo" data={costoBreakdown} total={totalCosti} accentClass="text-expense" onRowClick={onRowClick ? (codice) => onRowClick(codice, "costo") : undefined} categorie={categorieCosto} centri={centriCosto} />
    </div>);
}

function CentroTableCard({ title, data, total, accentClass, onRowClick, categorie, centri
}: {title: string;data: CentroAgg[];total: number;accentClass: string;onRowClick?: (codice: string) => void; categorie: CategoriaCentro[]; centri: CentroCR[];}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCategory = (catId: string) => {
    setCollapsed(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  const { groups, orphans } = useMemo(() => {
    const dataByCode = new Map(data.map(d => [d.codice, d]));
    const groups: CategoryGroup[] = [];
    const usedCodes = new Set<string>();

    for (const cat of categorie) {
      const catCentri = centri.filter(c => c.categoriaId === cat.id);
      const items: CentroAgg[] = [];
      for (const cc of catCentri) {
        const agg = dataByCode.get(cc.codice);
        if (agg) {
          items.push(agg);
          usedCodes.add(cc.codice);
        }
      }
      if (items.length > 0) {
        groups.push({
          categoria: cat,
          items: items.sort((a, b) => b.importo - a.importo),
          subtotal: items.reduce((s, i) => s + i.importo, 0),
        });
      }
    }

    const orphans = data.filter(d => !usedCodes.has(d.codice));
    return { groups, orphans };
  }, [data, categorie, centri]);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="p-3 border-b border-border bg-muted/30">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {data.length === 0 ?
      <div className="p-6 text-center text-muted-foreground text-sm">Nessun centro configurato</div> :
      <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="w-8"></th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Codice</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Centro</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Importo</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">%</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isCollapsed = collapsed[g.categoria.id] ?? false;
                return (
                  <Fragment key={g.categoria.id}>
                    <tr
                      className="border-b border-border bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors select-none"
                      onClick={() => toggleCategory(g.categoria.id)}
                    >
                      <td className="pl-2 pr-0 py-1.5 text-muted-foreground">
                        {isCollapsed ?
                          <ChevronRight className="h-3.5 w-3.5" /> :
                          <ChevronDown className="h-3.5 w-3.5" />
                        }
                      </td>
                      <td className="px-3 py-1.5 text-xs font-mono font-semibold text-foreground">{g.categoria.codice}</td>
                      <td className="px-3 py-1.5 text-xs font-semibold text-foreground">{g.categoria.descrizione}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs font-semibold">{formatCurrency(g.subtotal)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground font-semibold">
                        {total > 0 ? (g.subtotal / total * 100).toFixed(1) : "0.0"}%
                      </td>
                    </tr>
                    {!isCollapsed && g.items.map((d) => (
                      <tr
                        key={d.codice}
                        onClick={() => onRowClick && d.codice !== "__unassigned__" && onRowClick(d.codice)}
                        className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${
                          onRowClick && d.codice !== "__unassigned__" ? "cursor-pointer" : ""}`}
                      >
                        <td className="pl-2 pr-0 py-1.5"></td>
                        <td className="px-3 pl-8 py-1.5 text-xs font-mono text-muted-foreground">{d.codice}</td>
                        <td className={`px-3 py-1.5 text-xs font-medium truncate max-w-[200px] ${onRowClick && d.codice !== "__unassigned__" ? "text-primary underline decoration-dotted" : ""}`}>{d.descrizione}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs">{formatCurrency(d.importo)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                          {total > 0 ? (d.importo / total * 100).toFixed(1) : "0.0"}%
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              {orphans.map((d) => (
                <tr
                  key={d.codice}
                  onClick={() => onRowClick && d.codice !== "__unassigned__" && onRowClick(d.codice)}
                  className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${
                    onRowClick && d.codice !== "__unassigned__" ? "cursor-pointer" : ""}`}
                >
                  <td className="pl-2 pr-0 py-1.5"></td>
                  <td className="px-3 py-1.5 text-xs font-mono text-muted-foreground">{d.codice === "__unassigned__" ? "—" : d.codice}</td>
                  <td className={`px-3 py-1.5 text-xs font-medium truncate max-w-[200px] ${onRowClick && d.codice !== "__unassigned__" ? "text-primary underline decoration-dotted" : ""}`}>{d.descrizione}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs">{formatCurrency(d.importo)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                    {total > 0 ? (d.importo / total * 100).toFixed(1) : "0.0"}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 font-semibold">
                <td></td>
                <td></td>
                <td className="px-3 py-2 text-xs">TOTALE</td>
                <td className={`px-3 py-2 text-right font-mono text-xs ${accentClass}`}>{formatCurrency(data.reduce((s, d) => s + d.importo, 0))}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      }
    </div>);
}

/* ────────── PDF Centro table sub-component ────────── */

function PdfCentroTable({ title, data, total }: {title: string;data: CentroAgg[];total: number;}) {
  if (data.length === 0) return null;
  return (
    <div className="pdf-section">
      <h2>{title}</h2>
      <table className="pdf-table">
        <thead>
          <tr>
             <th>Codice</th>
             <th>Centro</th>
             <th className="is-right">Importo</th>
             <th className="is-right">%</th>
           </tr>
        </thead>
        <tbody>
          {data.map((d) =>
          <tr key={d.codice}>
              <td style={{ fontFamily: "monospace", fontSize: "0.85em" }}>{d.codice === "__unassigned__" ? "—" : d.codice}</td>
              <td>{d.descrizione}</td>
              <td className="is-right">{formatCurrency(d.importo)}</td>
              <td className="is-right">{total > 0 ? (d.importo / total * 100).toFixed(1) : "0.0"}%</td>
            </tr>
          )}
           <tr className="pdf-table-total">
             <td></td>
             <td>TOTALE</td>
            <td className="is-right">{formatCurrency(data.reduce((s, d) => s + d.importo, 0))}</td>
            <td className="is-right">100%</td>
          </tr>
        </tbody>
      </table>
    </div>);

}