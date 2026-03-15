import { useState, useMemo, useEffect } from "react";
import { useInvoiceData, SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
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
import { TrendingUp, TrendingDown, Scale, Receipt, Loader2, Users, Truck, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  nome: string
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

  entries.sort((a, b) => a.dataSort - b.dataSort);

  let saldo = 0;
  const rows: PrimaNotaRow[] = entries.map((e) => {
    saldo += e.dare - e.avere;
    return { ...e, saldo };
  });

  const totaleDare = entries.reduce((a, e) => a + e.dare, 0);
  const totaleAvere = entries.reduce((a, e) => a + e.avere, 0);

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
  const { rows, stats } = useMemo(
    () => buildRows(allSales, allPurchases, tipo, nome),
    [allSales, allPurchases, tipo, nome]
  );

  return (
    <>
      {/* Screen content */}
      <div className="space-y-5 scheda-screen-content">
        {/* Export button */}
        <div className="flex justify-end no-print">
          <Button variant="outline" size="sm" onClick={handleExportPdf} className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Report
          </Button>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              {tipo === "cliente" ? "Fatturato" : "Dare"}
            </div>
            <p className="text-lg font-semibold font-mono">{formatCurrency(stats.totaleDare)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingDown className="h-3.5 w-3.5" />
              {tipo === "fornitore" ? "Totale Acquisti" : "Avere"}
            </div>
            <p className="text-lg font-semibold font-mono">{formatCurrency(stats.totaleAvere)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Scale className="h-3.5 w-3.5" />
              Saldo
            </div>
            <p className={`text-lg font-semibold font-mono ${stats.saldo >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {formatCurrency(stats.saldo)}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Receipt className="h-3.5 w-3.5" />
              Documenti
            </div>
            <p className="text-lg font-semibold">{stats.numFatture}</p>
            <p className="text-[10px] text-muted-foreground">Media: {formatCurrency(stats.mediaImporto)}</p>
          </div>
        </div>

        {/* Dettaglio imponibile/IVA */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border bg-card p-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Totale Imponibile</span>
            <span className="font-mono text-sm font-semibold">{formatCurrency(stats.totaleImponibile)}</span>
          </div>
          <div className="rounded-lg border bg-card p-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Totale IVA</span>
            <span className="font-mono text-sm font-semibold">{formatCurrency(stats.totaleImposta)}</span>
          </div>
        </div>

        {/* Grafico andamento saldo */}
        {rows.length > 1 && (() => {
          const chartData = rows.map((r) => ({
            data: r.data,
            Dare: Math.round(r.dare),
            Avere: Math.round(r.avere),
            Saldo: Math.round(r.saldo),
          }));
          return (
            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                Andamento Saldo Progressivo
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                  <XAxis dataKey="data" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 10 }}
                    width={50}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ borderRadius: "0.5rem", border: "1px solid hsl(220 14% 89%)", fontSize: "0.75rem" }}
                  />
                  <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <Bar dataKey="Dare" fill="hsl(152 60% 36%)" radius={[3, 3, 0, 0]} barSize={14} />
                  <Bar dataKey="Avere" fill="hsl(0 72% 51%)" radius={[3, 3, 0, 0]} barSize={14} />
                  <Area
                    type="monotone"
                    dataKey="Saldo"
                    stroke="hsl(210 80% 50%)"
                    fill="hsl(210 80% 50% / 0.1)"
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
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
          <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
            Prima Nota — Movimenti in ordine cronologico
          </h3>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">Nessun movimento trovato</p>
          ) : (
            <div className="rounded-md border overflow-auto max-h-[calc(100vh-380px)]">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                  <TableRow>
                    <TableHead className="text-[11px] font-semibold w-[85px]">Data</TableHead>
                    <TableHead className="text-[11px] font-semibold w-[75px]">N°</TableHead>
                    <TableHead className="text-[11px] font-semibold">Descrizione</TableHead>
                    <TableHead className="text-[11px] font-semibold w-[90px]">CIG</TableHead>
                    <TableHead className="text-[11px] font-semibold w-[85px]">Scadenza</TableHead>
                    <TableHead className="text-[11px] font-semibold w-[70px]">Stato</TableHead>
                    <TableHead className="text-[11px] font-semibold text-right w-[100px]">Imponibile</TableHead>
                    <TableHead className="text-[11px] font-semibold text-right w-[80px]">IVA</TableHead>
                    <TableHead className="text-[11px] font-semibold text-right w-[110px]">Dare</TableHead>
                    <TableHead className="text-[11px] font-semibold text-right w-[110px]">Avere</TableHead>
                    <TableHead className="text-[11px] font-semibold text-right w-[110px]">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i} className="text-xs hover:bg-muted/30">
                      <TableCell className="font-mono text-[11px] py-2 whitespace-nowrap">{row.data}</TableCell>
                      <TableCell className="font-mono text-[11px] py-2">{row.numero}</TableCell>
                      <TableCell className="py-2 max-w-[260px] truncate text-[11px]">{row.descrizione}</TableCell>
                      <TableCell className="font-mono text-[11px] py-2">{row.cig || "—"}</TableCell>
                      <TableCell className="font-mono text-[11px] py-2 whitespace-nowrap">{row.scadenza || "—"}</TableCell>
                      <TableCell className="py-2"><StatusBadge stato={row.stato} /></TableCell>
                      <TableCell className="text-right font-mono text-[11px] py-2">{formatCurrency(row.imponibile)}</TableCell>
                      <TableCell className="text-right font-mono text-[11px] py-2">{formatCurrency(row.imposta)}</TableCell>
                      <TableCell className="text-right font-mono text-[11px] py-2">
                        {row.dare > 0 ? <span className="text-emerald-600">{formatCurrency(row.dare)}</span> : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] py-2">
                        {row.avere > 0 ? <span className="text-destructive">{formatCurrency(row.avere)}</span> : "—"}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-[11px] font-semibold py-2 ${row.saldo >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {formatCurrency(row.saldo)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-semibold border-t-2 sticky bottom-0">
                    <TableCell colSpan={6} className="text-[11px] py-2.5">TOTALE</TableCell>
                    <TableCell className="text-right font-mono text-[11px] py-2.5">{formatCurrency(stats.totaleImponibile)}</TableCell>
                    <TableCell className="text-right font-mono text-[11px] py-2.5">{formatCurrency(stats.totaleImposta)}</TableCell>
                    <TableCell className="text-right font-mono text-[11px] py-2.5 text-emerald-600">{formatCurrency(stats.totaleDare)}</TableCell>
                    <TableCell className="text-right font-mono text-[11px] py-2.5 text-destructive">{formatCurrency(stats.totaleAvere)}</TableCell>
                    <TableCell className={`text-right font-mono text-[11px] py-2.5 font-bold ${stats.saldo >= 0 ? "text-emerald-600" : "text-destructive"}`}>
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

  return (
    <div className="p-6 space-y-5">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="clienti" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Clienti ({clienti.length})
          </TabsTrigger>
          <TabsTrigger value="fornitori" className="gap-1.5">
            <Truck className="h-3.5 w-3.5" /> Fornitori ({fornitori.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clienti" className="mt-4 space-y-4">
          <div className="max-w-sm no-print">
            <Combobox
              value={selectedCliente}
              onValueChange={setSelectedCliente}
              options={clienteOptions}
              placeholder="Cerca cliente..."
            />
          </div>
          {selectedCliente ? (
            <SchedaDetail
              tipo="cliente"
              nome={selectedCliente}
              allSales={allSales}
              allPurchases={allPurchases}
            />
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Seleziona un cliente per visualizzare la scheda contabile</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="fornitori" className="mt-4 space-y-4">
          <div className="max-w-sm no-print">
            <Combobox
              value={selectedFornitore}
              onValueChange={setSelectedFornitore}
              options={fornitoreOptions}
              placeholder="Cerca fornitore..."
            />
          </div>
          {selectedFornitore ? (
            <SchedaDetail
              tipo="fornitore"
              nome={selectedFornitore}
              allSales={allSales}
              allPurchases={allPurchases}
            />
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Seleziona un fornitore per visualizzare la scheda contabile</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
