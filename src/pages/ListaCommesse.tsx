import { useMemo, useState } from "react";
import { useCssrCommesse, CssrCommessa } from "@/hooks/useCssrCommesse";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { CommessaDetailSheet } from "@/components/CommessaDetailSheet";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import { useCommessaLinks } from "@/hooks/useCommessaLinks";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/format";

export interface Commessa {
  numero: number;
  oggetto: string;
  committente: string;
  assegnataria: string;
  cig: string;
  cssrStato: string;
  fattureVendita: number;
  fattureAcquisto: number;
  totaleVendite: number;
  totaleAcquisti: number;
  cssrData?: CssrCommessa;
}

const columns: ColumnDef<Commessa>[] = [
  { key: "numero", label: "N° Comm.", render: (r) => <span className="font-mono text-xs font-medium">{r.numero ? formatNumber(r.numero).replace(/,00$/, "") : "—"}</span>, sortable: true },
  { key: "oggetto", label: "Oggetto", sortable: true, filterable: true, render: (r) => <span className="text-xs max-w-[280px] whitespace-normal break-words block leading-snug py-1">{r.oggetto}</span> },
  { key: "committente", label: "Committente", sortable: true, filterable: true, render: (r) => <span className="text-xs max-w-[180px] truncate block">{r.committente}</span> },
  { key: "assegnataria", label: "Assegnataria", sortable: true, filterable: true, render: (r) => <span className="text-xs max-w-[180px] truncate block">{r.assegnataria}</span> },
  { key: "cig", label: "CIG", sortable: true, filterable: true, render: (r) => <span className="font-mono text-[11px]">{r.cig || "—"}</span> },
  {
    key: "cssrStato", label: "Stato", sortable: true,
    render: (r) => {
      if (!r.cssrData) return <span className="text-xs text-muted-foreground">—</span>;
      const stato = r.cssrData.stato;
      const colorClass =
        stato === "completata" || stato === "completate"
          ? "bg-success text-success-foreground border-success"
          : stato === "in_corso"
          ? "bg-warning/30 text-warning-foreground border-warning"
          : "bg-destructive text-destructive-foreground border-destructive";
      return <Badge className={`text-[10px] ${colorClass}`}>{stato}</Badge>;
    },
  },
  {
    key: "cssrImporto" as any, label: "Importo Contratto", sortable: true, align: "right" as const,
    render: (r) => {
      if (!r.cssrData?.importo_contrattuale) return <span className="text-xs text-muted-foreground">—</span>;
      const val = parseFloat(r.cssrData.importo_contrattuale);
      return <span className="text-xs font-mono font-medium">{isNaN(val) ? r.cssrData.importo_contrattuale : formatCurrency(val)}</span>;
    },
  },
  { key: "fattureVendita", label: "Fatt. Vendita", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{r.fattureVendita}</span> },
  { key: "totaleVendite", label: "Tot. Vendite", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{r.totaleVendite ? formatCurrency(r.totaleVendite) : "—"}</span> },
  { key: "fattureAcquisto", label: "Fatt. Acquisto", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{r.fattureAcquisto}</span> },
  { key: "totaleAcquisti", label: "Tot. Acquisti", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{r.totaleAcquisti ? formatCurrency(r.totaleAcquisti) : "—"}</span> },
];

const ListaCommessePage = () => {
  const { commesse: cssrCommesse, loading: cssrLoading } = useCssrCommesse();
  const { allSales, allPurchases, loading: invoiceLoading } = useInvoiceData();
  const { links, addLink, removeLink } = useCommessaLinks();
  const [selected, setSelected] = useState<Commessa | null>(null);

  const rows = useMemo(() => {
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

    return cssrCommesse.map((c) => {
      const cig = c.cig || "";
      const counts = cig ? cigCounts.get(cig) || { fv: 0, fa: 0, tv: 0, ta: 0 } : { fv: 0, fa: 0, tv: 0, ta: 0 };
      const countsDeriv = c.cig_derivato ? cigCounts.get(c.cig_derivato) || { fv: 0, fa: 0, tv: 0, ta: 0 } : { fv: 0, fa: 0, tv: 0, ta: 0 };

      return {
        numero: parseFloat(c.commessa_consortile || "0") || 0,
        oggetto: c.oggetto_lavori || "—",
        committente: c.committente || "—",
        assegnataria: c.impresa_assegnataria || "—",
        cig,
        cssrStato: c.stato || "",
        fattureVendita: counts.fv + countsDeriv.fv,
        fattureAcquisto: counts.fa + countsDeriv.fa,
        totaleVendite: counts.tv + countsDeriv.tv,
        totaleAcquisti: counts.ta + countsDeriv.ta,
        cssrData: c,
      };
    });
  }, [cssrCommesse, allSales, allPurchases]);

  if (cssrLoading || invoiceLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <p className="text-sm text-muted-foreground">
        {rows.length} commesse
      </p>
      <DataTable<Commessa> columns={columns} data={rows} rowKey={(r) => r.cssrData?.id || r.cig || String(r.numero)} onRowClick={setSelected} />
      <CommessaDetailSheet
        commessa={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        allSales={allSales}
        allPurchases={allPurchases}
        manualLinks={links}
        onAddLink={addLink}
        onRemoveLink={removeLink}
      />
    </div>
  );
};

export default ListaCommessePage;
