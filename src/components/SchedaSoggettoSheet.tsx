import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { formatCurrency } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp, TrendingDown, Scale, Receipt, FileText } from "lucide-react";

interface SchedaSoggettoSheetProps {
  tipo: "cliente" | "fornitore";
  nome: string | null;
  allSales: SaleInvoice[];
  allPurchases: PurchaseInvoice[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function parseDate(d: string): Date | null {
  if (!d) return null;
  const parts = d.split("/");
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  const serial = parseFloat(d);
  if (!isNaN(serial) && serial > 30000) {
    return new Date((serial - 25569) * 86400 * 1000);
  }
  return null;
}

interface PrimaNotaRow {
  data: string;
  dataSort: number;
  numero: string;
  descrizione: string;
  tipo: "vendita" | "acquisto";
  dare: number;
  avere: number;
  saldo: number;
  stato: string;
}

function StatusBadge({ stato }: { stato: string }) {
  const s = stato.toLowerCase();
  if (s.includes("scadut"))
    return <Badge variant="destructive" className="text-[10px]">{stato}</Badge>;
  if (s.includes("scadere"))
    return <Badge variant="secondary" className="text-[10px]">{stato}</Badge>;
  if (s.includes("pagat") || s.includes("regolar") || s.includes("incass"))
    return <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">{stato}</Badge>;
  return <Badge variant="outline" className="text-[10px]">{stato}</Badge>;
}

export function SchedaSoggettoSheet({
  tipo,
  nome,
  allSales,
  allPurchases,
  open,
  onOpenChange,
}: SchedaSoggettoSheetProps) {
  const navigate = useNavigate();
  const { rows, stats } = useMemo(() => {
    if (!nome) return { rows: [], stats: { totaleDare: 0, totaleAvere: 0, saldo: 0, numFatture: 0, mediaImporto: 0 } };

    const entries: Omit<PrimaNotaRow, "saldo">[] = [];

    // Get sales for this subject
    const matchingSales = allSales.filter((s) =>
      tipo === "cliente" ? s.cliente === nome : false
    );
    // Get purchases for this subject
    const matchingPurchases = allPurchases.filter((p) =>
      tipo === "fornitore" ? p.fornitore === nome : false
    );

    matchingSales.forEach((s) => {
      const d = parseDate(s.data);
      entries.push({
        data: s.data,
        dataSort: d ? d.getTime() : 0,
        numero: `${s.numero}/${s.anno}`,
        descrizione: s.descrizione || s.cliente,
        tipo: "vendita",
        dare: s.totale,
        avere: 0,
        stato: s.stato,
      });
    });

    matchingPurchases.forEach((p) => {
      const d = parseDate(p.data);
      entries.push({
        data: p.data,
        dataSort: d ? d.getTime() : 0,
        numero: `${p.numero}/${p.anno}`,
        descrizione: p.descrizione || p.fornitore,
        tipo: "acquisto",
        dare: 0,
        avere: p.totale,
        stato: p.stato,
      });
    });

    // Sort chronologically
    entries.sort((a, b) => a.dataSort - b.dataSort);

    // Build running balance
    let saldo = 0;
    const rows: PrimaNotaRow[] = entries.map((e) => {
      saldo += e.dare - e.avere;
      return { ...e, saldo };
    });

    const totaleDare = entries.reduce((a, e) => a + e.dare, 0);
    const totaleAvere = entries.reduce((a, e) => a + e.avere, 0);
    const numFatture = entries.length;

    return {
      rows,
      stats: {
        totaleDare,
        totaleAvere,
        saldo: totaleDare - totaleAvere,
        numFatture,
        mediaImporto: numFatture > 0 ? (totaleDare + totaleAvere) / numFatture : 0,
      },
    };
  }, [nome, allSales, allPurchases, tipo]);

  if (!nome) return null;

  const label = tipo === "cliente" ? "Scheda Cliente" : "Scheda Fornitore";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!max-w-[720px] w-[90vw] overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-base">{label}</SheetTitle>
              <SheetDescription className="text-lg font-semibold text-foreground">
                {nome}
              </SheetDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              title="Apri scheda contabile e stampa report PDF"
              onClick={() => {
                onOpenChange(false);
                navigate(`/schede-contabili?soggetto=${encodeURIComponent(nome)}&autoprint=1`);
              }}
            >
              <FileText className="h-3.5 w-3.5" />
              Report PDF
            </Button>
          </div>
        </SheetHeader>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-lg border bg-card p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              {tipo === "cliente" ? "Fatturato" : "Dare"}
            </div>
            <p className="text-sm font-semibold font-mono">{formatCurrency(stats.totaleDare)}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingDown className="h-3.5 w-3.5" />
              {tipo === "fornitore" ? "Totale Acquisti" : "Avere"}
            </div>
            <p className="text-sm font-semibold font-mono">{formatCurrency(stats.totaleAvere)}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Scale className="h-3.5 w-3.5" />
              Saldo
            </div>
            <p className={`text-sm font-semibold font-mono ${stats.saldo >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {formatCurrency(stats.saldo)}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Receipt className="h-3.5 w-3.5" />
              Documenti
            </div>
            <p className="text-sm font-semibold">{stats.numFatture}</p>
            <p className="text-[10px] text-muted-foreground">Media: {formatCurrency(stats.mediaImporto)}</p>
          </div>
        </div>

        <Separator className="mb-4" />

        {/* Prima nota table */}
        <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
          Prima Nota — Movimenti in ordine cronologico
        </h3>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nessun movimento trovato</p>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-[11px] font-semibold w-[80px]">Data</TableHead>
                  <TableHead className="text-[11px] font-semibold w-[70px]">N°</TableHead>
                  <TableHead className="text-[11px] font-semibold">Descrizione</TableHead>
                  <TableHead className="text-[11px] font-semibold w-[60px]">Stato</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right w-[100px]">Dare</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right w-[100px]">Avere</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right w-[100px]">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i} className="text-xs">
                    <TableCell className="font-mono text-[11px] py-1.5 whitespace-nowrap">{row.data}</TableCell>
                    <TableCell className="font-mono text-[11px] py-1.5">{row.numero}</TableCell>
                    <TableCell className="py-1.5 max-w-[180px] truncate text-[11px]">{row.descrizione}</TableCell>
                    <TableCell className="py-1.5"><StatusBadge stato={row.stato} /></TableCell>
                    <TableCell className="text-right font-mono text-[11px] py-1.5">
                      {row.dare > 0 ? (
                        <span className="text-emerald-600">{formatCurrency(row.dare)}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px] py-1.5">
                      {row.avere > 0 ? (
                        <span className="text-destructive">{formatCurrency(row.avere)}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-[11px] font-semibold py-1.5 ${row.saldo >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {formatCurrency(row.saldo)}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                <TableRow className="bg-muted/50 font-semibold border-t-2">
                  <TableCell colSpan={4} className="text-[11px] py-2">TOTALE</TableCell>
                  <TableCell className="text-right font-mono text-[11px] py-2 text-emerald-600">
                    {formatCurrency(stats.totaleDare)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px] py-2 text-destructive">
                    {formatCurrency(stats.totaleAvere)}
                  </TableCell>
                  <TableCell className={`text-right font-mono text-[11px] py-2 font-bold ${stats.saldo >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                    {formatCurrency(stats.saldo)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
