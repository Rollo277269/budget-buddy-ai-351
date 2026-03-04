import { useMemo, useState, useCallback } from "react";
import { useInvoiceData, SaleInvoice } from "@/hooks/useInvoiceData";
import { useCentriData, useCentroMap } from "@/hooks/useCentri";
import { CentroCell } from "@/components/CentroCell";
import { FilterBar } from "@/components/FilterBar";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { InvoiceDetailSheet } from "@/components/InvoiceDetailSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

const VenditePage = () => {
  const { sales, loading, filters, setFilters, filterOptions } = useInvoiceData();
  const [selectedInvoice, setSelectedInvoice] = useState<SaleInvoice | null>(null);
  const { centri, centriCosto, centriRicavo } = useCentriData();
  const ricavoMap = useCentroMap("ricavo", "vendite");
  const costoMap = useCentroMap("costo", "vendite");
  const [classifying, setClassifying] = useState(false);

  const handleAIClassify = useCallback(async () => {
    const hasRicavo = centriRicavo.length > 0;
    const hasCosto = centriCosto.length > 0;
    if (!hasRicavo && !hasCosto) {
      toast.error("Definisci prima i centri in Strumenti → Centri C/R");
      return;
    }

    setClassifying(true);
    try {
      let totalClassified = 0;
      const batchSize = 20;

      // Classify ricavo
      if (hasRicavo) {
        const unclassified = sales.filter((s) => !ricavoMap.map[`${s.anno}-${s.numero}`]);
        for (let i = 0; i < unclassified.length; i += batchSize) {
          const batch = unclassified.slice(i, i + batchSize);
          const { data, error } = await supabase.functions.invoke("classify-centro-ricavo", {
            body: { invoices: batch, centri, tipo: "ricavo", tipoFattura: "vendita" },
          });
          if (error) { toast.error("Errore classificazione ricavi"); break; }
          (data?.classifications || []).forEach((c: { id: string; codice: string }) => {
            if (c.codice && c.codice !== "N/A") { ricavoMap.assign(c.id, c.codice); totalClassified++; }
          });
        }
      }

      // Classify costo
      if (hasCosto) {
        const unclassified = sales.filter((s) => !costoMap.map[`${s.anno}-${s.numero}`]);
        for (let i = 0; i < unclassified.length; i += batchSize) {
          const batch = unclassified.slice(i, i + batchSize);
          const { data, error } = await supabase.functions.invoke("classify-centro-ricavo", {
            body: { invoices: batch, centri, tipo: "costo", tipoFattura: "vendita" },
          });
          if (error) { toast.error("Errore classificazione costi"); break; }
          (data?.classifications || []).forEach((c: { id: string; codice: string }) => {
            if (c.codice && c.codice !== "N/A") { costoMap.assign(c.id, c.codice); totalClassified++; }
          });
        }
      }

      toast.success(`${totalClassified} classificazioni completate`);
    } catch (e) {
      console.error(e);
      toast.error("Errore nella classificazione");
    } finally {
      setClassifying(false);
    }
  }, [sales, centri, centriRicavo, centriCosto, ricavoMap, costoMap]);

  const columns: ColumnDef<SaleInvoice>[] = useMemo(
    () => [
      { key: "numero", label: "N°", render: (r) => <span className="font-mono text-xs">{r.numero}/{r.anno}</span>, sortable: true },
      { key: "data", label: "Data", render: (r) => <span className="text-xs">{r.data}</span>, sortable: true },
      { key: "cliente", label: "Cliente", render: (r) => <span className="text-xs max-w-[200px] truncate block">{r.cliente}</span>, sortable: true, filterable: true },
      { key: "cig", label: "CIG", render: (r) => <span className="font-mono text-[11px]">{r.cig || "—"}</span>, sortable: true, filterable: true },
      { key: "imponibile", label: "Imponibile", render: (r) => <span className="text-xs font-mono text-right block">{formatCurrency(r.imponibile)}</span>, sortable: true, align: "right" },
      { key: "imposta", label: "IVA", render: (r) => <span className="text-xs font-mono text-right block">{formatCurrency(r.imposta)}</span>, sortable: true, align: "right" },
      { key: "totale", label: "Totale", render: (r) => <span className="text-xs font-mono font-semibold text-right block">{formatCurrency(r.totale)}</span>, sortable: true, align: "right" },
      { key: "stato", label: "Stato", render: (r) => <StatusBadge stato={r.stato} />, sortable: true, filterable: true },
      {
        key: "centroRicavo", label: "Centro Ricavo", filterable: true,
        render: (r) => <CentroCell invoiceKey={`${r.anno}-${r.numero}`} tipo="ricavo" centri={centri} centroMap={ricavoMap.map} onAssign={ricavoMap.assign} />,
      },
      {
        key: "centroCosto", label: "Centro Costo", filterable: true,
        render: (r) => <CentroCell invoiceKey={`${r.anno}-${r.numero}`} tipo="costo" centri={centri} centroMap={costoMap.map} onAssign={costoMap.assign} />,
      },
      { key: "scadenza", label: "Scadenza", render: (r) => <span className="text-xs">{r.scadenza || "—"}</span>, sortable: true, defaultHidden: true },
      { key: "pagamento", label: "Pagamento", render: (r) => <span className="text-xs">{r.pagamento || "—"}</span>, sortable: true, defaultHidden: true },
      { key: "descrizione", label: "Descrizione", render: (r) => <span className="text-xs max-w-[250px] truncate block">{r.descrizione || "—"}</span>, defaultHidden: true },
      { key: "partitaIva", label: "P.IVA", render: (r) => <span className="font-mono text-[11px]">{r.partitaIva || "—"}</span>, defaultHidden: true },
    ],
    [centri, ricavoMap.map, ricavoMap.assign, costoMap.map, costoMap.assign]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasCentri = centriRicavo.length > 0 || centriCosto.length > 0;
  const unclassifiedCount = sales.filter((s) => {
    const k = `${s.anno}-${s.numero}`;
    return (centriRicavo.length > 0 && !ricavoMap.map[k]) || (centriCosto.length > 0 && !costoMap.map[k]);
  }).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Fatture di Vendita</h2>
          <p className="text-sm text-muted-foreground">{sales.length} fatture trovate</p>
        </div>
        {hasCentri && (
          <Button size="sm" variant="outline" onClick={handleAIClassify} disabled={classifying || unclassifiedCount === 0}>
            {classifying ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            {classifying ? "Classifico..." : `Classifica con AI (${unclassifiedCount})`}
          </Button>
        )}
      </div>
      <FilterBar filters={filters} onFiltersChange={setFilters} options={filterOptions} />
      <DataTable<SaleInvoice> columns={columns} data={sales} rowKey={(r) => `${r.anno}-${r.numero}`} onRowClick={setSelectedInvoice} />
      <InvoiceDetailSheet invoice={selectedInvoice} open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)} type="vendita" />
    </div>
  );
};

export default VenditePage;
