import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { SaleInvoice, PurchaseInvoice, getIssuedInvoiceRows } from "@/hooks/useInvoiceData";
import { FileText, ArrowLeft } from "lucide-react";
import { BankMovementSuggestions } from "@/components/BankMovementSuggestions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CentroCell } from "@/components/CentroCell";
import { useCentriData, useCentroMap } from "@/hooks/useCentri";

type Invoice = SaleInvoice | PurchaseInvoice;

import { formatCurrency } from "@/lib/format";

function StatusBadge({ stato }: { stato: string }) {
  const s = stato.toLowerCase();
  if (s.includes("scadut"))
    return <Badge variant="destructive" className="text-xs">{stato}</Badge>;
  if (s.includes("scadere"))
    return <Badge variant="secondary" className="text-xs">{stato}</Badge>;
  return <Badge variant="outline" className="text-xs">{stato}</Badge>;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right ml-4">{value || "—"}</span>
    </div>
  );
}

interface InvoiceDetailSheetProps {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "vendita" | "acquisto";
}

export function InvoiceDetailSheet({ invoice, open, onOpenChange, type }: InvoiceDetailSheetProps) {
  if (!invoice) return null;

  const counterpart = type === "vendita"
    ? (invoice as SaleInvoice).cliente
    : (invoice as PurchaseInvoice).fornitore;

  const { centri } = useCentriData();
  const centroTipo: "costo" | "ricavo" = type === "vendita" ? "ricavo" : "costo";
  const centroContext: "vendite" | "acquisti" = type === "vendita" ? "vendite" : "acquisti";
  const centroMap = useCentroMap(centroTipo, centroContext);

  const righeRaw = Array.isArray((invoice as any).righe) ? (invoice as any).righe : [];
  const righe = type === "vendita"
    ? getIssuedInvoiceRows(righeRaw)
    : righeRaw.map((riga: any, idx: number) => ({ riga, idx }));
  const headerKey = `${invoice.anno}-${invoice.numero}`;
  const headerSenzaIva = Number(invoice.imposta || 0) === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[50vw] overflow-y-auto z-[60]">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onOpenChange(false)} title="Torna indietro">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <SheetTitle className="flex items-center gap-2">
              <div className="rounded-lg bg-primary p-1.5">
                <FileText className="h-4 w-4 text-primary-foreground" />
              </div>
              Fattura {invoice.numero}/{invoice.anno}
            </SheetTitle>
          </div>
          <SheetDescription>
            {type === "vendita" ? "Fattura di vendita" : "Fattura di acquisto"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-2">
          {/* Header info */}
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <DetailRow label="Numero" value={<span className="font-mono">{invoice.numero}/{invoice.anno}</span>} />
            <Separator />
            <DetailRow label="Data" value={invoice.data} />
            <Separator />
            <DetailRow label={type === "vendita" ? "Cliente" : "Fornitore"} value={counterpart} />
            <Separator />
            <DetailRow label="P.IVA" value={<span className="font-mono">{invoice.partitaIva}</span>} />
            <Separator />
            <DetailRow label="Stato" value={<StatusBadge stato={invoice.stato} />} />
          </div>

          {/* Amounts */}
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Importi</h3>
            <DetailRow label="Imponibile" value={<span className="font-mono">{formatCurrency(invoice.imponibile)}</span>} />
            <Separator />
            <DetailRow label="IVA" value={<span className="font-mono">{formatCurrency(invoice.imposta)}</span>} />
            <Separator />
            <DetailRow label="Totale" value={<span className="font-mono font-bold text-base">{formatCurrency(invoice.totale)}</span>} />
          </div>

          {/* Payment & deadlines */}
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pagamento</h3>
            <DetailRow label="Scadenza" value={invoice.scadenza} />
            <Separator />
            <DetailRow label="Modalità" value={invoice.pagamento} />
          </div>

          {/* CIG & Description */}
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Dettagli</h3>
            <DetailRow label="CIG" value={invoice.cig ? <span className="font-mono">{invoice.cig}</span> : null} />
            {invoice.cup && (
              <>
                <Separator />
                <DetailRow label="CUP" value={<span className="font-mono">{invoice.cup}</span>} />
              </>
            )}
            <Separator />
            <DetailRow label="Descrizione" value={
              <span className="text-xs leading-relaxed whitespace-pre-wrap max-w-[300px] block">
                {invoice.descrizione}
              </span>
            } />
            {righe.length <= 1 && (
              <>
                <Separator />
                <div className="flex justify-between items-center py-2">
                  <span className="text-xs text-muted-foreground shrink-0">
                    Centro {centroTipo === "ricavo" ? "Ricavo" : "Costo"}
                  </span>
                  <CentroCell
                    invoiceKey={headerKey}
                    tipo={centroTipo}
                    centri={centri}
                    centroMap={centroMap.map}
                    onAssign={centroMap.assign}
                    onRemove={centroMap.remove}
                    importo={invoice.totale}
                  />
                </div>
              </>
            )}
          </div>

          {/* Invoice rows */}
          {righe.length > 1 && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Righe fattura ({righe.length})
              </h3>
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/50">
                    <TableHead className="text-[10px] font-semibold text-muted-foreground w-8">#</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground">Descrizione</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground text-right">Imponibile</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground text-right">IVA</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground text-right">Totale</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground">CIG</TableHead>
                    <TableHead className="text-[10px] font-semibold text-muted-foreground">
                      Centro {centroTipo === "ricavo" ? "Ricavo" : "Costo"}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {righe.map(({ riga, idx }, displayIdx) => {
                    const rigaImposta = headerSenzaIva ? 0 : Number(riga.imposta || 0);
                    const rigaTotale = headerSenzaIva ? Number(riga.imponibile || 0) : Number(riga.totale || 0);
                    const rigaCig = riga.cig || invoice.cig || "";
                    return (
                      <TableRow key={idx} className="border-b border-border/30">
                        <TableCell className="text-[11px] font-mono text-muted-foreground py-1.5">{displayIdx + 1}</TableCell>
                        <TableCell className="text-[11px] whitespace-normal break-words leading-snug py-1.5" style={{ overflowWrap: "anywhere" }}>{riga.descrizione || "—"}</TableCell>
                        <TableCell className="text-[11px] font-mono text-right py-1.5">{formatCurrency(Number(riga.imponibile || 0))}</TableCell>
                        <TableCell className="text-[11px] font-mono text-right py-1.5">{formatCurrency(rigaImposta)}</TableCell>
                        <TableCell className="text-[11px] font-mono font-semibold text-right py-1.5">{formatCurrency(rigaTotale)}</TableCell>
                        <TableCell className="text-[11px] font-mono py-1.5">{rigaCig || "—"}</TableCell>
                        <TableCell className="py-1.5">
                          <CentroCell
                            invoiceKey={`${invoice.anno}-${invoice.numero}-${idx}`}
                            tipo={centroTipo}
                            centri={centri}
                            centroMap={centroMap.map}
                            onAssign={centroMap.assign}
                            onRemove={centroMap.remove}
                            importo={rigaTotale}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Bank movement reconciliation suggestions */}
          <BankMovementSuggestions invoice={invoice} type={type} />

          {/* PDF placeholder */}
          <div className="rounded-xl border border-dashed bg-muted/30 p-8 flex flex-col items-center justify-center gap-3 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Anteprima PDF non disponibile</p>
            <p className="text-xs text-muted-foreground/70">
              Collega un sistema documentale per visualizzare il PDF originale
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
