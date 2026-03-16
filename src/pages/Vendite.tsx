import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInvoiceData, SaleInvoice, SaleInvoiceRiga } from "@/hooks/useInvoiceData";
import { SchedaSoggettoSheet } from "@/components/SchedaSoggettoSheet";
import { useCentriData, useCentroMap } from "@/hooks/useCentri";
import { useXmlInvoices } from "@/hooks/useXmlInvoices";
import { CentroCell } from "@/components/CentroCell";
import { FilterBar } from "@/components/FilterBar";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { InvoiceDetailSheet } from "@/components/InvoiceDetailSheet";
import { XmlInvoiceSheet } from "@/components/XmlInvoiceSheet";
import { XmlPickerSheet } from "@/components/XmlPickerSheet";
import { PdfViewerPanel } from "@/components/PdfViewerPanel";
import { DocumentiAcquistoSection } from "@/components/DocumentiAcquistoSection";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Sparkles, FileText, CheckCircle2, FileDown, FileCode2, Link2, RefreshCw, Trash2, FileSpreadsheet, ChevronDown } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { formatCurrency } from "@/lib/format";

function isNotaCredito(r: SaleInvoice): boolean {
  const t = (r.tipo || "").toLowerCase();
  return t.includes("nota") && t.includes("credito");
}

function formatCreditAmount(value: number, isCreditNote: boolean): string {
  const formatted = formatCurrency(Math.abs(value));
  return isCreditNote ? `- ${formatted}` : formatted;
}

function StatusBadge({ stato }: { stato: string }) {
  const s = stato.toLowerCase();
  if (s.includes("scadut"))
    return <Badge variant="destructive" className="text-[10px] font-medium">{stato}</Badge>;
  if (s.includes("scadere"))
    return <Badge variant="secondary" className="text-[10px] font-medium">{stato}</Badge>;
  return <Badge variant="outline" className="text-[10px] font-medium">{stato}</Badge>;
}

const VenditePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { sales, allSales, allPurchases, loading, filters, setFilters, filterOptions } = useInvoiceData();

  // Read centroRicavo from URL on mount
  useEffect(() => {
    const cr = searchParams.get("centroRicavo");
    if (cr) setFilters((f) => ({ ...f, centroRicavo: cr }));
  }, [searchParams, setFilters]);
  const [selectedInvoice, setSelectedInvoice] = useState<SaleInvoice | null>(null);
  const [selectedCliente, setSelectedCliente] = useState<string | null>(null);
  const { centri, centriCosto, centriRicavo } = useCentriData();
  const ricavoMap = useCentroMap("ricavo", "vendite");
  const costoMap = useCentroMap("costo", "vendite");
  const [classifying, setClassifying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [xmlDragging, setXmlDragging] = useState(false);
  const xmlDragCounter = useRef(0);
  const [csvDragging, setCsvDragging] = useState(false);
  const csvDragCounter = useRef(0);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [pdfData, setPdfData] = useState<{ base64: string; fileName: string } | null>(null);
  const [xmlExpanded, setXmlExpanded] = useState(false);

  const displayedSales = useMemo(() => {
    const selectedYear = filters.anno.trim();
    const yearFilteredSales = selectedYear
      ? sales.filter((s) => String(s.anno) === selectedYear)
      : sales;

    if (!filters.centroRicavo) return yearFilteredSales;
    return yearFilteredSales.filter(
      (s) => ricavoMap.map[`${s.anno}-${s.numero}`] === filters.centroRicavo
    );
  }, [sales, filters.anno, filters.centroRicavo, ricavoMap.map]);

  const { xmlRecords, xmlMap, uploadXmlFiles, deleteRecord, manualMatch, rematchAll, removeDuplicates, fetchParsedData, findXml, hasXml } = useXmlInvoices(allSales, "vendita");
  const [selectedXml, setSelectedXml] = useState<(typeof xmlRecords)[0] | null>(null);
  const [xmlPickerInvoice, setXmlPickerInvoice] = useState<SaleInvoice | null>(null);

  const openXmlSheet = useCallback(async (record: (typeof xmlRecords)[0]) => {
    const parsed = await fetchParsedData(record.id);
    setSelectedXml({ ...record, parsed_data: parsed });
  }, [fetchParsedData]);

  const openPdf = useCallback(async (xmlRecord: (typeof xmlRecords)[0], fallbackName: string) => {
    const parsed = await fetchParsedData(xmlRecord.id);
    const pdfAllegato = parsed?.allegati?.find((a) => a.formato?.toUpperCase() === "PDF");
    if (pdfAllegato) {
      setPdfData({ base64: pdfAllegato.base64, fileName: pdfAllegato.nome || fallbackName });
    } else {
      toast.error("Nessun PDF trovato in questo XML");
    }
  }, [fetchParsedData]);

  const processXmlFiles = useCallback(async (fileList: File[]) => {
    const files = fileList.filter((f) => f.name.toLowerCase().endsWith(".xml"));
    if (files.length === 0) { toast.error("Seleziona file XML"); return; }
    setUploading(true);
    setUploadProgress({ done: 0, total: files.length });
    await uploadXmlFiles(files, (done, total) => setUploadProgress({ done, total }));
    setUploading(false);
    setUploadProgress(null);
  }, [uploadXmlFiles]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    await processXmlFiles(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [processXmlFiles]);

  const handleXmlDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    xmlDragCounter.current++;
    setXmlDragging(true);
  }, []);

  const handleXmlDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    xmlDragCounter.current--;
    if (xmlDragCounter.current === 0) setXmlDragging(false);
  }, []);

  const handleXmlDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);

  const handleXmlDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    xmlDragCounter.current = 0;
    setXmlDragging(false);
    await processXmlFiles(Array.from(e.dataTransfer.files));
  }, [processXmlFiles]);

  // CSV drag handlers
  const handleCsvDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    csvDragCounter.current++;
    setCsvDragging(true);
  }, []);
  const handleCsvDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    csvDragCounter.current--;
    if (csvDragCounter.current === 0) setCsvDragging(false);
  }, []);
  const handleCsvDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);
  const processCsvFiles = useCallback(async (fileList: File[]) => {
    const files = fileList.filter((f) => f.name.toLowerCase().endsWith(".csv"));
    if (files.length === 0) { toast.error("Seleziona file CSV"); return; }
    toast.info(`${files.length} file CSV ricevuti — funzionalità in arrivo`);
  }, []);
  const handleCsvDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    csvDragCounter.current = 0;
    setCsvDragging(false);
    await processCsvFiles(Array.from(e.dataTransfer.files));
  }, [processCsvFiles]);
  const handleCsvFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    await processCsvFiles(Array.from(e.target.files || []));
    if (csvInputRef.current) csvInputRef.current.value = "";
  }, [processCsvFiles]);

  const handleAIClassify = useCallback(async () => {
    const hasRicavo = centriRicavo.length > 0;
    const hasCosto = centriCosto.length > 0;
    if (!hasRicavo && !hasCosto) {
      toast.error("Definisci prima i centri in Strumenti → Centri C/R");
      return;
    }
    setClassifying(true);
    try {
      let totalClassified = 0;
      const batchSize = 20;
      if (hasRicavo) {
        const unclassified = sales.filter((s) => !ricavoMap.map[`${s.anno}-${s.numero}`]);
        for (let i = 0; i < unclassified.length; i += batchSize) {
          const batch = unclassified.slice(i, i + batchSize);
          const { data, error } = await supabase.functions.invoke("classify-centro-ricavo", {
            body: { invoices: batch, centri, tipo: "ricavo", tipoFattura: "vendita" },
          });
          if (error) { toast.error("Errore classificazione ricavi"); break; }
          (data?.classifications || []).forEach((c: { id: string; codice: string }) => {
            if (c.codice && c.codice !== "N/A") { ricavoMap.assign(c.id, c.codice); totalClassified++; }
          });
        }
      }
      if (hasCosto) {
        const unclassified = sales.filter((s) => !costoMap.map[`${s.anno}-${s.numero}`]);
        for (let i = 0; i < unclassified.length; i += batchSize) {
          const batch = unclassified.slice(i, i + batchSize);
          const { data, error } = await supabase.functions.invoke("classify-centro-ricavo", {
            body: { invoices: batch, centri, tipo: "costo", tipoFattura: "vendita" },
          });
          if (error) { toast.error("Errore classificazione costi"); break; }
          (data?.classifications || []).forEach((c: { id: string; codice: string }) => {
            if (c.codice && c.codice !== "N/A") { costoMap.assign(c.id, c.codice); totalClassified++; }
          });
        }
      }
      toast.success(`${totalClassified} classificazioni completate`);
    } catch (e) {
      console.error(e);
      toast.error("Errore nella classificazione");
    } finally {
      setClassifying(false);
    }
  }, [sales, centri, centriRicavo, centriCosto, ricavoMap, costoMap]);

  const columns: ColumnDef<SaleInvoice>[] = useMemo(
    () => [
      { key: "numero", label: "N°", render: (r) => <span className="font-mono text-xs">{r.numero}{r.suffisso ? `/${r.suffisso}` : ""}</span>, sortable: true },
      { key: "data", label: "Data", render: (r) => <span className="text-xs">{r.data}</span>, sortable: true },
      { key: "cliente", label: "Cliente", render: (r) => <span className="text-xs max-w-[200px] truncate block cursor-pointer text-primary underline decoration-dotted hover:text-primary/80" onClick={(e) => { e.stopPropagation(); setSelectedCliente(r.cliente); }}>{r.cliente}</span>, sortable: true, filterable: true },
      { key: "cig", label: "CIG", render: (r) => r.cig ? (
        <span
          className="font-mono text-[11px] text-primary underline decoration-dotted cursor-pointer hover:text-primary/80"
          onClick={(e) => { e.stopPropagation(); navigate(`/?cig=${encodeURIComponent(r.cig)}`); }}
        >{r.cig}</span>
      ) : <span className="font-mono text-[11px]">—</span>, sortable: true, filterable: true },
      { key: "tipo", label: "Tipo", render: (r) => isNotaCredito(r) ? <Badge variant="destructive" className="text-[10px] font-medium">NC</Badge> : <span className="text-xs text-muted-foreground">{r.tipo}</span>, sortable: true, filterable: true },
      { key: "imponibile", label: "Imponibile", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono text-right block ${nc ? "text-destructive" : ""}`}>{formatCreditAmount(r.imponibile, nc)}</span>; }, sortable: true, align: "right" },
      { key: "imposta", label: "IVA", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono text-right block ${nc ? "text-destructive" : ""}`}>{formatCreditAmount(r.imposta, nc)}</span>; }, sortable: true, align: "right" },
      { key: "totale", label: "Totale", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono font-semibold text-right block ${nc ? "text-destructive" : ""}`}>{formatCreditAmount(r.totale, nc)}</span>; }, sortable: true, align: "right" },
      { key: "stato", label: "Stato", render: (r) => <StatusBadge stato={r.stato} />, sortable: true, filterable: true },
      {
        key: "xml", label: "XML", filterable: true,
        filterValue: (r) => hasXml(`${r.anno}-${r.numero}`) ? "sì" : "no",
        render: (r) => {
          const k = `${r.anno}-${r.numero}`;
          const xml = findXml(k, r.cliente);
          if (xml) return (
            <Button size="sm" variant="ghost" className="h-6 px-1.5" title="Visualizza XML associato" onClick={(e) => { e.stopPropagation(); openXmlSheet(xml); }}>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            </Button>
          );
          if (xmlRecords.some(x => !x.matched)) {
            return (
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-muted-foreground" title="Associa XML manualmente" onClick={(e) => { e.stopPropagation(); setXmlPickerInvoice(r); }}>
                <Link2 className="h-3.5 w-3.5" />
              </Button>
            );
          }
          return <span className="text-muted-foreground text-[11px]">—</span>;
        },
      },
      {
        key: "pdf", label: "PDF", filterable: true,
        filterValue: (r) => hasXml(`${r.anno}-${r.numero}`) ? "sì" : "no",
        render: (r) => {
          const xml = findXml(`${r.anno}-${r.numero}`, r.cliente);
          if (xml) {
            return (
              <Button size="sm" variant="ghost" className="h-6 px-1.5" title="Visualizza PDF allegato" onClick={(e) => {
                e.stopPropagation();
                openPdf(xml, `Fattura_${r.numero}-${r.anno}.pdf`);
              }}>
                <FileDown className="h-3.5 w-3.5 text-red-600" />
              </Button>
            );
          }
          return <span className="text-muted-foreground text-[11px]">—</span>;
        },
      },
      {
        key: "centroRicavo", label: "Centro Ricavo", filterable: true,
        render: (r) => <CentroCell invoiceKey={`${r.anno}-${r.numero}`} tipo="ricavo" centri={centri} centroMap={ricavoMap.map} onAssign={ricavoMap.assign} />,
      },
      { key: "scadenza", label: "Scadenza", render: (r) => <span className="text-xs">{r.scadenza || "—"}</span>, sortable: true, defaultHidden: true },
      { key: "pagamento", label: "Pagamento", render: (r) => <span className="text-xs">{r.pagamento || "—"}</span>, sortable: true, defaultHidden: true },
      { key: "descrizione", label: "Descrizione", render: (r) => <span className="text-xs max-w-[300px] whitespace-normal break-words block leading-snug py-1">{r.descrizione || "—"}</span>, defaultHidden: true },
      { key: "partitaIva", label: "P.IVA", render: (r) => <span className="font-mono text-[11px]">{r.partitaIva || "—"}</span>, defaultHidden: true },
    ],
    [centri, ricavoMap.map, ricavoMap.assign, costoMap.map, costoMap.assign, findXml, hasXml, navigate, openXmlSheet, openPdf]
  );

  // Count duplicates by file_name (must be before early return to preserve hooks order)
  const xmlDuplicateCount = useMemo(() => {
    const seen = new Set<string>();
    let dupes = 0;
    for (const r of xmlRecords) {
      if (seen.has(r.file_name)) dupes++;
      else seen.add(r.file_name);
    }
    return dupes;
  }, [xmlRecords]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasCentri = centriRicavo.length > 0 || centriCosto.length > 0;
  const unclassifiedCount = sales.filter((s) => {
    const k = `${s.anno}-${s.numero}`;
    return (centriRicavo.length > 0 && !ricavoMap.map[k]) || (centriCosto.length > 0 && !costoMap.map[k]);
  }).length;

  const xmlMatchedCount = xmlRecords.filter((r) => r.matched).length;
  const xmlUnmatchedCount = xmlRecords.filter((r) => !r.matched).length;


  return (
    <div className="flex h-full">
      <div className={`flex flex-col overflow-auto ${pdfData ? "w-1/2" : "w-full"} transition-all`}>
        {/* Sticky header area */}
        <div className="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 space-y-2">
          {/* Row 1: summary + actions + compact drop zones */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground whitespace-nowrap">
              {displayedSales.length} fatture
              {xmlRecords.length > 0 && (
                <span className="ml-1.5">
                  · <FileText className="inline h-3 w-3 mb-0.5" /> {xmlMatchedCount}
                  {xmlUnmatchedCount > 0 && <span className="text-destructive"> · {xmlUnmatchedCount} non assoc.</span>}
                </span>
              )}
            </p>
            <div className="flex items-center gap-1.5">
              {/* Compact drop zones */}
              <input ref={fileInputRef} type="file" accept=".xml" multiple className="hidden" onChange={handleFileUpload} />
              <div
                className={`flex items-center gap-1.5 border border-dashed rounded-md px-2.5 py-1.5 cursor-pointer transition-colors text-muted-foreground hover:text-foreground ${xmlDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                title="Carica fatture elettroniche XML"
                onDragEnter={handleXmlDragEnter}
                onDragLeave={handleXmlDragLeave}
                onDragOver={handleXmlDragOver}
                onDrop={handleXmlDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileCode2 className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">XML</span>
              </div>

              <input ref={csvInputRef} type="file" accept=".csv" multiple className="hidden" onChange={handleCsvFileInput} />
              <div
                className={`flex items-center gap-1.5 border border-dashed rounded-md px-2.5 py-1.5 cursor-pointer transition-colors text-muted-foreground hover:text-foreground ${csvDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                title="Carica elenco ricavi CSV"
                onDragEnter={handleCsvDragEnter}
                onDragLeave={handleCsvDragLeave}
                onDragOver={handleCsvDragOver}
                onDrop={handleCsvDrop}
                onClick={() => csvInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">CSV</span>
              </div>

              <DocumentiAcquistoSection dropZoneOnly compact />

              {hasCentri && (
                <Button size="sm" variant="outline" className="h-7 text-xs" title="Classifica automaticamente con intelligenza artificiale" onClick={handleAIClassify} disabled={classifying || unclassifiedCount === 0}>
                  {classifying ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  {classifying ? "AI..." : `AI (${unclassifiedCount})`}
                </Button>
              )}
            </div>
          </div>

          {/* Upload progress bar */}
          {uploading && uploadProgress && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">XML {uploadProgress.done}/{uploadProgress.total}</span>
              <Progress value={(uploadProgress.done / uploadProgress.total) * 100} className="h-1.5 flex-1" />
            </div>
          )}

          {/* Collapsible unmatched XML */}
          {xmlUnmatchedCount > 0 && (
            <Collapsible open={xmlExpanded} onOpenChange={setXmlExpanded}>
              <div className="flex items-center gap-2">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-destructive hover:text-destructive gap-1">
                    <ChevronDown className={`h-3 w-3 transition-transform ${xmlExpanded ? "rotate-180" : ""}`} />
                    {xmlUnmatchedCount} XML non associati
                  </Button>
                </CollapsibleTrigger>
                <div className="flex gap-1">
                  {xmlDuplicateCount > 0 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] text-destructive hover:text-destructive" title="Elimina file XML caricati più volte">
                          <Trash2 className="h-3 w-3 mr-1" />Duplicati ({xmlDuplicateCount})
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Rimuovere {xmlDuplicateCount} XML duplicati?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Verranno eliminati {xmlDuplicateCount} file XML caricati più volte con lo stesso nome. Questa azione è irreversibile.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction onClick={removeDuplicates} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Elimina</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={rematchAll}>
                    <RefreshCw className="h-3 w-3 mr-1" />Riassocia
                  </Button>
                </div>
              </div>
              <CollapsibleContent>
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  {xmlRecords.filter((r) => !r.matched).map((r) => (
                    <Badge
                      key={r.id}
                      variant="secondary"
                      className="text-[10px] cursor-pointer hover:bg-accent"
                      onClick={() => openXmlSheet(r)}
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      {r.file_name} — {r.cedente_denominazione || "?"} — {r.numero}/{r.anno}
                    </Badge>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Row 2: Compact filters */}
          <FilterBar compact filters={filters} onFiltersChange={setFilters} options={{
            ...filterOptions,
            centriRicavo: centriRicavo
              .map((c) => ({ value: c.codice, label: `${c.codice} - ${c.descrizione}` }))
              .sort((a, b) => a.label.localeCompare(b.label)),
          }} hideFornitore />
        </div>

        {/* Table content */}
        <div className="px-4 pb-4 pt-2">
          <DataTable<SaleInvoice>
            columns={columns}
            data={displayedSales}
            defaultSort={{ key: "data", dir: "desc" }}
            rowKey={(r) => `${r.anno}-${r.numero}-${r.suffisso}-${r.tipo}`}
            onRowClick={setSelectedInvoice}
            rowClassName={(r) => {
              const nc = isNotaCredito(r);
              const xml = hasXml(`${r.anno}-${r.numero}`);
              return [
                nc ? "bg-destructive/5 dark:bg-destructive/10" : "",
                xml && !nc ? "bg-green-50/50 dark:bg-green-950/20" : "",
              ].filter(Boolean).join(" ");
            }}
            expandable={(r) => r.righe.length > 1}
            renderExpandedContent={(r) => (
              <div className="px-4 py-2">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border/50">
                      <TableHead className="text-[10px] font-semibold text-muted-foreground">Riga</TableHead>
                      <TableHead className="text-[10px] font-semibold text-muted-foreground">Descrizione</TableHead>
                      <TableHead className="text-[10px] font-semibold text-muted-foreground text-right">Imponibile</TableHead>
                      <TableHead className="text-[10px] font-semibold text-muted-foreground text-right">IVA</TableHead>
                      <TableHead className="text-[10px] font-semibold text-muted-foreground text-right">Totale</TableHead>
                      <TableHead className="text-[10px] font-semibold text-muted-foreground">CIG</TableHead>
                      <TableHead className="text-[10px] font-semibold text-muted-foreground">Centro Ricavo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                     {(Array.isArray(r.righe) ? r.righe : []).map((riga, idx) => {
                      const nc = isNotaCredito(r);
                      const amtClass = nc ? "text-destructive" : "";
                      return (
                      <TableRow key={idx} className="border-b border-border/30">
                        <TableCell className="text-[11px] font-mono text-muted-foreground py-1.5">{idx + 1}</TableCell>
                        <TableCell className="text-[11px] max-w-[300px] whitespace-normal break-words leading-snug py-1.5">{riga.descrizione || "—"}</TableCell>
                        <TableCell className={`text-[11px] font-mono text-right py-1.5 ${amtClass}`}>{formatCreditAmount(riga.imponibile, nc)}</TableCell>
                        <TableCell className={`text-[11px] font-mono text-right py-1.5 ${amtClass}`}>{formatCreditAmount(riga.imposta, nc)}</TableCell>
                        <TableCell className={`text-[11px] font-mono font-semibold text-right py-1.5 ${amtClass}`}>{formatCreditAmount(riga.totale, nc)}</TableCell>
                        <TableCell className="text-[11px] font-mono py-1.5">{riga.cig || "—"}</TableCell>
                        <TableCell className="py-1.5">
                          <CentroCell
                            invoiceKey={`${r.anno}-${r.numero}-${idx}`}
                            tipo="ricavo"
                            centri={centri}
                            centroMap={ricavoMap.map}
                            onAssign={ricavoMap.assign}
                          />
                        </TableCell>
                      </TableRow>
                      );
                     })}
                  </TableBody>
                </Table>
              </div>
            )}
          />
        </div>
        <InvoiceDetailSheet invoice={selectedInvoice} open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)} type="vendita" />
        <XmlInvoiceSheet record={selectedXml} open={!!selectedXml} onOpenChange={(open) => !open && setSelectedXml(null)} onDelete={deleteRecord} invoices={sales} xmlMap={xmlMap} tipo="vendita" onManualMatch={manualMatch} />
        <XmlPickerSheet
          open={!!xmlPickerInvoice}
          onOpenChange={(open) => !open && setXmlPickerInvoice(null)}
          xmlRecords={xmlRecords}
          invoiceAnno={xmlPickerInvoice?.anno || 0}
          invoiceNumero={xmlPickerInvoice?.numero || 0}
          invoiceName={xmlPickerInvoice?.cliente || ""}
          invoiceTotale={xmlPickerInvoice?.totale || 0}
          onMatch={manualMatch}
        />
        <SchedaSoggettoSheet tipo="cliente" nome={selectedCliente} allSales={allSales} allPurchases={allPurchases} open={!!selectedCliente} onOpenChange={(open) => !open && setSelectedCliente(null)} />
      </div>

      {/* PDF side panel */}
      {pdfData && (
        <div className="w-1/2 h-full">
          <PdfViewerPanel base64={pdfData.base64} fileName={pdfData.fileName} onClose={() => setPdfData(null)} />
        </div>
      )}
    </div>
  );
};

export default VenditePage;
