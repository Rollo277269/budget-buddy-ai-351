import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInvoiceData, SaleInvoice, SaleInvoiceRiga, parseExcelSales, seedSalesFromExcel, invalidateInvoiceCache } from "@/hooks/useInvoiceData";
import { parseFatturaPA } from "@/lib/fatturaPA";
import { SchedaSoggettoSheet } from "@/components/SchedaSoggettoSheet";
import { useCentriData, useCentroMap } from "@/hooks/useCentri";
import { useXmlInvoices, buildSalesXmlKey } from "@/hooks/useXmlInvoices";
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

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Sparkles, FileText, CheckCircle2, FileDown, FileCode2, Link2, RefreshCw, Trash2, FileSpreadsheet, AlertTriangle, RefreshCcw } from "lucide-react";
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
  const { sales, allSales, allPurchases, loading, filters, setFilters, filterOptions, refresh: refreshInvoices } = useInvoiceData();

  // Read centroRicavo from URL on mount
  useEffect(() => {
    const cr = searchParams.get("centroRicavo");
    const anno = searchParams.get("anno");
    setFilters((f) => ({
      ...f,
      ...(cr ? { centroRicavo: cr } : {}),
      ...(anno ? { anno } : {}),
    }));
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
  
  // Excel import collision state
  const [excelCollisions, setExcelCollisions] = useState<{ key: string; anno: number; numero: number; tipo: string; existingDesc: string; newDesc: string; selected: boolean }[]>([]);
  const [showExcelCollisionDialog, setShowExcelCollisionDialog] = useState(false);
  const [pendingExcelUpload, setPendingExcelUpload] = useState<{ fileName: string; newOnly: SaleInvoice[]; colliding: SaleInvoice[] } | null>(null);
  const toolbarPortalRef = useRef<HTMLDivElement>(null);

  // ── Reconciliation data for payment columns ──
  const [reconMap, setReconMap] = useState<Record<string, { paid: number; lastDate: string }>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: recons } = await supabase
        .from("bank_reconciliations")
        .select("movement_id, invoice_anno, invoice_numero, invoice_type")
        .eq("invoice_type", "vendita");
      if (cancelled) return;
      if (!recons || recons.length === 0) { setReconMap({}); return; }

      const movementIds = [...new Set(recons.map((r: any) => r.movement_id))];
      const movements: Record<string, { importo: number; data: string }> = {};
      for (let i = 0; i < movementIds.length; i += 500) {
        const batch = movementIds.slice(i, i + 500);
        const { data: movs } = await supabase
          .from("bank_movements")
          .select("id, importo, data")
          .in("id", batch);
        if (cancelled) return;
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
      if (!cancelled) setReconMap(map);
    })();
    return () => { cancelled = true; };
  }, [sales]);
  const displayedSales = useMemo(() => {
    const selectedYear = filters.anno.trim();
    const yearFilteredSales = selectedYear
      ? sales.filter((s) => String(s.anno) === selectedYear)
      : sales;

    if (!filters.centroRicavo) return yearFilteredSales;
    return yearFilteredSales.filter((s) => {
      const headerKey = `${s.anno}-${s.numero}`;
      // Check header-level assignment
      if (ricavoMap.map[headerKey] === filters.centroRicavo) return true;
      // Check row-level assignments
      if (s.righe && s.righe.length > 0) {
        for (let idx = 0; idx < s.righe.length; idx++) {
          if (ricavoMap.map[`${headerKey}-${idx}`] === filters.centroRicavo) return true;
        }
      }
      return false;
    });
  }, [sales, filters.anno, filters.centroRicavo, ricavoMap.map]);

  const { xmlRecords, xmlMap, uploadXmlFiles, deleteRecord, manualMatch, rematchAll, removeDuplicates, fetchParsedData, findXml, hasXml } = useXmlInvoices(allSales, "vendita");
  const [selectedXml, setSelectedXml] = useState<(typeof xmlRecords)[0] | null>(null);
  const [xmlPickerInvoice, setXmlPickerInvoice] = useState<SaleInvoice | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [selectedXmlIds, setSelectedXmlIds] = useState<Set<string>>(new Set());
  const toggleXmlSelection = useCallback((id: string) => {
    setSelectedXmlIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const toggleAllXml = useCallback((records: typeof xmlRecords) => {
    setSelectedXmlIds(prev => {
      const ids = records.map(r => r.id);
      const allSelected = ids.every(id => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }, []);

  // ── Invoice row selection for bulk operations ──
  const [selectedInvoiceKeys, setSelectedInvoiceKeys] = useState<Set<string>>(new Set());
  const toggleInvoiceSelection = useCallback((key: string) => {
    setSelectedInvoiceKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const toggleAllInvoices = useCallback(() => {
    setSelectedInvoiceKeys(prev => {
      const keys = displayedSales.map(r => `${r.anno}-${r.numero}`);
      const allSelected = keys.length > 0 && keys.every(k => prev.has(k));
      if (allSelected) return new Set();
      return new Set(keys);
    });
  }, [displayedSales]);

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
        const parsed = parseExcelSales(rows);
        if (parsed.length === 0) { toast.error(`Nessuna fattura vendita trovata in ${file.name}`); continue; }

        // Check collisions
        const keys = parsed.map((i) => `${i.anno}-${i.numero}-${i.tipo || ""}`);
        const { data: existing } = await supabase
          .from("fatture_vendita")
          .select("anno, numero, tipo, descrizione, imponibile, imposta, totale, cig, source_file")
          .or(keys.map(k => { const [a, n] = k.split("-"); return `and(anno.eq.${a},numero.eq.${n})`; }).join(","));

        const existingMap = new Map<string, any>();
        (existing || []).forEach((r: any) => existingMap.set(`${r.anno}-${r.numero}-${r.tipo || ""}`, r));

        const newOnly = parsed.filter((i) => !existingMap.has(`${i.anno}-${i.numero}-${i.tipo || ""}`));
        const colliding = parsed.filter((i) => existingMap.has(`${i.anno}-${i.numero}-${i.tipo || ""}`));

        if (colliding.length === 0) {
          await seedSalesFromExcel(parsed, file.name);
          toast.success(`Importate ${parsed.length} fatture vendita da ${file.name}`);
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
    await seedSalesFromExcel(all, pendingExcelUpload.fileName);
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
        // Build per-row items for multi-row invoices, single item for single-row
        const items: { id: string; invoice: any }[] = [];
        for (const s of sales) {
          if (s.righe && s.righe.length > 1) {
            s.righe.forEach((riga, idx) => {
              const key = `${s.anno}-${s.numero}-${idx}`;
              if (!ricavoMap.map[key]) {
                items.push({ id: key, invoice: { ...s, descrizione: riga.descrizione || s.descrizione, totale: riga.totale, cig: riga.cig || s.cig } });
              }
            });
          } else {
            const key = `${s.anno}-${s.numero}`;
            if (!ricavoMap.map[key]) {
              items.push({ id: key, invoice: s });
            }
          }
        }
        for (let i = 0; i < items.length; i += batchSize) {
          const batch = items.slice(i, i + batchSize);
          const invoicesForAI = batch.map(b => ({ ...b.invoice, _classifyId: b.id }));
          const { data, error } = await supabase.functions.invoke("classify-centro-ricavo", {
            body: { invoices: invoicesForAI, centri, tipo: "ricavo", tipoFattura: "vendita", useClassifyId: true },
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
      {
        key: "select", label: "", sortable: false,
        headerRender: () => (
          <Checkbox
            checked={displayedSales.length > 0 && displayedSales.every(r => selectedInvoiceKeys.has(`${r.anno}-${r.numero}`))}
            onCheckedChange={toggleAllInvoices}
            className="h-3.5 w-3.5"
          />
        ),
        render: (r) => (
          <span onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedInvoiceKeys.has(`${r.anno}-${r.numero}`)}
              onCheckedChange={() => toggleInvoiceSelection(`${r.anno}-${r.numero}`)}
              className="h-3.5 w-3.5"
            />
          </span>
        ),
        minWidth: 36, defaultWidth: 36,
      },
      { key: "numero", label: "N°", render: (r) => <span className="font-mono text-xs">{r.numero}{r.suffisso ? `/${r.suffisso}` : ""}</span>, sortable: true, summaryRender: (rows) => <span className="text-[11px] font-semibold text-muted-foreground">{rows.length} righe</span> },
      { key: "data", label: "Data", render: (r) => <span className="text-xs">{r.data}</span>, sortable: true },
      { key: "cliente", label: "Cliente", render: (r) => <span className="text-xs max-w-[200px] truncate block cursor-pointer text-primary underline decoration-dotted hover:text-primary/80" onClick={(e) => { e.stopPropagation(); setSelectedCliente(r.cliente); }}>{r.cliente}</span>, sortable: true, filterable: true },
      { key: "cig", label: "CIG", render: (r) => r.cig ? (
        <span
          className="font-mono text-[11px] text-primary underline decoration-dotted cursor-pointer hover:text-primary/80"
          onClick={(e) => { e.stopPropagation(); navigate(`/?cig=${encodeURIComponent(r.cig)}`); }}
        >{r.cig}</span>
      ) : <span className="font-mono text-[11px]">—</span>, sortable: true, filterable: true },
      { key: "tipo", label: "Tipo", render: (r) => isNotaCredito(r) ? <Badge variant="destructive" className="text-[10px] font-medium">NC</Badge> : <span className="text-xs text-muted-foreground">{r.tipo}</span>, sortable: true, filterable: true },
      { key: "imponibile", label: "Imponibile", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono text-right block ${nc ? "text-destructive" : ""}`}>{formatCreditAmount(r.imponibile, nc)}</span>; }, sortable: true, align: "right", summaryRender: (rows) => {
        const sum = rows.reduce((s, r) => {
          const sign = isNotaCredito(r) ? -1 : 1;
          if (!filters.centroRicavo) return s + sign * Math.abs(r.imponibile);
          const headerKey = `${r.anno}-${r.numero}`;
          const headerMatch = ricavoMap.map[headerKey] === filters.centroRicavo;
          const righe = r.righe || [];
          const matchingCount = righe.filter((_: any, idx: number) => ricavoMap.map[`${headerKey}-${idx}`] === filters.centroRicavo).length;
          const hasRowAssignments = righe.some((_: any, idx: number) => !!ricavoMap.map[`${headerKey}-${idx}`]);
          // All rows assigned to this centro OR header match with no row assignments → full amount
          if ((matchingCount === righe.length && righe.length > 0) || (headerMatch && !hasRowAssignments)) {
            return s + sign * Math.abs(r.imponibile);
          }
          // Partial row assignments → sum only matching rows
          if (matchingCount > 0) {
            let rowSum = 0;
            righe.forEach((riga: any, idx: number) => {
              if (ricavoMap.map[`${headerKey}-${idx}`] === filters.centroRicavo) rowSum += riga.imponibile;
            });
            return s + sign * Math.abs(rowSum);
          }
          return s + sign * Math.abs(r.imponibile);
        }, 0);
        return <span className="text-[11px] font-mono font-semibold text-right block">{formatCurrency(sum)}</span>;
      } },
      { key: "imposta", label: "IVA", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono text-right block ${nc ? "text-destructive" : ""}`}>{formatCreditAmount(r.imposta, nc)}</span>; }, sortable: true, align: "right", summaryRender: (rows) => {
        const sum = rows.reduce((s, r) => {
          const sign = isNotaCredito(r) ? -1 : 1;
          if (!filters.centroRicavo) return s + sign * Math.abs(r.imposta);
          const headerKey = `${r.anno}-${r.numero}`;
          const headerMatch = ricavoMap.map[headerKey] === filters.centroRicavo;
          const righe = r.righe || [];
          const matchingCount = righe.filter((_: any, idx: number) => ricavoMap.map[`${headerKey}-${idx}`] === filters.centroRicavo).length;
          const hasRowAssignments = righe.some((_: any, idx: number) => !!ricavoMap.map[`${headerKey}-${idx}`]);
          if ((matchingCount === righe.length && righe.length > 0) || (headerMatch && !hasRowAssignments)) {
            return s + sign * Math.abs(r.imposta);
          }
          if (matchingCount > 0) {
            let rowSum = 0;
            righe.forEach((riga: any, idx: number) => {
              if (ricavoMap.map[`${headerKey}-${idx}`] === filters.centroRicavo) rowSum += riga.imposta;
            });
            return s + sign * Math.abs(rowSum);
          }
          return s + sign * Math.abs(r.imposta);
        }, 0);
        return <span className="text-[11px] font-mono font-semibold text-right block">{formatCurrency(sum)}</span>;
      } },
      { key: "percIva", label: "% IVA", sortable: true, filterable: true, defaultHidden: false, align: "right",
        render: (r) => {
          if (!r.imponibile || r.imponibile === 0) return <span className="text-xs text-muted-foreground">—</span>;
          const pct = Math.round((r.imposta / r.imponibile) * 100);
          return <span className="text-xs font-mono text-right block">{pct}%</span>;
        },
        filterValue: (r) => {
          if (!r.imponibile || r.imponibile === 0) return "0%";
          return `${Math.round((r.imposta / r.imponibile) * 100)}%`;
        },
      },
      { key: "articoloIva", label: "Articolo IVA", sortable: true, filterable: true, defaultHidden: false,
        render: (r) => {
          const desc = (r.descrizione || "").toLowerCase();
          const pag = (r.pagamento || "").toLowerCase();
          const tipo = (r.tipo || "").toLowerCase();
          let art = "";
          if (pag.includes("split") || desc.includes("split payment") || desc.includes("scissione") || tipo.includes("split")) {
            art = "Split Payment";
          } else if (desc.includes("art. 17") || desc.includes("art.17") || desc.includes("reverse charge") || desc.includes("inversione contabile")) {
            art = "Art. 17";
          } else if (desc.includes("art. 74") || desc.includes("art.74")) {
            art = "Art. 74";
          } else if (r.imposta === 0 && r.imponibile > 0) {
            if (desc.includes("esente") || desc.includes("art. 10") || desc.includes("art.10")) {
              art = "Esente Art. 10";
            } else if (desc.includes("esclus") || desc.includes("art. 15") || desc.includes("art.15")) {
              art = "Esclusa Art. 15";
            } else if (desc.includes("non imponibile") || desc.includes("art. 8") || desc.includes("art.8")) {
              art = "N.I. Art. 8";
            } else {
              art = "Esente/N.I.";
            }
          }
          if (!art) return <span className="text-xs text-muted-foreground">—</span>;
          return <span className="text-xs">{art}</span>;
        },
        filterValue: (r) => {
          const desc = (r.descrizione || "").toLowerCase();
          const pag = (r.pagamento || "").toLowerCase();
          const tipo = (r.tipo || "").toLowerCase();
          if (pag.includes("split") || desc.includes("split payment") || desc.includes("scissione") || tipo.includes("split")) return "Split Payment";
          if (desc.includes("art. 17") || desc.includes("art.17") || desc.includes("reverse charge") || desc.includes("inversione contabile")) return "Art. 17";
          if (desc.includes("art. 74") || desc.includes("art.74")) return "Art. 74";
          if (r.imposta === 0 && r.imponibile > 0) {
            if (desc.includes("esente") || desc.includes("art. 10") || desc.includes("art.10")) return "Esente Art. 10";
            if (desc.includes("esclus") || desc.includes("art. 15") || desc.includes("art.15")) return "Esclusa Art. 15";
            if (desc.includes("non imponibile") || desc.includes("art. 8") || desc.includes("art.8")) return "N.I. Art. 8";
            return "Esente/N.I.";
          }
          return "";
        },
      },
      { key: "totale", label: "Totale", render: (r) => { const nc = isNotaCredito(r); return <span className={`text-xs font-mono font-semibold text-right block ${nc ? "text-destructive" : ""}`}>{formatCreditAmount(r.totale, nc)}</span>; }, sortable: true, align: "right", summaryRender: (rows) => {
        const sum = rows.reduce((s, r) => {
          const sign = isNotaCredito(r) ? -1 : 1;
          if (!filters.centroRicavo) return s + sign * Math.abs(r.totale);
          const headerKey = `${r.anno}-${r.numero}`;
          const headerMatch = ricavoMap.map[headerKey] === filters.centroRicavo;
          const righe = r.righe || [];
          const matchingCount = righe.filter((_: any, idx: number) => ricavoMap.map[`${headerKey}-${idx}`] === filters.centroRicavo).length;
          const hasRowAssignments = righe.some((_: any, idx: number) => !!ricavoMap.map[`${headerKey}-${idx}`]);
          if ((matchingCount === righe.length && righe.length > 0) || (headerMatch && !hasRowAssignments)) {
            return s + sign * Math.abs(r.totale);
          }
          if (matchingCount > 0) {
            let rowSum = 0;
            righe.forEach((riga: any, idx: number) => {
              if (ricavoMap.map[`${headerKey}-${idx}`] === filters.centroRicavo) rowSum += riga.totale;
            });
            return s + sign * Math.abs(rowSum);
          }
          return s + sign * Math.abs(r.totale);
        }, 0);
        return <span className="text-[11px] font-mono font-bold text-right block">{formatCurrency(sum)}</span>;
      } },
      { key: "stato", label: "Stato", render: (r) => <StatusBadge stato={r.stato} />, sortable: true, filterable: true },
      { key: "importoPagato", label: "Importo Pagato", align: "right", sortable: true, defaultHidden: false, render: (r) => {
        const rec = reconMap[`${r.anno}-${r.numero}`];
        if (!rec) return <span className="text-xs text-muted-foreground">—</span>;
        return <span className="text-xs font-mono text-right block">{formatCurrency(rec.paid)}</span>;
      }, summaryRender: (rows) => {
        const sum = rows.reduce((s, r) => s + (reconMap[`${r.anno}-${r.numero}`]?.paid || 0), 0);
        return sum ? <span className="text-[11px] font-mono font-semibold text-right block">{formatCurrency(sum)}</span> : null;
      }},
      { key: "differenza", label: "Differenza", align: "right", sortable: true, defaultHidden: false, render: (r) => {
        const rec = reconMap[`${r.anno}-${r.numero}`];
        if (!rec) return <span className="text-xs text-muted-foreground">—</span>;
        const diff = Math.round((r.totale - rec.paid) * 100) / 100;
        if (Math.abs(diff) < 0.01) return <span className="text-xs font-mono text-right block text-[hsl(var(--success))]">0,00</span>;
        return <span className={`text-xs font-mono text-right block ${diff > 0 ? "text-destructive" : "text-[hsl(var(--success))]"}`}>{formatCurrency(Math.abs(diff))}{diff > 0 ? "" : " +"}</span>;
      }},
      { key: "dataSaldo", label: "Data Saldo", sortable: true, defaultHidden: false, render: (r) => {
        const rec = reconMap[`${r.anno}-${r.numero}`];
        if (!rec) return <span className="text-xs text-muted-foreground">—</span>;
        const diff = Math.round((r.totale - rec.paid) * 100) / 100;
        if (Math.abs(diff) > 0.01) return <span className="text-xs text-muted-foreground italic">Parziale</span>;
        return <span className="text-xs font-mono">{rec.lastDate}</span>;
      }},
      {
        key: "xml", label: "XML", filterable: true,
        filterValue: (r) => hasXml(buildSalesXmlKey(r.anno, r.numero, r.suffisso)) ? "sì" : "no",
        render: (r) => {
          const k = buildSalesXmlKey(r.anno, r.numero, r.suffisso);
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
        filterValue: (r) => hasXml(buildSalesXmlKey(r.anno, r.numero, r.suffisso)) ? "sì" : "no",
        render: (r) => {
          const xml = findXml(buildSalesXmlKey(r.anno, r.numero, r.suffisso), r.cliente);
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
        filterValue: (r) => {
          const codes = new Set<string>();
          if (r.righe && r.righe.length > 1) {
            r.righe.forEach((_: any, idx: number) => {
              const rowCode = ricavoMap.map[`${r.anno}-${r.numero}-${idx}`];
              if (rowCode) codes.add(rowCode);
            });
          }
          // Only use header-level if no per-row assignments found
          if (codes.size === 0) {
            const headerCode = ricavoMap.map[`${r.anno}-${r.numero}`];
            if (headerCode) codes.add(headerCode);
          }
          return Array.from(codes).join(", ") || "";
        },
        render: (r) => {
          const codes = new Set<string>();
          if (r.righe && r.righe.length > 1) {
            r.righe.forEach((_: any, idx: number) => {
              const rowCode = ricavoMap.map[`${r.anno}-${r.numero}-${idx}`];
              if (rowCode) codes.add(rowCode);
            });
          }
          const hasRowAssignments = codes.size > 0;
          if (!hasRowAssignments) {
            const headerCode = ricavoMap.map[`${r.anno}-${r.numero}`];
            if (headerCode) codes.add(headerCode);
          }
          if (hasRowAssignments || codes.size > 1) {
            return (
              <div className="flex flex-wrap gap-0.5">
                {Array.from(codes).map((code) => {
                  const centro = centri.find((c) => c.codice === code && c.tipo === "ricavo");
                  return (
                    <Badge key={code} variant="outline" className="px-1 py-0 font-thin text-xs font-sans">
                      {code}{centro ? ` - ${centro.descrizione.slice(0, 15)}` : ""}
                    </Badge>
                  );
                })}
              </div>
            );
          }
          return <CentroCell invoiceKey={`${r.anno}-${r.numero}`} tipo="ricavo" centri={centri} centroMap={ricavoMap.map} onAssign={ricavoMap.assign} onRemove={ricavoMap.remove} />;
        },
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
      { key: "partitaIva", label: "P.IVA", render: (r) => <span className="font-mono text-[11px]">{r.partitaIva || "—"}</span>, defaultHidden: true },
    ],
    [centri, ricavoMap.map, ricavoMap.assign, costoMap.map, costoMap.assign, findXml, hasXml, navigate, openXmlSheet, openPdf, reconMap, displayedSales, selectedInvoiceKeys, toggleAllInvoices, toggleInvoiceSelection, filters.centroRicavo]
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

  // ── Enrich invoices from XML data ──
  const handleEnrichFromXml = useCallback(async () => {
    setEnriching(true);
    let updated = 0;
    try {
      const { data: xmlRows } = await supabase
        .from("fatture_xml")
        .select("id, anno, numero, matched, storage_path")
        .eq("tipo", "vendita")
        .eq("matched", true);
      if (!xmlRows || xmlRows.length === 0) {
        toast.info("Nessun XML associato trovato");
        setEnriching(false);
        return;
      }

      // Filter by selected invoices or selected XMLs
      let targetXmls = xmlRows as any[];
      if (selectedInvoiceKeys.size > 0) {
        targetXmls = targetXmls.filter(x => x.anno && x.numero && selectedInvoiceKeys.has(`${x.anno}-${x.numero}`));
      } else if (selectedXmlIds.size > 0) {
        targetXmls = targetXmls.filter(x => selectedXmlIds.has(x.id));
      }

      const invoicesNeedingUpdate = (selectedInvoiceKeys.size > 0 || selectedXmlIds.size > 0)
        ? allSales
        : allSales.filter(s => !s.cig || !s.cup || !s.partitaIva || !s.scadenza);
      const needingSet = new Set(invoicesNeedingUpdate.map(s => `${s.anno}-${s.numero}`));
      const relevantXmls = targetXmls.filter(x => x.anno && x.numero && needingSet.has(`${x.anno}-${x.numero}`));

      if (relevantXmls.length === 0) {
        toast.info(selectedInvoiceKeys.size > 0 ? "Nessun XML associato alle fatture selezionate" : selectedXmlIds.size > 0 ? "Nessun XML selezionato associato trovato" : "Tutte le fatture sono già complete");
        setEnriching(false);
        return;
      }

      toast.info(`Analisi di ${relevantXmls.length} XML in corso...`);

      for (const xml of relevantXmls) {
        const inv = allSales.find(s => s.anno === xml.anno && s.numero === xml.numero);
        if (!inv) continue;

        if (xml.storage_path) {
          try {
            const { data: fileData } = await supabase.storage.from("fatture-xml").download(xml.storage_path);
            if (!fileData) continue;
            const rawText = await fileData.text();
            const reParsed = parseFatturaPA(rawText);

            const xmlCig = reParsed.cig || "";
            let xmlCup = "";
            for (const c of reParsed.causale || []) {
              const match = (c || "").match(/CUP[:\s]*([A-Z0-9]+)/i);
              if (match) { xmlCup = match[1]; break; }
            }

            if (xmlCig) {
              const { data: currentRow } = await supabase.from("fatture_xml").select("parsed_data").eq("id", xml.id).single();
              if (currentRow) {
                const updatedPd = { ...(currentRow as any).parsed_data, cig: xmlCig };
                await supabase.from("fatture_xml" as any).update({ parsed_data: updatedPd } as any).eq("id", xml.id);
              }
            }

            const updates: Record<string, any> = {};
            if (!inv.cig && xmlCig) updates.cig = xmlCig.toUpperCase();
            if (!inv.cup && xmlCup) updates.cup = xmlCup.toUpperCase();
            if (!inv.partitaIva && reParsed.cessionario?.partitaIva) updates.partita_iva = reParsed.cessionario.partitaIva;
            if ((!inv.scadenza || inv.scadenza === "") && reParsed.pagamenti?.length > 0) {
              const scad = reParsed.pagamenti[0].dataScadenza;
              if (scad) updates.scadenza = scad;
            }

            if (Object.keys(updates).length > 0) {
              const { error } = await supabase
                .from("fatture_vendita")
                .update(updates)
                .eq("anno", xml.anno)
                .eq("numero", xml.numero);
              if (!error) updated++;
            }
          } catch (e) {
            console.warn("Could not re-parse XML:", xml.storage_path, e);
          }
        }
      }

      if (updated > 0) {
        toast.success(`${updated} fatture aggiornate da XML`);
        invalidateInvoiceCache();
        refreshInvoices();
        setSelectedXmlIds(new Set());
      } else {
        toast.info("Tutte le fatture sono già complete");
      }
    } catch (e) {
      console.error("Enrich error:", e);
      toast.error("Errore durante l'aggiornamento");
    } finally {
      setEnriching(false);
    }
  }, [allSales, refreshInvoices, selectedXmlIds, selectedInvoiceKeys]);

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
    <>
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

              <input ref={csvInputRef} type="file" accept=".csv,.xlsx,.xls" multiple className="hidden" onChange={handleCsvFileInput} />
              <div
                className={`flex items-center gap-1.5 border border-dashed rounded-md px-2.5 py-1.5 cursor-pointer transition-colors text-muted-foreground hover:text-foreground ${csvDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                title="Carica elenco ricavi CSV o importa fatture vendita Excel (.xlsx)"
                onDragEnter={handleCsvDragEnter}
                onDragLeave={handleCsvDragLeave}
                onDragOver={handleCsvDragOver}
                onDrop={handleCsvDrop}
                onClick={() => csvInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">CSV / Excel</span>
              </div>

              <DocumentiAcquistoSection dropZoneOnly compact tipo="vendita" />

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
              centriRicavo: centriRicavo
                .map((c) => ({ value: c.codice, label: `${c.codice} - ${c.descrizione}` }))
                .sort((a, b) => a.label.localeCompare(b.label)),
            }} hideFornitore />
            <div ref={toolbarPortalRef} className="flex items-center gap-2 ml-auto" />
          </div>
        </div>

        {/* ── Schede: Ricevute e Documenti / Fatture XML ── */}
        <div className="px-4 pt-3">
          <Tabs defaultValue="xml" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="xml" className="text-xs gap-1.5">
                <FileCode2 className="h-3.5 w-3.5" />
                Fatture XML
                {xmlUnmatchedCount > 0 && <Badge variant="destructive" className="text-[10px] ml-1 h-4 px-1">{xmlUnmatchedCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="documenti" className="text-xs gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Ricevute e Documenti
              </TabsTrigger>
            </TabsList>

            <TabsContent value="documenti">
              <DocumentiAcquistoSection tableOnly tipo="vendita" />
            </TabsContent>

            <TabsContent value="xml">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{xmlRecords.length} totali</Badge>
                  <Badge className="text-[10px]">{xmlMatchedCount} assoc.</Badge>
                  {xmlUnmatchedCount > 0 && <Badge variant="destructive" className="text-[10px]">{xmlUnmatchedCount} non assoc.</Badge>}
                  {selectedXmlIds.size > 0 && (
                    <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => setSelectedXmlIds(new Set())}>
                      {selectedXmlIds.size} selezionati ✕
                    </Badge>
                  )}
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
                    <Button size="sm" variant="outline" className="h-6 text-[10px]" title="Aggiorna dati fatture da XML associati (CIG, scadenza, P.IVA, CUP)" onClick={handleEnrichFromXml} disabled={enriching || xmlRecords.filter(r => r.matched).length === 0}>
                      {enriching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCcw className="h-3 w-3 mr-1" />}
                      {enriching ? "Aggiornamento..." : selectedInvoiceKeys.size > 0 ? `Aggiorna da XML (${selectedInvoiceKeys.size})` : selectedXmlIds.size > 0 ? `Aggiorna da XML (${selectedXmlIds.size})` : "Aggiorna da XML"}
                    </Button>
                  </div>
                </div>
                {/* Main invoices table */}
                <div className="pt-2">
                  <DataTable<SaleInvoice>
                    toolbarPortalRef={toolbarPortalRef}
                    columns={columns}
                    data={displayedSales}
                    defaultSort={{ key: "data", dir: "desc" }}
                    rowKey={(r) => `${r.anno}-${r.numero}-${r.suffisso}-${r.tipo}`}
                    onRowClick={setSelectedInvoice}
                    rowClassName={(r) => {
                      const nc = isNotaCredito(r);
                      const xml = hasXml(buildSalesXmlKey(r.anno, r.numero, r.suffisso));
                      const selected = selectedInvoiceKeys.has(`${r.anno}-${r.numero}`);
                      return [
                        selected ? "bg-accent/40" : "",
                        nc ? "bg-destructive/5 dark:bg-destructive/10" : "",
                        xml && !nc && !selected ? "bg-green-50/50 dark:bg-green-950/20" : "",
                      ].filter(Boolean).join(" ");
                    }}
                    expandable={(r) => r.righe.length > 1}
                    renderExpandedContent={(r) => (
                      <div className="px-4 py-2 overflow-hidden w-full">
                        <Table style={{ tableLayout: "fixed", width: "100%" }}>
                          <colgroup>
                            <col style={{ width: "40px" }} />
                            <col style={{ minWidth: 0 }} />
                            <col style={{ width: "100px" }} />
                            <col style={{ width: "80px" }} />
                            <col style={{ width: "100px" }} />
                            <col style={{ width: "100px" }} />
                            <col style={{ width: "140px" }} />
                          </colgroup>
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
                                  <TableCell className="text-[11px] whitespace-normal break-words leading-snug py-1.5 overflow-hidden">{riga.descrizione || "—"}</TableCell>
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
                                      onRemove={ricavoMap.remove}
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
              </div>
            </TabsContent>
          </Tabs>
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
          invoiceImposta={xmlPickerInvoice?.imposta || 0}
          invoiceCig={xmlPickerInvoice?.cig || ""}
          tipo="vendita"
          onMatch={(xmlId, anno, numero) => manualMatch(xmlId, anno, numero, xmlPickerInvoice?.suffisso)}
          onCigChange={async (anno, numero, cig) => {
            await supabase.from("fatture_vendita").update({ cig }).eq("anno", anno).eq("numero", numero);
            toast.success(`CIG aggiornato: ${cig || "(rimosso)"}`);
          }}
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

      {/* Excel collision dialog */}
      <Dialog open={showExcelCollisionDialog} onOpenChange={setShowExcelCollisionDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-yellow-500" /> Record duplicati trovati</DialogTitle>
            <DialogDescription>
              {pendingExcelUpload && pendingExcelUpload.newOnly.length > 0 && <span className="block text-sm mb-1">{pendingExcelUpload.newOnly.length} nuovi record verranno importati automaticamente.</span>}
              Seleziona i record duplicati che vuoi <strong>sovrascrivere</strong>.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-1 p-1">
              <div className="flex items-center gap-2 mb-2">
                <Checkbox checked={excelCollisions.every(c => c.selected)} onCheckedChange={(v) => setExcelCollisions(prev => prev.map(c => ({ ...c, selected: !!v })))} />
                <span className="text-xs font-medium">Seleziona tutti</span>
              </div>
              {excelCollisions.map((c) => (
                <div key={c.key} className="flex items-start gap-2 py-1 border-b last:border-0">
                  <Checkbox checked={c.selected} onCheckedChange={() => setExcelCollisions(prev => prev.map(x => x.key === c.key ? { ...x, selected: !x.selected } : x))} />
                  <div className="text-xs space-y-0.5">
                    <p className="font-medium">N. {c.numero}/{c.anno}</p>
                    <p className="text-muted-foreground">Esistente: {c.existingDesc || "—"}</p>
                    <p className="text-muted-foreground">Nuovo: {c.newDesc || "—"}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={handleExcelCancelCollisions}>Annulla</Button>
            <Button size="sm" onClick={handleExcelConfirmCollisions}>
              Importa {(pendingExcelUpload?.newOnly.length || 0) + excelCollisions.filter(c => c.selected).length} record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default VenditePage;
