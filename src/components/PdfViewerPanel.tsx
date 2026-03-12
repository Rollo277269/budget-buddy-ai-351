import { forwardRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PdfViewerPanelProps {
  base64: string;
  fileName?: string;
  onClose: () => void;
}

export const PdfViewerPanel = forwardRef<HTMLDivElement, PdfViewerPanelProps>(
  function PdfViewerPanel({ base64, fileName, onClose }, ref) {
    const byteChars = atob(base64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArray], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    return (
      <div ref={ref} className="flex flex-col h-full border-l border-border bg-background">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
          <span className="text-xs font-semibold truncate">{fileName || "PDF"}</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <iframe src={url} className="flex-1 w-full" title="PDF Viewer" />
      </div>
    );
  }
);