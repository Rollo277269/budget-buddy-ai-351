import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { XmlInvoiceRecord } from "@/hooks/useXmlInvoices";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { computeSuggestions, MatchSuggestion } from "@/lib/invoiceMatchSuggestions";
import { formatCurrency } from "@/lib/format";
import { Link2, Search, Star } from "lucide-react";

interface Props {
  record: XmlInvoiceRecord;
  invoices: (SaleInvoice | PurchaseInvoice)[];
  xmlMap: Map<string, XmlInvoiceRecord>;
  tipo: "vendita" | "acquisto";
  onManualMatch: (xmlId: string, anno: number, numero: number) => void;
}

export function XmlMatchSection({ record, invoices, xmlMap, tipo, onManualMatch }: Props) {
  const [showSearch, setShowSearch] = useState(false);
  const [comboValue, setComboValue] = useState("");

  const suggestions = useMemo(
    () => computeSuggestions(record, invoices, xmlMap, tipo),
    [record, invoices, xmlMap, tipo]
  );

  const comboOptions = useMemo(() => {
    const available = invoices.filter((inv) => !xmlMap.has(`${inv.anno}-${inv.numero}`));
    return available.map((inv) => {
      const name = tipo === "vendita" ? (inv as SaleInvoice).cliente : (inv as PurchaseInvoice).fornitore;
      return {
        value: `${inv.anno}-${inv.numero}`,
        label: `${inv.numero}/${inv.anno} — ${name || "?"} — ${formatCurrency(inv.totale)}`,
      };
    });
  }, [invoices, xmlMap, tipo]);

  const handleComboSelect = (val: string) => {
    setComboValue(val);
    if (val) {
      const [anno, numero] = val.split("-").map(Number);
      if (anno && numero) onManualMatch(record.id, anno, numero);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 60) return "text-green-600 dark:text-green-400";
    if (score >= 30) return "text-yellow-600 dark:text-yellow-400";
    return "text-muted-foreground";
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-primary" />
        <h4 className="text-xs font-semibold">ASSOCIA A FATTURA</h4>
      </div>

      {suggestions.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">Suggerimenti basati su importo, data e denominazione:</p>
          {suggestions.map((s) => (
            <button
              key={`${s.invoice.anno}-${s.invoice.numero}`}
              className="w-full flex items-center justify-between gap-2 p-2 rounded-md border border-border hover:bg-accent/50 transition-colors text-left group"
              onClick={() => onManualMatch(record.id, s.invoice.anno, s.invoice.numero)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-semibold">{s.invoice.label}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {s.invoice.cliente || s.invoice.fornitore || ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {s.reasons.map((r) => (
                    <Badge key={r} variant="secondary" className="text-[9px] h-4 px-1.5">
                      {r}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <span className="text-xs font-mono">{formatCurrency(s.invoice.totale)}</span>
                <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${scoreColor(s.score)}`}>
                  <Star className="h-2.5 w-2.5" />
                  {s.score}%
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nessun suggerimento trovato.</p>
      )}

      <div className="pt-2 border-t border-border">
        {!showSearch ? (
          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowSearch(true)}>
            <Search className="h-3 w-3 mr-1.5" />
            Cerca manualmente
          </Button>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">Cerca tra le fatture disponibili:</p>
            <Combobox
              value={comboValue}
              onValueChange={handleComboSelect}
              options={comboOptions}
              placeholder="Cerca fattura per numero, nome..."
              searchPlaceholder="Cerca..."
              emptyText="Nessuna fattura trovata"
              className="h-8 text-xs"
            />
          </div>
        )}
      </div>
    </div>
  );
}
