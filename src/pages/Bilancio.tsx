import { useMemo, useState, useCallback, useEffect, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { useInvoiceData, SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { useCentriData, CategoriaCentro, CentroCR } from "@/hooks/useCentri";
import { useDocumentiAcquisto, DocumentoAcquisto } from "@/hooks/useDocumentiAcquisto";
import { StatCard } from "@/components/StatCard";
import { formatCurrency } from "@/lib/format";
import { TrendingUp, TrendingDown, Scale, Percent, BarChart3, Loader2, FileText, ChevronRight, ChevronDown } from "lucide-react";
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
  costiDocumenti: number;
  numDocumenti: number;
}

function parseYearFromDate(dateStr: string | null): number | null {
  if (!dateStr) return null;
  // Try DD/MM/YYYY
  const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return parseInt(m[3]);
  // Try YYYY-MM-DD
  const m2 = dateStr.match(/^(\d{4})/);
  if (m2) return parseInt(m2[1]);
  return null;
}

function buildYearSummaries(sales: SaleInvoice[], purchases: PurchaseInvoice[], documenti: DocumentoAcquisto[]): YearSummary[] {
  const map = new Map<number, YearSummary>();
  const ensure = (a: number) => {
    if (!map.has(a)) map.set(a, { anno: a, ricavi: 0, costi: 0, ivaRicavi: 0, ivaCosti: 0, saldo: 0, marginePercent: 0, numVendite: 0, numAcquisti: 0, costiDocumenti: 0, numDocumenti: 0 });
    return map.get(a)!;
  };
  sales.forEach((s) => {const y = ensure(s.anno);y.ricavi += s.imponibile;y.ivaRicavi += s.imposta;y.numVendite++;});
  purchases.forEach((p) => {const y = ensure(p.anno);y.costi += p.imponibile;y.ivaCosti += p.imposta;y.numAcquisti++;});
  documenti.forEach((d) => {
    if (!d.importo) return;
    const anno = parseYearFromDate(d.data_documento);
    if (!anno) return;
    const y = ensure(anno);
    y.costi += d.importo;
    y.costiDocumenti += d.importo;
    y.numDocumenti++;
  });
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
  const { allSales, allPurchases, loading: invoiceLoading, filterOptions } = useInvoiceData();
  const { centri, categorie } = useCentriData();
  const { documenti, loading: docLoading } = useDocumentiAcquisto();
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

  const yearSummaries = useMemo(() => buildYearSummaries(allSales, allPurchases, documenti), [allSales, allPurchases, documenti]);

  const annoFilter = selectedAnno !== "all" ? parseInt(selectedAnno) : undefined;

  const globalKpis = useMemo(() => {
    const src = annoFilter ? yearSummaries.filter((y) => y.anno === annoFilter) : yearSummaries;
    const ricavi = src.reduce((s, y) => s + y.ricavi, 0);
    const costi = src.reduce((s, y) => s + y.costi, 0);
    const saldo = ricavi - costi;
    const margine = ricavi ? saldo / ricavi * 100 : 0;
    const numVendite = src.reduce((s, y) => s + y.numVendite, 0);
    const numAcquisti = src.reduce((s, y) => s + y.numAcquisti, 0);
    const numDocumenti = src.reduce((s, y) => s + y.numDocumenti, 0);
    return { ricavi, costi, saldo, margine, numVendite, numAcquisti, numDocumenti };
  }, [yearSummaries, annoFilter]);

  const centriRicavo = useMemo(() => centri.filter((c) => c.tipo === "ricavo"), [centri]);
  const centriCosto = useMemo(() => centri.filter((c) => c.tipo === "costo"), [centri]);

  const ricavoBreakdown = useMemo(
    () => aggregateByCentro(allSales, ricavoMapVendite, centriRicavo, annoFilter),
    [allSales, ricavoMapVendite, centriRicavo, annoFilter]
  );
  const costoBreakdown = useMemo(() => {
    const invoiceAgg = aggregateByCentro(allPurchases, costoMapAcquisti, centriCosto, annoFilter);
    // Add documenti_acquisto costs by centro_costo
    const docAgg = new Map<string, number>();
    const filteredDocs = annoFilter
      ? documenti.filter(d => d.importo && parseYearFromDate(d.data_documento) === annoFilter)
      : documenti.filter(d => !!d.importo);
    filteredDocs.forEach(d => {
      const codice = d.centro_costo || "__unassigned__";
      docAgg.set(codice, (docAgg.get(codice) || 0) + (d.importo || 0));
    });
    // Merge into invoice aggregation
    const merged = new Map(invoiceAgg.map(a => [a.codice, { ...a }]));
    const centroLookup = new Map(centriCosto.map(c => [c.codice, c.descrizione]));
    docAgg.forEach((importo, codice) => {
      if (merged.has(codice)) {
        merged.get(codice)!.importo += importo;
      } else {
        merged.set(codice, {
          codice,
          descrizione: codice === "__unassigned__" ? "Non classificate" : centroLookup.get(codice) || codice,
          importo,
        });
      }
    });
    return Array.from(merged.values()).sort((a, b) => b.importo - a.importo);
  }, [allPurchases, costoMapAcquisti, centriCosto, annoFilter, documenti]);

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

  const loading = invoiceLoading || docLoading;

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
            <FileText className="h-4 w-4 mr-1" /> Report
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
          subtitle={`${globalKpis.numAcquisti} fatture${globalKpis.numDocumenti ? ` + ${globalKpis.numDocumenti} doc` : ""}`}
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
            <h1>RELAZIONE ECONOMICA — {annoLabel}</h1>
            <p>Riepilogo costi e ricavi con ripartizione per centri di competenza</p>
          </div>
        </div>
        <div className="pdf-meta">
          <span>Generato il {now}</span>
          <span>•</span>
          <span>{globalKpis.numVendite} fatture vendita — {globalKpis.numAcquisti} fatture acquisto{globalKpis.numDocumenti ? ` — ${globalKpis.numDocumenti} documenti` : ""}</span>
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

/* ────────── Side-by-side centro tables with horizontal pairing ────────── */

interface CategoryGroup {
  categoria: CategoriaCentro;
  items: CentroAgg[];
  subtotal: number;
}

// Pair mapping: ricavo suffix → costo suffix
const CATEGORY_PAIRS: [string, string][] = [["RG", "CG"], ["RO", "CO"], ["RC", "CC"]];

function buildGroups(data: CentroAgg[], categorie: CategoriaCentro[], centri: CentroCR[]): { groups: CategoryGroup[]; orphans: CentroAgg[] } {
  const dataByCode = new Map(data.map(d => [d.codice, d]));
  const groups: CategoryGroup[] = [];
  const usedCodes = new Set<string>();

  for (const cat of categorie) {
    const catCentri = centri.filter(c => c.categoriaId === cat.id);
    const items: CentroAgg[] = [];
    for (const cc of catCentri) {
      const agg = dataByCode.get(cc.codice);
      if (agg) { items.push(agg); usedCodes.add(cc.codice); }
    }
    groups.push({
      categoria: cat,
      items: items.sort((a, b) => b.importo - a.importo),
      subtotal: items.reduce((s, i) => s + i.importo, 0),
    });
  }

  const orphans = data.filter(d => !usedCodes.has(d.codice));
  return { groups, orphans };
}

function CentriSideBySide({
  ricavoBreakdown, costoBreakdown, totalRicavi, totalCosti, onRowClick, centri, categorie
}: {ricavoBreakdown: CentroAgg[];costoBreakdown: CentroAgg[];totalRicavi: number;totalCosti: number;onRowClick?: (codice: string, tipo: "ricavo" | "costo") => void; centri: CentroCR[]; categorie: CategoriaCentro[];}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCategory = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  const categorieRicavo = useMemo(() => categorie.filter(c => c.tipo === "ricavo"), [categorie]);
  const categorieCosto = useMemo(() => categorie.filter(c => c.tipo === "costo"), [categorie]);
  const centriRicavo = useMemo(() => centri.filter(c => c.tipo === "ricavo"), [centri]);
  const centriCosto = useMemo(() => centri.filter(c => c.tipo === "costo"), [centri]);

  const ricavoData = useMemo(() => buildGroups(ricavoBreakdown, categorieRicavo, centriRicavo), [ricavoBreakdown, categorieRicavo, centriRicavo]);
  const costoData = useMemo(() => buildGroups(costoBreakdown, categorieCosto, centriCosto), [costoBreakdown, categorieCosto, centriCosto]);

  // Build paired rows based on CATEGORY_PAIRS
  const pairs = useMemo(() => {
    const ricavoByCode = new Map(ricavoData.groups.map(g => [g.categoria.codice, g]));
    const costoByCode = new Map(costoData.groups.map(g => [g.categoria.codice, g]));
    const usedR = new Set<string>();
    const usedC = new Set<string>();

    const result: { ricavo: CategoryGroup | null; costo: CategoryGroup | null; pairKey: string }[] = [];

    for (const [rCode, cCode] of CATEGORY_PAIRS) {
      const r = ricavoByCode.get(rCode) || null;
      const c = costoByCode.get(cCode) || null;
      if (r) usedR.add(rCode);
      if (c) usedC.add(cCode);
      result.push({ ricavo: r, costo: c, pairKey: `${rCode}-${cCode}` });
    }

    // Add any unpaired categories
    ricavoData.groups.filter(g => !usedR.has(g.categoria.codice)).forEach(g => {
      result.push({ ricavo: g, costo: null, pairKey: `extra-r-${g.categoria.codice}` });
    });
    costoData.groups.filter(g => !usedC.has(g.categoria.codice)).forEach(g => {
      result.push({ ricavo: null, costo: g, pairKey: `extra-c-${g.categoria.codice}` });
    });

    return result;
  }, [ricavoData, costoData]);

  const renderHalf = (
    group: CategoryGroup | null,
    orphans: CentroAgg[],
    total: number,
    tipo: "ricavo" | "costo",
    accentClass: string,
    showOrphans: boolean,
    isCollapsed: boolean,
    onToggle: () => void,
  ) => {
    if (!group && !showOrphans) {
      return (
        <>
          <td className="py-1.5" colSpan={4}></td>
        </>
      );
    }

    if (showOrphans && orphans.length > 0) {
      return (
        <>
          <td className="pl-2 pr-0 py-1.5"></td>
          <td className="px-3 py-1.5 text-xs font-mono text-muted-foreground">—</td>
          <td className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Non classificate</td>
          <td className="px-3 py-1.5 text-right font-mono text-xs">{formatCurrency(orphans.reduce((s, d) => s + d.importo, 0))}</td>
        </>
      );
    }

    if (!group) return <td className="py-1.5" colSpan={4}></td>;

    return null; // handled inline
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              {/* Ricavo side */}
              <th className="w-8"></th>
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Codice</th>
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Centro di Ricavo</th>
              <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Importo</th>
              {/* Separator */}
              <th className="w-px bg-border"></th>
              {/* Costo side */}
              <th className="w-8"></th>
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Codice</th>
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Centro di Costo</th>
              <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Importo</th>
              {/* Separator */}
              <th className="w-px bg-border"></th>
              {/* Differenza */}
              <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Differenza</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map(({ ricavo, costo, pairKey }) => {
              const isCollapsed_ = collapsed[pairKey] ?? false;
              const maxItems = Math.max(ricavo?.items.length || 0, costo?.items.length || 0);
              const hasContent = ricavo || costo;
              if (!hasContent) return null;

              return (
                <Fragment key={pairKey}>
                  {/* Category header row */}
                  <tr
                    className="border-b border-border bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors select-none"
                    onClick={() => toggleCategory(pairKey)}
                  >
                    {/* Ricavo category */}
                    <td className="pl-2 pr-0 py-1.5 text-muted-foreground">
                      {isCollapsed_ ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </td>
                    <td className="px-3 py-1.5 text-xs font-mono font-semibold text-foreground">{ricavo?.categoria.codice || ""}</td>
                    <td className="px-3 py-1.5 text-xs font-semibold text-foreground">{ricavo?.categoria.descrizione || ""}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs font-semibold text-income">{ricavo ? formatCurrency(ricavo.subtotal) : ""}</td>
                    {/* Separator */}
                    <td className="bg-border"></td>
                    {/* Costo category */}
                    <td className="pl-2 pr-0 py-1.5"></td>
                    <td className="px-3 py-1.5 text-xs font-mono font-semibold text-foreground">{costo?.categoria.codice || ""}</td>
                    <td className="px-3 py-1.5 text-xs font-semibold text-foreground">{costo?.categoria.descrizione || ""}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs font-semibold text-expense">{costo ? formatCurrency(costo.subtotal) : ""}</td>
                    {/* Separator + Differenza */}
                    <td className="bg-border"></td>
                    {(() => {
                      const diff = (ricavo?.subtotal || 0) - (costo?.subtotal || 0);
                      return <td className={`px-3 py-1.5 text-right font-mono text-xs font-semibold ${diff >= 0 ? "text-income" : "text-expense"}`}>{formatCurrency(diff)}</td>;
                    })()}
                  </tr>
                  {/* Expanded items */}
                  {!isCollapsed_ && Array.from({ length: maxItems }).map((_, i) => {
                    const rItem = ricavo?.items[i];
                    const cItem = costo?.items[i];
                    return (
                      <tr key={`${pairKey}-${i}`} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="pl-2 pr-0 py-1.5"></td>
                        {rItem ? (
                          <>
                            <td className="px-3 pl-8 py-1.5 text-xs font-mono text-muted-foreground">{rItem.codice}</td>
                            <td
                              className={`px-3 py-1.5 text-xs font-medium truncate max-w-[180px] ${onRowClick ? "text-primary underline decoration-dotted cursor-pointer" : ""}`}
                              onClick={() => onRowClick && rItem.codice !== "__unassigned__" && onRowClick(rItem.codice, "ricavo")}
                            >{rItem.descrizione}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs">{formatCurrency(rItem.importo)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-1.5"></td>
                            <td className="px-3 py-1.5"></td>
                            <td className="px-3 py-1.5"></td>
                          </>
                        )}
                        <td className="bg-border"></td>
                        <td className="pl-2 pr-0 py-1.5"></td>
                        {cItem ? (
                          <>
                            <td className="px-3 pl-8 py-1.5 text-xs font-mono text-muted-foreground">{cItem.codice}</td>
                            <td
                              className={`px-3 py-1.5 text-xs font-medium truncate max-w-[180px] ${onRowClick ? "text-primary underline decoration-dotted cursor-pointer" : ""}`}
                              onClick={() => onRowClick && cItem.codice !== "__unassigned__" && onRowClick(cItem.codice, "costo")}
                            >{cItem.descrizione}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs">{formatCurrency(cItem.importo)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-1.5"></td>
                            <td className="px-3 py-1.5"></td>
                            <td className="px-3 py-1.5"></td>
                          </>
                        )}
                        <td className="bg-border"></td>
                        <td className="px-3 py-1.5"></td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
            {/* Orphan rows */}
            {(ricavoData.orphans.length > 0 || costoData.orphans.length > 0) && (() => {
              const maxOrphans = Math.max(ricavoData.orphans.length, costoData.orphans.length);
              return Array.from({ length: maxOrphans }).map((_, i) => {
                const rO = ricavoData.orphans[i];
                const cO = costoData.orphans[i];
                return (
                  <tr key={`orphan-${i}`} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="pl-2 pr-0 py-1.5"></td>
                    {rO ? (
                      <>
                        <td className="px-3 py-1.5 text-xs font-mono text-muted-foreground">{rO.codice === "__unassigned__" ? "—" : rO.codice}</td>
                        <td className={`px-3 py-1.5 text-xs font-medium truncate max-w-[180px] ${onRowClick && rO.codice !== "__unassigned__" ? "text-primary underline decoration-dotted cursor-pointer" : ""}`}
                          onClick={() => onRowClick && rO.codice !== "__unassigned__" && onRowClick(rO.codice, "ricavo")}
                        >{rO.descrizione}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs">{formatCurrency(rO.importo)}</td>
                      </>
                    ) : (
                      <><td className="px-3 py-1.5"></td><td className="px-3 py-1.5"></td><td className="px-3 py-1.5"></td></>
                    )}
                    <td className="bg-border"></td>
                    <td className="pl-2 pr-0 py-1.5"></td>
                    {cO ? (
                      <>
                        <td className="px-3 py-1.5 text-xs font-mono text-muted-foreground">{cO.codice === "__unassigned__" ? "—" : cO.codice}</td>
                        <td className={`px-3 py-1.5 text-xs font-medium truncate max-w-[180px] ${onRowClick && cO.codice !== "__unassigned__" ? "text-primary underline decoration-dotted cursor-pointer" : ""}`}
                          onClick={() => onRowClick && cO.codice !== "__unassigned__" && onRowClick(cO.codice, "costo")}
                        >{cO.descrizione}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs">{formatCurrency(cO.importo)}</td>
                      </>
                    ) : (
                      <><td className="px-3 py-1.5"></td><td className="px-3 py-1.5"></td><td className="px-3 py-1.5"></td></>
                    )}
                    <td className="bg-border"></td>
                    <td className="px-3 py-1.5"></td>
                  </tr>
                );
              });
            })()}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 font-semibold border-t-2 border-border">
              <td></td>
              <td></td>
              <td className="px-3 py-2 text-xs">TOTALE RICAVI</td>
              <td className="px-3 py-2 text-right font-mono text-xs text-income">{formatCurrency(totalRicavi)}</td>
              <td className="bg-border"></td>
              <td></td>
              <td></td>
              <td className="px-3 py-2 text-xs">TOTALE COSTI</td>
              <td className="px-3 py-2 text-right font-mono text-xs text-expense">{formatCurrency(totalCosti)}</td>
              <td className="bg-border"></td>
              {(() => {
                const diff = totalRicavi - totalCosti;
                return <td className={`px-3 py-2 text-right font-mono text-xs font-semibold ${diff >= 0 ? "text-income" : "text-expense"}`}>{formatCurrency(diff)}</td>;
              })()}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
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