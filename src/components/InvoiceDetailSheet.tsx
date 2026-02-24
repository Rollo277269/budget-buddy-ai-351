import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { FileText } from "lucide-react";

type Invoice = SaleInvoice | PurchaseInvoice;

function formatCurrency(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[50vw] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <div className="rounded-lg bg-primary p-1.5">
              <FileText className="h-4 w-4 text-primary-foreground" />
            </div>
            Fattura {invoice.numero}/{invoice.anno}
          </SheetTitle>
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
          </div>

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
