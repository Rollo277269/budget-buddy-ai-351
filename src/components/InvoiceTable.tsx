import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

function StatusBadge({ stato }: { stato: string }) {
  const s = stato.toLowerCase();
  if (s.includes("scadut"))
    return <Badge variant="destructive" className="text-[10px] font-medium">{stato}</Badge>;
  if (s.includes("scadere"))
    return <Badge variant="secondary" className="text-[10px] font-medium">{stato}</Badge>;
  return <Badge variant="outline" className="text-[10px] font-medium">{stato}</Badge>;
}

export function SalesTable({ data }: { data: SaleInvoice[] }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="max-h-[420px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="text-xs">N°</TableHead>
              <TableHead className="text-xs">Data</TableHead>
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">CIG</TableHead>
              <TableHead className="text-xs text-right">Imponibile</TableHead>
              <TableHead className="text-xs text-right">IVA</TableHead>
              <TableHead className="text-xs text-right">Totale</TableHead>
              <TableHead className="text-xs">Stato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nessuna fattura trovata
                </TableCell>
              </TableRow>
            ) : (
              data.map((inv) => (
                <TableRow key={`${inv.anno}-${inv.numero}`}>
                  <TableCell className="font-mono text-xs">{inv.numero}/{inv.anno}</TableCell>
                  <TableCell className="text-xs">{inv.data}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{inv.cliente}</TableCell>
                  <TableCell className="font-mono text-[11px]">{inv.cig || "—"}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatCurrency(inv.imponibile)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatCurrency(inv.imposta)}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-semibold">{formatCurrency(inv.totale)}</TableCell>
                  <TableCell><StatusBadge stato={inv.stato} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function PurchasesTable({ data }: { data: PurchaseInvoice[] }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="max-h-[420px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="text-xs">N°</TableHead>
              <TableHead className="text-xs">Data</TableHead>
              <TableHead className="text-xs">Fornitore</TableHead>
              <TableHead className="text-xs">CIG</TableHead>
              <TableHead className="text-xs text-right">Imponibile</TableHead>
              <TableHead className="text-xs text-right">IVA</TableHead>
              <TableHead className="text-xs text-right">Totale</TableHead>
              <TableHead className="text-xs">Stato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nessuna fattura trovata
                </TableCell>
              </TableRow>
            ) : (
              data.map((inv) => (
                <TableRow key={`${inv.anno}-${inv.numero}`}>
                  <TableCell className="font-mono text-xs">{inv.numero}/{inv.anno}</TableCell>
                  <TableCell className="text-xs">{inv.data}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{inv.fornitore}</TableCell>
                  <TableCell className="font-mono text-[11px]">{inv.cig || "—"}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatCurrency(inv.imponibile)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatCurrency(inv.imposta)}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-semibold">{formatCurrency(inv.totale)}</TableCell>
                  <TableCell><StatusBadge stato={inv.stato} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
