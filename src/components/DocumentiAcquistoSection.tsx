import { useState, useRef, useCallback, useMemo } from "react";
import { useDocumentiAcquisto, DocumentoAcquisto, PreparedDocumento } from "@/hooks/useDocumentiAcquisto";
import { useCentriData } from "@/hooks/useCentri";
import { useRubrica, emptyIndirizzo } from "@/hooks/useRubrica";
import { DocumentoAiReviewDialog } from "@/components/DocumentoAiReviewDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { PdfViewerPanel } from "@/components/PdfViewerPanel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/format";
import { Upload, FileText, Trash2, Loader2, Receipt, Eye, Search, FileDown, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Columns3, Sparkles, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

async function getPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  return pdfjsLib;
}

async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(" ") + "\n";
  }
  return text;
}

async function extractTextFromPdfBuffer(buf: ArrayBuffer): Promise<string> {
  const pdfjsLib = await getPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(" ") + "\n";
  }
  return text;
}

/* ── Column definitions ── */
type ColumnKey = "descrizione" | "file_name" | "numero" | "fornitore" | "data" | "importo" | "cig" | "centro_costo" | "created_at";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
}

function buildColumns(tipo: "acquisto" | "vendita"): ColumnDef[] {
  return [
    { key: "descrizione", label: "Documento", defaultVisible: true },
    { key: "file_name", label: "Nome file", defaultVisible: true },
    { key: "numero", label: "Numero", defaultVisible: true },
    { key: "fornitore", label: tipo === "vendita" ? "Cliente" : "Fornitore", defaultVisible: true },
    { key: "data", label: "Data", defaultVisible: true },
    { key: "importo", label: "Importo", defaultVisible: true },
    { key: "cig", label: "CIG", defaultVisible: true },
    { key: "centro_costo", label: tipo === "vendita" ? "Centro Ricavo" : "Centro Costo", defaultVisible: true },
    { key: "created_at", label: "Data caricamento", defaultVisible: true },
  ];
}

type SortDir = "asc" | "desc" | null;

interface Props {
  dropZoneOnly?: boolean;
  tableOnly?: boolean;
  compact?: boolean;
  tipo?: "acquisto" | "vendita";
}

export function DocumentiAcquistoSection({ dropZoneOnly, tableOnly, compact, tipo = "acquisto" }: Props) {
  const { documenti, loading, prepareDocumento, finalizeDocumento, deleteDocumento, updateCentroCosto, updateCig, updateField, reclassifyExisting, updateDocumentoFromPrepared } = useDocumentiAcquisto(tipo);
  const { contatti: rubricaContatti, saveContatto: saveContattoRubrica } = useRubrica();

  // AI review queue state
  const [reviewQueue, setReviewQueue] = useState<PreparedDocumento[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Re-classification state (single document at a time)
  const [reclassifying, setReclassifying] = useState<string | null>(null);
  const [reclassifyItem, setReclassifyItem] = useState<{ id: string; prepared: PreparedDocumento } | null>(null);
  const { centriCosto, centriRicavo } = useCentriData();
  const centri = tipo === "vendita" ? centriRicavo : centriCosto;
  const ALL_COLUMNS = useMemo(() => buildColumns(tipo), [tipo]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentoAcquisto | null>(null);
  const [pdfDragging, setPdfDragging] = useState(false);
  const pdfDragCounter = useRef(0);
  const [searchQuery, setSearchQuery] = useState("");

  // Column visibility
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(
    () => new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key))
  );

  // Sorting
  const [sortKey, setSortKey] = useState<ColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // PDF viewer state
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  // Inline editing state: { docId, field }
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // Fornitore picker: dialog asking the user whether to add a new supplier to rubrica
  const [newFornitoreAsk, setNewFornitoreAsk] = useState<{ docId: string; name: string } | null>(null);
  // Fornitore picker: dialog showing similar existing contacts when the typed name doesn't match exactly
  const [similarFornitoreAsk, setSimilarFornitoreAsk] = useState<{
    docId: string;
    typed: string;
    suggestions: { id: string; denominazione: string }[];
  } | null>(null);

  const fornitoreLabel = tipo === "vendita" ? "cliente" : "fornitore";
  const rubricaOptions = useMemo(() => {
    // For acquisti: prefer fornitori + soci; for vendite: clienti + soci.
    const allowed = tipo === "vendita" ? ["cliente", "socio"] : ["fornitore", "socio"];
    const filtered = rubricaContatti.filter((c) => allowed.includes((c.tipo || "").toLowerCase()));
    // Fallback: if no contacts match the expected tipo, show all so the picker isn't empty.
    return (filtered.length > 0 ? filtered : rubricaContatti).slice().sort((a, b) =>
      a.denominazione.localeCompare(b.denominazione)
    );
  }, [rubricaContatti, tipo]);

  const handleFornitorePicked = useCallback(async (docId: string, denominazione: string) => {
    await updateField(docId, "fornitore", denominazione || null);
    setEditingCell(null);
    setEditingValue("");
  }, [updateField]);

  const handleConfirmNewFornitore = useCallback(async () => {
    if (!newFornitoreAsk) return;
    const { docId, name } = newFornitoreAsk;
    await saveContattoRubrica({
      id: "",
      denominazione: name,
      tipo: tipo === "vendita" ? "cliente" : "fornitore",
      partita_iva: "",
      email: "",
      pec: "",
      codice_sdi: "",
      telefono: "",
      indirizzo: "",
      note: "",
      sede_legale: { ...emptyIndirizzo },
      sede_operativa: { ...emptyIndirizzo },
    });
    setNewFornitoreAsk(null);
    await handleFornitorePicked(docId, name);
  }, [newFornitoreAsk, saveContattoRubrica, tipo, handleFornitorePicked]);

  // When the user types a name that doesn't exactly match any rubrica entry,
  // look for fuzzy/substring matches and, if found, offer them; otherwise propose creation.
  const handleFornitoreFreeText = useCallback((docId: string, typed: string) => {
    const t = typed.trim();
    if (!t) {
      setEditingCell(null);
      setEditingValue("");
      return;
    }
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const exact = rubricaOptions.find((c) => norm(c.denominazione) === norm(t));
    if (exact) {
      handleFornitorePicked(docId, exact.denominazione);
      return;
    }
    const nt = norm(t);
    const suggestions = rubricaOptions.filter((c) => {
      const n = norm(c.denominazione);
      return n.includes(nt) || nt.includes(n);
    }).slice(0, 8);
    if (suggestions.length > 0) {
      setSimilarFornitoreAsk({ docId, typed: t, suggestions: suggestions.map((c) => ({ id: c.id, denominazione: c.denominazione })) });
    } else {
      setNewFornitoreAsk({ docId, name: t });
    }
  }, [rubricaOptions, handleFornitorePicked]);

  const centroLookup = useMemo(() => new Map(centri.map(c => [c.codice, c.descrizione])), [centri]);

  const toggleCol = (key: ColumnKey) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSort = (key: ColumnKey) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
      else setSortDir("asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getSortValue = (doc: DocumentoAcquisto, key: ColumnKey): string | number => {
    switch (key) {
      case "descrizione": return (doc.descrizione || doc.file_name || "").toLowerCase();
      case "file_name": return (doc.file_name || "").toLowerCase();
      case "numero": return (doc.numero || "").toLowerCase();
      case "fornitore": return (doc.fornitore || "").toLowerCase();
      case "data": return doc.data_documento || "";
      case "importo": return doc.importo || 0;
      case "cig": return (doc.cig || "").toLowerCase();
      case "centro_costo": return (doc.centro_costo || "").toLowerCase();
      case "created_at": return doc.created_at || "";
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = documenti;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        (d.descrizione || "").toLowerCase().includes(q) ||
        (d.file_name || "").toLowerCase().includes(q) ||
        (d.numero || "").toLowerCase().includes(q) ||
        (d.fornitore || "").toLowerCase().includes(q) ||
        (d.cig || "").toLowerCase().includes(q)
      );
    }
    if (sortKey && sortDir) {
      result = [...result].sort((a, b) => {
        const va = getSortValue(a, sortKey);
        const vb = getSortValue(b, sortKey);
        const cmp = typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [documenti, searchQuery, sortKey, sortDir]);

  const openPdf = useCallback(async (doc: DocumentoAcquisto) => {
    setPdfLoading(true);
    setPdfFileName(doc.file_name);
    try {
      const { data, error } = await supabase.storage
        .from("documenti-acquisto")
        .download(doc.storage_path);
      if (error || !data) { toast.error("Errore download PDF"); setPdfLoading(false); return; }
      const arrayBuffer = await data.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      setPdfBase64(btoa(binary));
      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(url);
    } catch (err) {
      console.error("PDF download error:", err);
      toast.error("Errore apertura PDF");
    }
    setPdfLoading(false);
  }, [pdfBlobUrl]);

  const closePdf = useCallback(() => {
    setPdfBase64(null);
    setPdfFileName("");
    if (pdfBlobUrl) { URL.revokeObjectURL(pdfBlobUrl); setPdfBlobUrl(null); }
  }, [pdfBlobUrl]);

  const openInNewTab = useCallback(() => {
    if (pdfBlobUrl) window.open(pdfBlobUrl, "_blank");
  }, [pdfBlobUrl]);

  // Duplicate confirmation queue: files awaiting user decision
  const [duplicateQueue, setDuplicateQueue] = useState<Array<{
    file: File;
    text: string;
    existing: { id: string; storage_path: string; file_name: string; descrizione: string | null; importo: number | null; fornitore: string | null; created_at: string | null };
  }>>([]);

  const enqueuePreparedResults = useCallback(async (
    items: Array<{ file: File; text: string }>,
  ) => {
    const ready: PreparedDocumento[] = [];
    const duplicates: typeof duplicateQueue = [];
    for (const { file, text } of items) {
      try {
        const result = await prepareDocumento(file, text);
        if (!result) continue;
        if (result.kind === "duplicate") {
          duplicates.push({ file, text, existing: result.existing });
        } else {
          ready.push(result.prepared);
        }
      } catch (err) {
        console.error(`Error processing ${file.name}:`, err);
        toast.error(`Errore elaborazione ${file.name}`);
      }
    }
    if (ready.length > 0) {
      setReviewQueue((prev) => [...prev, ...ready]);
      setReviewOpen(true);
    }
    if (duplicates.length > 0) {
      setDuplicateQueue((prev) => [...prev, ...duplicates]);
    }
  }, [prepareDocumento]);

  const processPdfFiles = useCallback(async (files: File[]) => {
    const pdfFiles = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) { toast.error("Seleziona file PDF"); return; }
    setUploading(true);
    const items: Array<{ file: File; text: string }> = [];
    for (const file of pdfFiles) {
      try {
        const text = await extractTextFromPdf(file);
        items.push({ file, text });
      } catch (err) {
        console.error(`Error reading ${file.name}:`, err);
        toast.error(`Errore lettura ${file.name}`);
      }
    }
    await enqueuePreparedResults(items);
    setUploading(false);
  }, [enqueuePreparedResults]);

  const handleDuplicateOverwrite = useCallback(async () => {
    const current = duplicateQueue[0];
    if (!current) return;
    setDuplicateQueue((prev) => prev.slice(1));
    setUploading(true);
    try {
      const result = await prepareDocumento(current.file, current.text, {
        overwriteExistingId: current.existing.id,
        overwriteStoragePath: current.existing.storage_path,
      });
      if (result && result.kind === "ready") {
        setReviewQueue((prev) => [...prev, result.prepared]);
        setReviewOpen(true);
      }
    } catch (err) {
      console.error("Overwrite error:", err);
      toast.error(`Errore sovrascrittura ${current.file.name}`);
    } finally {
      setUploading(false);
    }
  }, [duplicateQueue, prepareDocumento]);

  const handleDuplicateSkip = useCallback(() => {
    const current = duplicateQueue[0];
    if (current) toast.info(`"${current.file.name}" non caricato (duplicato)`);
    setDuplicateQueue((prev) => prev.slice(1));
  }, [duplicateQueue]);

  const handleReviewConfirm = useCallback(async (edited: PreparedDocumento) => {
    await finalizeDocumento(edited);
    setReviewQueue((prev) => {
      const next = prev.slice(1);
      if (next.length === 0) setReviewOpen(false);
      return next;
    });
  }, [finalizeDocumento]);

  const handleReviewCancel = useCallback(async () => {
    const current = reviewQueue[0];
    if (current) {
      await supabase.storage.from("documenti-acquisto").remove([current.storage_path]);
      toast.info(`Upload di "${current.file_name}" annullato`);
    }
    setReviewQueue((prev) => {
      const next = prev.slice(1);
      if (next.length === 0) setReviewOpen(false);
      return next;
    });
  }, [reviewQueue]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    await processPdfFiles(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [processPdfFiles]);

  const handlePdfDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); pdfDragCounter.current++; setPdfDragging(true); }, []);
  const handlePdfDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); pdfDragCounter.current--; if (pdfDragCounter.current === 0) setPdfDragging(false); }, []);
  const handlePdfDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handlePdfDrop = useCallback(async (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); pdfDragCounter.current = 0; setPdfDragging(false); await processPdfFiles(Array.from(e.dataTransfer.files)); }, [processPdfFiles]);

  const startEditing = useCallback((id: string, field: string, currentValue: string) => {
    setEditingCell({ id, field });
    setEditingValue(currentValue);
  }, []);

  const saveEditing = useCallback(async () => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const trimmed = editingValue.trim();
    if (field === "importo") {
      const num = parseFloat(trimmed.replace(",", "."));
      await updateField(id, field, isNaN(num) ? null : num);
    } else if (field === "cig") {
      await updateCig(id, trimmed);
    } else {
      await updateField(id, field, trimmed || null);
    }
    setEditingCell(null);
    setEditingValue("");
  }, [editingCell, editingValue, updateField, updateCig]);

  const cancelEditing = useCallback(() => {
    setEditingCell(null);
    setEditingValue("");
  }, []);

  const handleReclassify = useCallback(async (doc: DocumentoAcquisto) => {
    setReclassifying(doc.id);
    try {
      let text = "";
      // 1) Try to re-extract fresh text from the stored PDF
      try {
        const { data, error } = await supabase.storage
          .from("documenti-acquisto")
          .download(doc.storage_path);
        if (error || !data) throw error || new Error("Download vuoto");
        const buf = await data.arrayBuffer();
        text = await extractTextFromPdfBuffer(buf);
      } catch (extractErr) {
        console.warn("PDF re-extract failed, falling back to parsed_text:", extractErr);
      }
      // 2) Fallback to text saved at first upload
      if (!text || text.trim().length < 10) text = doc.parsed_text || "";
      if (!text || text.trim().length < 10) {
        toast.error("Impossibile leggere il testo dal PDF (potrebbe essere una scansione senza OCR)");
        return;
      }
      const prepared = await reclassifyExisting(doc, text);
      if (prepared) setReclassifyItem({ id: doc.id, prepared });
      else toast.error("L'AI non ha restituito risultati");
    } catch (err) {
      console.error("Reclassify error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Errore rilettura AI: ${msg}`);
    } finally {
      setReclassifying(null);
    }
  }, [reclassifyExisting]);

  const handleReclassifyConfirm = useCallback(async (edited: PreparedDocumento) => {
    if (!reclassifyItem) return;
    await updateDocumentoFromPrepared(reclassifyItem.id, edited);
    setReclassifyItem(null);
  }, [reclassifyItem, updateDocumentoFromPrepared]);

  const handleReclassifyCancel = useCallback(() => {
    setReclassifyItem(null);
  }, []);

  const currentDuplicate = duplicateQueue[0];
  const reviewDialogEl = (
    <>
      <DocumentoAiReviewDialog
        open={reviewOpen && reviewQueue.length > 0}
        prepared={reviewQueue[0] ?? null}
        centri={centri}
        tipo={tipo}
        onConfirm={handleReviewConfirm}
        onCancel={handleReviewCancel}
      />
      <DocumentoAiReviewDialog
        open={!!reclassifyItem}
        prepared={reclassifyItem?.prepared ?? null}
        centri={centri}
        tipo={tipo}
        onConfirm={handleReclassifyConfirm}
        onCancel={handleReclassifyCancel}
      />
      <AlertDialog open={!!currentDuplicate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Documento duplicato</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Il file <span className="font-medium text-foreground">"{currentDuplicate?.file.name}"</span> è già presente nei documenti.
                </p>
                {currentDuplicate && (
                  <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-0.5">
                    <div><span className="text-muted-foreground">Descrizione: </span><span className="text-foreground">{currentDuplicate.existing.descrizione || "—"}</span></div>
                    <div><span className="text-muted-foreground">{tipo === "vendita" ? "Cliente" : "Fornitore"}: </span><span className="text-foreground">{currentDuplicate.existing.fornitore || "—"}</span></div>
                    <div><span className="text-muted-foreground">Importo: </span><span className="text-foreground">{currentDuplicate.existing.importo != null ? formatCurrency(currentDuplicate.existing.importo) : "—"}</span></div>
                    {currentDuplicate.existing.created_at && (
                      <div><span className="text-muted-foreground">Caricato il: </span><span className="text-foreground">{new Date(currentDuplicate.existing.created_at).toLocaleDateString("it-IT")}</span></div>
                    )}
                  </div>
                )}
                <p>Vuoi sovrascrivere il documento esistente o annullare l'upload?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDuplicateSkip}>Annulla upload</AlertDialogCancel>
            <AlertDialogAction onClick={handleDuplicateOverwrite}>Sovrascrivi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ask: typed name doesn't exist in rubrica → create it? */}
      <AlertDialog open={!!newFornitoreAsk} onOpenChange={(o) => { if (!o) setNewFornitoreAsk(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nuovo {fornitoreLabel}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Il {fornitoreLabel} <span className="font-medium text-foreground">"{newFornitoreAsk?.name}"</span> non è presente in rubrica.
                </p>
                <p>Vuoi aggiungerlo alla rubrica e assegnarlo a questo documento?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmNewFornitore}>Aggiungi in rubrica</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ask: typed name is similar to existing rubrica entries → pick one or create new */}
      <AlertDialog open={!!similarFornitoreAsk} onOpenChange={(o) => { if (!o) setSimilarFornitoreAsk(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fornitoreLabel.charAt(0).toUpperCase() + fornitoreLabel.slice(1)} simile già in rubrica</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Hai scritto <span className="font-medium text-foreground">"{similarFornitoreAsk?.typed}"</span>. Forse intendevi uno di questi?
                </p>
                <div className="space-y-1 max-h-[240px] overflow-y-auto">
                  {similarFornitoreAsk?.suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-left text-xs px-2 py-1.5 rounded border bg-card hover:bg-accent hover:border-primary/40 transition-colors"
                      onClick={() => {
                        const ask = similarFornitoreAsk;
                        setSimilarFornitoreAsk(null);
                        if (ask) handleFornitorePicked(ask.docId, s.denominazione);
                      }}
                    >
                      {s.denominazione}
                    </button>
                  ))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const ask = similarFornitoreAsk;
                setSimilarFornitoreAsk(null);
                if (ask) setNewFornitoreAsk({ docId: ask.docId, name: ask.typed });
              }}
            >
              Aggiungi come nuovo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  // Drop zone only mode
  if (dropZoneOnly) {
    if (compact) {
      return (
        <>
          <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleUpload} />
          <div
            className={`flex items-center gap-1.5 border border-dashed rounded-md px-2.5 py-1.5 cursor-pointer transition-colors text-muted-foreground hover:text-foreground ${pdfDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            onDragEnter={handlePdfDragEnter} onDragLeave={handlePdfDragLeave} onDragOver={handlePdfDragOver} onDrop={handlePdfDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
            <span className="text-[11px] font-medium">PDF</span>
          </div>
          {reviewDialogEl}
        </>
      );
    }
    return (
      <>
        <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleUpload} />
        <div
          className={`relative border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer ${pdfDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}
          onDragEnter={handlePdfDragEnter} onDragLeave={handlePdfDragLeave} onDragOver={handlePdfDragOver} onDrop={handlePdfDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /><span className="text-xs font-medium">Analisi in corso...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
              <Receipt className="h-5 w-5" /><span className="text-xs font-medium">Trascina file PDF</span>
              <span className="text-[10px]">Ricevute, marche da bollo, affitti</span>
            </div>
          )}
        </div>
        {reviewDialogEl}
      </>
    );
  }

  if (loading) return null;

  const SortIcon = ({ col }: { col: ColumnKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />;
    if (sortDir === "asc") return <ArrowUp className="h-3 w-3 text-primary" />;
    return <ArrowDown className="h-3 w-3 text-primary" />;
  };

  const tableContent = (docs: DocumentoAcquisto[]) => (
    <div className="max-h-[60vh] overflow-y-auto overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {visibleCols.has("descrizione") && (
              <TableHead className="text-[11px] h-8 cursor-pointer select-none" onClick={() => handleSort("descrizione")}>
                <span className="flex items-center gap-1">Documento <SortIcon col="descrizione" /></span>
              </TableHead>
            )}
            {visibleCols.has("file_name") && (
              <TableHead className="text-[11px] h-8 cursor-pointer select-none" onClick={() => handleSort("file_name")}>
                <span className="flex items-center gap-1">Nome file <SortIcon col="file_name" /></span>
              </TableHead>
            )}
            {visibleCols.has("numero") && (
              <TableHead className="text-[11px] h-8 cursor-pointer select-none" onClick={() => handleSort("numero")}>
                <span className="flex items-center gap-1">Numero <SortIcon col="numero" /></span>
              </TableHead>
            )}
            {visibleCols.has("fornitore") && (
              <TableHead className="text-[11px] h-8 cursor-pointer select-none" onClick={() => handleSort("fornitore")}>
                <span className="flex items-center gap-1">{ALL_COLUMNS.find(c => c.key === "fornitore")?.label} <SortIcon col="fornitore" /></span>
              </TableHead>
            )}
            {visibleCols.has("data") && (
              <TableHead className="text-[11px] h-8 cursor-pointer select-none" onClick={() => handleSort("data")}>
                <span className="flex items-center gap-1">Data <SortIcon col="data" /></span>
              </TableHead>
            )}
            {visibleCols.has("importo") && (
              <TableHead className="text-[11px] h-8 text-right cursor-pointer select-none" onClick={() => handleSort("importo")}>
                <span className="flex items-center gap-1 justify-end">Importo <SortIcon col="importo" /></span>
              </TableHead>
            )}
            {visibleCols.has("cig") && (
              <TableHead className="text-[11px] h-8 cursor-pointer select-none" onClick={() => handleSort("cig")}>
                <span className="flex items-center gap-1">CIG <SortIcon col="cig" /></span>
              </TableHead>
            )}
            {visibleCols.has("centro_costo") && (
              <TableHead className="text-[11px] h-8 cursor-pointer select-none" onClick={() => handleSort("centro_costo")}>
                <span className="flex items-center gap-1">{ALL_COLUMNS.find(c => c.key === "centro_costo")?.label} <SortIcon col="centro_costo" /></span>
              </TableHead>
            )}
            {visibleCols.has("created_at") && (
              <TableHead className="text-[11px] h-8 cursor-pointer select-none" onClick={() => handleSort("created_at")}>
                <span className="flex items-center gap-1">Data caricamento <SortIcon col="created_at" /></span>
              </TableHead>
            )}
            <TableHead className="text-[11px] h-8 w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((doc) => (
            <TableRow key={doc.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelectedDoc(doc)}>
              {visibleCols.has("descrizione") && (
                <TableCell className="text-xs py-1.5" onClick={(e) => e.stopPropagation()}>
                  {editingCell?.id === doc.id && editingCell?.field === "descrizione" ? (
                    <Input value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={saveEditing} onKeyDown={(e) => { if (e.key === "Enter") saveEditing(); if (e.key === "Escape") cancelEditing(); }}
                      className="h-6 text-[10px] w-[180px]" autoFocus />
                  ) : (
                    <div className="flex items-center gap-1.5 cursor-text hover:text-primary transition-colors text-black"
                      onClick={() => startEditing(doc.id, "descrizione", doc.descrizione || doc.file_name)}>
                      <FileText className="h-3.5 w-3.5 text-destructive shrink-0" />
                      <span className="truncate max-w-[180px] text-black">{doc.descrizione || doc.file_name}</span>
                    </div>
                  )}
                </TableCell>
              )}
              {visibleCols.has("file_name") && (
                <TableCell className="text-xs py-1.5 text-muted-foreground">
                  <span className="truncate max-w-[160px] block bg-transparent text-black" title={doc.file_name}>{doc.file_name}</span>
                </TableCell>
              )}
              {visibleCols.has("numero") && (
                <TableCell className="text-xs py-1.5" onClick={(e) => e.stopPropagation()}>
                  {editingCell?.id === doc.id && editingCell?.field === "numero" ? (
                    <Input value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={saveEditing} onKeyDown={(e) => { if (e.key === "Enter") saveEditing(); if (e.key === "Escape") cancelEditing(); }}
                      className="h-6 text-[10px] w-[120px]" autoFocus />
                  ) : (
                    <span className="cursor-text hover:text-primary transition-colors text-black"
                      onClick={() => startEditing(doc.id, "numero", doc.numero || "")}>
                      {doc.numero || "—"}
                    </span>
                  )}
                </TableCell>
              )}
              {visibleCols.has("fornitore") && (
                <TableCell className="text-xs py-1.5" onClick={(e) => e.stopPropagation()}>
                  <FornitoreCellEditor
                    value={doc.fornitore || ""}
                    options={rubricaOptions}
                    open={editingCell?.id === doc.id && editingCell?.field === "fornitore"}
                    onOpenChange={(o) => {
                      if (o) startEditing(doc.id, "fornitore", doc.fornitore || "");
                      else { setEditingCell(null); setEditingValue("") }
                    }}
                    onPick={(name) => handleFornitorePicked(doc.id, name)}
                    onFreeText={(t) => handleFornitoreFreeText(doc.id, t)}
                    placeholder={tipo === "vendita" ? "Seleziona cliente" : "Seleziona fornitore"}
                  />
                </TableCell>
              )}
              {visibleCols.has("data") && (
                <TableCell className="text-xs py-1.5" onClick={(e) => e.stopPropagation()}>
                  {editingCell?.id === doc.id && editingCell?.field === "data_documento" ? (
                    <Input value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={saveEditing} onKeyDown={(e) => { if (e.key === "Enter") saveEditing(); if (e.key === "Escape") cancelEditing(); }}
                      className="h-6 text-[10px] w-[100px]" autoFocus placeholder="dd/mm/yyyy" />
                  ) : (
                    <span className="cursor-text hover:text-primary transition-colors text-black"
                      onClick={() => startEditing(doc.id, "data_documento", doc.data_documento || "")}>
                      {doc.data_documento || "—"}
                    </span>
                  )}
                </TableCell>
              )}
              {visibleCols.has("importo") && (
                <TableCell className="text-xs py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                  {editingCell?.id === doc.id && editingCell?.field === "importo" ? (
                    <Input value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={saveEditing} onKeyDown={(e) => { if (e.key === "Enter") saveEditing(); if (e.key === "Escape") cancelEditing(); }}
                      className="h-6 text-[10px] w-[100px] font-mono text-right" autoFocus />
                  ) : (
                    <span className="font-mono cursor-text hover:text-primary transition-colors text-black"
                      onClick={() => startEditing(doc.id, "importo", doc.importo ? String(doc.importo) : "")}>
                      {doc.importo ? formatCurrency(doc.importo) : "—"}
                    </span>
                  )}
                </TableCell>
              )}
              {visibleCols.has("cig") && (
                <TableCell className="text-xs py-1.5" onClick={(e) => e.stopPropagation()}>
                  {editingCell?.id === doc.id && editingCell?.field === "cig" ? (
                    <Input value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={saveEditing} onKeyDown={(e) => { if (e.key === "Enter") saveEditing(); if (e.key === "Escape") cancelEditing(); }}
                      className="h-6 text-[10px] w-[120px] font-mono" autoFocus />
                  ) : (
                    <span className="font-mono cursor-text hover:text-primary transition-colors text-black text-xs"
                      onClick={() => startEditing(doc.id, "cig", doc.cig || "")}>
                      {doc.cig || "—"}
                    </span>
                  )}
                </TableCell>
              )}
              {visibleCols.has("centro_costo") && (
                <TableCell className="text-xs py-1.5" onClick={(e) => e.stopPropagation()}>
                  {centri.length > 0 ? (
                    <Select value={doc.centro_costo || ""} onValueChange={(val) => updateCentroCosto(doc.id, val)}>
                      <SelectTrigger className="h-6 text-[10px] w-[160px]">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {centri.map((c) => (
                          <SelectItem key={c.id} value={c.codice} className="text-xs">
                            <span className="font-mono">{c.codice}</span>
                            <span className="text-muted-foreground ml-1">- {c.descrizione}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
              {visibleCols.has("created_at") && (
                <TableCell className="text-xs py-1.5 text-muted-foreground whitespace-nowrap text-black">
                  {doc.created_at ? new Date(doc.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                </TableCell>
              )}
              <TableCell className="py-1.5">
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Visualizza PDF" onClick={(e) => { e.stopPropagation(); openPdf(doc); }}>
                    <FileDown className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Rileggi e riclassifica con AI" disabled={reclassifying === doc.id} onClick={(e) => { e.stopPropagation(); handleReclassify(doc); }}>
                    {reclassifying === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-primary" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Visualizza dettaglio" onClick={(e) => { e.stopPropagation(); setSelectedDoc(doc); }}>
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" title="Elimina documento" onClick={(e) => { e.stopPropagation(); deleteDocumento(doc.id, doc.storage_path); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const mainPanel = (isTableOnly: boolean) => (
    <div
      className={`bg-muted/30 border border-border rounded-lg p-4 space-y-3 ${pdfBase64 ? "h-full flex flex-col" : ""} ${pdfDragging ? "ring-2 ring-primary border-primary bg-primary/5" : ""} transition-colors`}
      onDragEnter={handlePdfDragEnter} onDragLeave={handlePdfDragLeave} onDragOver={handlePdfDragOver} onDrop={handlePdfDrop}
    >
      <div className="flex items-center justify-between shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Ricevute e Documenti</h3>
          {documenti.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{documenti.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-[200px]" title="Cerca tra descrizione, nome file, numero, fornitore, CIG">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={documenti.length === 0 ? "Cerca (nessun documento)" : "Filtra documenti..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 text-xs pl-7"
                disabled={documenti.length === 0}
              />
          </div>
          <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs" title="Mostra/nascondi colonne" disabled={documenti.length === 0}>
                  <Columns3 className="h-3.5 w-3.5 mr-1" /> Colonne
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="end">
                {ALL_COLUMNS.map(col => (
                  <label key={col.key} className="flex items-center gap-2 px-2 py-1 hover:bg-accent rounded cursor-pointer">
                    <Checkbox
                      checked={visibleCols.has(col.key)}
                      onCheckedChange={() => toggleCol(col.key)}
                    />
                    <span className="text-xs">{col.label}</span>
                  </label>
                ))}
              </PopoverContent>
          </Popover>
          {!isTableOnly && (
            <>
              <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleUpload} />
               <Button size="sm" variant="outline" title="Carica documenti PDF (ricevute, marche da bollo, affitti)" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                 {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                 {uploading ? "Analisi in corso..." : "Carica PDF"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className={pdfBase64 ? "flex-1 overflow-auto" : ""}>
        {filteredAndSorted.length > 0 ? tableContent(filteredAndSorted) : (
          documenti.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Trascina qui i PDF di ricevute, marche da bollo, affitti e altri documenti
            </p>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nessun documento corrisponde alla ricerca
            </p>
          )
        )}
      </div>
    </div>
  );

  // Table only mode
  if (tableOnly) {
    return (
      <>
        {pdfBase64 ? (
          <div className="rounded-lg overflow-hidden border border-border" style={{ height: 420 }}>
            <ResizablePanelGroup direction="horizontal">
              <ResizablePanel defaultSize={50} minSize={30}>
                <div className="h-full">
                  <PdfViewerPanel base64={pdfBase64} fileName={pdfFileName} onClose={closePdf}
                    extraActions={<Button variant="ghost" size="icon" className="h-7 w-7" onClick={openInNewTab} title="Apri in nuova scheda"><ExternalLink className="h-3.5 w-3.5" /></Button>} />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50} minSize={30}>
                <div className="h-full overflow-auto p-4">{mainPanel(true)}</div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        ) : mainPanel(true)}
        <Sheet open={!!selectedDoc} onOpenChange={(open) => !open && setSelectedDoc(null)}>
          <SheetContent className="sm:max-w-[500px] overflow-y-auto">
            {selectedDoc && <DocDetailContent doc={selectedDoc} centroLookup={centroLookup} onDelete={() => { deleteDocumento(selectedDoc.id, selectedDoc.storage_path); setSelectedDoc(null); }} />}
          </SheetContent>
        </Sheet>
        {reviewDialogEl}
      </>
    );
  }

  // Default: full section
  return (
    <>
      {pdfBase64 ? (
        <div className="rounded-lg overflow-hidden border border-border" style={{ height: 420 }}>
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={50} minSize={30}>
              <div className="h-full">
                <PdfViewerPanel base64={pdfBase64} fileName={pdfFileName} onClose={closePdf}
                  extraActions={<Button variant="ghost" size="icon" className="h-7 w-7" onClick={openInNewTab} title="Apri in nuova scheda"><ExternalLink className="h-3.5 w-3.5" /></Button>} />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={30}>
              <div className="h-full overflow-auto p-4">{mainPanel(false)}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : mainPanel(false)}
      <Sheet open={!!selectedDoc} onOpenChange={(open) => !open && setSelectedDoc(null)}>
        <SheetContent className="sm:max-w-[500px] overflow-y-auto">
          {selectedDoc && <DocDetailContent doc={selectedDoc} centroLookup={centroLookup} onDelete={() => { deleteDocumento(selectedDoc.id, selectedDoc.storage_path); setSelectedDoc(null); }} />}
        </SheetContent>
      </Sheet>
      {reviewDialogEl}
    </>
  );
}

function DocDetailContent({ doc, centroLookup, onDelete }: { doc: DocumentoAcquisto; centroLookup: Map<string, string>; onDelete: () => void }) {
  const centroLabel = doc.centro_costo
    ? `${doc.centro_costo} - ${centroLookup.get(doc.centro_costo) || ""}`
    : null;
  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4 text-destructive" />
          {doc.descrizione || doc.file_name}
        </SheetTitle>
      </SheetHeader>
      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground">DETTAGLI</h4>
          <DetailRow label="File" value={doc.file_name} />
          <DetailRow label="Numero" value={doc.numero} />
          <DetailRow label="Fornitore" value={doc.fornitore} />
          <DetailRow label="Data" value={doc.data_documento} />
          <DetailRow label="Importo" value={doc.importo ? formatCurrency(doc.importo) : null} />
          <DetailRow label="CIG" value={doc.cig || null} />
          <DetailRow label="Centro Costo" value={centroLabel} />
        </div>
        {doc.ai_summary && (
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-muted-foreground">RIEPILOGO AI</h4>
            <p className="text-xs text-foreground bg-muted/50 rounded-md p-2">{doc.ai_summary}</p>
          </div>
        )}
        {doc.parsed_text && (
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-muted-foreground">TESTO ESTRATTO</h4>
            <ScrollArea className="h-[300px]">
              <pre className="text-[10px] font-mono bg-muted p-3 rounded-md whitespace-pre-wrap break-all">{doc.parsed_text}</pre>
            </ScrollArea>
          </div>
        )}
        <Button size="sm" variant="destructive" title="Elimina questo documento" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5 mr-1" />Elimina
        </Button>
      </div>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border/50">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-right max-w-[60%]">{value || "—"}</span>
    </div>
  );
}

interface FornitoreCellEditorProps {
  value: string;
  options: { id: string; denominazione: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (denominazione: string) => void;
  onFreeText: (typed: string) => void;
  placeholder: string;
}

function FornitoreCellEditor({ value, options, open, onOpenChange, onPick, onFreeText, placeholder }: FornitoreCellEditorProps) {
  const [query, setQuery] = useState("");
  // Reset query when opening
  const handleOpenChange = useCallback((o: boolean) => {
    if (o) setQuery("");
    onOpenChange(o);
  }, [onOpenChange]);

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return options.slice(0, 200);
    return options.filter((o) => norm(o.denominazione).includes(q)).slice(0, 200);
  }, [options, query]);
  const exactMatch = useMemo(
    () => options.find((o) => norm(o.denominazione) === norm(query)),
    [options, query]
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="truncate max-w-[160px] text-left cursor-pointer hover:text-primary transition-colors"
          title={value || placeholder}
        >
          {value || <span className="text-muted-foreground">—</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={query}
            onValueChange={setQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered.length === 0 && query.trim()) {
                e.preventDefault();
                onFreeText(query);
              }
            }}
          />
          <CommandList>
            <CommandEmpty>
              <div className="py-2 px-2 space-y-2">
                <p className="text-xs text-muted-foreground">Nessun contatto trovato.</p>
                {query.trim() && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-xs"
                    onClick={() => onFreeText(query)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Aggiungi "{query.trim()}"
                  </Button>
                )}
              </div>
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.denominazione}
                  onSelect={() => onPick(o.denominazione)}
                  className="text-xs justify-start text-left"
                >
                  <span className="truncate flex-1 text-left">{o.denominazione}</span>
                  {value === o.denominazione && <Check className="ml-2 h-3 w-3 shrink-0 opacity-70" />}
                </CommandItem>
              ))}
              {query.trim() && !exactMatch && filtered.length > 0 && (
                <CommandItem
                  value={`__new__${query}`}
                  onSelect={() => onFreeText(query)}
                  className="text-xs text-primary justify-start text-left"
                >
                  <Plus className="mr-2 h-3 w-3" />
                  Aggiungi "{query.trim()}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
