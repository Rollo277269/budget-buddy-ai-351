import { useMemo } from "react";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import { useCssrCommesse } from "@/hooks/useCssrCommesse";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface Offerta {
  numero: number;
  cig: string;
  oggetto: string;
  cliente: string;
  fornitore: string;
  totaleVendite: number;
  totaleAcquisti: number;
  fattureVendita: number;
  fattureAcquisto: number;
}

const columns: ColumnDef<Offerta>[] = [
{ key: "numero", label: "N°", render: (r) => <span className="font-mono text-xs">{r.numero}</span>, sortable: true },
{ key: "cig", label: "CIG", sortable: true, filterable: true, render: (r) => <span className="font-mono text-[11px]">{r.cig}</span> },
{ key: "oggetto", label: "Oggetto / Descrizione", sortable: true, filterable: true, render: (r) => <span className="text-xs max-w-[300px] truncate block">{r.oggetto}</span> },
{ key: "cliente", label: "Cliente", sortable: true, filterable: true, render: (r) => <span className="text-xs max-w-[200px] truncate block">{r.cliente}</span> },
{ key: "fornitore", label: "Fornitore", sortable: true, filterable: true, render: (r) => <span className="text-xs max-w-[200px] truncate block">{r.fornitore}</span> },
{ key: "fattureVendita", label: "N° Fatt. Vendita", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{r.fattureVendita}</span> },
{ key: "totaleVendite", label: "Tot. Vendite", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{formatCurrency(r.totaleVendite)}</span> },
{ key: "fattureAcquisto", label: "N° Fatt. Acquisto", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{r.fattureAcquisto}</span> },
{ key: "totaleAcquisti", label: "Tot. Acquisti", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{formatCurrency(r.totaleAcquisti)}</span> }];


const OffertePage = () => {
  const { allSales, allPurchases, loading } = useInvoiceData();
  const { byCig, loading: cssrLoading } = useCssrCommesse();

  const rows = useMemo(() => {
    // Collect CIGs from invoices that do NOT appear in CSSR
    const cigMap = new Map<string, {oggetto: string;cliente: string;fornitore: string;tv: number;ta: number;fv: number;fa: number;}>();

    allSales.forEach((s) => {
      if (s.cig && !byCig.has(s.cig)) {
        const e = cigMap.get(s.cig) || { oggetto: s.descrizione || "—", cliente: s.cliente || "—", fornitore: "—", tv: 0, ta: 0, fv: 0, fa: 0 };
        e.tv += s.totale || 0;
        e.fv++;
        if (e.cliente === "—" && s.cliente) e.cliente = s.cliente;
        cigMap.set(s.cig, e);
      }
    });

    allPurchases.forEach((p) => {
      if (p.cig && !byCig.has(p.cig)) {
        const e = cigMap.get(p.cig) || { oggetto: p.descrizione || "—", cliente: "—", fornitore: p.fornitore || "—", tv: 0, ta: 0, fv: 0, fa: 0 };
        e.ta += p.totale || 0;
        e.fa++;
        if (e.fornitore === "—" && p.fornitore) e.fornitore = p.fornitore;
        cigMap.set(p.cig, e);
      }
    });

    const result: Offerta[] = [];
    let idx = 1;
    cigMap.forEach((val, cig) => {
      result.push({
        numero: idx++,
        cig,
        oggetto: val.oggetto,
        cliente: val.cliente,
        fornitore: val.fornitore,
        totaleVendite: val.tv,
        totaleAcquisti: val.ta,
        fattureVendita: val.fv,
        fattureAcquisto: val.fa
      });
    });
    return result;
  }, [allSales, allPurchases, byCig]);

  if (loading || cssrLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>);

  }

  return (
    <div className="p-6 space-y-6 bg-slate-300">
      <div>
        
        <p className="text-sm text-muted-foreground">
          {rows.length} CIG presenti nelle fatture ma non ancora registrati come commesse CSSR
        </p>
      </div>
      <DataTable<Offerta> columns={columns} data={rows} rowKey={(r) => r.cig} />
    </div>);

};

export default OffertePage;