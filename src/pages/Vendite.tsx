import { useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useInvoiceData, SaleInvoice } from "@/hooks/useInvoiceData";
import { useCentriData, useCentroMap } from "@/hooks/useCentri";
import { useXmlInvoices } from "@/hooks/useXmlInvoices";
import { CentroCell } from "@/components/CentroCell";
import { FilterBar } from "@/components/FilterBar";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { InvoiceDetailSheet } from "@/components/InvoiceDetailSheet";
import { XmlInvoiceSheet } from "@/components/XmlInvoiceSheet";
import { PdfViewerPanel } from "@/components/PdfViewerPanel";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Upload, FileText, CheckCircle2, FileDown } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { formatCurrency } from "@/lib/format";

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
  const { sales, loading, filters, setFilters, filterOptions } = useInvoiceData();
  const [selectedInvoice, setSelectedInvoice] = useState<SaleInvoice | null>(null);
  const { centri, centriCosto, centriRicavo } = useCentriData();
  const ricavoMap = useCentroMap("ricavo", "vendite");
  const costoMap = useCentroMap("costo", "vendite");
  const [classifying, setClassifying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const { xmlRecords, xmlMap, uploadXmlFiles, deleteRecord, manualMatch } = useXmlInvoices(sales, "vendita");
  const [selectedXml, setSelectedXml] = useState<(typeof xmlRecords)[0] | null>(null);

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

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0;
    setDragging(false);
    await processXmlFiles(Array.from(e.dataTransfer.files));
  }, [processXmlFiles]);

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
      { key: "numero", label: "N°", render: (r) => <span className="font-mono text-xs">{r.numero}/{r.anno}</span>, sortable: true },
      { key: "data", label: "Data", render: (r) => <span className="text-xs">{r.data}</span>, sortable: true },
      { key: "cliente", label: "Cliente", render: (r) => <span className="text-xs max-w-[200px] truncate block">{r.cliente}</span>, sortable: true, filterable: true },
      { key: "cig", label: "CIG", render: (r) => r.cig ? (
        <span
          className="font-mono text-[11px] text-primary underline decoration-dotted cursor-pointer hover:text-primary/80"
          onClick={(e) => { e.stopPropagation(); navigate(`/?cig=${encodeURIComponent(r.cig)}`); }}
        >{r.cig}</span>
      ) : <span className="font-mono text-[11px]">—</span>, sortable: true, filterable: true },
      { key: "imponibile", label: "Imponibile", render: (r) => <span className="text-xs font-mono text-right block">{formatCurrency(r.imponibile)}</span>, sortable: true, align: "right" },
      { key: "imposta", label: "IVA", render: (r) => <span className="text-xs font-mono text-right block">{formatCurrency(r.imposta)}</span>, sortable: true, align: "right" },
      { key: "totale", label: "Totale", render: (r) => <span className="text-xs font-mono font-semibold text-right block">{formatCurrency(r.totale)}</span>, sortable: true, align: "right" },
      { key: "stato", label: "Stato", render: (r) => <StatusBadge stato={r.stato} />, sortable: true, filterable: true },
      {
        key: "xml", label: "XML", filterable: true,
        filterValue: (r) => xmlMap.has(`${r.anno}-${r.numero}`) ? "sì" : "no",
        render: (r) => {
          const k = `${r.anno}-${r.numero}`;
          const xml = xmlMap.get(k);
          if (xml) return (
            <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={(e) => { e.stopPropagation(); setSelectedXml(xml); }}>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            </Button>
          );
          return <span className="text-muted-foreground text-[11px]">—</span>;
        },
      },
      {
        key: "pdf", label: "PDF", filterable: true,
        filterValue: (r) => {
          const xml = xmlMap.get(`${r.anno}-${r.numero}`);
          return xml?.parsed_data?.allegati?.some((a) => a.formato?.toUpperCase() === "PDF") ? "sì" : "no";
        },
        render: (r) => {
          const xml = xmlMap.get(`${r.anno}-${r.numero}`);
          const pdfAllegato = xml?.parsed_data?.allegati?.find((a) => a.formato?.toUpperCase() === "PDF");
          if (pdfAllegato) {
            return (
              <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={(e) => {
                e.stopPropagation();
                const byteChars = atob(pdfAllegato.base64);
                const byteArray = new Uint8Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
                const blob = new Blob([byteArray], { type: "application/pdf" });
                window.open(URL.createObjectURL(blob), "_blank");
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
      {
        key: "centroCosto", label: "Centro Costo", filterable: true,
        render: (r) => <CentroCell invoiceKey={`${r.anno}-${r.numero}`} tipo="costo" centri={centri} centroMap={costoMap.map} onAssign={costoMap.assign} />,
      },
      { key: "scadenza", label: "Scadenza", render: (r) => <span className="text-xs">{r.scadenza || "—"}</span>, sortable: true, defaultHidden: true },
      { key: "pagamento", label: "Pagamento", render: (r) => <span className="text-xs">{r.pagamento || "—"}</span>, sortable: true, defaultHidden: true },
      { key: "descrizione", label: "Descrizione", render: (r) => <span className="text-xs max-w-[250px] truncate block">{r.descrizione || "—"}</span>, defaultHidden: true },
      { key: "partitaIva", label: "P.IVA", render: (r) => <span className="font-mono text-[11px]">{r.partitaIva || "—"}</span>, defaultHidden: true },
    ],
    [centri, ricavoMap.map, ricavoMap.assign, costoMap.map, costoMap.assign, xmlMap, navigate]
  );

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
    <div
      className="p-6 space-y-6 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {dragging && (
        <div className="absolute inset-0 z-50 bg-primary/5 border-2 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none">
          <div className="bg-background/90 backdrop-blur-sm rounded-lg px-6 py-4 shadow-lg text-center">
            <Upload className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="text-sm font-semibold text-primary">Rilascia i file XML qui</p>
            <p className="text-xs text-muted-foreground">Caricamento massivo fatture</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Fatture di Vendita</h2>
          <p className="text-sm text-muted-foreground">
            {sales.length} fatture trovate
            {xmlRecords.length > 0 && (
              <span className="ml-2">
                · <FileText className="inline h-3 w-3 mb-0.5" /> {xmlMatchedCount} XML associati
                {xmlUnmatchedCount > 0 && <span className="text-destructive"> · {xmlUnmatchedCount} non associati</span>}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept=".xml" multiple className="hidden" onChange={handleFileUpload} />
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            {uploading && uploadProgress ? `${uploadProgress.done}/${uploadProgress.total}` : "Carica XML"}
          </Button>
          {hasCentri && (
            <Button size="sm" variant="outline" onClick={handleAIClassify} disabled={classifying || unclassifiedCount === 0}>
              {classifying ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              {classifying ? "Classifico..." : `Classifica con AI (${unclassifiedCount})`}
            </Button>
          )}
        </div>
      </div>

      {/* Upload progress bar */}
      {uploading && uploadProgress && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Caricamento XML in corso…</span>
            <span className="font-mono">{uploadProgress.done}/{uploadProgress.total}</span>
          </div>
          <Progress value={(uploadProgress.done / uploadProgress.total) * 100} className="h-2" />
        </div>
      )}

      {/* Unmatched XML list */}
      {xmlUnmatchedCount > 0 && (
        <div className="bg-muted/50 border border-border rounded-md p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">XML NON ASSOCIATI ({xmlUnmatchedCount})</p>
          <div className="flex flex-wrap gap-1.5">
            {xmlRecords.filter((r) => !r.matched).map((r) => (
              <Badge
                key={r.id}
                variant="secondary"
                className="text-[10px] cursor-pointer hover:bg-accent"
                onClick={() => setSelectedXml(r)}
              >
                <FileText className="h-3 w-3 mr-1" />
                {r.file_name} — {r.cedente_denominazione || "?"} — {r.numero}/{r.anno}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <FilterBar filters={filters} onFiltersChange={setFilters} options={filterOptions} />
      <DataTable<SaleInvoice>
        columns={columns}
        data={sales}
        rowKey={(r) => `${r.anno}-${r.numero}`}
        onRowClick={setSelectedInvoice}
        rowClassName={(r) => xmlMap.has(`${r.anno}-${r.numero}`) ? "bg-green-50/50 dark:bg-green-950/20" : ""}
      />
      <InvoiceDetailSheet invoice={selectedInvoice} open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)} type="vendita" />
      <XmlInvoiceSheet record={selectedXml} open={!!selectedXml} onOpenChange={(open) => !open && setSelectedXml(null)} onDelete={deleteRecord} />
    </div>
  );
};

export default VenditePage;
