import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { XmlInvoiceRecord } from "@/hooks/useXmlInvoices";
import { formatCurrency } from "@/lib/format";
import { Search, FileText, Link2, X, Pencil, Check, Hash } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  xmlRecords: XmlInvoiceRecord[];
  invoiceAnno: number;
  invoiceNumero: number;
  invoiceName: string;
  invoiceTotale: number;
  invoiceImposta?: number;
  invoiceCig?: string;
  invoiceNumeroFornitore?: string;
  tipo?: "vendita" | "acquisto";
  onMatch: (xmlId: string, anno: number, numero: number) => void;
  onCigChange?: (anno: number, numero: number, cig: string) => void;
}

export function XmlPickerSheet({
  open, onOpenChange, xmlRecords, invoiceAnno, invoiceNumero, invoiceName, invoiceTotale,
  invoiceImposta, invoiceCig, invoiceNumeroFornitore, tipo = "vendita", onMatch, onCigChange
}: Props) {
  const [search, setSearch] = useState("");
  const [editingCig, setEditingCig] = useState(false);
  const [cigValue, setCigValue] = useState(invoiceCig || "");

  // Sync cigValue when the sheet opens with a new invoice
  const [prevKey, setPrevKey] = useState("");
  const key = `${invoiceAnno}-${invoiceNumero}`;
  if (key !== prevKey) {
    setPrevKey(key);
    setCigValue(invoiceCig || "");
    setEditingCig(false);
  }

  const handleSaveCig = () => {
    if (onCigChange) {
      onCigChange(invoiceAnno, invoiceNumero, cigValue.trim());
    }
    setEditingCig(false);
  };

  const scored = useMemo(() => {
    const unmatched = xmlRecords.filter(r => !r.matched);
    const q = search.toLowerCase();
    const filtered = q
      ? unmatched.filter(r =>
          (r.file_name || "").toLowerCase().includes(q) ||
          (r.cedente_denominazione || "").toLowerCase().includes(q) ||
          (r.cessionario_denominazione || "").toLowerCase().includes(q) ||
          String(r.numero || "").includes(q) ||
          (r.numero_documento || "").toLowerCase().includes(q)
        )
      : unmatched;

    return filtered.map(r => {
      let score = 0;
      if (r.importo_totale && Math.abs(r.importo_totale - invoiceTotale) < 0.02) score += 50;
      else if (r.importo_totale && Math.abs(r.importo_totale - invoiceTotale) < invoiceTotale * 0.05) score += 20;
      const xmlName = (r.cedente_denominazione || r.cessionario_denominazione || "").toLowerCase();
      const invName = invoiceName.toLowerCase();
      if (xmlName && invName && (xmlName.includes(invName) || invName.includes(xmlName))) score += 30;
      if (r.anno === invoiceAnno) score += 10;
      if (r.numero === invoiceNumero) score += 10;
      return { record: r, score };
    }).sort((a, b) => b.score - a.score);
  }, [xmlRecords, search, invoiceAnno, invoiceNumero, invoiceName, invoiceTotale]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent className="sm:max-w-[520px] z-[60]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Link2 className="h-4 w-4" />
            Associa XML a fattura {invoiceNumero}/{invoiceAnno}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {/* Invoice detail card */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">{invoiceName || "—"}</span>
              <Badge variant="outline" className="text-[10px]">
                {tipo === "acquisto" ? "Acquisto" : "Vendita"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Totale:</span>
                <span className="font-mono font-medium">{formatCurrency(invoiceTotale)}</span>
              </div>
              {invoiceImposta !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IVA:</span>
                  <span className="font-mono font-medium">{formatCurrency(invoiceImposta)}</span>
                </div>
              )}
              {invoiceNumeroFornitore && (
                <div className="flex justify-between col-span-2">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    N° Fornitore:
                  </span>
                  <span className="font-mono font-medium">{invoiceNumeroFornitore}</span>
                </div>
              )}
            </div>

            {/* CIG row with edit capability */}
            <div className="flex items-center gap-2 pt-1 border-t border-border/50">
              <span className="text-xs text-muted-foreground shrink-0">CIG:</span>
              {editingCig ? (
                <div className="flex items-center gap-1 flex-1">
                  <Input
                    value={cigValue}
                    onChange={(e) => setCigValue(e.target.value)}
                    placeholder="Inserisci CIG..."
                    className="h-7 text-xs flex-1"
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveCig(); if (e.key === "Escape") setEditingCig(false); }}
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSaveCig} title="Salva CIG">
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingCig(false); setCigValue(invoiceCig || ""); }} title="Annulla">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-xs font-mono font-medium">{invoiceCig || "—"}</span>
                  {onCigChange && (
                    <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto" onClick={() => setEditingCig(true)} title="Modifica CIG">
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              )}
            </div>
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
              <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" title="Cancella ricerca" onClick={() => setSearch("")}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          <ScrollArea className="h-[calc(100vh-340px)]">
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
                        {r.numero_documento && (
                          <>
                            <span>·</span>
                            <span className="font-mono">Doc: {r.numero_documento}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{r.numero}/{r.anno}</span>
                      </div>
                      {score > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
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
                          {(() => {
                            const td = ((r as any).parsed_data?.tipoDocumento || "").toUpperCase();
                            return td === "TD04";
                          })() && (
                            <Badge variant="destructive" className="text-[9px] h-4 px-1.5">Nota di Credito</Badge>
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
