import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { XmlInvoiceRecord } from "@/hooks/useXmlInvoices";
import { formatCurrency } from "@/lib/format";
import { Search, FileText, Link2, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  xmlRecords: XmlInvoiceRecord[];
  invoiceAnno: number;
  invoiceNumero: number;
  invoiceName: string; // cliente or fornitore
  invoiceTotale: number;
  onMatch: (xmlId: string, anno: number, numero: number) => void;
}

export function XmlPickerSheet({
  open, onOpenChange, xmlRecords, invoiceAnno, invoiceNumero, invoiceName, invoiceTotale, onMatch
}: Props) {
  const [search, setSearch] = useState("");

  // Show unmatched XMLs, sorted by relevance to this invoice
  const scored = useMemo(() => {
    const unmatched = xmlRecords.filter(r => !r.matched);
    const q = search.toLowerCase();
    const filtered = q
      ? unmatched.filter(r =>
          (r.file_name || "").toLowerCase().includes(q) ||
          (r.cedente_denominazione || "").toLowerCase().includes(q) ||
          (r.cessionario_denominazione || "").toLowerCase().includes(q) ||
          String(r.numero || "").includes(q)
        )
      : unmatched;

    // Score by similarity
    return filtered.map(r => {
      let score = 0;
      // Amount match
      if (r.importo_totale && Math.abs(r.importo_totale - invoiceTotale) < 0.02) score += 50;
      else if (r.importo_totale && Math.abs(r.importo_totale - invoiceTotale) < invoiceTotale * 0.05) score += 20;
      // Name match
      const xmlName = (r.cedente_denominazione || r.cessionario_denominazione || "").toLowerCase();
      const invName = invoiceName.toLowerCase();
      if (xmlName && invName && (xmlName.includes(invName) || invName.includes(xmlName))) score += 30;
      // Year match
      if (r.anno === invoiceAnno) score += 10;
      // Number match
      if (r.numero === invoiceNumero) score += 10;
      return { record: r, score };
    }).sort((a, b) => b.score - a.score);
  }, [xmlRecords, search, invoiceAnno, invoiceNumero, invoiceName, invoiceTotale]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Link2 className="h-4 w-4" />
            Associa XML a fattura {invoiceNumero}/{invoiceAnno}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">{invoiceName}</span> — {formatCurrency(invoiceTotale)}
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca per nome, numero, file..."
              className="pl-8 h-9 text-sm"
            />
            {search && (
              <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => setSearch("")}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          <ScrollArea className="h-[calc(100vh-220px)]">
            {scored.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Nessun XML non associato disponibile
              </div>
            ) : (
              <div className="space-y-1.5">
                {scored.map(({ record: r, score }) => (
                  <button
                    key={r.id}
                    className="w-full flex items-center justify-between gap-2 p-3 rounded-md border border-border hover:bg-accent/50 transition-colors text-left group"
                    onClick={() => {
                      onMatch(r.id, invoiceAnno, invoiceNumero);
                      onOpenChange(false);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium truncate">{r.file_name}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{r.cedente_denominazione || r.cessionario_denominazione || "—"}</span>
                        <span>·</span>
                        <span>{r.numero}/{r.anno}</span>
                      </div>
                      {score > 0 && (
                        <div className="flex gap-1 mt-1">
                          {r.importo_totale && Math.abs(r.importo_totale - invoiceTotale) < 0.02 && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">Importo uguale</Badge>
                          )}
                          {(() => {
                            const xmlName = (r.cedente_denominazione || r.cessionario_denominazione || "").toLowerCase();
                            const invName = invoiceName.toLowerCase();
                            return xmlName && invName && (xmlName.includes(invName) || invName.includes(xmlName));
                          })() && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">Nome simile</Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono">{r.importo_totale ? formatCurrency(r.importo_totale) : "—"}</span>
                      {score > 0 && (
                        <div className="text-[10px] text-green-600 font-medium">{score}%</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
