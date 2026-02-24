import { useMemo } from "react";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { Loader2 } from "lucide-react";

interface Commessa {
  numero: number;
  oggetto: string;
  committente: string;
  assegnataria: string;
  cig: string;
}

const columns: ColumnDef<Commessa>[] = [
  { key: "numero", label: "N°", render: (r) => <span className="font-mono text-xs">{r.numero}</span>, sortable: true },
  { key: "oggetto", label: "Oggetto", render: (r) => <span className="text-xs max-w-[300px] truncate block">{r.oggetto}</span>, sortable: true, filterable: true },
  { key: "committente", label: "Committente", render: (r) => <span className="text-xs max-w-[200px] truncate block">{r.committente}</span>, sortable: true, filterable: true },
  { key: "assegnataria", label: "Assegnataria dei lavori", render: (r) => <span className="text-xs max-w-[200px] truncate block">{r.assegnataria}</span>, sortable: true, filterable: true },
  { key: "cig", label: "CIG", render: (r) => <span className="font-mono text-[11px]">{r.cig}</span>, sortable: true, filterable: true },
];

const ListaCommessePage = () => {
  const { allSales, allPurchases, loading } = useInvoiceData();

  const commesse = useMemo(() => {
    const cigMap = new Map<string, { oggetto: string; committente: string; assegnataria: string }>();

    allSales.forEach((s) => {
      if (s.cig && !cigMap.has(s.cig)) {
        cigMap.set(s.cig, {
          oggetto: s.descrizione || "—",
          committente: s.cliente || "—",
          assegnataria: "—",
        });
      }
    });

    allPurchases.forEach((p) => {
      if (p.cig) {
        const existing = cigMap.get(p.cig);
        if (existing) {
          if (existing.assegnataria === "—") {
            existing.assegnataria = p.fornitore || "—";
          }
        } else {
          cigMap.set(p.cig, {
            oggetto: p.descrizione || "—",
            committente: "—",
            assegnataria: p.fornitore || "—",
          });
        }
      }
    });

    const result: Commessa[] = [];
    let idx = 1;
    cigMap.forEach((val, cig) => {
      result.push({ numero: idx++, cig, ...val });
    });
    return result;
  }, [allSales, allPurchases]);

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
        <h2 className="text-lg font-bold tracking-tight">Commesse</h2>
        <p className="text-sm text-muted-foreground">{commesse.length} commesse trovate</p>
      </div>
      <DataTable<Commessa> columns={columns} data={commesse} rowKey={(r) => r.cig} />
    </div>
  );
};

export default ListaCommessePage;
