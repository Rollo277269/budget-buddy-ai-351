import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import { formatCurrency } from "@/lib/format";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

function parseDate(d: string): Date | null {
  if (!d) return null;
  const parts = d.split("/");
  if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  return null;
}

interface ScadenzaRow {
  tipo: "credito" | "debito";
  numero: string;
  soggetto: string;
  totale: number;
  scadenza: string;
  scadenzaDate: Date | null;
  giorniRimasti: number;
  stato: "scaduta" | "in_scadenza" | "regolare";
  cig: string;
}

const scadenzaCols: ColumnDef<ScadenzaRow>[] = [
  {
    key: "stato", label: "Stato", sortable: true, filterable: true,
    render: (r) => {
      if (r.stato === "scaduta") return <Badge variant="destructive" className="text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" />Scaduta</Badge>;
      if (r.stato === "in_scadenza") return <Badge className="bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] text-[10px]"><Clock className="h-3 w-3 mr-1" />In scadenza</Badge>;
      return <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Regolare</Badge>;
    }
  },
  {
    key: "tipo", label: "Tipo", sortable: true, filterable: true,
    render: (r) => <Badge variant={r.tipo === "credito" ? "secondary" : "outline"} className="text-[10px]">{r.tipo === "credito" ? "Credito" : "Debito"}</Badge>
  },
  { key: "numero", label: "N° Fattura", sortable: true, render: (r) => <span className="text-xs font-mono">{r.numero}</span> },
  { key: "soggetto", label: "Soggetto", filterable: true, render: (r) => <span className="text-xs truncate max-w-[200px] block">{r.soggetto}</span> },
  { key: "scadenza", label: "Scadenza", sortable: true, render: (r) => <span className="text-xs">{r.scadenza}</span> },
  {
    key: "giorniRimasti", label: "Giorni", sortable: true, align: "right",
    render: (r) =>
    <span className={`text-xs font-mono font-medium ${r.giorniRimasti < 0 ? "text-destructive" : r.giorniRimasti <= 30 ? "text-[hsl(var(--warning))]" : "text-muted-foreground"}`}>
      {r.giorniRimasti < 0 ? `${Math.abs(r.giorniRimasti)}g fa` : `${r.giorniRimasti}g`}
    </span>
  },
  {
    key: "totale", label: "Importo", sortable: true, align: "right",
    render: (r) => <span className={`text-xs font-mono font-medium ${r.tipo === "credito" ? "text-income" : "text-expense"}`}>{formatCurrency(r.totale)}</span>
  },
  { key: "cig", label: "CIG", filterable: true, defaultHidden: true, render: (r) => r.cig ? <span className="text-xs font-mono">{r.cig}</span> : <span className="text-xs text-muted-foreground">—</span> },
];

export default function ScadenzarioPage() {
  const { allSales, allPurchases, loading } = useInvoiceData();

  const rows: ScadenzaRow[] = (() => {
    if (loading) return [];
    const now = new Date();
    const result: ScadenzaRow[] = [];

    const getStato = (stato: string, scadDate: Date | null): ScadenzaRow["stato"] => {
      const s = stato.toLowerCase();
      if (s.includes("scadut")) return "scaduta";
      if (s.includes("scadere")) return "in_scadenza";
      if (!scadDate) return "regolare";
      const days = (scadDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (days < 0) return "scaduta";
      if (days <= 30) return "in_scadenza";
      return "regolare";
    };

    allSales.forEach((s) => {
      const d = parseDate(s.scadenza || s.data);
      const days = d ? Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 9999;
      const stato = getStato(s.stato, d);
      if (stato !== "regolare") {
        result.push({ tipo: "credito", numero: `${s.numero}/${s.anno}`, soggetto: s.cliente, totale: s.totale, scadenza: s.scadenza || s.data, scadenzaDate: d, giorniRimasti: days, stato, cig: s.cig });
      }
    });

    allPurchases.forEach((p) => {
      const d = parseDate(p.scadenza || p.data);
      const days = d ? Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 9999;
      const stato = getStato(p.stato, d);
      if (stato !== "regolare") {
        result.push({ tipo: "debito", numero: `${p.numero}/${p.anno}`, soggetto: p.fornitore, totale: p.totale, scadenza: p.scadenza || p.data, scadenzaDate: d, giorniRimasti: days, stato, cig: p.cig });
      }
    });

    return result.sort((a, b) => a.giorniRimasti - b.giorniRimasti);
  })();

  const totCrediti = rows.filter((r) => r.tipo === "credito").reduce((s, r) => s + r.totale, 0);
  const totDebiti = rows.filter((r) => r.tipo === "debito").reduce((s, r) => s + r.totale, 0);
  const scadute = rows.filter((r) => r.stato === "scaduta").length;
  const inScadenza = rows.filter((r) => r.stato === "in_scadenza").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Scadute</p>
            <p className="text-xl font-bold text-destructive">{scadute}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">In Scadenza</p>
            <p className="text-xl font-bold text-[hsl(var(--warning))]">{inScadenza}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Crediti aperti</p>
            <p className="text-lg font-bold font-mono text-income">{formatCurrency(totCrediti)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Debiti aperti</p>
            <p className="text-lg font-bold font-mono text-expense">{formatCurrency(totDebiti)}</p>
          </CardContent>
        </Card>
      </div>

      <DataTable<ScadenzaRow>
        columns={scadenzaCols}
        data={rows}
        rowKey={(r) => `${r.tipo}-${r.numero}`} />
    </div>
  );
}
