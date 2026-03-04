import { useInvoiceData } from "@/hooks/useInvoiceData";
import { StatCard } from "@/components/StatCard";
import { FilterBar } from "@/components/FilterBar";
import { MonthlyChart } from "@/components/SummaryChart";
import { ClientPieChart, SupplierPieChart, CentroRicavoChart } from "@/components/PieCharts";
import { CigDetailTable } from "@/components/CigDetailTable";
import { DeadlineAnalysis } from "@/components/DeadlineAnalysis";
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Receipt,
  Loader2,
} from "lucide-react";
import { useMemo } from "react";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

const Index = () => {
  const {
    sales,
    purchases,
    loading,
    filters,
    setFilters,
    filterOptions,
  } = useInvoiceData();

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
    <div>

      <div className="p-6 space-y-6">
        {/* Filters */}
        <FilterBar
          filters={filters}
          onFiltersChange={setFilters}
          options={filterOptions}
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Totale Vendite"
            value={formatCurrency(stats.totalSales)}
            subtitle={`${stats.countSales} fatture`}
            icon={TrendingUp}
            variant="income"
          />
          <StatCard
            title="Totale Acquisti"
            value={formatCurrency(stats.totalPurchases)}
            subtitle={`${stats.countPurchases} fatture`}
            icon={TrendingDown}
            variant="expense"
          />
          <StatCard
            title="Saldo"
            value={formatCurrency(stats.balance)}
            subtitle="Vendite - Acquisti"
            icon={Scale}
            variant="balance"
          />
          <StatCard
            title="Saldo IVA"
            value={formatCurrency(stats.taxBalance)}
            subtitle="IVA vendite - IVA acquisti"
            icon={Receipt}
            variant="neutral"
          />
        </div>

        {/* Chart */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4">Andamento Mensile</h2>
          <MonthlyChart sales={sales} purchases={purchases} />
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

        {/* Deadline Analysis */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Analisi Scadenze</h2>
          <DeadlineAnalysis sales={sales} purchases={purchases} />
        </div>

        {/* CIG Detail */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Dettaglio per CIG / Commessa</h2>
          <CigDetailTable sales={sales} purchases={purchases} />
        </div>

      </div>
    </div>
  );
};

export default Index;
