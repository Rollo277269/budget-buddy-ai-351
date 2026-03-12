import { forwardRef, useEffect, useRef, useState, useCallback } from "react";
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PdfViewerPanelProps {
  base64: string;
  fileName?: string;
  onClose: () => void;
}

export const PdfViewerPanel = forwardRef<HTMLDivElement, PdfViewerPanelProps>(
  function PdfViewerPanel({ base64, fileName, onClose }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [scale, setScale] = useState(1.5);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderTaskRef = useRef<any>(null);

    // Load PDF
    useEffect(() => {
      const byteChars = atob(base64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);

      const loadingTask = pdfjsLib.getDocument({ data: byteArray });
      loadingTask.promise.then((doc) => {
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
      });

      return () => { loadingTask.destroy(); };
    }, [base64]);

    // Render page
    const renderPage = useCallback(async (pageNum: number) => {
      if (!pdfDoc || !canvasRef.current) return;

      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderTask = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = renderTask;

      try {
        await renderTask.promise;
      } catch (e: any) {
        if (e?.name !== "RenderingCancelledException") console.error(e);
      }
    }, [pdfDoc, scale]);

    useEffect(() => {
      renderPage(currentPage);
    }, [currentPage, renderPage]);

    const handleDownload = () => {
      const byteChars = atob(base64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "fattura.pdf";
      a.click();
      URL.revokeObjectURL(url);
    };

    return (
      <div ref={ref} className="flex flex-col h-full border-l border-border bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
          <span className="text-xs font-semibold truncate">{fileName || "PDF"}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleDownload} title="Scarica PDF">
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs font-mono text-muted-foreground">{currentPage}/{totalPages}</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setScale((s) => Math.max(0.5, s - 0.25))} title="Riduci">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs font-mono text-muted-foreground w-10 text-center">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setScale((s) => Math.min(3, s + 0.25))} title="Ingrandisci">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-muted/20 flex justify-center p-4">
          <canvas ref={canvasRef} className="shadow-lg" />
        </div>
      </div>
    );
  }
);
