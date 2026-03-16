import { forwardRef, useEffect, useRef, useState, useCallback } from "react";
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

async function getPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  return pdfjsLib;
}

interface PdfViewerPanelProps {
  base64: string;
  fileName?: string;
  onClose: () => void;
  extraActions?: React.ReactNode;
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

export const PdfViewerPanel = forwardRef<HTMLDivElement, PdfViewerPanelProps>(
  function PdfViewerPanel({ base64, fileName, onClose, extraActions }, ref) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [zoom, setZoom] = useState(1); // 1 = fit-width
    const [fitWidth, setFitWidth] = useState(true);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderTaskRef = useRef<any>(null);
    const containerWidthRef = useRef(0);

    // Load PDF
    useEffect(() => {
      let cancelled = false;
      let loadingTask: any;
      (async () => {
        const pdfjsLib = await getPdfjs();
        const byteChars = atob(base64);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);

        loadingTask = pdfjsLib.getDocument({ data: byteArray });
        const doc = await loadingTask.promise;
        if (!cancelled) {
          setPdfDoc(doc);
          setTotalPages(doc.numPages);
          setCurrentPage(1);
          setFitWidth(true);
        }
      })();
      return () => { cancelled = true; if (loadingTask) loadingTask.destroy(); };
    }, [base64]);

    const renderPage = useCallback(async (pageNum: number) => {
      if (!pdfDoc || !canvasRef.current || !scrollRef.current) return;
      if (renderTaskRef.current) renderTaskRef.current.cancel();

      const page = await pdfDoc.getPage(pageNum);
      const containerWidth = scrollRef.current.clientWidth - 32;
      containerWidthRef.current = containerWidth;

      const unscaledViewport = page.getViewport({ scale: 1 });
      const fitScale = containerWidth / unscaledViewport.width;
      const scale = fitWidth ? fitScale : fitScale * zoom;
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const renderTask = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = renderTask;
      try { await renderTask.promise; } catch (e: any) {
        if (e?.name !== "RenderingCancelledException") console.error(e);
      }
    }, [pdfDoc, zoom, fitWidth]);

    useEffect(() => { renderPage(currentPage); }, [currentPage, renderPage]);

    // Re-render on resize
    useEffect(() => {
      if (!scrollRef.current || !pdfDoc) return;
      const ro = new ResizeObserver(() => renderPage(currentPage));
      ro.observe(scrollRef.current);
      return () => ro.disconnect();
    }, [pdfDoc, currentPage, renderPage]);

    const handleZoomIn = () => {
      setFitWidth(false);
      setZoom((z) => {
        const next = ZOOM_STEPS.find((s) => s > z);
        return next ?? z;
      });
    };

    const handleZoomOut = () => {
      setFitWidth(false);
      setZoom((z) => {
        const prev = [...ZOOM_STEPS].reverse().find((s) => s < z);
        return prev ?? z;
      });
    };

    const handleFitWidth = () => {
      setFitWidth(true);
      setZoom(1);
    };

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

    const zoomPercent = fitWidth ? "Auto" : `${Math.round(zoom * 100)}%`;

    return (
      <div ref={ref} className="flex flex-col h-full border-l border-border bg-background">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card shrink-0">
          <span className="text-sm font-semibold truncate max-w-[200px]" title={fileName}>
            {fileName || "PDF"}
          </span>

          <div className="flex items-center gap-1">
            {/* Page navigation */}
            {totalPages > 1 && (
              <div className="flex items-center gap-0.5 mr-2 border-r border-border pr-2">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-mono text-muted-foreground min-w-[3ch] text-center">
                  {currentPage}/{totalPages}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Zoom controls */}
            <div className="flex items-center gap-0.5 mr-2 border-r border-border pr-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut} title="Riduci">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-[11px] font-mono text-muted-foreground min-w-[4ch] text-center">
                {zoomPercent}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn} title="Ingrandisci">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleFitWidth} title="Adatta alla larghezza">
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Extra actions */}
            {extraActions}

            {/* Actions */}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload} title="Scarica PDF">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Chiudi">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Canvas area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto bg-muted/30 flex justify-center p-4"
        >
          <div className="shadow-lg rounded-sm bg-white">
            <canvas ref={canvasRef} className="block" />
          </div>
        </div>
      </div>
    );
  }
);
