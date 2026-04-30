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
import logoCssr from "@/assets/logo-cssr.jpg";
import logoAgis from "@/assets/logo-agis.png";
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

type SortKey = "data" | "numero" | "descrizione" | "cig" | "scadenza" | "stato" | "imponibile" | "imposta" | "dare" | "avere" | "saldo" | "incassato";
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
      case "incassato": cmp = a.incassato - b.incassato; break;
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
  incassato: number;
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
  paymentDatesMap: Map<string, string>,
  reconAmountsMap: Map<string, number>
) {
  const entries: Omit<PrimaNotaRow, "saldo">[] = [];

  if (tipo === "cliente") {
    allSales.filter((s) => s.cliente === nome).forEach((s) => {
      const d = parseDate(s.data);
      const reconKey = `vendita-${s.anno}-${s.numero}`;
      const incassato = reconAmountsMap.get(reconKey) || 0;
      const isNC = (s.tipo || "").toLowerCase().includes("nota di credito");
      const sign = isNC ? -1 : 1;
      const stato = incassato >= Math.abs(s.totale) - 0.01
        ? "Incassata"
        : incassato > 0
          ? "Parzialmente incassata"
          : s.stato;
      entries.push({
        data: s.data, dataSort: d ? d.getTime() : 0,
        numero: `${s.numero}/${s.anno}`, descrizione: s.descrizione || s.cliente,
        tipo: "vendita", dare: sign * Math.abs(s.totale), avere: 0, stato,
        cig: s.cig, scadenza: s.scadenza,
        imponibile: sign * Math.abs(s.imponibile),
        imposta: sign * Math.abs(s.imposta),
        incassato,
      });
    });
  } else {
    allPurchases.filter((p) => p.fornitore === nome).forEach((p) => {
      const d = parseDate(p.data);
      const reconKey = `acquisto-${p.anno}-${p.numero}`;
      const incassato = reconAmountsMap.get(reconKey) || 0;
      const isNC = (p.tipo || "").toLowerCase().includes("nota di credito");
      const sign = isNC ? -1 : 1;
      const stato = incassato >= Math.abs(p.totale) - 0.01
        ? "Pagata"
        : incassato > 0
          ? "Parzialmente pagata"
          : p.stato;
      entries.push({
        data: p.data, dataSort: d ? d.getTime() : 0,
        numero: `${p.numero}/${p.anno}`, descrizione: p.descrizione || p.fornitore,
        tipo: "acquisto", dare: 0, avere: sign * Math.abs(p.totale), stato,
        cig: p.cig, scadenza: p.scadenza,
        imponibile: sign * Math.abs(p.imponibile),
        imposta: sign * Math.abs(p.imposta),
        incassato,
      });
    });
  }

  entries.sort((a, b) => b.dataSort - a.dataSort);

  const rows: PrimaNotaRow[] = entries.map((e) => ({
    ...e,
    saldo: (e.dare || e.avere) - e.incassato,
  }));

  const totaleFatturato = tipo === "cliente"
    ? entries.reduce((a, e) => a + e.dare, 0)
    : entries.reduce((a, e) => a + e.avere, 0);
  const totaleIncassato = entries.reduce((a, e) => a + e.incassato, 0);
  const totaleDare = entries.reduce((a, e) => a + e.dare, 0);
  const totaleAvere = entries.reduce((a, e) => a + e.avere, 0);

  const paymentDelays: number[] = [];
  for (const e of entries) {
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
      totaleFatturato,
      totaleIncassato,
      saldoCredito: totaleFatturato - totaleIncassato,
      saldo: totaleDare - totaleAvere,
      numFatture: entries.length,
      mediaImporto: entries.length > 0 ? totaleFatturato / entries.length : 0,
      totaleImponibile: entries.reduce((a, e) => a + e.imponibile, 0),
      totaleImposta: entries.reduce((a, e) => a + e.imposta, 0),
      paymentTiming,
    },
  };
}

/* ── PDF Export ── */

function handleExportPdf(marginMode: "zero" | "standard" = "zero") {
  document.body.classList.add("print-report");
  if (marginMode === "standard") {
    document.body.classList.add("pdf-margin-standard");
  } else {
    document.body.classList.remove("pdf-margin-standard");
  }
  const cleanup = () => {
    document.body.classList.remove("print-report");
    document.body.classList.remove("pdf-margin-standard");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

function PdfReport({ tipo, nome, rows, stats, paymentDatesMap }: {
  tipo: "cliente" | "fornitore";
  nome: string;
  rows: PrimaNotaRow[];
  stats: ReturnType<typeof buildRows>["stats"];
  paymentDatesMap: Map<string, string>;
}) {
  const label = tipo === "cliente" ? "Scheda Cliente" : "Scheda Fornitore";
  const now = new Date().toLocaleString("it-IT");

  // KPI: scaduto / da incassare(pagare)
  const today = new Date(); today.setHours(0,0,0,0);
  let daIncassare = 0;
  let scaduto = 0;
  for (const r of rows) {
    const residuo = (r.dare || r.avere) - r.incassato;
    if (residuo <= 0.01) continue;
    daIncassare += residuo;
    const dueRaw = r.scadenza?.trim() ? r.scadenza : r.data;
    const parsed = parsePaymentTerms(dueRaw, r.data);
    const due = parsed?.lastDueDate || parseDate(r.scadenza) || parseDate(r.data);
    if (due && due.getTime() < today.getTime()) scaduto += residuo;
  }

  // Indice affidabilità
  const pt = stats.paymentTiming;
  const stars = !pt ? 0 : pt.avg <= 0 ? 5 : pt.avg <= 15 ? 4 : pt.avg <= 30 ? 3 : pt.avg <= 60 ? 2 : 1;
  const ratingLabels = ["—", "Critica", "Scarsa", "Sufficiente", "Buona", "Eccellente"];

  // Pagamenti: una riga per ogni fattura riconciliata (anche parziale)
  const pagamenti = rows
    .filter((r) => {
      const parts = r.numero.split("/");
      if (parts.length !== 2) return false;
      const key = `${r.tipo}-${parts[1]}-${parts[0]}`;
      return paymentDatesMap.has(key) || r.incassato > 0;
    })
    .map((r) => {
      const parts = r.numero.split("/");
      const key = `${r.tipo}-${parts[1]}-${parts[0]}`;
      const dataPag = paymentDatesMap.get(key) || "—";
      const dueRaw = r.scadenza?.trim() ? r.scadenza : r.data;
      const parsed = parsePaymentTerms(dueRaw, r.data);
      const dueDate = parsed?.lastDueDate || parseDate(r.scadenza);
      const payDate = parseDate(dataPag);
      let ritardo: number | null = null;
      if (dueDate && payDate) ritardo = Math.round((payDate.getTime() - dueDate.getTime()) / 86400000);
      return { ...r, dataPag, ritardo };
    });

  return (
    <div className="scheda-pdf-report pdf-report" style={{ display: "none" }}>
      {/* Header */}
      <div className="pdf-header">
        <div className="pdf-header-logo">
          <img
            src={logoCssr}
            alt="CSSR"
            className="pdf-logo-cssr"
            style={{ height: "28px", width: "auto", maxHeight: "28px", maxWidth: "110px", objectFit: "contain", display: "block" }}
          />
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

      {/* KPI principali */}
      <div className="pdf-kpi-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <div className="pdf-kpi-card">
          <p className="pdf-kpi-label">{tipo === "cliente" ? "Fatturato" : "Totale Acquisti"}</p>
          <p className="pdf-kpi-value is-positive">{formatCurrency(stats.totaleFatturato)}</p>
          <p className="pdf-kpi-sub">Imp. {formatCurrency(stats.totaleImponibile)} · IVA {formatCurrency(stats.totaleImposta)}</p>
        </div>
        <div className="pdf-kpi-card">
          <p className="pdf-kpi-label">{tipo === "cliente" ? "Incassato" : "Pagato"}</p>
          <p className="pdf-kpi-value">{formatCurrency(stats.totaleIncassato)}</p>
        </div>
        <div className="pdf-kpi-card">
          <p className="pdf-kpi-label">{tipo === "cliente" ? "Da Incassare" : "Da Pagare"}</p>
          <p className="pdf-kpi-value">{formatCurrency(daIncassare)}</p>
        </div>
        <div className="pdf-kpi-card">
          <p className="pdf-kpi-label">Scaduto</p>
          <p className={`pdf-kpi-value ${scaduto > 0 ? "is-negative" : "is-positive"}`}>{formatCurrency(scaduto)}</p>
        </div>
        <div className="pdf-kpi-card">
          <p className="pdf-kpi-label">Affidabilità {tipo === "cliente" ? "Cliente" : "Fornitore"}</p>
          <p className="pdf-kpi-value" style={{ color: stars >= 4 ? "#16a34a" : stars >= 3 ? "#d97706" : stars > 0 ? "#dc2626" : "#94a3b8", letterSpacing: "2px" }}>
            {"★".repeat(stars)}{"☆".repeat(5 - stars)}
          </p>
          <p className="pdf-kpi-sub">
            {ratingLabels[stars]}{pt ? ` · media ${pt.avg > 0 ? "+" : ""}${pt.avg}gg` : ""}
          </p>
        </div>
      </div>

      {/* Stato Fatture */}
      <div className="pdf-section pdf-full-width">
        <h2>Stato Fatture</h2>
        <table className="pdf-table pdf-table-fixed">
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>N°</th>
              <th>Data</th>
              <th>Descrizione</th>
              <th>CIG</th>
              <th>Scadenza</th>
              <th>Stato</th>
              <th className="is-right">Imponibile</th>
              <th className="is-right">IVA</th>
              <th className="is-right">Totale</th>
              <th className="is-right">{tipo === "cliente" ? "Incassato" : "Pagato"}</th>
              <th className="is-right">Residuo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const totale = row.dare || row.avere;
              const residuo = totale - row.incassato;
              return (
                <tr key={i}>
                  <td>{row.numero}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{row.data}</td>
                  <td className="pdf-desc-cell">{row.descrizione}</td>
                  <td className="pdf-cig-cell">{row.cig || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{row.scadenza || "—"}</td>
                  <td>{row.stato}</td>
                  <td className="is-right">{formatCurrency(row.imponibile)}</td>
                  <td className="is-right">{formatCurrency(row.imposta)}</td>
                  <td className="is-right">{formatCurrency(totale)}</td>
                  <td className="is-right">{row.incassato > 0 ? formatCurrency(row.incassato) : "—"}</td>
                  <td className={`is-right ${residuo <= 0.01 ? "is-positive" : "is-negative"}`} style={{ fontWeight: 600 }}>
                    {formatCurrency(residuo)}
                  </td>
                </tr>
              );
            })}
            <tr className="pdf-table-total">
              <td colSpan={6}>TOTALE</td>
              <td className="is-right">{formatCurrency(stats.totaleImponibile)}</td>
              <td className="is-right">{formatCurrency(stats.totaleImposta)}</td>
              <td className="is-right is-positive">{formatCurrency(stats.totaleFatturato)}</td>
              <td className="is-right">{formatCurrency(stats.totaleIncassato)}</td>
              <td className={`is-right ${stats.saldoCredito <= 0.01 ? "is-positive" : "is-negative"}`}>{formatCurrency(stats.saldoCredito)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Pagamenti / Riconciliazioni */}
      <div className="pdf-section pdf-full-width">
        <h2>Pagamenti & Riconciliazioni Bancarie</h2>
        {pagamenti.length === 0 ? (
          <p style={{ fontSize: "10px", color: "#6b7280", padding: "8px 0" }}>Nessun pagamento riconciliato.</p>
        ) : (
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Fattura</th>
                <th>Data Fattura</th>
                <th>Scadenza</th>
                <th>Data Pagamento</th>
                <th className="is-right">Totale Fattura</th>
                <th className="is-right">Importo Pagato</th>
                <th className="is-right">Ritardo (gg)</th>
              </tr>
            </thead>
            <tbody>
              {pagamenti.map((p, i) => {
                const totale = p.dare || p.avere;
                const ritardoCls = p.ritardo === null ? "" : p.ritardo <= 0 ? "is-positive" : "is-negative";
                return (
                  <tr key={i}>
                    <td>{p.numero}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{p.data}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{p.scadenza || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{p.dataPag}</td>
                    <td className="is-right">{formatCurrency(totale)}</td>
                    <td className="is-right">{formatCurrency(p.incassato)}</td>
                    <td className={`is-right ${ritardoCls}`} style={{ fontWeight: 600 }}>
                      {p.ritardo === null ? "—" : `${p.ritardo > 0 ? "+" : ""}${p.ritardo}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="pdf-footer">
        <div className="pdf-footer-agis">
          <img
            src={logoAgis}
            alt="AGIS"
            style={{ height: "10px", width: "auto", maxHeight: "10px", maxWidth: "40px", objectFit: "contain", display: "block" }}
          />
        </div>
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
  const [reconAmountsMap, setReconAmountsMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    async function loadReconData() {
      const { data, error } = await supabase
        .from("bank_reconciliations")
        .select("invoice_type, invoice_anno, invoice_numero, movement_id");
      if (error || !data || data.length === 0) return;

      const movementIds = [...new Set(data.map((r: any) => r.movement_id))];
      const movMap = new Map<string, { data: string; importo: number }>();

      for (let i = 0; i < movementIds.length; i += 500) {
        const batch = movementIds.slice(i, i + 500);
        const { data: movements } = await supabase
          .from("bank_movements")
          .select("id, data, importo")
          .in("id", batch);
        if (movements) {
          movements.forEach((m: any) => movMap.set(m.id, { data: m.data, importo: m.importo }));
        }
      }

      const dateMap = new Map<string, string>();
      const amountMap = new Map<string, number>();

      // Group reconciliations by movement_id to handle many-to-one splits
      const movGroups = new Map<string, any[]>();
      for (const rec of data as any[]) {
        if (!rec.invoice_anno || !rec.invoice_numero || !rec.invoice_type) continue;
        const list = movGroups.get(rec.movement_id) || [];
        list.push(rec);
        movGroups.set(rec.movement_id, list);
      }

      // Resolve invoice totals for FIFO allocation
      const invoiceTotals = new Map<string, { totale: number; dataSort: number }>();
      for (const s of allSales) {
        invoiceTotals.set(`vendita-${s.anno}-${s.numero}`, {
          totale: Math.abs(s.totale),
          dataSort: parseDate(s.data)?.getTime() || 0,
        });
      }
      for (const p of allPurchases) {
        invoiceTotals.set(`acquisto-${p.anno}-${p.numero}`, {
          totale: Math.abs(p.totale),
          dataSort: parseDate(p.data)?.getTime() || 0,
        });
      }

      for (const [movId, recs] of movGroups) {
        const mov = movMap.get(movId);
        if (!mov) continue;
        let remaining = Math.abs(mov.importo);

        // Sort linked invoices oldest-first (FIFO)
        const sorted = recs
          .map((rec: any) => {
            const key = `${rec.invoice_type}-${rec.invoice_anno}-${rec.invoice_numero}`;
            const inv = invoiceTotals.get(key);
            return { rec, key, totale: inv?.totale || 0, dataSort: inv?.dataSort || 0 };
          })
          .sort((a: any, b: any) => a.dataSort - b.dataSort);

        for (const { rec, key, totale } of sorted) {
          if (remaining <= 0) break;
          const allocated = Math.min(remaining, totale);
          remaining -= allocated;

          // Date: keep latest
          const existing = dateMap.get(key);
          if (!existing) {
            dateMap.set(key, mov.data);
          } else {
            const existDate = parseDate(existing);
            const newDate = parseDate(mov.data);
            if (existDate && newDate && newDate > existDate) {
              dateMap.set(key, mov.data);
            }
          }
          // Amount: add FIFO-allocated share
          amountMap.set(key, (amountMap.get(key) || 0) + allocated);
        }
      }
      setPaymentDatesMap(dateMap);
      setReconAmountsMap(amountMap);
    }
    loadReconData();
  }, [tipo, nome, allSales, allPurchases]);

  const { rows, stats } = useMemo(
    () => buildRows(allSales, allPurchases, tipo, nome, paymentDatesMap, reconAmountsMap),
    [allSales, allPurchases, tipo, nome, paymentDatesMap, reconAmountsMap]
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
        <div className="space-y-3 scheda-screen-content">
          {/* KPI table + Affidabilità + Centro chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: KPI summary table */}
            <div className="rounded-lg border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {[
                    { label: tipo === "cliente" ? "Fatturato" : "Totale Acquisti", value: stats.totaleFatturato, cls: "text-[hsl(var(--success))]" },
                    { label: tipo === "cliente" ? "Incassato" : "Pagato", value: stats.totaleIncassato, cls: "text-primary" },
                    { label: "Saldo (da incassare)", value: stats.saldoCredito, cls: stats.saldoCredito >= 0 ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--success))]" },
                    { label: "Totale Imponibile", value: stats.totaleImponibile, cls: "" },
                    { label: "Totale IVA", value: stats.totaleImposta, cls: "" },
                  ].map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                      <td className="px-3 py-1 text-xs text-muted-foreground font-medium">{row.label}</td>
                      <td className={`px-3 py-1 text-right font-mono text-xs font-semibold ${row.cls}`}>
                        {formatCurrency(row.value)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t">
                    <td className="px-3 py-1 text-xs text-muted-foreground font-medium">Documenti</td>
                    <td className="px-3 py-1 text-right font-semibold text-xs">
                      {stats.numFatture}
                      <span className="text-[10px] text-muted-foreground ml-2">media {formatCurrency(stats.mediaImporto)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Center: Affidabilità / Tempi */}
            <div className="rounded-lg border bg-card p-3">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                {tipo === "cliente" ? "Tempi di Incasso" : "Tempi di Pagamento"}
              </h3>
              {stats.paymentTiming ? (
              <div className="space-y-2">
                  {(() => {
                    const avg = stats.paymentTiming!.avg;
                    const stars = avg <= 0 ? 5 : avg <= 15 ? 4 : avg <= 30 ? 3 : avg <= 60 ? 2 : 1;
                    const ratingLabels = ["", "Critica", "Scarsa", "Sufficiente", "Buona", "Eccellente"];
                    const ratingColors = ["", "text-destructive", "text-destructive", "text-[hsl(var(--warning))]", "text-primary", "text-[hsl(var(--success))]"];
                    return (
                      <div className="flex flex-col items-center gap-0.5 py-0.5">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <Star
                              key={i}
                              className={`h-4 w-4 ${i <= stars ? ratingColors[stars] : "text-muted"}`}
                              fill={i <= stars ? "currentColor" : "none"}
                            />
                          ))}
                        </div>
                        <p className={`text-[10px] font-semibold ${ratingColors[stars]}`}>
                          {ratingLabels[stars]}
                        </p>
                      </div>
                    );
                  })()}
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="rounded-md bg-muted/40 p-2">
                      <p className="text-[9px] text-muted-foreground uppercase">Min</p>
                      <p className={`text-base font-bold font-mono ${stats.paymentTiming.min <= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                        {stats.paymentTiming.min > 0 ? "+" : ""}{stats.paymentTiming.min}
                      </p>
                      <p className="text-[9px] text-muted-foreground">giorni</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2">
                      <p className="text-[9px] text-muted-foreground uppercase">Media</p>
                      <p className={`text-base font-bold font-mono ${stats.paymentTiming.avg <= 0 ? "text-[hsl(var(--success))]" : stats.paymentTiming.avg <= 15 ? "text-primary" : "text-destructive"}`}>
                        {stats.paymentTiming.avg > 0 ? "+" : ""}{stats.paymentTiming.avg}
                      </p>
                      <p className="text-[9px] text-muted-foreground">giorni</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2">
                      <p className="text-[9px] text-muted-foreground uppercase">Max</p>
                      <p className={`text-base font-bold font-mono ${stats.paymentTiming.max <= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                        {stats.paymentTiming.max > 0 ? "+" : ""}{stats.paymentTiming.max}
                      </p>
                      <p className="text-[9px] text-muted-foreground">giorni</p>
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
            <div className="rounded-lg border bg-card p-3">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                {tipo === "cliente" ? "Fatturato per Centro di Ricavo" : "Acquisti per Centro di Costo"}
              </h3>
              {centroChartData.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Nessun centro assegnato</p>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
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
            <div className="rounded-xl border bg-card p-3">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                Andamento Saldo Progressivo
              </h3>
              <ResponsiveContainer width="100%" height={160}>
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
                    <TableHead className="text-right font-mono text-[11px] py-2.5 text-[hsl(var(--success))]">{formatCurrency(stats.totaleFatturato)}</TableHead>
                    <TableHead className="text-right font-mono text-[11px] py-2.5 text-primary">{formatCurrency(stats.totaleIncassato)}</TableHead>
                    <TableHead className={`text-right font-mono text-[11px] py-2.5 font-bold ${stats.saldoCredito >= 0 ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--success))]"}`}>
                      {formatCurrency(stats.saldoCredito)}
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
                      { key: "dare" as SortKey, label: tipo === "cliente" ? "Fatturato" : "Acquistato", w: "w-[110px]", align: "text-right" },
                      { key: "incassato" as SortKey, label: tipo === "cliente" ? "Incassato" : "Pagato", w: "w-[110px]", align: "text-right" },
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
                        {(row.dare > 0 || row.avere > 0) ? <span className="text-[hsl(var(--success))]">{formatCurrency(row.dare || row.avere)}</span> : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] py-2">
                        {row.incassato > 0 ? <span className="text-primary">{formatCurrency(row.incassato)}</span> : "—"}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-[11px] font-semibold py-2 ${(row.dare || row.avere) - row.incassato <= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]"}`}>
                        {formatCurrency((row.dare || row.avere) - row.incassato)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Hidden PDF report */}
      <PdfReport tipo={tipo} nome={nome} rows={rows} stats={stats} paymentDatesMap={paymentDatesMap} />

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

  // Auto-print: if ?autoprint=1, trigger PDF export shortly after data renders
  useEffect(() => {
    if (searchParams.get("autoprint") !== "1") return;
    const activeNome = tab === "clienti" ? selectedCliente : selectedFornitore;
    if (!activeNome) return;
    const t = setTimeout(() => {
      handleExportPdf();
      searchParams.delete("autoprint");
      setSearchParams(searchParams, { replace: true });
    }, 1200);
    return () => clearTimeout(t);
  }, [searchParams, tab, selectedCliente, selectedFornitore, setSearchParams]);

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
