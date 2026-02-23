import { useMemo } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

interface CigRow {
  cig: string;
  vendite: number;
  acquisti: number;
  saldo: number;
  nVendite: number;
  nAcquisti: number;
}

export function CigDetailTable({ sales, purchases }: { sales: SaleInvoice[]; purchases: PurchaseInvoice[] }) {
  const rows = useMemo(() => {
    const map: Record<string, CigRow> = {};
    sales.forEach((s) => {
      if (!s.cig) return;
      if (!map[s.cig]) map[s.cig] = { cig: s.cig, vendite: 0, acquisti: 0, saldo: 0, nVendite: 0, nAcquisti: 0 };
      map[s.cig].vendite += s.totale;
      map[s.cig].nVendite++;
    });
    purchases.forEach((p) => {
      if (!p.cig) return;
      if (!map[p.cig]) map[p.cig] = { cig: p.cig, vendite: 0, acquisti: 0, saldo: 0, nVendite: 0, nAcquisti: 0 };
      map[p.cig].acquisti += p.totale;
      map[p.cig].nAcquisti++;
    });
    return Object.values(map)
      .map((r) => ({ ...r, saldo: r.vendite - r.acquisti }))
      .sort((a, b) => b.vendite + b.acquisti - (a.vendite + a.acquisti));
  }, [sales, purchases]);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="max-h-[460px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="text-xs">CIG</TableHead>
              <TableHead className="text-xs text-right">Vendite</TableHead>
              <TableHead className="text-xs text-right">N° Fatt. V.</TableHead>
              <TableHead className="text-xs text-right">Acquisti</TableHead>
              <TableHead className="text-xs text-right">N° Fatt. A.</TableHead>
              <TableHead className="text-xs text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nessun CIG trovato
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.cig}>
                  <TableCell className="font-mono text-xs">{r.cig}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-income">{formatCurrency(r.vendite)}</TableCell>
                  <TableCell className="text-xs text-right">{r.nVendite}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-expense">{formatCurrency(r.acquisti)}</TableCell>
                  <TableCell className="text-xs text-right">{r.nAcquisti}</TableCell>
                  <TableCell className={`text-xs text-right font-mono font-semibold ${r.saldo >= 0 ? "text-income" : "text-expense"}`}>
                    {formatCurrency(r.saldo)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
