import { useMemo, useState } from "react";
import { useInvoiceData, SaleInvoice } from "@/hooks/useInvoiceData";
import { FilterBar } from "@/components/FilterBar";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { InvoiceDetailSheet } from "@/components/InvoiceDetailSheet";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function StatusBadge({ stato }: { stato: string }) {
  const s = stato.toLowerCase();
  if (s.includes("scadut"))
    return <Badge variant="destructive" className="text-[10px] font-medium">{stato}</Badge>;
  if (s.includes("scadere"))
    return <Badge variant="secondary" className="text-[10px] font-medium">{stato}</Badge>;
  return <Badge variant="outline" className="text-[10px] font-medium">{stato}</Badge>;
}

const columns: ColumnDef<SaleInvoice>[] = [
  { key: "numero", label: "N°", render: (r) => <span className="font-mono text-xs">{r.numero}/{r.anno}</span>, sortable: true },
  { key: "data", label: "Data", render: (r) => <span className="text-xs">{r.data}</span>, sortable: true },
  { key: "cliente", label: "Cliente", render: (r) => <span className="text-xs max-w-[200px] truncate block">{r.cliente}</span>, sortable: true, filterable: true },
  { key: "cig", label: "CIG", render: (r) => <span className="font-mono text-[11px]">{r.cig || "—"}</span>, sortable: true, filterable: true },
  { key: "imponibile", label: "Imponibile", render: (r) => <span className="text-xs font-mono text-right block">{formatCurrency(r.imponibile)}</span>, sortable: true, align: "right" },
  { key: "imposta", label: "IVA", render: (r) => <span className="text-xs font-mono text-right block">{formatCurrency(r.imposta)}</span>, sortable: true, align: "right" },
  { key: "totale", label: "Totale", render: (r) => <span className="text-xs font-mono font-semibold text-right block">{formatCurrency(r.totale)}</span>, sortable: true, align: "right" },
  { key: "stato", label: "Stato", render: (r) => <StatusBadge stato={r.stato} />, sortable: true, filterable: true },
  { key: "scadenza", label: "Scadenza", render: (r) => <span className="text-xs">{r.scadenza || "—"}</span>, sortable: true, defaultHidden: true },
  { key: "pagamento", label: "Pagamento", render: (r) => <span className="text-xs">{r.pagamento || "—"}</span>, sortable: true, defaultHidden: true },
  { key: "descrizione", label: "Descrizione", render: (r) => <span className="text-xs max-w-[250px] truncate block">{r.descrizione || "—"}</span>, defaultHidden: true },
  { key: "partitaIva", label: "P.IVA", render: (r) => <span className="font-mono text-[11px]">{r.partitaIva || "—"}</span>, defaultHidden: true },
];

const VenditePage = () => {
  const { sales, loading, filters, setFilters, filterOptions } = useInvoiceData();
  const [selectedInvoice, setSelectedInvoice] = useState<SaleInvoice | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Fatture di Vendita</h2>
        <p className="text-sm text-muted-foreground">{sales.length} fatture trovate</p>
      </div>
      <FilterBar filters={filters} onFiltersChange={setFilters} options={filterOptions} />
      <DataTable<SaleInvoice> columns={columns} data={sales} rowKey={(r) => `${r.anno}-${r.numero}`} onRowClick={setSelectedInvoice} />
      <InvoiceDetailSheet
        invoice={selectedInvoice}
        open={!!selectedInvoice}
        onOpenChange={(open) => !open && setSelectedInvoice(null)}
        type="vendita"
      />
    </div>
  );
};

export default VenditePage;
