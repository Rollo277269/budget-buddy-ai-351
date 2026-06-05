import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Wallet, Settings2, Loader2, GitCompareArrows } from "lucide-react";
import { BudgetAssumptions } from "@/lib/budgetEngine";
import { useBudgetData, loadAssumptions, saveAssumptions } from "@/hooks/useBudgetData";
import { ContoEconomicoPrevisionale } from "@/components/budget/ContoEconomicoPrevisionale";
import { CashFlowPrevisionale } from "@/components/budget/CashFlowPrevisionale";
import { BudgetAssumptionsPanel } from "@/components/budget/BudgetAssumptionsPanel";
import { ConfrontoStoricoPrevisionale } from "@/components/budget/ConfrontoStoricoPrevisionale";

export default function BudgetPage() {
  const [assumptions, setAssumptions] = useState<BudgetAssumptions>(() => loadAssumptions());

  useEffect(() => {
    saveAssumptions(assumptions);
  }, [assumptions]);

  const { months, ceRows, commesseDetail, cashFlowRows, initialBalance, loading } = useBudgetData(assumptions);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Calcolo previsioni...</span>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Bilancio previsionale — 12 mesi rolling</h1>
        <p className="text-xs text-muted-foreground">
          Conto Economico riclassificato + Cash Flow prospettico, alimentato da commesse aperte, scadenzario, rate finanziamenti e media storica.
        </p>
      </div>

      <Tabs defaultValue="ce" className="space-y-3">
        <TabsList>
          <TabsTrigger value="ce" className="text-xs">
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" />Conto Economico
          </TabsTrigger>
          <TabsTrigger value="cf" className="text-xs">
            <Wallet className="h-3.5 w-3.5 mr-1.5" />Cash Flow
          </TabsTrigger>
          <TabsTrigger value="cmp" className="text-xs">
            <GitCompareArrows className="h-3.5 w-3.5 mr-1.5" />Storico vs Previsionale
          </TabsTrigger>
          <TabsTrigger value="params" className="text-xs">
            <Settings2 className="h-3.5 w-3.5 mr-1.5" />Parametri
          </TabsTrigger>
        </TabsList>
        <TabsContent value="ce">
          <ContoEconomicoPrevisionale months={months} rows={ceRows} commesseDetail={commesseDetail} />
        </TabsContent>
        <TabsContent value="cf">
          <CashFlowPrevisionale months={months} rows={cashFlowRows} initialBalance={initialBalance} />
        </TabsContent>
        <TabsContent value="cmp">
          <ConfrontoStoricoPrevisionale assumptions={assumptions} />
        </TabsContent>
        <TabsContent value="params">
          <BudgetAssumptionsPanel assumptions={assumptions} onChange={setAssumptions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}