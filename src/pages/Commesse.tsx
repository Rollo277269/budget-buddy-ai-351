import { useState, useCallback } from "react";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import { useCommessaLinks } from "@/hooks/useCommessaLinks";
import { FilterBar } from "@/components/FilterBar";
import { CigDetailTable } from "@/components/CigDetailTable";
import { CommessaDetailSheet } from "@/components/CommessaDetailSheet";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";

const CommessePage = () => {
  const { sales, purchases, allSales, allPurchases, loading, filters, setFilters, filterOptions } = useInvoiceData();
  const { links, addLink, removeLink, refresh: refreshLinks } = useCommessaLinks();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCig, setSelectedCig] = useState<string | null>(null);

  useEffect(() => {
    const cigParam = searchParams.get("cig");
    if (cigParam && filters.cig !== cigParam) {
      setFilters({ ...filters, cig: cigParam });
      searchParams.delete("cig");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

  const handleCigClick = useCallback((cig: string) => {
    setSelectedCig(cig);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Caricamento dati...</span>
        </div>
      </div>
    );
  }

  const commessa = selectedCig ? {
    numero: "",
    oggetto: "",
    committente: "",
    assegnataria: "",
    cig: selectedCig,
  } : null;

  return (
    <div className="p-6 space-y-6 bg-slate-300">
      <FilterBar filters={filters} onFiltersChange={setFilters} options={filterOptions} />
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Dettaglio per CIG (Gara / Commessa)</h2>
        <CigDetailTable sales={sales} purchases={purchases} onCigClick={handleCigClick} />
      </div>

      <CommessaDetailSheet
        commessa={commessa}
        open={!!selectedCig}
        onOpenChange={(open) => { if (!open) setSelectedCig(null); }}
        allSales={allSales}
        allPurchases={allPurchases}
        manualLinks={links}
        onAddLink={addLink}
        onRemoveLink={removeLink}
        onExpenseAdded={refreshLinks}
      />
    </div>
  );
};

export default CommessePage;
