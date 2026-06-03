import { useInvoiceData } from "@/hooks/useInvoiceData";
import { useBankData } from "@/hooks/useBankData";
import { useCommessaLinks } from "@/hooks/useCommessaLinks";
import { StatCard } from "@/components/StatCard";
import { FilterBar } from "@/components/FilterBar";
import { MonthlyChart } from "@/components/SummaryChart";
import { ClientPieChart, SupplierPieChart, CentroRicavoChart } from "@/components/PieCharts";
import { CigDetailTable } from "@/components/CigDetailTable";
import { DeadlineAnalysis } from "@/components/DeadlineAnalysis";
import { BankReconciliationSummary } from "@/components/BankReconciliationSummary";
import { YearSummaryTable } from "@/components/YearSummaryTable";
import { CommessaDetailSheet } from "@/components/CommessaDetailSheet";
import { formatCurrency } from "@/lib/format";
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Receipt,
  Loader2,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemo, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";

const Index = () => {
  const {
    sales,
    purchases,
    allSales,
    allPurchases,
    loading,
    filters,
    setFilters,
    filterOptions,
  } = useInvoiceData();

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

  const { allMovements: movements, stats: bankStats } = useBankData(sales, purchases);

  const stats = useMemo(() => {
    const totalSales = sales.reduce((a, s) => a + s.totale, 0);
    const totalPurchases = purchases.reduce((a, p) => a + p.totale, 0);
    const totalTaxSales = sales.reduce((a, s) => a + s.imposta, 0);
    const totalTaxPurchases = purchases.reduce((a, p) => a + p.imposta, 0);
    return {
      totalSales,
      totalPurchases,
      balance: totalSales - totalPurchases,
      taxBalance: totalTaxSales - totalTaxPurchases,
      countSales: sales.length,
      countPurchases: purchases.length,
    };
  }, [sales, purchases]);

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
    <div>
      <div className="p-6 space-y-6 bg-white">
        {/* Filters */}
        <div className="flex items-center justify-between gap-4 no-print">
          <FilterBar filters={filters} onFiltersChange={setFilters} options={filterOptions} />
          <Button variant="outline" size="sm" onClick={() => window.print()} className="shrink-0" title="Esporta il cruscotto in PDF">
            <Printer className="h-4 w-4 mr-1" /> Stampa PDF
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Totale Vendite" value={formatCurrency(stats.totalSales)} subtitle={`${stats.countSales} fatture`} icon={TrendingUp} variant="income" />
          <StatCard title="Totale Acquisti" value={formatCurrency(stats.totalPurchases)} subtitle={`${stats.countPurchases} fatture`} icon={TrendingDown} variant="expense" />
          <StatCard title="Saldo" value={formatCurrency(stats.balance)} subtitle="Vendite - Acquisti" icon={Scale} variant="balance" />
          <StatCard title="Saldo IVA" value={formatCurrency(stats.taxBalance)} subtitle="IVA vendite - IVA acquisti" icon={Receipt} variant="neutral" />
        </div>

        {/* Chart */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4">{filters.anno ? "Andamento Mensile" : "Andamento Annuale"}</h2>
          <MonthlyChart sales={sales} purchases={purchases} movements={movements} selectedYear={filters.anno} />
        </div>

        {/* Pie Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4">Distribuzione Vendite per Cliente</h2>
            <ClientPieChart sales={sales} />
          </div>
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4">Distribuzione Acquisti per Fornitore</h2>
            <SupplierPieChart purchases={purchases} />
          </div>
        </div>

        {/* Centro Ricavo Chart */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4">Ricavi per Centro di Ricavo</h2>
          <CentroRicavoChart sales={sales} />
        </div>

        {/* Bank Reconciliation Summary */}
        {movements.length > 0 && (
          <BankReconciliationSummary movements={movements} stats={bankStats} />
        )}

        {/* Deadline Analysis */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Analisi Scadenze</h2>
          <DeadlineAnalysis sales={sales} purchases={purchases} />
        </div>

        {/* Year Summary */}
        <YearSummaryTable allSales={allSales} allPurchases={allPurchases} />

        {/* CIG Detail */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Dettaglio per CIG / Commessa</h2>
          <CigDetailTable sales={sales} purchases={purchases} onCigClick={handleCigClick} />
        </div>
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

export default Index;
