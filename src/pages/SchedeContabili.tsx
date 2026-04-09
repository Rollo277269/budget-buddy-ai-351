import { useState, useMemo, useEffect, useCallback } from "react";
import { useInvoiceData, SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { parsePaymentTerms } from "@/lib/paymentTerms";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Combobox } from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Scale, Receipt, Loader2, Users, Truck, FileText, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommessaDetailSheet } from "@/components/CommessaDetailSheet";
import { useCommessaLinks } from "@/hooks/useCommessaLinks";
import { useCentroMap, useCentriData } from "@/hooks/useCentri";
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type SortKey = "data" | "numero" | "descrizione" | "cig" | "scadenza" | "stato" | "imponibile" | "imposta" | "dare" | "avere" | "saldo";
type SortDir = "asc" | "desc";

function sortRows(rows: PrimaNotaRow[], key: SortKey, dir: SortDir): PrimaNotaRow[] {
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "data": cmp = a.dataSort - b.dataSort; break;
      case "numero": cmp = a.numero.localeCompare(b.numero); break;
      case "descrizione": cmp = a.descrizione.localeCompare(b.descrizione); break;
      case "cig": cmp = (a.cig || "").localeCompare(b.cig || ""); break;
      case "scadenza": cmp = (a.scadenza || "").localeCompare(b.scadenza || ""); break;
      case "stato": cmp = a.stato.localeCompare(b.stato); break;
      case "imponibile": cmp = a.imponibile - b.imponibile; break;
      case "imposta": cmp = a.imposta - b.imposta; break;
      case "dare": cmp = a.dare - b.dare; break;
      case "avere": cmp = a.avere - b.avere; break;
      case "saldo": cmp = a.saldo - b.saldo; break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

/* ── Helpers ── */

function parseDate(d: string): Date | null {
  if (!d) return null;
  const parts = d.split("/");
  if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  const serial = parseFloat(d);
  if (!isNaN(serial) && serial > 30000) return new Date((serial - 25569) * 86400 * 1000);
  return null;
}

interface PrimaNotaRow {
  data: string;
  dataSort: number;
  numero: string;
  descrizione: string;
  tipo: "vendita" | "acquisto";
  dare: number;
  avere: number;
  saldo: number;
  stato: string;
  cig: string;
  scadenza: string;
  imponibile: number;
  imposta: number;
}

function StatusBadge({ stato }: { stato: string }) {
  const s = stato.toLowerCase();
  if (s.includes("scadut"))
    return <Badge variant="destructive" className="text-[10px]">{stato}</Badge>;
  if (s.includes("scadere"))
    return <Badge variant="secondary" className="text-[10px]">{stato}</Badge>;
  if (s.includes("pagat") || s.includes("regolar") || s.includes("incass"))
    return <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">{stato}</Badge>;
  return <Badge variant="outline" className="text-[10px]">{stato}</Badge>;
}

function buildRows(
  allSales: SaleInvoice[],
  allPurchases: PurchaseInvoice[],
  tipo: "cliente" | "fornitore",
  nome: string,
  paymentDatesMap: Map<string, string> // key: "tipo-anno-numero" → payment date string
) {
  const entries: Omit<PrimaNotaRow, "saldo">[] = [];

  if (tipo === "cliente") {
    allSales.filter((s) => s.cliente === nome).forEach((s) => {
      const d = parseDate(s.data);
      entries.push({
        data: s.data, dataSort: d ? d.getTime() : 0,
        numero: `${s.numero}/${s.anno}`, descrizione: s.descrizione || s.cliente,
        tipo: "vendita", dare: s.totale, avere: 0, stato: s.stato,
        cig: s.cig, scadenza: s.scadenza, imponibile: s.imponibile, imposta: s.imposta,
      });
    });
  } else {
    allPurchases.filter((p) => p.fornitore === nome).forEach((p) => {
      const d = parseDate(p.data);
      entries.push({
        data: p.data, dataSort: d ? d.getTime() : 0,
        numero: `${p.numero}/${p.anno}`, descrizione: p.descrizione || p.fornitore,
        tipo: "acquisto", dare: 0, avere: p.totale, stato: p.stato,
        cig: p.cig, scadenza: p.scadenza, imponibile: p.imponibile, imposta: p.imposta,
      });
    });
  }

  entries.sort((a, b) => b.dataSort - a.dataSort);

  let saldo = 0;
  const rows: PrimaNotaRow[] = entries.map((e) => {
    saldo += e.dare - e.avere;
    return { ...e, saldo };
  });

  const totaleDare = entries.reduce((a, e) => a + e.dare, 0);
  const totaleAvere = entries.reduce((a, e) => a + e.avere, 0);

  // Compute payment timing: delay between actual payment date and calculated due date
  const paymentDelays: number[] = [];
  for (const e of entries) {
    // Extract anno and numero from "numero/anno" format
    const parts = e.numero.split("/");
    if (parts.length !== 2) continue;
    const numero = parts[0];
    const anno = parts[1];
    const invoiceType = e.tipo === "vendita" ? "vendita" : "acquisto";
    const key = `${invoiceType}-${anno}-${numero}`;
    
    const actualPaymentDateStr = paymentDatesMap.get(key);
    if (!actualPaymentDateStr) continue;
    
    const actualPaymentDate = parseDate(actualPaymentDateStr);
    if (!actualPaymentDate) continue;

    // Default empty scadenza to "Vista fattura" (due date = invoice date)
    const scadenza = e.scadenza?.trim() ? e.scadenza : "Vista fattura";
    const parsed = parsePaymentTerms(scadenza, e.data);
    if (parsed) {
      const delay = Math.round(
        (actualPaymentDate.getTime() - parsed.lastDueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      paymentDelays.push(delay);
    }
  }

  const paymentTiming = paymentDelays.length > 0 ? {
    min: Math.min(...paymentDelays),
    max: Math.max(...paymentDelays),
    avg: Math.round(paymentDelays.reduce((a, b) => a + b, 0) / paymentDelays.length),
    count: paymentDelays.length,
  } : null;

  return {
    rows,
    stats: {
      totaleDare,
      totaleAvere,
      saldo: totaleDare - totaleAvere,
      numFatture: entries.length,
      mediaImporto: entries.length > 0 ? (totaleDare + totaleAvere) / entries.length : 0,
      totaleImponibile: entries.reduce((a, e) => a + e.imponibile, 0),
      totaleImposta: entries.reduce((a, e) => a + e.imposta, 0),
      paymentTiming,
    },
  };
}

/* ── PDF Export ── */

function handleExportPdf() {
  document.body.classList.add("print-report");
  const cleanup = () => {
    document.body.classList.remove("print-report");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

function PdfReport({ tipo, nome, rows, stats }: {
  tipo: "cliente" | "fornitore";
  nome: string;
  rows: PrimaNotaRow[];
  stats: ReturnType<typeof buildRows>["stats"];
}) {
  const label = tipo === "cliente" ? "Scheda Cliente" : "Scheda Fornitore";
  const now = new Date().toLocaleString("it-IT");

  return (
    <div className="scheda-pdf-report pdf-report" style={{ display: "none" }}>
      {/* Header */}
      <div className="pdf-header">
        <div className="pdf-header-logo">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="hsl(var(--primary))" />
            <text x="18" y="24" textAnchor="middle" fill="white" fontSize="18" fontWeight="700" fontFamily="sans-serif">G</text>
          </svg>
        </div>
        <div className="pdf-header-text">
          <h1>{label}</h1>
          <p>{nome}</p>
          <div className="pdf-meta">
            <span>Documenti: {stats.numFatture}</span>
            <span>Esportato: {now}</span>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="pdf-kpi-grid">
        <div className="pdf-kpi-card">
          <p className="pdf-kpi-label">{tipo === "cliente" ? "Fatturato" : "Dare"}</p>
          <p className="pdf-kpi-value is-positive">{formatCurrency(stats.totaleDare)}</p>
        </div>
        <div className="pdf-kpi-card">
          <p className="pdf-kpi-label">{tipo === "fornitore" ? "Totale Acquisti" : "Avere"}</p>
          <p className="pdf-kpi-value is-negative">{formatCurrency(stats.totaleAvere)}</p>
        </div>
        <div className="pdf-kpi-card">
          <p className="pdf-kpi-label">Saldo</p>
          <p className={`pdf-kpi-value ${stats.saldo >= 0 ? "is-positive" : "is-negative"}`}>{formatCurrency(stats.saldo)}</p>
        </div>
        <div className="pdf-kpi-card">
          <p className="pdf-kpi-label">Media Importo</p>
          <p className="pdf-kpi-value">{formatCurrency(stats.mediaImporto)}</p>
          <p className="pdf-kpi-sub">Imponibile: {formatCurrency(stats.totaleImponibile)} · IVA: {formatCurrency(stats.totaleImposta)}</p>
        </div>
      </div>

      {/* Prima Nota Table */}
      <div className="pdf-section pdf-full-width">
        <h2>Prima Nota — Movimenti in ordine cronologico</h2>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>N°</th>
              <th>Descrizione</th>
              <th>CIG</th>
              <th>Scadenza</th>
              <th>Stato</th>
              <th className="is-right">Imponibile</th>
              <th className="is-right">IVA</th>
              <th className="is-right">Dare</th>
              <th className="is-right">Avere</th>
              <th className="is-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: "nowrap" }}>{row.data}</td>
                <td>{row.numero}</td>
                <td className="pdf-desc-cell">{row.descrizione}</td>
                <td>{row.cig || "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>{row.scadenza || "—"}</td>
                <td>{row.stato}</td>
                <td className="is-right">{formatCurrency(row.imponibile)}</td>
                <td className="is-right">{formatCurrency(row.imposta)}</td>
                <td className="is-right">{row.dare > 0 ? formatCurrency(row.dare) : "—"}</td>
                <td className="is-right">{row.avere > 0 ? formatCurrency(row.avere) : "—"}</td>
                <td className={`is-right ${row.saldo >= 0 ? "is-positive" : "is-negative"}`} style={{ fontWeight: 600 }}>{formatCurrency(row.saldo)}</td>
              </tr>
            ))}
            <tr className="pdf-table-total">
              <td colSpan={6}>TOTALE</td>
              <td className="is-right">{formatCurrency(stats.totaleImponibile)}</td>
              <td className="is-right">{formatCurrency(stats.totaleImposta)}</td>
              <td className="is-right is-positive">{formatCurrency(stats.totaleDare)}</td>
              <td className="is-right is-negative">{formatCurrency(stats.totaleAvere)}</td>
              <td className={`is-right ${stats.saldo >= 0 ? "is-positive" : "is-negative"}`}>{formatCurrency(stats.saldo)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="pdf-footer">
        <div className="pdf-footer-left">{label} — {nome}</div>
        <div className="pdf-footer-center">Esportato il {now}</div>
        <div className="pdf-footer-right">Pag. <span className="pdf-page-number"></span></div>
      </div>
    </div>
  );
}

/* ── Scheda Detail (on-screen) ── */

function SchedaDetail({
  tipo,
  nome,
  allSales,
  allPurchases,
}: {
  tipo: "cliente" | "fornitore";
  nome: string;
  allSales: SaleInvoice[];
  allPurchases: PurchaseInvoice[];
}) {
  // Load payment dates from bank reconciliations
  const [paymentDatesMap, setPaymentDatesMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    async function loadPaymentDates() {
      // Fetch ALL reconciliations (both vendita and acquisto) so we cover all invoices
      const { data, error } = await supabase
        .from("bank_reconciliations")
        .select("invoice_type, invoice_anno, invoice_numero, movement_id");
      if (error || !data || data.length === 0) return;

      const movementIds = [...new Set(data.map((r: any) => r.movement_id))];
      const movDateMap = new Map<string, string>();

      for (let i = 0; i < movementIds.length; i += 500) {
        const batch = movementIds.slice(i, i + 500);
        const { data: movements } = await supabase
          .from("bank_movements")
          .select("id, data")
          .in("id", batch);
        if (movements) {
          movements.forEach((m: any) => movDateMap.set(m.id, m.data));
        }
      }

      const map = new Map<string, string>();
      for (const rec of data as any[]) {
        const movDate = movDateMap.get(rec.movement_id);
        if (movDate && rec.invoice_anno && rec.invoice_numero && rec.invoice_type) {
          const key = `${rec.invoice_type}-${rec.invoice_anno}-${rec.invoice_numero}`;
          const existing = map.get(key);
          if (!existing) {
            map.set(key, movDate);
          } else {
            const existDate = parseDate(existing);
            const newDate = parseDate(movDate);
            if (existDate && newDate && newDate > existDate) {
              map.set(key, movDate);
            }
          }
        }
      }
      setPaymentDatesMap(map);
    }
    loadPaymentDates();
  }, [tipo, nome]);

  const { rows, stats } = useMemo(
    () => buildRows(allSales, allPurchases, tipo, nome, paymentDatesMap),
    [allSales, allPurchases, tipo, nome, paymentDatesMap]
  );

  const [selectedCig, setSelectedCig] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("data");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { links, addLink, removeLink, refresh: refreshLinks } = useCommessaLinks();
  const handleCigClick = useCallback((cig: string) => setSelectedCig(cig), []);

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) { setSortDir((d) => d === "asc" ? "desc" : "asc"); return key; }
      setSortDir(key === "data" ? "desc" : "asc");
      return key;
    });
  }, []);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        r.data.toLowerCase().includes(q) ||
        r.numero.toLowerCase().includes(q) ||
        r.descrizione.toLowerCase().includes(q) ||
        (r.cig || "").toLowerCase().includes(q) ||
        r.stato.toLowerCase().includes(q) ||
        (r.scadenza || "").toLowerCase().includes(q)
      );
    }
    return sortRows(result, sortKey, sortDir);
  }, [rows, search, sortKey, sortDir]);

  const commessa = selectedCig ? {
    numero: "", oggetto: "", committente: "", assegnataria: "", cig: selectedCig,
  } : null;

  const centroContext = tipo === "cliente" ? "vendite" : "acquisti";
  const centroTipo = tipo === "cliente" ? "ricavo" : "costo";
  const { map: centroMap } = useCentroMap(centroTipo as "costo" | "ricavo", centroContext as "vendite" | "acquisti");
  const { centri } = useCentriData();

  const CHART_COLORS = [
    "hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))",
    "hsl(var(--destructive))", "hsl(210 80% 50%)", "hsl(280 60% 50%)",
    "hsl(170 60% 40%)", "hsl(30 80% 50%)", "hsl(330 60% 50%)", "hsl(200 70% 45%)",
  ];

  const centroChartData = useMemo(() => {
    const invoices = tipo === "cliente"
      ? allSales.filter((s) => s.cliente === nome)
      : allPurchases.filter((p) => p.fornitore === nome);

    const totals: Record<string, number> = {};
    for (const inv of invoices) {
      const key = `${inv.numero}-${inv.anno}`;
      const codice = centroMap[key];
      const label = codice
        ? (centri.find((c) => c.codice === codice)?.descrizione || codice)
        : "Non assegnato";
      totals[label] = (totals[label] || 0) + Math.abs(inv.totale);
    }

    return Object.entries(totals)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [tipo, nome, allSales, allPurchases, centroMap, centri]);

  return (
      <>
        {/* Screen content */}
        <div className="space-y-5 scheda-screen-content">
          {/* KPI table + Affidabilità + Centro chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: KPI summary table */}
            <div className="rounded-lg border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {[
                    { label: tipo === "cliente" ? "Fatturato" : "Dare", value: stats.totaleDare, cls: "text-[hsl(var(--success))]" },
                    { label: tipo === "fornitore" ? "Totale Acquisti" : "Avere", value: stats.totaleAvere, cls: "text-destructive" },
                    { label: "Saldo", value: stats.saldo, cls: stats.saldo >= 0 ? "text-[hsl(var(--success))]" : "text-destructive" },
                    { label: "Totale Imponibile", value: stats.totaleImponibile, cls: "" },
                    { label: "Totale IVA", value: stats.totaleImposta, cls: "" },
                  ].map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground font-medium">{row.label}</td>
                      <td className={`px-4 py-2.5 text-right font-mono text-sm font-semibold ${row.cls}`}>
                        {formatCurrency(row.value)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-medium">Documenti</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-sm">
                      {stats.numFatture}
                      <span className="text-[10px] text-muted-foreground ml-2">media {formatCurrency(stats.mediaImporto)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Center: Affidabilità / Tempi */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                {tipo === "cliente" ? "Tempi di Incasso" : "Tempi di Pagamento"}
              </h3>
              {stats.paymentTiming ? (
                <div className="space-y-3">
                  {/* Star rating based on delay (actual payment - due date) */}
                  {(() => {
                    const avg = stats.paymentTiming!.avg;
                    // avg is delay in days: negative = early, 0 = on time, positive = late
                    // ≤-15 (very early) = 5★, ≤0 (on time) = 5★, ≤15 = 4★, ≤30 = 3★, ≤60 = 2★, >60 = 1★
                    const stars = avg <= 0 ? 5 : avg <= 15 ? 4 : avg <= 30 ? 3 : avg <= 60 ? 2 : 1;
                    const ratingLabels = ["", "Critica", "Scarsa", "Sufficiente", "Buona", "Eccellente"];
                    const ratingColors = ["", "text-destructive", "text-destructive", "text-[hsl(var(--warning))]", "text-primary", "text-[hsl(var(--success))]"];
                    return (
                      <div className="flex flex-col items-center gap-1 py-1">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <Star
                              key={i}
                              className={`h-5 w-5 ${i <= stars ? ratingColors[stars] : "text-muted"}`}
                              fill={i <= stars ? "currentColor" : "none"}
                            />
                          ))}
                        </div>
                        <p className={`text-xs font-semibold ${ratingColors[stars]}`}>
                          {ratingLabels[stars]}
                        </p>
                      </div>
                    );
                  })()}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-[10px] text-muted-foreground uppercase">Min</p>
                      <p className={`text-xl font-bold font-mono ${stats.paymentTiming.min <= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                        {stats.paymentTiming.min > 0 ? "+" : ""}{stats.paymentTiming.min}
                      </p>
                      <p className="text-[10px] text-muted-foreground">giorni</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-[10px] text-muted-foreground uppercase">Media</p>
                      <p className={`text-xl font-bold font-mono ${stats.paymentTiming.avg <= 0 ? "text-[hsl(var(--success))]" : stats.paymentTiming.avg <= 15 ? "text-primary" : "text-destructive"}`}>
                        {stats.paymentTiming.avg > 0 ? "+" : ""}{stats.paymentTiming.avg}
                      </p>
                      <p className="text-[10px] text-muted-foreground">giorni</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-[10px] text-muted-foreground uppercase">Max</p>
                      <p className={`text-xl font-bold font-mono ${stats.paymentTiming.max <= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                        {stats.paymentTiming.max > 0 ? "+" : ""}{stats.paymentTiming.max}
                      </p>
                      <p className="text-[10px] text-muted-foreground">giorni</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">
                      Ritardo rispetto alla scadenza · <span className="font-semibold">{stats.paymentTiming.count}</span> fatture riconciliate
                    </p>
                  </div>
                  {/* Visual bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                      <span>{stats.paymentTiming.min > 0 ? "+" : ""}{stats.paymentTiming.min}g</span>
                      <span>{stats.paymentTiming.avg > 0 ? "+" : ""}{stats.paymentTiming.avg}g</span>
                      <span>{stats.paymentTiming.max > 0 ? "+" : ""}{stats.paymentTiming.max}g</span>
                    </div>
                    <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                      {(() => {
                        const range = Math.max(1, stats.paymentTiming.max - stats.paymentTiming.min);
                        const zeroPos = Math.max(0, Math.min(100, ((0 - stats.paymentTiming.min) / range) * 100));
                        const avgPos = ((stats.paymentTiming.avg - stats.paymentTiming.min) / range) * 100;
                        return (
                          <>
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[hsl(var(--success))] via-primary to-destructive"
                              style={{ width: "100%" }}
                            />
                            {/* Zero line (on-time marker) */}
                            <div
                              className="absolute top-0 h-full w-0.5 bg-foreground/50"
                              style={{ left: `${zeroPos}%` }}
                              title="Scadenza"
                            />
                            {/* Average marker */}
                            <div
                              className="absolute top-0 h-full w-1 bg-foreground rounded"
                              style={{ left: `${avgPos}%` }}
                              title="Media"
                            />
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">
                  Dati insufficienti per il calcolo dei tempi
                </p>
              )}
            </div>
            {/* Right: Centro chart */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                {tipo === "cliente" ? "Fatturato per Centro di Ricavo" : "Acquisti per Centro di Costo"}
              </h3>
              {centroChartData.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Nessun centro assegnato</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={centroChartData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: "0.5rem", border: "1px solid hsl(var(--border))", fontSize: "0.75rem" }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18} name="Importo">
                      {centroChartData.map((_, idx) => (
                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

        {/* Grafico andamento saldo */}
        {rows.length > 1 && (() => {
          // Sort chronologically (ascending) and aggregate by year
          const chronoRows = [...rows].sort((a, b) => a.dataSort - b.dataSort);
          const yearAgg: Record<string, { dare: number; avere: number }> = {};
          for (const r of chronoRows) {
            const d = parseDate(r.data);
            const anno = d ? String(d.getFullYear()) : "N/D";
            if (!yearAgg[anno]) yearAgg[anno] = { dare: 0, avere: 0 };
            yearAgg[anno].dare += r.dare;
            yearAgg[anno].avere += r.avere;
          }
          let saldoProgressivo = 0;
          const chartData = Object.entries(yearAgg)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([anno, v]) => {
              saldoProgressivo += v.dare - v.avere;
              return { anno, Dare: Math.round(v.dare), Avere: Math.round(v.avere), Saldo: Math.round(saldoProgressivo) };
            });

          return (
            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                Andamento Saldo Progressivo
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                  <XAxis dataKey="anno" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 10 }}
                    width={50}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ borderRadius: "0.5rem", border: "1px solid hsl(var(--border))", fontSize: "0.75rem" }}
                  />
                  <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                  <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={2} />
                  <Bar dataKey="Dare" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} barSize={18} />
                  <Bar dataKey="Avere" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} barSize={18} />
                  <Area
                    type="monotone"
                    dataKey="Saldo"
                    stroke="hsl(210 80% 50%)"
                    fill="hsl(210 80% 50% / 0.1)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Saldo"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          );
        })()}

        <Separator />

        {/* Prima nota */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Prima Nota — {filteredRows.length} di {rows.length} movimenti
            </h3>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">Nessun movimento trovato</p>
          ) : (
            <div className="rounded-md border overflow-auto max-h-[calc(100vh-380px)]">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                  <TableRow className="bg-muted/50 font-semibold border-b-2">
                    <TableHead colSpan={6} className="text-[11px] py-2.5">TOTALE</TableHead>
                    <TableHead className="text-right font-mono text-[11px] py-2.5">{formatCurrency(stats.totaleImponibile)}</TableHead>
                    <TableHead className="text-right font-mono text-[11px] py-2.5">{formatCurrency(stats.totaleImposta)}</TableHead>
                    <TableHead className="text-right font-mono text-[11px] py-2.5 text-[hsl(var(--success))]">{formatCurrency(stats.totaleDare)}</TableHead>
                    <TableHead className="text-right font-mono text-[11px] py-2.5 text-destructive">{formatCurrency(stats.totaleAvere)}</TableHead>
                    <TableHead className={`text-right font-mono text-[11px] py-2.5 font-bold ${stats.saldo >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                      {formatCurrency(stats.saldo)}
                    </TableHead>
                  </TableRow>
                  <TableRow>
                    {([
                      { key: "data" as SortKey, label: "Data", w: "w-[85px]", align: "" },
                      { key: "numero" as SortKey, label: "N°", w: "w-[75px]", align: "" },
                      { key: "descrizione" as SortKey, label: "Descrizione", w: "", align: "" },
                      { key: "cig" as SortKey, label: "CIG", w: "w-[90px]", align: "" },
                      { key: "scadenza" as SortKey, label: "Scadenza", w: "w-[85px]", align: "" },
                      { key: "stato" as SortKey, label: "Stato", w: "w-[70px]", align: "" },
                      { key: "imponibile" as SortKey, label: "Imponibile", w: "w-[100px]", align: "text-right" },
                      { key: "imposta" as SortKey, label: "IVA", w: "w-[80px]", align: "text-right" },
                      { key: "dare" as SortKey, label: "Dare", w: "w-[110px]", align: "text-right" },
                      { key: "avere" as SortKey, label: "Avere", w: "w-[110px]", align: "text-right" },
                      { key: "saldo" as SortKey, label: "Saldo", w: "w-[110px]", align: "text-right" },
                    ]).map((col) => (
                      <TableHead
                        key={col.key}
                        className={`text-[11px] font-semibold ${col.w} ${col.align} cursor-pointer select-none hover:text-foreground`}
                        onClick={() => toggleSort(col.key)}
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {sortKey === col.key ? (
                            sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-30" />
                          )}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row, i) => (
                    <TableRow key={i} className="text-xs hover:bg-muted/30">
                      <TableCell className="font-mono text-[11px] py-2 whitespace-nowrap">{row.data}</TableCell>
                      <TableCell className="font-mono text-[11px] py-2">{row.numero}</TableCell>
                      <TableCell className="py-2 max-w-[260px] truncate text-[11px]">{row.descrizione}</TableCell>
                      <TableCell className="font-mono text-[11px] py-2">
                        {row.cig ? (
                          <span
                            className="text-primary underline decoration-dotted cursor-pointer hover:text-primary/80"
                            onClick={() => handleCigClick(row.cig)}
                          >{row.cig}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] py-2 whitespace-nowrap">{row.scadenza || "—"}</TableCell>
                      <TableCell className="py-2"><StatusBadge stato={row.stato} /></TableCell>
                      <TableCell className="text-right font-mono text-[11px] py-2">{formatCurrency(row.imponibile)}</TableCell>
                      <TableCell className="text-right font-mono text-[11px] py-2">{formatCurrency(row.imposta)}</TableCell>
                      <TableCell className="text-right font-mono text-[11px] py-2">
                        {row.dare > 0 ? <span className="text-[hsl(var(--success))]">{formatCurrency(row.dare)}</span> : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] py-2">
                        {row.avere > 0 ? <span className="text-destructive">{formatCurrency(row.avere)}</span> : "—"}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-[11px] font-semibold py-2 ${row.saldo >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                        {formatCurrency(row.saldo)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-semibold border-t-2 sticky bottom-0">
                    <TableCell colSpan={6} className="text-[11px] py-2.5">TOTALE</TableCell>
                    <TableCell className="text-right font-mono text-[11px] py-2.5">{formatCurrency(stats.totaleImponibile)}</TableCell>
                    <TableCell className="text-right font-mono text-[11px] py-2.5">{formatCurrency(stats.totaleImposta)}</TableCell>
                    <TableCell className="text-right font-mono text-[11px] py-2.5 text-[hsl(var(--success))]">{formatCurrency(stats.totaleDare)}</TableCell>
                    <TableCell className="text-right font-mono text-[11px] py-2.5 text-destructive">{formatCurrency(stats.totaleAvere)}</TableCell>
                    <TableCell className={`text-right font-mono text-[11px] py-2.5 font-bold ${stats.saldo >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                      {formatCurrency(stats.saldo)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Hidden PDF report */}
      <PdfReport tipo={tipo} nome={nome} rows={rows} stats={stats} />

      <CommessaDetailSheet
        commessa={commessa}
        open={!!selectedCig}
        onOpenChange={(open) => { if (!open) setSelectedCig(null); }}
        allSales={allSales}
        allPurchases={allPurchases}
        manualLinks={links}
        onAddLink={addLink}
        onRemoveLink={removeLink}
        onExpenseAdded={refreshLinks}
      />
    </>
  );
}

/* ── Page ── */

export default function SchedeContabiliPage() {
  const { allSales, allPurchases, loading } = useInvoiceData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState("clienti");
  const [selectedCliente, setSelectedCliente] = useState("");
  const [selectedFornitore, setSelectedFornitore] = useState("");

  const clienti = useMemo(() => {
    const set = new Set<string>();
    allSales.forEach((s) => { if (s.cliente) set.add(s.cliente); });
    return Array.from(set).sort();
  }, [allSales]);

  const fornitori = useMemo(() => {
    const set = new Set<string>();
    allPurchases.forEach((p) => { if (p.fornitore) set.add(p.fornitore); });
    return Array.from(set).sort();
  }, [allPurchases]);

  const clienteOptions = useMemo(() => [
    { value: "", label: "Seleziona cliente..." },
    ...clienti.map((c) => ({ value: c, label: c })),
  ], [clienti]);

  const fornitoreOptions = useMemo(() => [
    { value: "", label: "Seleziona fornitore..." },
    ...fornitori.map((f) => ({ value: f, label: f })),
  ], [fornitori]);

  // Handle URL param ?soggetto=Name to auto-select
  useEffect(() => {
    const soggetto = searchParams.get("soggetto");
    if (soggetto && clienti.length + fornitori.length > 0) {
      if (clienti.includes(soggetto)) {
        setTab("clienti");
        setSelectedCliente(soggetto);
      } else if (fornitori.includes(soggetto)) {
        setTab("fornitori");
        setSelectedFornitore(soggetto);
      } else {
        // Try case-insensitive partial match
        const matchC = clienti.find((c) => c.toLowerCase().includes(soggetto.toLowerCase()));
        if (matchC) {
          setTab("clienti");
          setSelectedCliente(matchC);
        } else {
          const matchF = fornitori.find((f) => f.toLowerCase().includes(soggetto.toLowerCase()));
          if (matchF) {
            setTab("fornitori");
            setSelectedFornitore(matchF);
          }
        }
      }
      searchParams.delete("soggetto");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, clienti, fornitori]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeNome = tab === "clienti" ? selectedCliente : selectedFornitore;

  return (
    <div className="p-6 space-y-0">
      {/* Sticky header: tabs + combobox + report */}
      <div className="sticky top-0 z-20 bg-background pb-3 -mx-6 px-6 pt-0 border-b border-border mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <Tabs value={tab} onValueChange={setTab} className="flex-shrink-0">
            <TabsList>
              <TabsTrigger value="clienti" className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> Clienti ({clienti.length})
              </TabsTrigger>
              <TabsTrigger value="fornitori" className="gap-1.5">
                <Truck className="h-3.5 w-3.5" /> Fornitori ({fornitori.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="w-96 no-print">
            <Combobox
              value={tab === "clienti" ? selectedCliente : selectedFornitore}
              onValueChange={tab === "clienti" ? setSelectedCliente : setSelectedFornitore}
              options={tab === "clienti" ? clienteOptions : fornitoreOptions}
              placeholder={tab === "clienti" ? "Cerca cliente..." : "Cerca fornitore..."}
            />
          </div>

          {activeNome && (
            <Button variant="outline" size="sm" onClick={handleExportPdf} className="gap-1.5 ml-auto no-print" title="Esporta scheda contabile in PDF">
              <FileText className="h-3.5 w-3.5" />
              Report
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {activeNome ? (
        <SchedaDetail
          tipo={tab === "clienti" ? "cliente" : "fornitore"}
          nome={activeNome}
          allSales={allSales}
          allPurchases={allPurchases}
        />
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          {tab === "clienti" ? <Users className="h-10 w-10 mx-auto mb-3 opacity-30" /> : <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />}
          <p className="text-sm">Seleziona {tab === "clienti" ? "un cliente" : "un fornitore"} per visualizzare la scheda contabile</p>
        </div>
      )}
    </div>
  );
}
