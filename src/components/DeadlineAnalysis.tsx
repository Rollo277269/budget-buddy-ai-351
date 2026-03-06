import { useMemo } from "react";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

import { formatCurrency } from "@/lib/format";

function parseDate(d: string): Date | null {
  if (!d) return null;
  const parts = d.split("/");
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  return null;
}

type DeadlineStatus = "scaduta" | "in_scadenza" | "regolare";

function getStatus(stato: string, scadenza: string): DeadlineStatus {
  const s = stato.toLowerCase();
  if (s.includes("scadut")) return "scaduta";
  if (s.includes("scadere") || s.includes("scadenza")) return "in_scadenza";

  const date = parseDate(scadenza);
  if (!date) return "regolare";
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 0) return "scaduta";
  if (days <= 30) return "in_scadenza";
  return "regolare";
}

interface Props {
  sales: SaleInvoice[];
  purchases: PurchaseInvoice[];
}

export function DeadlineAnalysis({ sales, purchases }: Props) {
  const analysis = useMemo(() => {
    const creditiScaduti: { label: string; numero: string; totale: number; scadenza: string; tipo: "credito" }[] = [];
    const creditiInScadenza: typeof creditiScaduti = [];
    const debitiScaduti: { label: string; numero: string; totale: number; scadenza: string; tipo: "debito" }[] = [];
    const debitiInScadenza: typeof debitiScaduti = [];

    let totCredScaduti = 0, totCredInScadenza = 0, totDebScaduti = 0, totDebInScadenza = 0;

    sales.forEach((s) => {
      const status = getStatus(s.stato, s.scadenza);
      if (status === "scaduta") {
        totCredScaduti += s.totale;
        creditiScaduti.push({ label: s.cliente, numero: `${s.numero}/${s.anno}`, totale: s.totale, scadenza: s.scadenza || s.data, tipo: "credito" });
      } else if (status === "in_scadenza") {
        totCredInScadenza += s.totale;
        creditiInScadenza.push({ label: s.cliente, numero: `${s.numero}/${s.anno}`, totale: s.totale, scadenza: s.scadenza || s.data, tipo: "credito" });
      }
    });

    purchases.forEach((p) => {
      const status = getStatus(p.stato, p.scadenza);
      if (status === "scaduta") {
        totDebScaduti += p.totale;
        debitiScaduti.push({ label: p.fornitore, numero: `${p.numero}/${p.anno}`, totale: p.totale, scadenza: p.scadenza || p.data, tipo: "debito" });
      } else if (status === "in_scadenza") {
        totDebInScadenza += p.totale;
        debitiInScadenza.push({ label: p.fornitore, numero: `${p.numero}/${p.anno}`, totale: p.totale, scadenza: p.scadenza || p.data, tipo: "debito" });
      }
    });

    return {
      creditiScaduti, creditiInScadenza, debitiScaduti, debitiInScadenza,
      totCredScaduti, totCredInScadenza, totDebScaduti, totDebInScadenza,
    };
  }, [sales, purchases]);

  const allOverdue = [...analysis.creditiScaduti, ...analysis.debitiScaduti].sort((a, b) => b.totale - a.totale);
  const allExpiring = [...analysis.creditiInScadenza, ...analysis.debitiInScadenza].sort((a, b) => b.totale - a.totale);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={AlertTriangle}
          title="Crediti Scaduti"
          value={formatCurrency(analysis.totCredScaduti)}
          count={analysis.creditiScaduti.length}
          variant="danger"
        />
        <SummaryCard
          icon={Clock}
          title="Crediti in Scadenza"
          value={formatCurrency(analysis.totCredInScadenza)}
          count={analysis.creditiInScadenza.length}
          variant="warning"
        />
        <SummaryCard
          icon={AlertTriangle}
          title="Debiti Scaduti"
          value={formatCurrency(analysis.totDebScaduti)}
          count={analysis.debitiScaduti.length}
          variant="danger"
        />
        <SummaryCard
          icon={Clock}
          title="Debiti in Scadenza"
          value={formatCurrency(analysis.totDebInScadenza)}
          count={analysis.debitiInScadenza.length}
          variant="warning"
        />
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold">Fatture Scadute ({allOverdue.length})</h3>
          </div>
          <InvoiceList items={allOverdue} emptyText="Nessuna fattura scaduta" />
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-semibold">In Scadenza ({allExpiring.length})</h3>
          </div>
          <InvoiceList items={allExpiring} emptyText="Nessuna fattura in scadenza" />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, title, value, count, variant }: {
  icon: React.ElementType;
  title: string;
  value: string;
  count: number;
  variant: "danger" | "warning";
}) {
  const styles = variant === "danger"
    ? "border-destructive/20 bg-destructive/5"
    : "border-orange-500/20 bg-orange-500/5";
  const iconStyle = variant === "danger"
    ? "text-destructive bg-destructive/10"
    : "text-orange-500 bg-orange-500/10";
  const valueStyle = variant === "danger" ? "text-destructive" : "text-orange-600";

  return (
    <div className={`rounded-xl border p-5 transition-all hover:shadow-md ${styles}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className={`text-2xl font-bold tracking-tight font-mono ${valueStyle}`}>{value}</p>
          <p className="text-xs text-muted-foreground">{count} fatture</p>
        </div>
        <div className={`rounded-lg p-2.5 ${iconStyle}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function InvoiceList({ items, emptyText }: {
  items: { label: string; numero: string; totale: number; scadenza: string; tipo: "credito" | "debito" }[];
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 mr-2" />
        {emptyText}
      </div>
    );
  }

  return (
    <div className="max-h-[300px] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">N°</TableHead>
            <TableHead className="text-xs">Soggetto</TableHead>
            <TableHead className="text-xs">Tipo</TableHead>
            <TableHead className="text-xs">Scadenza</TableHead>
            <TableHead className="text-xs text-right">Importo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.slice(0, 50).map((item, i) => (
            <TableRow key={`${item.numero}-${i}`}>
              <TableCell className="font-mono text-xs">{item.numero}</TableCell>
              <TableCell className="text-xs max-w-[180px] truncate">{item.label}</TableCell>
              <TableCell>
                <Badge variant={item.tipo === "credito" ? "secondary" : "outline"} className="text-[10px]">
                  {item.tipo === "credito" ? "Credito" : "Debito"}
                </Badge>
              </TableCell>
              <TableCell className="text-xs">{item.scadenza}</TableCell>
              <TableCell className="text-xs text-right font-mono font-semibold">{formatCurrency(item.totale)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
