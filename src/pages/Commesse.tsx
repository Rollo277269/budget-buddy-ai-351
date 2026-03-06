import { useInvoiceData } from "@/hooks/useInvoiceData";
import { FilterBar } from "@/components/FilterBar";
import { CigDetailTable } from "@/components/CigDetailTable";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";

const CommessePage = () => {
  const { sales, purchases, loading, filters, setFilters, filterOptions } = useInvoiceData();
  const [searchParams, setSearchParams] = useSearchParams();

  // Pre-set CIG filter from URL query param
  useEffect(() => {
    const cigParam = searchParams.get("cig");
    if (cigParam && filters.cig !== cigParam) {
      setFilters({ ...filters, cig: cigParam });
      // Clean up the URL
      searchParams.delete("cig");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

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

  return (
    <div className="p-6 space-y-6">
      <FilterBar filters={filters} onFiltersChange={setFilters} options={filterOptions} />
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Dettaglio per CIG / Commessa</h2>
        <CigDetailTable sales={sales} purchases={purchases} />
      </div>
    </div>
  );
};

export default CommessePage;
