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
import { formatCurrency } from "@/lib/format";
import { Upload, FileText, Trash2, Loader2, Receipt, Eye, FileDown, Search } from "lucide-react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

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

interface Props {
  dropZoneOnly?: boolean;
  tableOnly?: boolean;
}

export function DocumentiAcquistoSection({ dropZoneOnly, tableOnly }: Props) {
  const { documenti, loading, uploadDocumento, deleteDocumento, updateCentroCosto } = useDocumentiAcquisto();
  const { centriCosto } = useCentriData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentoAcquisto | null>(null);
  const [pdfDragging, setPdfDragging] = useState(false);
  const pdfDragCounter = useRef(0);
  const [searchQuery, setSearchQuery] = useState("");

  const centroLookup = useMemo(() => new Map(centriCosto.map(c => [c.codice, c.descrizione])), [centriCosto]);

  const filteredDocumenti = useMemo(() => {
    if (!searchQuery.trim()) return documenti;
    const q = searchQuery.toLowerCase();
    return documenti.filter(d =>
      (d.descrizione || "").toLowerCase().includes(q) ||
      (d.file_name || "").toLowerCase().includes(q) ||
      (d.fornitore || "").toLowerCase().includes(q)
    );
  }, [documenti, searchQuery]);

  const processPdfFiles = useCallback(async (files: File[]) => {
    const pdfFiles = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) {
      toast.error("Seleziona file PDF");
      return;
    }
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

  // PDF drag handlers
  const handlePdfDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    pdfDragCounter.current++;
    setPdfDragging(true);
  }, []);
  const handlePdfDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    pdfDragCounter.current--;
    if (pdfDragCounter.current === 0) setPdfDragging(false);
  }, []);
  const handlePdfDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);
  const handlePdfDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    pdfDragCounter.current = 0;
    setPdfDragging(false);
    await processPdfFiles(Array.from(e.dataTransfer.files));
  }, [processPdfFiles]);

  // Drop zone only mode - renders just the drag target (no loading dependency)
  if (dropZoneOnly) {
    return (
      <>
        <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleUpload} />
        <div
          className={`relative border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer ${pdfDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}
          onDragEnter={handlePdfDragEnter}
          onDragLeave={handlePdfDragLeave}
          onDragOver={handlePdfDragOver}
          onDrop={handlePdfDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-xs font-medium">Analisi in corso...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
              <Receipt className="h-5 w-5" />
              <span className="text-xs font-medium">Trascina file PDF</span>
              <span className="text-[10px]">Ricevute, marche da bollo, affitti</span>
            </div>
          )}
        </div>
      </>
    );
  }

  if (loading) return null;

  // Table only mode - renders the documents list
  if (tableOnly) {
    if (documenti.length === 0) return null;

    return (
      <>
        <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Ricevute e Documenti</h3>
              <Badge variant="secondary" className="text-[10px]">{documenti.length}</Badge>
            </div>
          </div>

          <ScrollArea className="max-h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] h-8">Documento</TableHead>
                  <TableHead className="text-[11px] h-8">Fornitore</TableHead>
                  <TableHead className="text-[11px] h-8">Data</TableHead>
                  <TableHead className="text-[11px] h-8 text-right">Importo</TableHead>
                  <TableHead className="text-[11px] h-8">Centro Costo</TableHead>
                  <TableHead className="text-[11px] h-8 w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documenti.map((doc) => (
                  <TableRow key={doc.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelectedDoc(doc)}>
                    <TableCell className="text-xs py-1.5">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-destructive shrink-0" />
                        <span className="truncate max-w-[180px]">{doc.descrizione || doc.file_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs py-1.5 truncate max-w-[140px]">{doc.fornitore || "—"}</TableCell>
                    <TableCell className="text-xs py-1.5">{doc.data_documento || "—"}</TableCell>
                    <TableCell className="text-xs py-1.5 text-right font-mono">
                      {doc.importo ? formatCurrency(doc.importo) : "—"}
                    </TableCell>
                    <TableCell className="text-xs py-1.5" onClick={(e) => e.stopPropagation()}>
                      {centriCosto.length > 0 ? (
                        <Select
                          value={doc.centro_costo || ""}
                          onValueChange={(val) => updateCentroCosto(doc.id, val)}
                        >
                          <SelectTrigger className="h-6 text-[10px] w-[120px]">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {centriCosto.map((c) => (
                              <SelectItem key={c.id} value={c.codice} className="text-xs">{c.codice}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); setSelectedDoc(doc); }}>
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={(e) => {
                          e.stopPropagation();
                          deleteDocumento(doc.id, doc.storage_path);
                        }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        {/* Detail Sheet */}
        <Sheet open={!!selectedDoc} onOpenChange={(open) => !open && setSelectedDoc(null)}>
          <SheetContent className="sm:max-w-[500px] overflow-y-auto">
            {selectedDoc && <DocDetailContent doc={selectedDoc} onDelete={() => { deleteDocumento(selectedDoc.id, selectedDoc.storage_path); setSelectedDoc(null); }} />}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Default: full section (drop zone + table)
  return (
    <>
      <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Ricevute e Documenti</h3>
            {documenti.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">{documenti.length}</Badge>
            )}
          </div>
          <div>
            <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleUpload} />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
              {uploading ? "Analisi in corso..." : "Carica PDF"}
            </Button>
          </div>
        </div>

        {documenti.length > 0 && (
          <ScrollArea className="max-h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] h-8">Documento</TableHead>
                  <TableHead className="text-[11px] h-8">Fornitore</TableHead>
                  <TableHead className="text-[11px] h-8">Data</TableHead>
                  <TableHead className="text-[11px] h-8 text-right">Importo</TableHead>
                  <TableHead className="text-[11px] h-8">Centro Costo</TableHead>
                  <TableHead className="text-[11px] h-8 w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documenti.map((doc) => (
                  <TableRow key={doc.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelectedDoc(doc)}>
                    <TableCell className="text-xs py-1.5">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-destructive shrink-0" />
                        <span className="truncate max-w-[180px]">{doc.descrizione || doc.file_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs py-1.5 truncate max-w-[140px]">{doc.fornitore || "—"}</TableCell>
                    <TableCell className="text-xs py-1.5">{doc.data_documento || "—"}</TableCell>
                    <TableCell className="text-xs py-1.5 text-right font-mono">
                      {doc.importo ? formatCurrency(doc.importo) : "—"}
                    </TableCell>
                    <TableCell className="text-xs py-1.5" onClick={(e) => e.stopPropagation()}>
                      {centriCosto.length > 0 ? (
                        <Select
                          value={doc.centro_costo || ""}
                          onValueChange={(val) => updateCentroCosto(doc.id, val)}
                        >
                          <SelectTrigger className="h-6 text-[10px] w-[120px]">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {centriCosto.map((c) => (
                              <SelectItem key={c.id} value={c.codice} className="text-xs">{c.codice}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); setSelectedDoc(doc); }}>
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={(e) => {
                          e.stopPropagation();
                          deleteDocumento(doc.id, doc.storage_path);
                        }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        {documenti.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Carica PDF di ricevute, marche da bollo, affitti e altri documenti non fiscali XML
          </p>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedDoc} onOpenChange={(open) => !open && setSelectedDoc(null)}>
        <SheetContent className="sm:max-w-[500px] overflow-y-auto">
          {selectedDoc && <DocDetailContent doc={selectedDoc} onDelete={() => { deleteDocumento(selectedDoc.id, selectedDoc.storage_path); setSelectedDoc(null); }} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function DocDetailContent({ doc, onDelete }: { doc: DocumentoAcquisto; onDelete: () => void }) {
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
          <DetailRow label="Centro Costo" value={doc.centro_costo} />
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
              <pre className="text-[10px] font-mono bg-muted p-3 rounded-md whitespace-pre-wrap break-all">
                {doc.parsed_text}
              </pre>
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
