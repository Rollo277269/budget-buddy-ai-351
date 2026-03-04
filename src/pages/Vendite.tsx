import { useMemo, useState, useCallback } from "react";
import { useInvoiceData, SaleInvoice } from "@/hooks/useInvoiceData";
import { FilterBar } from "@/components/FilterBar";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { InvoiceDetailSheet } from "@/components/InvoiceDetailSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, TrendingUp } from "lucide-react";
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

interface CentroCR {
  id: string;
  tipo: "costo" | "ricavo";
  codice: string;
  descrizione: string;
  responsabile: string;
  note: string;
}

const CENTRI_KEY = "centri-costo-ricavo";
const CENTRO_RICAVO_MAP_KEY = "centro-ricavo-map";

function loadCentri(): CentroCR[] {
  try { return JSON.parse(localStorage.getItem(CENTRI_KEY) || "[]"); }
  catch { return []; }
}

function loadCentroRicavoMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CENTRO_RICAVO_MAP_KEY) || "{}"); }
  catch { return {}; }
}

function saveCentroRicavoMap(map: Record<string, string>) {
  localStorage.setItem(CENTRO_RICAVO_MAP_KEY, JSON.stringify(map));
}

function CentroRicavoCell({
  invoice,
  centri,
  centroMap,
  onAssign,
}: {
  invoice: SaleInvoice;
  centri: CentroCR[];
  centroMap: Record<string, string>;
  onAssign: (key: string, codice: string) => void;
}) {
  const key = `${invoice.anno}-${invoice.numero}`;
  const assigned = centroMap[key];
  const centriRicavo = centri.filter((c) => c.tipo === "ricavo");

  if (centriRicavo.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <Select value={assigned || ""} onValueChange={(v) => onAssign(key, v)}>
      <SelectTrigger className="h-7 text-[11px] w-[130px] font-mono">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {centriRicavo.map((c) => (
          <SelectItem key={c.codice} value={c.codice} className="text-xs">
            <span className="font-mono">{c.codice}</span>
            <span className="text-muted-foreground ml-1">- {c.descrizione}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const VenditePage = () => {
  const { sales, loading, filters, setFilters, filterOptions } = useInvoiceData();
  const [selectedInvoice, setSelectedInvoice] = useState<SaleInvoice | null>(null);
  const [centroMap, setCentroMap] = useState<Record<string, string>>(loadCentroRicavoMap);
  const [classifying, setClassifying] = useState(false);
  const centri = useMemo(() => loadCentri(), []);
  const centriRicavo = useMemo(() => centri.filter((c) => c.tipo === "ricavo"), [centri]);

  const handleAssign = useCallback((key: string, codice: string) => {
    setCentroMap((prev) => {
      const next = { ...prev, [key]: codice };
      saveCentroRicavoMap(next);
      return next;
    });
  }, []);

  const handleAIClassify = useCallback(async () => {
    if (centriRicavo.length === 0) {
      toast.error("Definisci prima i centri di ricavo in Strumenti → Centri C/R");
      return;
    }

    const unclassified = sales.filter((s) => !centroMap[`${s.anno}-${s.numero}`]);
    if (unclassified.length === 0) {
      toast.info("Tutte le fatture sono già classificate");
      return;
    }

    setClassifying(true);
    try {
      // Process in batches of 20
      const batchSize = 20;
      let totalClassified = 0;
      const newMap = { ...centroMap };

      for (let i = 0; i < unclassified.length; i += batchSize) {
        const batch = unclassified.slice(i, i + batchSize);

        const { data, error } = await supabase.functions.invoke("classify-centro-ricavo", {
          body: { invoices: batch, centri },
        });

        if (error) {
          console.error("Classify error:", error);
          toast.error("Errore nella classificazione AI");
          break;
        }

        const classifications = data?.classifications || [];
        classifications.forEach((c: { id: string; codice: string }) => {
          if (c.codice && c.codice !== "N/A") {
            newMap[c.id] = c.codice;
            totalClassified++;
          }
        });
      }

      setCentroMap(newMap);
      saveCentroRicavoMap(newMap);
      toast.success(`${totalClassified} fatture classificate automaticamente`);
    } catch (e) {
      console.error(e);
      toast.error("Errore nella classificazione");
    } finally {
      setClassifying(false);
    }
  }, [sales, centroMap, centri, centriRicavo]);

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
        key: "centroRicavo",
        label: "Centro Ricavo",
        filterable: true,
        render: (r) => (
          <CentroRicavoCell
            invoice={r}
            centri={centri}
            centroMap={centroMap}
            onAssign={handleAssign}
          />
        ),
      },
      { key: "scadenza", label: "Scadenza", render: (r) => <span className="text-xs">{r.scadenza || "—"}</span>, sortable: true, defaultHidden: true },
      { key: "pagamento", label: "Pagamento", render: (r) => <span className="text-xs">{r.pagamento || "—"}</span>, sortable: true, defaultHidden: true },
      { key: "descrizione", label: "Descrizione", render: (r) => <span className="text-xs max-w-[250px] truncate block">{r.descrizione || "—"}</span>, defaultHidden: true },
      { key: "partitaIva", label: "P.IVA", render: (r) => <span className="font-mono text-[11px]">{r.partitaIva || "—"}</span>, defaultHidden: true },
    ],
    [centri, centroMap, handleAssign]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const unclassifiedCount = sales.filter((s) => !centroMap[`${s.anno}-${s.numero}`]).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Fatture di Vendita</h2>
          <p className="text-sm text-muted-foreground">{sales.length} fatture trovate</p>
        </div>
        {centriRicavo.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleAIClassify}
            disabled={classifying || unclassifiedCount === 0}
          >
            {classifying ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            )}
            {classifying ? "Classifico..." : `Classifica con AI (${unclassifiedCount})`}
          </Button>
        )}
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
