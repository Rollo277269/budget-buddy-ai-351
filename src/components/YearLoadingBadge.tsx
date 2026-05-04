import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { subscribeYearLoading } from "@/hooks/useInvoiceData";

/**
 * Floating badge shown while invoices for a specific year are being fetched
 * on-demand (years outside the recent-window preloaded at startup).
 */
export function YearLoadingBadge() {
  const [year, setYear] = useState<number | null>(null);
  useEffect(() => subscribeYearLoading(setYear), []);
  if (year == null) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="flex items-center gap-2 rounded-full border bg-card/95 backdrop-blur px-3 py-1.5 shadow-lg text-xs font-medium">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span>Caricamento dati {year}…</span>
      </div>
    </div>
  );
}