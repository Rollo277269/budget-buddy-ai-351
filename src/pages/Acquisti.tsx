import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInvoiceData, PurchaseInvoice } from "@/hooks/useInvoiceData";
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
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles, FileText, CheckCircle2, FileDown, FileCode2, RefreshCw, Link2, Trash2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { formatCurrency } from "@/lib/format";

function isNotaCredito(r: PurchaseInvoice): boolean {
  const t = (r.tipo || "").toLowerCase();
  return t.includes("nota") && t.includes("credito");
}

function formatCreditAmount(value: number, isCreditNote: boolean): string {
  const formatted = formatCurrency(Math.abs(value));
  return isCreditNote ? `- ${formatted}` : formatted;
}

function StatusBadge({ stato }: {stato: string;}) {
  const s = stato.toLowerCase();
  if (s.includes("scadut"))
  return <Badge variant="destructive" className="text-[10px] font-medium">{stato}</Badge>;
  if (s.includes("scadere"))
  return <Badge variant="secondary" className="text-[10px] font-medium">{stato}</Badge>;
  return <Badge variant="outline" className="text-[10px] font-medium">{stato}</Badge>;
}

const AcquistiPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { purchases, allSales, allPurchases, loading, filters, setFilters, filterOptions } = useInvoiceData();

  // Read centroCosto from URL on mount
  useEffect(() => {
    const cc = searchParams.get("centroCosto");
    if (cc) setFilters((f) => ({ ...f, centroCosto: cc }));
  }, [searchParams, setFilters]);
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);
  const [selectedFornitore, setSelectedFornitore] = useState<string | null>(null);
  const { centri, centriCosto, centriRicavo } = useCentriData();
  const costoMap = useCentroMap("costo", "acquisti");
  const ricavoMap = useCentroMap("ricavo", "acquisti");
  const [classifying, setClassifying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{done: number;total: number;} | null>(null);
  const [xmlDragging, setXmlDragging] = useState(false);
  const xmlDragCounter = useRef(0);
  const [pdfData, setPdfData] = useState<{base64: string;fileName: string;} | null>(null);
  const [xmlExpanded, setXmlExpanded] = useState(false);

  const displayedPurchases = useMemo(() => {
    if (!filters.centroCosto) return purchases;
    return purchases.filter((p) => costoMap.map[`${p.anno}-${p.numero}`] === filters.centroCosto);
  }, [purchases, filters.centroCosto, costoMap.map]);

  const { xmlRecords, xmlMap, uploadXmlFiles, deleteRecord, manualMatch, rematchAll, removeDuplicates, fetchParsedData, findXml, hasXml } = useXmlInvoices(allPurchases, "acquisto");
  const [selectedXml, setSelectedXml] = useState<(typeof xmlRecords)[0] | null>(null);
  const [xmlPickerInvoice, setXmlPickerInvoice] = useState<PurchaseInvoice | null>(null);

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
    if (files.length === 0) {toast.error("Seleziona file XML");return;}
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

  // XML drag handlers
  const handleXmlDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();e.stopPropagation();
    xmlDragCounter.current++;
    setXmlDragging(true);
  }, []);
  const handleXmlDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();e.stopPropagation();
    xmlDragCounter.current--;
    if (xmlDragCounter.current === 0) setXmlDragging(false);
  }, []);
  const handleXmlDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();e.stopPropagation();
  }, []);
  const handleXmlDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();e.stopPropagation();
    xmlDragCounter.current = 0;
    setXmlDragging(false);
    await processXmlFiles(Array.from(e.dataTransfer.files));
  }, [processXmlFiles]);

  const handleAIClassify = useCallback(async () => {
    const hasCosto = centriCosto.length > 0;
    const hasRicavo = centriRicavo.length > 0;
    if (!hasCosto && !hasRicavo) {
      toast.error("Definisci prima i centri in Strumenti → Centri C/R");
      return;
    }

    setClassifying(true);
    try {
      let totalClassified = 0;
      const batchSize = 20;

      if (hasCosto) {
        const unclassified = purchases.filter((p) => !costoMap.map[`${p.anno}-${p.numero}`]);
        for (let i = 0; i < unclassified.length; i += batchSize) {
          const batch = unclassified.slice(i, i + batchSize);
          const { data, error } = await supabase.functions.invoke("classify-centro-ricavo", {
            body: { invoices: batch, centri, tipo: "costo", tipoFattura: "acquisto" }
          });
          if (error) {toast.error("Errore classificazione costi");break;}
          (data?.classifications || []).forEach((c: {id: string;codice: string;}) => {
            if (c.codice && c.codice !== "N/A") {costoMap.assign(c.id, c.codice);totalClassified++;}
          });
        }
      }

      if (hasRicavo) {
        const unclassified = purchases.filter((p) => !ricavoMap.map[`${p.anno}-${p.numero}`]);
        for (let i = 0; i < unclassified.length; i += batchSize) {
          const batch = unclassified.slice(i, i + batchSize);
          const { data, error } = await supabase.functions.invoke("classify-centro-ricavo", {
            body: { invoices: batch, centri, tipo: "ricavo", tipoFattura: "acquisto" }
          });
          if (error) {toast.error("Errore classificazione ricavi");break;}
          (data?.classifications || []).forEach((c: {id: string;codice: string;}) => {
            if (c.codice && c.codice !== "N/A") {ricavoMap.assign(c.id, c.codice);totalClassified++;}
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
  }, [purchases, centri, centriCosto, centriRicavo, costoMap, ricavoMap]);

  const columns: ColumnDef<PurchaseInvoice>[] = useMemo(
    () => [
    { key: "numero", label: "N° Reg.", render: (r) => <span className="font-mono text-xs">{r.numero}/{r.anno}</span>, sortable: true },
    { key: "numeroFornitore", label: "N° Forn.", render: (r) => {
      const xml = findXml(`${r.anno}-${r.numero}`, r.fornitore);
      const numDoc = xml?.numero_documento;
      return numDoc ? <span className="font-mono text-xs text-primary">{numDoc}</span> : <span className="text-muted-foreground text-[11px]">—</span>;
    }, sortable: false },
    { key: "data", label: "Data", render: (r) => <span className="text-xs">{r.data}</span>, sortable: true },
    { key: "tipo", label: "Tipo", render: (r) => isNotaCredito(r) ? <Badge variant="destructive" className="text-[10px] font-medium">NC</Badge> : <span className="text-xs text-muted-foreground">{r.tipo}</span>, sortable: true, filterable: true },
    { key: "fornitore", label: "Fornitore", render: (r) => <span className="text-xs max-w-[200px] truncate block cursor-pointer text-primary underline decoration-dotted hover:text-primary/80" onClick={(e) => { e.stopPropagation(); setSelectedFornitore(r.fornitore); }}>{r.fornitore}</span>, sortable: true, filterable: true },
    { key: "cig", label: "CIG", render: (r) => r.cig ?
      <span
        className="font-mono text-[11px] text-primary underline decoration-dotted cursor-pointer hover:text-primary/80"
        onClick={(e) => {e.stopPropagation();navigate(`/?cig=${encodeURIComponent(r.cig)}`);}}>
        {r.cig}</span> :
      <span className="font-mono text-[11px]">—</span>, sortable: true, filterable: true },
    { key: "imponibile", label: "Imponibile", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono text-right block ${nc ? "text-destructive" : ""}`}>{formatCreditAmount(r.imponibile, nc)}</span>; }, sortable: true, align: "right" },
    { key: "cassa", label: "Cassa", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono text-right block ${nc ? "text-destructive" : ""}`}>{r.cassa ? formatCreditAmount(r.cassa, nc) : "—"}</span>; }, sortable: true, align: "right" },
    { key: "imposta", label: "IVA", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono text-right block ${nc ? "text-destructive" : ""}`}>{formatCreditAmount(r.imposta, nc)}</span>; }, sortable: true, align: "right" },
    { key: "ritenute", label: "Ritenute", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono text-right block ${nc ? "text-destructive" : ""}`}>{r.ritenute ? formatCreditAmount(r.ritenute, nc) : "—"}</span>; }, sortable: true, align: "right" },
    { key: "totale", label: "Totale", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono font-semibold text-right block ${nc ? "text-destructive" : ""}`}>{formatCreditAmount(r.totale, nc)}</span>; }, sortable: true, align: "right" },
    { key: "stato", label: "Stato", render: (r) => <StatusBadge stato={r.stato} />, sortable: true, filterable: true },
    {
      key: "xml", label: "XML", filterable: true,
      filterValue: (r) => hasXml(`${r.anno}-${r.numero}`) ? "sì" : "no",
      render: (r) => {
        const k = `${r.anno}-${r.numero}`;
        const xml = findXml(k, r.fornitore);
        if (xml) return (
           <Button size="sm" variant="ghost" className="h-6 px-1.5" title="Visualizza XML associato" onClick={(e) => {e.stopPropagation();openXmlSheet(xml);}}>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
             </Button>);

        if (xmlRecords.some(x => !x.matched)) {
          return (
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-muted-foreground" title="Associa XML manualmente" onClick={(e) => { e.stopPropagation(); setXmlPickerInvoice(r); }}>
              <Link2 className="h-3.5 w-3.5" />
            </Button>
          );
        }
        return <span className="text-muted-foreground text-[11px]">—</span>;
      }
    },
    {
      key: "pdf", label: "PDF", filterable: true,
      filterValue: (r) => hasXml(`${r.anno}-${r.numero}`) ? "sì" : "no",
      render: (r) => {
        const xml = findXml(`${r.anno}-${r.numero}`, r.fornitore);
        if (xml) {
          return (
            <Button size="sm" variant="ghost" className="h-6 px-1.5" title="Visualizza PDF allegato" onClick={(e) => {
              e.stopPropagation();
              openPdf(xml, `Fattura_${r.numero}-${r.anno}.pdf`);
            }}>
                <FileDown className="h-3.5 w-3.5 text-red-600" />
              </Button>);

        }
        return <span className="text-muted-foreground text-[11px]">—</span>;
      }
    },
    {
      key: "centroCosto", label: "Centro Costo", filterable: true,
      render: (r) => <CentroCell invoiceKey={`${r.anno}-${r.numero}`} tipo="costo" centri={centri} centroMap={costoMap.map} onAssign={costoMap.assign} onRemove={costoMap.remove} />
    },
    { key: "scadenza", label: "Scadenza", render: (r) => <span className="text-xs">{r.scadenza || "—"}</span>, sortable: true, defaultHidden: true },
    { key: "pagamento", label: "Pagamento", render: (r) => <span className="text-xs">{r.pagamento || "—"}</span>, sortable: true, defaultHidden: true },
    { key: "descrizione", label: "Descrizione", render: (r) => <span className="text-xs max-w-[300px] whitespace-normal break-words block leading-snug py-1">{r.descrizione || "—"}</span>, defaultHidden: true },
    { key: "partitaIva", label: "P.IVA", render: (r) => <span className="font-mono text-[11px]">{r.partitaIva || "—"}</span>, defaultHidden: true }],

    [centri, costoMap.map, costoMap.assign, ricavoMap.map, ricavoMap.assign, findXml, hasXml, navigate, openXmlSheet, openPdf]
  );

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

  const hasCentri = centriCosto.length > 0 || centriRicavo.length > 0;
  const unclassifiedCount = purchases.filter((p) => {
    const k = `${p.anno}-${p.numero}`;
    return centriCosto.length > 0 && !costoMap.map[k] || centriRicavo.length > 0 && !ricavoMap.map[k];
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
              {purchases.length} fatture
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
                  <Button size="sm" variant="ghost" className="h-6 text-[10px]" title="Riprova associazione automatica XML" onClick={rematchAll}>
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
            centriCosto: centriCosto
              .map((c) => ({ value: c.codice, label: `${c.codice} - ${c.descrizione}` }))
              .sort((a, b) => a.label.localeCompare(b.label)),
          }} hideCliente />
        </div>

        {/* Documenti table */}
        <div className="px-4 pt-2">
          <DocumentiAcquistoSection tableOnly />
        </div>

        {/* Table content */}
        <div className="px-4 pb-4">
          <DataTable<PurchaseInvoice>
            columns={columns}
            data={displayedPurchases}
            defaultSort={{ key: "data", dir: "desc" }}
            rowKey={(r) => `${r.anno}-${r.numero}`}
            onRowClick={setSelectedInvoice}
            rowClassName={(r) => {
              const nc = isNotaCredito(r);
              const xml = hasXml(`${r.anno}-${r.numero}`);
              return [
                nc ? "bg-destructive/5 dark:bg-destructive/10" : "",
                xml && !nc ? "bg-green-50/50 dark:bg-green-950/20" : "",
              ].filter(Boolean).join(" ");
            }}
          />
        </div>

        <InvoiceDetailSheet invoice={selectedInvoice} open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)} type="acquisto" />
        <XmlInvoiceSheet record={selectedXml} open={!!selectedXml} onOpenChange={(open) => !open && setSelectedXml(null)} onDelete={deleteRecord} invoices={purchases} xmlMap={xmlMap} tipo="acquisto" onManualMatch={manualMatch} />
        <XmlPickerSheet
          open={!!xmlPickerInvoice}
          onOpenChange={(open) => !open && setXmlPickerInvoice(null)}
          xmlRecords={xmlRecords}
          invoiceAnno={xmlPickerInvoice?.anno || 0}
          invoiceNumero={xmlPickerInvoice?.numero || 0}
          invoiceName={xmlPickerInvoice?.fornitore || ""}
          invoiceTotale={xmlPickerInvoice?.totale || 0}
          invoiceImposta={xmlPickerInvoice?.imposta || 0}
          invoiceCig={xmlPickerInvoice?.cig || ""}
          invoiceNumeroFornitore={xmlPickerInvoice ? (findXml(`${xmlPickerInvoice.anno}-${xmlPickerInvoice.numero}`, xmlPickerInvoice.fornitore)?.numero_documento || "") : ""}
          tipo="acquisto"
          onMatch={manualMatch}
          onCigChange={async (anno, numero, cig) => {
            await supabase.from("fatture_acquisto").update({ cig }).eq("anno", anno).eq("numero", numero);
            toast.success(`CIG aggiornato: ${cig || "(rimosso)"}`);
          }}
        />
        <SchedaSoggettoSheet tipo="fornitore" nome={selectedFornitore} allSales={allSales} allPurchases={allPurchases} open={!!selectedFornitore} onOpenChange={(open) => !open && setSelectedFornitore(null)} />
      </div>

      {/* PDF side panel */}
      {pdfData && (
        <div className="w-1/2 h-full">
          <PdfViewerPanel base64={pdfData.base64} fileName={pdfData.fileName} onClose={() => setPdfData(null)} />
        </div>
      )}
    </div>);

};

export default AcquistiPage;