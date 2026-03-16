import { useState, useRef, useCallback, useMemo } from "react";
import { useDocumentiAcquisto, DocumentoAcquisto } from "@/hooks/useDocumentiAcquisto";
import { useCentriData } from "@/hooks/useCentri";
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
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/format";
import { Upload, FileText, Trash2, Loader2, Receipt, Eye, Search, FileDown, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Columns3 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

async function getPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  return pdfjsLib;
}

async function extractTextFromPdf(file: File): Promise<string> {
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

/* ── Column definitions ── */
type ColumnKey = "descrizione" | "fornitore" | "data" | "importo" | "cig" | "centro_costo";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "descrizione", label: "Documento", defaultVisible: true },
  { key: "fornitore", label: "Fornitore", defaultVisible: true },
  { key: "data", label: "Data", defaultVisible: true },
  { key: "importo", label: "Importo", defaultVisible: true },
  { key: "cig", label: "CIG", defaultVisible: true },
  { key: "centro_costo", label: "Centro Costo", defaultVisible: true },
];

type SortDir = "asc" | "desc" | null;

interface Props {
  dropZoneOnly?: boolean;
  tableOnly?: boolean;
}

export function DocumentiAcquistoSection({ dropZoneOnly, tableOnly }: Props) {
  const { documenti, loading, uploadDocumento, deleteDocumento, updateCentroCosto, updateCig } = useDocumentiAcquisto();
  const { centriCosto } = useCentriData();
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

  // Editing CIG inline
  const [editingCigId, setEditingCigId] = useState<string | null>(null);
  const [editingCigValue, setEditingCigValue] = useState("");

  const centroLookup = useMemo(() => new Map(centriCosto.map(c => [c.codice, c.descrizione])), [centriCosto]);

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
      case "fornitore": return (doc.fornitore || "").toLowerCase();
      case "data": return doc.data_documento || "";
      case "importo": return doc.importo || 0;
      case "cig": return (doc.cig || "").toLowerCase();
      case "centro_costo": return (doc.centro_costo || "").toLowerCase();
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = documenti;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        (d.descrizione || "").toLowerCase().includes(q) ||
        (d.file_name || "").toLowerCase().includes(q) ||
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

  const processPdfFiles = useCallback(async (files: File[]) => {
    const pdfFiles = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) { toast.error("Seleziona file PDF"); return; }
    setUploading(true);
    for (const file of pdfFiles) {
      try {
        const text = await extractTextFromPdf(file);
        await uploadDocumento(file, text);
      } catch (err) {
        console.error(`Error processing ${file.name}:`, err);
        toast.error(`Errore elaborazione ${file.name}`);
      }
    }
    setUploading(false);
  }, [uploadDocumento]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    await processPdfFiles(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [processPdfFiles]);

  const handlePdfDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); pdfDragCounter.current++; setPdfDragging(true); }, []);
  const handlePdfDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); pdfDragCounter.current--; if (pdfDragCounter.current === 0) setPdfDragging(false); }, []);
  const handlePdfDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handlePdfDrop = useCallback(async (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); pdfDragCounter.current = 0; setPdfDragging(false); await processPdfFiles(Array.from(e.dataTransfer.files)); }, [processPdfFiles]);

  const saveCig = useCallback(async (id: string) => {
    await updateCig(id, editingCigValue.trim());
    setEditingCigId(null);
    setEditingCigValue("");
  }, [updateCig, editingCigValue]);

  // Drop zone only mode
  if (dropZoneOnly) {
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
    <ScrollArea className="max-h-[300px]">
      <Table>
        <TableHeader>
          <TableRow>
            {visibleCols.has("descrizione") && (
              <TableHead className="text-[11px] h-8 cursor-pointer select-none" onClick={() => handleSort("descrizione")}>
                <span className="flex items-center gap-1">Documento <SortIcon col="descrizione" /></span>
              </TableHead>
            )}
            {visibleCols.has("fornitore") && (
              <TableHead className="text-[11px] h-8 cursor-pointer select-none" onClick={() => handleSort("fornitore")}>
                <span className="flex items-center gap-1">Fornitore <SortIcon col="fornitore" /></span>
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
                <span className="flex items-center gap-1">Centro Costo <SortIcon col="centro_costo" /></span>
              </TableHead>
            )}
            <TableHead className="text-[11px] h-8 w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((doc) => (
            <TableRow key={doc.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelectedDoc(doc)}>
              {visibleCols.has("descrizione") && (
                <TableCell className="text-xs py-1.5">
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-destructive shrink-0" />
                    <span className="truncate max-w-[180px]">{doc.descrizione || doc.file_name}</span>
                  </div>
                </TableCell>
              )}
              {visibleCols.has("fornitore") && (
                <TableCell className="text-xs py-1.5 truncate max-w-[140px]">{doc.fornitore || "—"}</TableCell>
              )}
              {visibleCols.has("data") && (
                <TableCell className="text-xs py-1.5">{doc.data_documento || "—"}</TableCell>
              )}
              {visibleCols.has("importo") && (
                <TableCell className="text-xs py-1.5 text-right font-mono">
                  {doc.importo ? formatCurrency(doc.importo) : "—"}
                </TableCell>
              )}
              {visibleCols.has("cig") && (
                <TableCell className="text-xs py-1.5" onClick={(e) => e.stopPropagation()}>
                  {editingCigId === doc.id ? (
                    <Input
                      value={editingCigValue}
                      onChange={(e) => setEditingCigValue(e.target.value)}
                      onBlur={() => saveCig(doc.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveCig(doc.id); if (e.key === "Escape") setEditingCigId(null); }}
                      className="h-6 text-[10px] w-[120px] font-mono"
                      autoFocus
                    />
                  ) : (
                    <span
                      className="font-mono cursor-text hover:text-primary transition-colors"
                      onClick={() => { setEditingCigId(doc.id); setEditingCigValue(doc.cig || ""); }}
                    >
                      {doc.cig || "—"}
                    </span>
                  )}
                </TableCell>
              )}
              {visibleCols.has("centro_costo") && (
                <TableCell className="text-xs py-1.5" onClick={(e) => e.stopPropagation()}>
                  {centriCosto.length > 0 ? (
                    <Select value={doc.centro_costo || ""} onValueChange={(val) => updateCentroCosto(doc.id, val)}>
                      <SelectTrigger className="h-6 text-[10px] w-[160px]">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {centriCosto.map((c) => (
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
              <TableCell className="py-1.5">
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Visualizza PDF" onClick={(e) => { e.stopPropagation(); openPdf(doc); }}>
                    <FileDown className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); setSelectedDoc(doc); }}>
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={(e) => { e.stopPropagation(); deleteDocumento(doc.id, doc.storage_path); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );

  const mainPanel = (isTableOnly: boolean) => (
    <div className={`bg-muted/30 border border-border rounded-lg p-4 space-y-3 ${pdfBase64 ? "h-full flex flex-col" : ""}`}>
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Ricevute e Documenti</h3>
          {documenti.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{documenti.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {documenti.length > 0 && (
            <div className="relative w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filtra documenti..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 text-xs pl-7"
              />
            </div>
          )}
          {documenti.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs">
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
          )}
          {!isTableOnly && (
            <>
              <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleUpload} />
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                {uploading ? "Analisi in corso..." : "Carica PDF"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className={pdfBase64 ? "flex-1 overflow-auto" : ""}>
        {filteredAndSorted.length > 0 ? tableContent(filteredAndSorted) : (
          !isTableOnly && documenti.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Carica PDF di ricevute, marche da bollo, affitti e altri documenti non fiscali XML
            </p>
          )
        )}
      </div>
    </div>
  );

  // Table only mode
  if (tableOnly) {
    if (documenti.length === 0) return null;
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
        <Button size="sm" variant="destructive" onClick={onDelete}>
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
