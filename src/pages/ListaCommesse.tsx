import { useMemo, useState } from "react";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import { useCommessaLinks } from "@/hooks/useCommessaLinks";
import { useCssrCommesse, CssrCommessa } from "@/hooks/useCssrCommesse";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { CommessaDetailSheet } from "@/components/CommessaDetailSheet";
import { Badge } from "@/components/ui/badge";
import { Loader2, Link2, ExternalLink } from "lucide-react";
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

function makeColumns(manualCounts: Map<string, { v: number; a: number }>): ColumnDef<Commessa>[] {
  return [
    { key: "numero", label: "N°", render: (r) => <span className="font-mono text-xs">{r.numero}</span>, sortable: true },
    {
      key: "oggetto", label: "Oggetto", sortable: true, filterable: true,
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <span className="text-xs max-w-[300px] truncate block">{r.oggetto}</span>
          {r.cssrData && <ExternalLink className="h-3 w-3 text-primary shrink-0" />}
        </div>
      ),
    },
    { key: "committente", label: "Committente", render: (r) => <span className="text-xs max-w-[200px] truncate block">{r.committente}</span>, sortable: true, filterable: true },
    { key: "assegnataria", label: "Assegnataria dei lavori", render: (r) => <span className="text-xs max-w-[200px] truncate block">{r.assegnataria}</span>, sortable: true, filterable: true },
    { key: "cig", label: "CIG", render: (r) => (
      <div className="flex items-center gap-1">
        <span className="font-mono text-[11px]">{r.cig}</span>
        {r.cssrData && <Badge variant="secondary" className="text-[8px] px-1 py-0">CSSR</Badge>}
      </div>
    ), sortable: true, filterable: true },
    {
      key: "cssrStato" as any, label: "Stato", sortable: true,
      render: (r) => {
        if (!r.cssrData) return <span className="text-xs text-muted-foreground">—</span>;
        const stato = r.cssrData.stato;
        const variant = stato === "attiva" ? "default" : stato === "completata" ? "secondary" : "outline";
        return <Badge variant={variant} className="text-[10px]">{stato}</Badge>;
      },
    },
    {
      key: "cssrImporto" as any, label: "Importo Contratto", sortable: true, align: "right",
      render: (r) => {
        if (!r.cssrData?.importo_contrattuale) return <span className="text-xs text-muted-foreground">—</span>;
        const val = parseFloat(r.cssrData.importo_contrattuale);
        return <span className="text-xs font-mono font-medium">{isNaN(val) ? r.cssrData.importo_contrattuale : formatCurrency(val)}</span>;
      },
    },
    {
      key: "fattureVendita", label: "Fatt. Vendita", sortable: true, align: "right",
      render: (r) => {
        const manual = manualCounts.get(r.cig)?.v || 0;
        return (
          <span className="text-xs font-mono">
            {r.fattureVendita}
            {manual > 0 && <Badge variant="outline" className="ml-1 text-[8px] px-1 py-0"><Link2 className="h-2 w-2 mr-0.5" />{manual}</Badge>}
          </span>
        );
      },
    },
    {
      key: "fattureAcquisto", label: "Fatt. Acquisto", sortable: true, align: "right",
      render: (r) => {
        const manual = manualCounts.get(r.cig)?.a || 0;
        return (
          <span className="text-xs font-mono">
            {r.fattureAcquisto}
            {manual > 0 && <Badge variant="outline" className="ml-1 text-[8px] px-1 py-0"><Link2 className="h-2 w-2 mr-0.5" />{manual}</Badge>}
          </span>
        );
      },
    },
  ];
}

const ListaCommessePage = () => {
  const { allSales, allPurchases, loading } = useInvoiceData();
  const { links, addLink, removeLink } = useCommessaLinks();
  const { byCig, loading: cssrLoading } = useCssrCommesse();
  const [selected, setSelected] = useState<Commessa | null>(null);

  const manualCounts = useMemo(() => {
    const map = new Map<string, { v: number; a: number }>();
    links.forEach((l) => {
      const entry = map.get(l.cig) || { v: 0, a: 0 };
      if (l.invoiceType === "vendita") entry.v++;
      else entry.a++;
      map.set(l.cig, entry);
    });
    return map;
  }, [links]);

  const commesse = useMemo(() => {
    const cigMap = new Map<string, { oggetto: string; committente: string; assegnataria: string; fv: number; fa: number }>();

    allSales.forEach((s) => {
      if (s.cig) {
        const existing = cigMap.get(s.cig);
        if (existing) {
          existing.fv++;
        } else {
          cigMap.set(s.cig, { oggetto: s.descrizione || "—", committente: s.cliente || "—", assegnataria: "—", fv: 1, fa: 0 });
        }
      }
    });

    allPurchases.forEach((p) => {
      if (p.cig) {
        const existing = cigMap.get(p.cig);
        if (existing) {
          existing.fa++;
          if (existing.assegnataria === "—") existing.assegnataria = p.fornitore || "—";
        } else {
          cigMap.set(p.cig, { oggetto: p.descrizione || "—", committente: "—", assegnataria: p.fornitore || "—", fv: 0, fa: 1 });
        }
      }
    });

    // Also add CSSR commesse that have a CIG but no invoices yet
    byCig.forEach((cssrData, cig) => {
      if (!cigMap.has(cig)) {
        cigMap.set(cig, {
          oggetto: cssrData.oggetto_lavori || "—",
          committente: cssrData.committente || "—",
          assegnataria: cssrData.impresa_assegnataria || "—",
          fv: 0,
          fa: 0,
        });
      }
    });

    const result: Commessa[] = [];
    let idx = 1;
    cigMap.forEach((val, cig) => {
      const mc = manualCounts.get(cig);
      const cssrData = byCig.get(cig);

      // Enrich with CSSR data if available
      const oggetto = cssrData?.oggetto_lavori || val.oggetto;
      const committente = cssrData?.committente || val.committente;
      const assegnataria = cssrData?.impresa_assegnataria || val.assegnataria;

      result.push({
        numero: idx++,
        cig,
        oggetto,
        committente,
        assegnataria,
        fattureVendita: val.fv + (mc?.v || 0),
        fattureAcquisto: val.fa + (mc?.a || 0),
        cssrData,
      });
    });
    return result;
  }, [allSales, allPurchases, manualCounts, byCig]);

  const columns = useMemo(() => makeColumns(manualCounts), [manualCounts]);

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
        <h2 className="text-lg font-bold tracking-tight">Commesse</h2>
        <p className="text-sm text-muted-foreground">
          {commesse.length} commesse trovate
          {commesse.filter(c => c.cssrData).length > 0 && (
            <span className="ml-2 text-primary">
              · {commesse.filter(c => c.cssrData).length} da CSSR
            </span>
          )}
        </p>
      </div>
      <DataTable<Commessa> columns={columns} data={commesse} rowKey={(r) => r.cig} onRowClick={setSelected} />
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
