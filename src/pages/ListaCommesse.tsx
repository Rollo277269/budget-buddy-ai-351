import { useMemo, useState } from "react";
import { useCssrCommesse, CssrCommessa } from "@/hooks/useCssrCommesse";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { CommessaDetailSheet } from "@/components/CommessaDetailSheet";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import { useCommessaLinks } from "@/hooks/useCommessaLinks";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export interface Commessa {
  numero: number;
  oggetto: string;
  committente: string;
  assegnataria: string;
  cig: string;
  fattureVendita: number;
  fattureAcquisto: number;
  cssrData?: CssrCommessa;
}

const columns: ColumnDef<Commessa>[] = [
  { key: "numero", label: "N°", render: (r) => <span className="font-mono text-xs">{r.numero}</span>, sortable: true },
  { key: "oggetto", label: "Oggetto", sortable: true, filterable: true, render: (r) => <span className="text-xs max-w-[300px] truncate block">{r.oggetto}</span> },
  { key: "committente", label: "Committente", sortable: true, filterable: true, render: (r) => <span className="text-xs max-w-[200px] truncate block">{r.committente}</span> },
  { key: "assegnataria", label: "Assegnataria", sortable: true, filterable: true, render: (r) => <span className="text-xs max-w-[200px] truncate block">{r.assegnataria}</span> },
  { key: "cig", label: "CIG", sortable: true, filterable: true, render: (r) => <span className="font-mono text-[11px]">{r.cig || "—"}</span> },
  {
    key: "cssrStato" as any, label: "Stato", sortable: true,
    render: (r) => {
      if (!r.cssrData) return <span className="text-xs text-muted-foreground">—</span>;
      const stato = r.cssrData.stato;
      const variant = stato === "in_corso" ? "default" : stato === "completata" || stato === "completate" ? "secondary" : "outline";
      return <Badge variant={variant} className="text-[10px]">{stato}</Badge>;
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
  { key: "fattureAcquisto", label: "Fatt. Acquisto", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{r.fattureAcquisto}</span> },
];

const ListaCommessePage = () => {
  const { commesse: cssrCommesse, loading: cssrLoading } = useCssrCommesse();
  const { allSales, allPurchases, loading: invoiceLoading } = useInvoiceData();
  const { links, addLink, removeLink } = useCommessaLinks();
  const [selected, setSelected] = useState<Commessa | null>(null);

  const rows = useMemo(() => {
    // Count invoices per CIG
    const cigCounts = new Map<string, { v: number; a: number }>();
    allSales.forEach((s) => {
      if (s.cig) {
        const e = cigCounts.get(s.cig) || { v: 0, a: 0 };
        e.v++;
        cigCounts.set(s.cig, e);
      }
    });
    allPurchases.forEach((p) => {
      if (p.cig) {
        const e = cigCounts.get(p.cig) || { v: 0, a: 0 };
        e.a++;
        cigCounts.set(p.cig, e);
      }
    });

    return cssrCommesse.map((c, idx) => {
      const cig = c.cig || "";
      const counts = cigCounts.get(cig) || { v: 0, a: 0 };
      // Also count cig_derivato
      const countsDeriv = c.cig_derivato ? cigCounts.get(c.cig_derivato) || { v: 0, a: 0 } : { v: 0, a: 0 };
      return {
        numero: idx + 1,
        oggetto: c.oggetto_lavori || "—",
        committente: c.committente || "—",
        assegnataria: c.impresa_assegnataria || "—",
        cig,
        fattureVendita: counts.v + countsDeriv.v,
        fattureAcquisto: counts.a + countsDeriv.a,
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
      <div>
        <h2 className="text-lg font-bold tracking-tight">Commesse (CSSR)</h2>
        <p className="text-sm text-muted-foreground">
          {rows.length} commesse dal progetto CSSR
        </p>
      </div>
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
