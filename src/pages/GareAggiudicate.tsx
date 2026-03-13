import { useMemo } from "react";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import { useCssrCommesse, CssrCommessa } from "@/hooks/useCssrCommesse";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface GaraAggiudicata {
  numero: number;
  cig: string;
  oggetto: string;
  committente: string;
  assegnataria: string;
  importoContratto: number | null;
  stato: string;
  fattureVendita: number;
  fattureAcquisto: number;
  totaleVendite: number;
  totaleAcquisti: number;
  cssrData: CssrCommessa;
}

const columns: ColumnDef<GaraAggiudicata>[] = [
  { key: "numero", label: "N°", render: (r) => <span className="font-mono text-xs">{r.numero}</span>, sortable: true },
  { key: "cig", label: "CIG", sortable: true, filterable: true, render: (r) => <span className="font-mono text-[11px]">{r.cig}</span> },
  { key: "oggetto", label: "Oggetto", sortable: true, filterable: true, render: (r) => <span className="text-xs max-w-[280px] truncate block">{r.oggetto}</span> },
  { key: "committente", label: "Committente", sortable: true, filterable: true, render: (r) => <span className="text-xs max-w-[180px] truncate block">{r.committente}</span> },
  { key: "assegnataria", label: "Assegnataria", sortable: true, filterable: true, render: (r) => <span className="text-xs max-w-[180px] truncate block">{r.assegnataria}</span> },
  {
    key: "stato", label: "Stato", sortable: true,
    render: (r) => {
      const variant = r.stato === "in_corso" ? "default" : r.stato === "completata" || r.stato === "completate" ? "secondary" : "outline";
      return <Badge variant={variant} className="text-[10px]">{r.stato}</Badge>;
    },
  },
  {
    key: "importoContratto" as any, label: "Importo Contratto", sortable: true, align: "right" as const,
    render: (r) => r.importoContratto ? <span className="text-xs font-mono font-medium">{formatCurrency(r.importoContratto)}</span> : <span className="text-xs text-muted-foreground">—</span>,
  },
  { key: "fattureVendita", label: "Fatt. Vendita", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{r.fattureVendita}</span> },
  { key: "totaleVendite", label: "Tot. Vendite", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{formatCurrency(r.totaleVendite)}</span> },
  { key: "fattureAcquisto", label: "Fatt. Acquisto", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{r.fattureAcquisto}</span> },
  { key: "totaleAcquisti", label: "Tot. Acquisti", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{formatCurrency(r.totaleAcquisti)}</span> },
];

const GareAggiudicatePage = () => {
  const { allSales, allPurchases, loading } = useInvoiceData();
  const { commesse: cssrCommesse, byCig, loading: cssrLoading } = useCssrCommesse();

  const rows = useMemo(() => {
    // Count invoices per CIG
    const cigCounts = new Map<string, { fv: number; fa: number; tv: number; ta: number }>();
    allSales.forEach((s) => {
      if (s.cig) {
        const e = cigCounts.get(s.cig) || { fv: 0, fa: 0, tv: 0, ta: 0 };
        e.fv++;
        e.tv += s.totale || 0;
        cigCounts.set(s.cig, e);
      }
    });
    allPurchases.forEach((p) => {
      if (p.cig) {
        const e = cigCounts.get(p.cig) || { fv: 0, fa: 0, tv: 0, ta: 0 };
        e.fa++;
        e.ta += p.totale || 0;
        cigCounts.set(p.cig, e);
      }
    });

    // Only CSSR commesse that have invoices = gare aggiudicate with activity
    const result: GaraAggiudicata[] = [];
    let idx = 1;
    cssrCommesse.forEach((c) => {
      const cig = c.cig || "";
      const counts = cig ? cigCounts.get(cig) : undefined;
      const countsDeriv = c.cig_derivato ? cigCounts.get(c.cig_derivato) : undefined;
      const hasInvoices = (counts && (counts.fv > 0 || counts.fa > 0)) || (countsDeriv && (countsDeriv.fv > 0 || countsDeriv.fa > 0));

      if (hasInvoices) {
        const fv = (counts?.fv || 0) + (countsDeriv?.fv || 0);
        const fa = (counts?.fa || 0) + (countsDeriv?.fa || 0);
        const tv = (counts?.tv || 0) + (countsDeriv?.tv || 0);
        const ta = (counts?.ta || 0) + (countsDeriv?.ta || 0);
        const importo = c.importo_contrattuale ? parseFloat(c.importo_contrattuale) : null;

        result.push({
          numero: idx++,
          cig,
          oggetto: c.oggetto_lavori || "—",
          committente: c.committente || "—",
          assegnataria: c.impresa_assegnataria || "—",
          importoContratto: importo && !isNaN(importo) ? importo : null,
          stato: c.stato,
          fattureVendita: fv,
          fattureAcquisto: fa,
          totaleVendite: tv,
          totaleAcquisti: ta,
          cssrData: c,
        });
      }
    });
    return result;
  }, [cssrCommesse, allSales, allPurchases]);

  if (loading || cssrLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Gare Aggiudicate</h2>
        <p className="text-sm text-muted-foreground">
          {rows.length} commesse CSSR con fatture associate
        </p>
      </div>
      <DataTable<GaraAggiudicata> columns={columns} data={rows} rowKey={(r) => r.cig || String(r.numero)} />
    </div>
  );
};

export default GareAggiudicatePage;
