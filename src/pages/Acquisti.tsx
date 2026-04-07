import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInvoiceData, PurchaseInvoice, parseExcelPurchases, seedPurchasesFromExcel, invalidateInvoiceCache } from "@/hooks/useInvoiceData";
import { SchedaSoggettoSheet } from "@/components/SchedaSoggettoSheet";
import { useCentriData, useCentroMap } from "@/hooks/useCentri";
import { useXmlInvoices } from "@/hooks/useXmlInvoices";
import { CentroCell } from "@/components/CentroCell";
import { FilterBar } from "@/components/FilterBar";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { InvoiceDetailSheet } from "@/components/InvoiceDetailSheet";
import { parsePaymentTerms, formatDateIT } from "@/lib/paymentTerms";
import { XmlInvoiceSheet } from "@/components/XmlInvoiceSheet";
import { XmlPickerSheet } from "@/components/XmlPickerSheet";
import { PdfViewerPanel } from "@/components/PdfViewerPanel";
import { DocumentiAcquistoSection } from "@/components/DocumentiAcquistoSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles, FileText, CheckCircle2, FileDown, FileCode2, RefreshCw, Link2, Trash2, ChevronDown, Pencil, Check, X, FileSpreadsheet, AlertTriangle } from "lucide-react";
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
  const { purchases, allSales, allPurchases, loading, filters, setFilters, filterOptions, refresh: refreshInvoices } = useInvoiceData();

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
  const [csvDragging, setCsvDragging] = useState(false);
  const csvDragCounter = useRef(0);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [excelCollisions, setExcelCollisions] = useState<{ key: string; anno: number; numero: number; tipo: string; existingDesc: string; newDesc: string; selected: boolean }[]>([]);
  const [showExcelCollisionDialog, setShowExcelCollisionDialog] = useState(false);
  const [pendingExcelUpload, setPendingExcelUpload] = useState<{ fileName: string; newOnly: PurchaseInvoice[]; colliding: PurchaseInvoice[] } | null>(null);
  const [xmlExpanded, setXmlExpanded] = useState(false);
  const [editingCigKey, setEditingCigKey] = useState<string | null>(null);
  const [editingCigValue, setEditingCigValue] = useState("");
  const toolbarPortalRef = useRef<HTMLDivElement>(null);

  // ── Reconciliation data for payment columns ──
  const [reconMap, setReconMap] = useState<Record<string, { paid: number; lastDate: string }>>({});
  useEffect(() => {
    (async () => {
      const { data: recons } = await supabase
        .from("bank_reconciliations")
        .select("movement_id, invoice_anno, invoice_numero, invoice_type")
        .eq("invoice_type", "acquisto");
      if (!recons || recons.length === 0) { setReconMap({}); return; }

      const movementIds = [...new Set(recons.map((r: any) => r.movement_id))];
      const movements: Record<string, { importo: number; data: string }> = {};
      for (let i = 0; i < movementIds.length; i += 500) {
        const batch = movementIds.slice(i, i + 500);
        const { data: movs } = await supabase
          .from("bank_movements")
          .select("id, importo, data")
          .in("id", batch);
        if (movs) movs.forEach((m: any) => { movements[m.id] = { importo: Math.abs(Number(m.importo)), data: m.data }; });
      }

      const map: Record<string, { paid: number; lastDate: string }> = {};
      for (const r of recons as any[]) {
        const key = `${r.invoice_anno}-${r.invoice_numero}`;
        const mov = movements[r.movement_id];
        if (!mov) continue;
        if (!map[key]) {
          map[key] = { paid: mov.importo, lastDate: mov.data };
        } else {
          map[key].paid += mov.importo;
          if (mov.data > map[key].lastDate) map[key].lastDate = mov.data;
        }
      }
      setReconMap(map);
    })();
  }, [purchases]);

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

  // CSV/Excel drag handlers
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
    const csvFiles = fileList.filter((f) => f.name.toLowerCase().endsWith(".csv"));
    const xlsFiles = fileList.filter((f) => /\.(xlsx?|xls)$/i.test(f.name));

    if (csvFiles.length > 0) {
      toast.info(`${csvFiles.length} file CSV ricevuti — funzionalità in arrivo`);
    }

    for (const file of xlsFiles) {
      try {
        const buf = await file.arrayBuffer();
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
        const parsed = parseExcelPurchases(rows);
        if (parsed.length === 0) { toast.error(`Nessuna fattura acquisto trovata in ${file.name}`); continue; }

        const keys = parsed.map((i) => `${i.anno}-${i.numero}-${i.tipo || ""}`);
        const { data: existing } = await supabase
          .from("fatture_acquisto")
          .select("anno, numero, tipo, descrizione, imponibile, imposta, totale, cig, source_file")
          .or(keys.map(k => { const [a, n] = k.split("-"); return `and(anno.eq.${a},numero.eq.${n})`; }).join(","));

        const existingMap = new Map<string, any>();
        (existing || []).forEach((r: any) => existingMap.set(`${r.anno}-${r.numero}-${r.tipo || ""}`, r));

        const newOnly = parsed.filter((i) => !existingMap.has(`${i.anno}-${i.numero}-${i.tipo || ""}`));
        const colliding = parsed.filter((i) => existingMap.has(`${i.anno}-${i.numero}-${i.tipo || ""}`));

        if (colliding.length === 0) {
          await seedPurchasesFromExcel(parsed, file.name);
          toast.success(`Importate ${parsed.length} fatture acquisto da ${file.name}`);
          invalidateInvoiceCache();
          setTimeout(() => window.location.reload(), 800);
        } else {
          setExcelCollisions(colliding.map((item) => {
            const key = `${item.anno}-${item.numero}-${item.tipo || ""}`;
            const ex = existingMap.get(key)!;
            const newHasMore = ((item.descrizione || "").length > (ex.descrizione || "").length) || (item.cig && !ex.cig);
            return { key, anno: item.anno, numero: item.numero, tipo: item.tipo || "", existingDesc: `${ex.tipo} — ${(ex.descrizione || "").slice(0, 60)}`, newDesc: `${item.tipo || ""} — ${(item.descrizione || "").slice(0, 60)}`, selected: newHasMore || ex.source_file === file.name };
          }));
          setPendingExcelUpload({ fileName: file.name, newOnly, colliding });
          setShowExcelCollisionDialog(true);
        }
      } catch (err) {
        console.error("Excel upload error:", err);
        toast.error(`Errore importazione ${file.name}`);
      }
    }

    if (csvFiles.length === 0 && xlsFiles.length === 0) {
      toast.error("Seleziona file CSV o Excel (.xlsx)");
    }
  }, []);

  const handleExcelConfirmCollisions = useCallback(async () => {
    if (!pendingExcelUpload) return;
    setShowExcelCollisionDialog(false);
    const selectedKeys = new Set(excelCollisions.filter(c => c.selected).map(c => c.key));
    const overwrite = pendingExcelUpload.colliding.filter((i) => selectedKeys.has(`${i.anno}-${i.numero}-${i.tipo || ""}`));
    const all = [...pendingExcelUpload.newOnly, ...overwrite];
    if (all.length === 0) { toast.info("Nessun record importato"); return; }
    await seedPurchasesFromExcel(all, pendingExcelUpload.fileName);
    const skipped = excelCollisions.length - selectedKeys.size;
    toast.success(`Importati ${all.length} record` + (skipped > 0 ? `, ${skipped} ignorati` : ""));
    invalidateInvoiceCache();
    setTimeout(() => window.location.reload(), 800);
  }, [pendingExcelUpload, excelCollisions]);

  const handleExcelCancelCollisions = useCallback(() => {
    setShowExcelCollisionDialog(false);
    setPendingExcelUpload(null);
    setExcelCollisions([]);
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
    { key: "numero", label: "N° Reg.", render: (r) => <span className="font-mono text-xs">{r.numero}/{r.anno}</span>, sortable: true, summaryRender: (rows) => <span className="text-[11px] font-semibold text-muted-foreground">{rows.length} righe</span> },
    { key: "numeroFornitore", label: "N° Forn.", render: (r) => {
      const xml = findXml(`${r.anno}-${r.numero}`, r.fornitore);
      const numDoc = xml?.numero_documento;
      return numDoc ? <span className="font-mono text-xs text-primary">{numDoc}</span> : <span className="text-muted-foreground text-[11px]">—</span>;
    }, sortable: false },
    { key: "data", label: "Data", render: (r) => <span className="text-xs">{r.data}</span>, sortable: true },
    { key: "tipo", label: "Tipo", render: (r) => isNotaCredito(r) ? <Badge variant="destructive" className="text-[10px] font-medium">NC</Badge> : <span className="text-xs text-muted-foreground">{r.tipo}</span>, sortable: true, filterable: true },
    { key: "fornitore", label: "Fornitore", render: (r) => <span className="text-xs max-w-[200px] truncate block cursor-pointer text-primary underline decoration-dotted hover:text-primary/80" onClick={(e) => { e.stopPropagation(); setSelectedFornitore(r.fornitore); }}>{r.fornitore}</span>, sortable: true, filterable: true },
    { key: "cig", label: "CIG", render: (r) => {
      const k = `${r.anno}-${r.numero}`;
      if (editingCigKey === k) {
        return (
          <span className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={editingCigValue}
              onChange={(e) => setEditingCigValue(e.target.value.toUpperCase())}
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  await supabase.from("fatture_acquisto").update({ cig: editingCigValue }).eq("anno", r.anno).eq("numero", r.numero);
                  toast.success("CIG salvato");
                  setEditingCigKey(null);
                  refreshInvoices();
                } else if (e.key === "Escape") setEditingCigKey(null);
              }}
              className="h-6 w-[110px] px-1 text-[11px] font-mono border rounded bg-background"
            />
            <button className="p-0.5 text-primary hover:text-primary/80" onClick={async () => {
              await supabase.from("fatture_acquisto").update({ cig: editingCigValue }).eq("anno", r.anno).eq("numero", r.numero);
              toast.success("CIG salvato");
              setEditingCigKey(null);
              refreshInvoices();
            }}><Check className="h-3 w-3" /></button>
            <button className="p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setEditingCigKey(null)}><X className="h-3 w-3" /></button>
          </span>
        );
      }
      return r.cig ?
        <span
          className="font-mono text-[11px] text-primary underline decoration-dotted cursor-pointer hover:text-primary/80"
          onClick={(e) => {e.stopPropagation();navigate(`/?cig=${encodeURIComponent(r.cig)}`);}}>
          {r.cig}</span> :
        <span className="font-mono text-[11px] text-muted-foreground cursor-pointer hover:text-primary flex items-center gap-0.5" onClick={(e) => { e.stopPropagation(); setEditingCigKey(k); setEditingCigValue(""); }}>
          — <Pencil className="h-3 w-3 opacity-50" />
        </span>;
    }, sortable: true, filterable: true },
    { key: "imponibile", label: "Imponibile", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono text-right block ${nc ? "text-destructive" : ""}`}>{formatCreditAmount(r.imponibile, nc)}</span>; }, sortable: true, align: "right", summaryRender: (rows) => { const sum = rows.reduce((s, r) => s + (isNotaCredito(r) ? -Math.abs(r.imponibile) : r.imponibile), 0); return <span className="text-[11px] font-mono font-semibold text-right block">{formatCurrency(sum)}</span>; } },
    { key: "cassa", label: "Cassa", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono text-right block ${nc ? "text-destructive" : ""}`}>{r.cassa ? formatCreditAmount(r.cassa, nc) : "—"}</span>; }, sortable: true, align: "right", summaryRender: (rows) => { const sum = rows.reduce((s, r) => s + (isNotaCredito(r) ? -Math.abs(r.cassa || 0) : (r.cassa || 0)), 0); return sum ? <span className="text-[11px] font-mono font-semibold text-right block">{formatCurrency(sum)}</span> : null; } },
    { key: "imposta", label: "IVA", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono text-right block ${nc ? "text-destructive" : ""}`}>{formatCreditAmount(r.imposta, nc)}</span>; }, sortable: true, align: "right", summaryRender: (rows) => { const sum = rows.reduce((s, r) => s + (isNotaCredito(r) ? -Math.abs(r.imposta) : r.imposta), 0); return <span className="text-[11px] font-mono font-semibold text-right block">{formatCurrency(sum)}</span>; } },
    { key: "ritenute", label: "Ritenute", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono text-right block ${nc ? "text-destructive" : ""}`}>{r.ritenute ? formatCreditAmount(r.ritenute, nc) : "—"}</span>; }, sortable: true, align: "right", summaryRender: (rows) => { const sum = rows.reduce((s, r) => s + (isNotaCredito(r) ? -Math.abs(r.ritenute || 0) : (r.ritenute || 0)), 0); return sum ? <span className="text-[11px] font-mono font-semibold text-right block">{formatCurrency(sum)}</span> : null; } },
    { key: "totale", label: "Totale", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono font-semibold text-right block ${nc ? "text-destructive" : ""}`}>{formatCreditAmount(r.totale, nc)}</span>; }, sortable: true, align: "right", summaryRender: (rows) => { const sum = rows.reduce((s, r) => s + (isNotaCredito(r) ? -Math.abs(r.totale) : r.totale), 0); return <span className="text-[11px] font-mono font-bold text-right block">{formatCurrency(sum)}</span>; } },
    { key: "stato", label: "Stato", render: (r) => <StatusBadge stato={r.stato} />, sortable: true, filterable: true },
    { key: "importoPagato", label: "Importo Pagato", align: "right", sortable: true, defaultHidden: false, render: (r) => {
      const k = `${r.anno}-${r.numero}`;
      const rec = reconMap[k];
      if (!rec) return <span className="text-xs text-muted-foreground">—</span>;
      return <span className="text-xs font-mono text-right block">{formatCurrency(rec.paid)}</span>;
    }, summaryRender: (rows) => {
      const sum = rows.reduce((s, r) => s + (reconMap[`${r.anno}-${r.numero}`]?.paid || 0), 0);
      return sum ? <span className="text-[11px] font-mono font-semibold text-right block">{formatCurrency(sum)}</span> : null;
    }},
    { key: "differenza", label: "Differenza", align: "right", sortable: true, defaultHidden: false, render: (r) => {
      const k = `${r.anno}-${r.numero}`;
      const rec = reconMap[k];
      if (!rec) return <span className="text-xs text-muted-foreground">—</span>;
      const diff = Math.round((r.totale - rec.paid) * 100) / 100;
      if (Math.abs(diff) < 0.01) return <span className="text-xs font-mono text-right block text-green-600">0,00</span>;
      return <span className={`text-xs font-mono text-right block ${diff > 0 ? "text-destructive" : "text-green-600"}`}>{formatCurrency(Math.abs(diff))}{diff > 0 ? "" : " +"}</span>;
    }},
    { key: "dataSaldo", label: "Data Saldo", sortable: true, defaultHidden: false, render: (r) => {
      const k = `${r.anno}-${r.numero}`;
      const rec = reconMap[k];
      if (!rec) return <span className="text-xs text-muted-foreground">—</span>;
      const diff = Math.round((r.totale - rec.paid) * 100) / 100;
      if (Math.abs(diff) > 0.01) return <span className="text-xs text-muted-foreground italic">Parziale</span>;
      return <span className="text-xs font-mono">{rec.lastDate}</span>;
    }},
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
    { key: "dataScadenza", label: "Data Scadenza", render: (r) => {
      const scadenza = r.scadenza?.trim() ? r.scadenza : "Vista fattura";
      const parsed = parsePaymentTerms(scadenza, r.data);
      if (!parsed) return <span className="text-xs text-muted-foreground">—</span>;
      return (
        <div className="text-xs space-y-0.5">
          {parsed.installments.map((inst, i) => (
            <div key={i} className="font-mono">
              {formatDateIT(inst.dueDate)}
              {parsed.installments.length > 1 && <span className="text-muted-foreground ml-1 text-[10px]">({inst.days}gg)</span>}
            </div>
          ))}
        </div>
      );
    }, sortable: false, defaultHidden: false },
    { key: "pagamento", label: "Pagamento", render: (r) => <span className="text-xs">{r.pagamento || "—"}</span>, sortable: true, defaultHidden: true },
    { key: "descrizione", label: "Descrizione", render: (r) => <span className="text-xs max-w-[300px] whitespace-normal break-words block leading-snug py-1">{r.descrizione || "—"}</span>, defaultHidden: true },
    { key: "partitaIva", label: "P.IVA", render: (r) => <span className="font-mono text-[11px]">{r.partitaIva || "—"}</span>, defaultHidden: true }],

    [centri, costoMap.map, costoMap.assign, ricavoMap.map, ricavoMap.assign, findXml, hasXml, navigate, openXmlSheet, openPdf, reconMap]
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


  return (<>
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

              <input ref={csvInputRef} type="file" accept=".csv,.xlsx,.xls" multiple className="hidden" onChange={handleCsvFileInput} />
              <div
                className={`flex items-center gap-1.5 border border-dashed rounded-md px-2.5 py-1.5 cursor-pointer transition-colors text-muted-foreground hover:text-foreground ${csvDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                title="Importa fatture acquisto da file CSV o Excel (.xlsx)"
                onDragEnter={handleCsvDragEnter}
                onDragLeave={handleCsvDragLeave}
                onDragOver={handleCsvDragOver}
                onDrop={handleCsvDrop}
                onClick={() => csvInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">CSV / Excel</span>
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

          {/* Row 2: Compact filters + DataTable toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <FilterBar compact filters={filters} onFiltersChange={setFilters} options={{
              ...filterOptions,
              centriCosto: centriCosto
                .map((c) => ({ value: c.codice, label: `${c.codice} - ${c.descrizione}` }))
                .sort((a, b) => a.label.localeCompare(b.label)),
            }} hideCliente />
            <div ref={toolbarPortalRef} className="flex items-center gap-2 ml-auto" />
          </div>
        </div>

        {/* ── Schede: Ricevute e Documenti / Fatture XML ── */}
        <div className="px-4 pt-3">
          <Tabs defaultValue="documenti" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="documenti" className="text-xs gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Ricevute e Documenti
              </TabsTrigger>
              <TabsTrigger value="xml" className="text-xs gap-1.5">
                <FileCode2 className="h-3.5 w-3.5" />
                Fatture XML
                {xmlUnmatchedCount > 0 && <Badge variant="destructive" className="text-[10px] ml-1 h-4 px-1">{xmlUnmatchedCount}</Badge>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="documenti">
              <DocumentiAcquistoSection tableOnly />
            </TabsContent>

            <TabsContent value="xml">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{xmlRecords.length} totali</Badge>
                  <Badge className="text-[10px]">{xmlMatchedCount} assoc.</Badge>
                  {xmlUnmatchedCount > 0 && <Badge variant="destructive" className="text-[10px]">{xmlUnmatchedCount} non assoc.</Badge>}
                  <div className="ml-auto flex gap-1">
                    {xmlDuplicateCount > 0 && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] text-destructive hover:text-destructive">
                            <Trash2 className="h-3 w-3 mr-1" />Duplicati ({xmlDuplicateCount})
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Rimuovere {xmlDuplicateCount} XML duplicati?</AlertDialogTitle>
                            <AlertDialogDescription>Verranno eliminati {xmlDuplicateCount} file XML caricati più volte con lo stesso nome.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction onClick={removeDuplicates} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Elimina</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {xmlUnmatchedCount > 0 && (
                      <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={rematchAll}>
                        <RefreshCw className="h-3 w-3 mr-1" />Riassocia
                      </Button>
                    )}
                  </div>
                </div>
                {xmlUnmatchedCount > 0 && (
                  <div className="max-h-[300px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[10px]">
                          <TableHead className="h-7 text-[10px]">File</TableHead>
                          <TableHead className="h-7 text-[10px]">N° Doc</TableHead>
                          <TableHead className="h-7 text-[10px]">Cedente</TableHead>
                          <TableHead className="h-7 text-[10px] text-right">Importo</TableHead>
                          <TableHead className="h-7 text-[10px]">Data</TableHead>
                          <TableHead className="h-7 text-[10px] w-[70px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {xmlRecords.filter((r) => !r.matched).map((r) => (
                          <TableRow key={r.id} className="cursor-pointer hover:bg-accent/50" onClick={() => openXmlSheet(r)}>
                            <TableCell className="text-[11px] py-1 max-w-[180px] truncate">
                              <FileText className="h-3 w-3 mr-1 inline text-muted-foreground" />
                              {r.file_name}
                            </TableCell>
                            <TableCell className="text-[11px] py-1 font-mono">
                              {r.numero_documento || `${r.numero || "?"}/${r.anno || "?"}`}
                            </TableCell>
                            <TableCell className="text-[11px] py-1 max-w-[160px] truncate">{r.cedente_denominazione || "—"}</TableCell>
                            <TableCell className="text-[11px] py-1 font-mono text-right">{r.importo_totale != null ? formatCurrency(r.importo_totale) : "—"}</TableCell>
                            <TableCell className="text-[11px] py-1">{r.data_fattura || "—"}</TableCell>
                            <TableCell className="py-1">
                              <Button size="sm" variant="outline" className="h-5 text-[10px] px-2" onClick={(e) => {
                                e.stopPropagation();
                                const fakePurchase = { anno: r.anno || 0, numero: r.numero || 0, fornitore: r.cedente_denominazione || "", totale: r.importo_totale || 0, imposta: 0, cig: "" } as PurchaseInvoice;
                                setXmlPickerInvoice(fakePurchase);
                              }}>
                                <Link2 className="h-3 w-3 mr-1" />Associa
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {xmlUnmatchedCount === 0 && xmlRecords.length > 0 && (
                  <p className="text-xs text-muted-foreground py-2">Tutte le fatture XML sono associate. ✓</p>
                )}
                {xmlRecords.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">Nessuna fattura XML caricata. Usa il pulsante XML nell'header per caricare.</p>
                )}
                {/* Main invoices table */}
                <div className="pt-2">
                  <DataTable<PurchaseInvoice>
                    toolbarPortalRef={toolbarPortalRef}
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
              </div>
            </TabsContent>
          </Tabs>
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
    </div>

    {/* Excel collision dialog */}
    <Dialog open={showExcelCollisionDialog} onOpenChange={(open) => { if (!open) handleExcelCancelCollisions(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-warning" /> Record duplicati</DialogTitle>
          <DialogDescription>
            {pendingExcelUpload && `${pendingExcelUpload.newOnly.length} nuovi record verranno importati. ${excelCollisions.length} record esistono già — seleziona quelli da sovrascrivere:`}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-64">
          <div className="space-y-2 pr-3">
            {excelCollisions.map((c, i) => (
              <label key={c.key} className="flex items-start gap-2 p-2 rounded border hover:bg-muted/50 cursor-pointer text-xs">
                <Checkbox checked={c.selected} onCheckedChange={(v) => setExcelCollisions(prev => prev.map((item, idx) => idx === i ? { ...item, selected: !!v } : item))} className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{c.tipo} {c.anno}/{c.numero}</p>
                  <p className="text-muted-foreground truncate">Attuale: {c.existingDesc}</p>
                  <p className="truncate">Nuovo: {c.newDesc}</p>
                </div>
              </label>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={handleExcelCancelCollisions}>Annulla</Button>
          <Button size="sm" onClick={handleExcelConfirmCollisions}>Importa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>);

};

export default AcquistiPage;