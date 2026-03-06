import { BankMovement } from "@/hooks/useBankData";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import { Landmark, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface Props {
  movements: BankMovement[];
  stats: {
    total: number;
    matched: number;
    unmatched: number;
    entrate: number;
    uscite: number;
  };
}

export function BankReconciliationSummary({ movements, stats }: Props) {
  const pct = stats.total > 0 ? Math.round((stats.matched / stats.total) * 100) : 0;

  const matchedEntrate = movements
    .filter((m) => m.importo > 0 && m.matchConfidence !== "none")
    .reduce((s, m) => s + m.importo, 0);
  const matchedUscite = movements
    .filter((m) => m.importo < 0 && m.matchConfidence !== "none")
    .reduce((s, m) => s + Math.abs(m.importo), 0);

  const autoCount = movements.filter((m) => m.matchConfidence === "auto").length;
  const manualCount = movements.filter((m) => m.matchConfidence === "manual").length;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-2 bg-primary/10 text-primary">
            <Landmark className="h-5 w-5" />
          </div>
          <h2 className="text-sm font-semibold">Riconciliazione Bancaria</h2>
        </div>
        <Link
          to="/banche"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Gestisci <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Movimenti riconciliati</span>
          <span className="font-mono font-medium text-foreground">
            {stats.matched}/{stats.total} ({pct}%)
          </span>
        </div>
        <Progress value={pct} className="h-2.5" />
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-accent/50 p-3 space-y-0.5">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-income" /> Riconciliati
          </p>
          <p className="text-lg font-bold font-mono text-foreground">{stats.matched}</p>
          <p className="text-[10px] text-muted-foreground">
            {autoCount} auto · {manualCount} manuali
          </p>
        </div>
        <div className="rounded-lg border bg-accent/50 p-3 space-y-0.5">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-expense" /> Da riconciliare
          </p>
          <p className="text-lg font-bold font-mono text-foreground">{stats.unmatched}</p>
        </div>
        <div className="rounded-lg border bg-accent/50 p-3 space-y-0.5">
          <p className="text-[11px] text-muted-foreground">Entrate riconciliate</p>
          <p className="text-sm font-bold font-mono text-income">{formatCurrency(matchedEntrate)}</p>
          <p className="text-[10px] text-muted-foreground">su {formatCurrency(stats.entrate)}</p>
        </div>
        <div className="rounded-lg border bg-accent/50 p-3 space-y-0.5">
          <p className="text-[11px] text-muted-foreground">Uscite riconciliate</p>
          <p className="text-sm font-bold font-mono text-expense">{formatCurrency(matchedUscite)}</p>
          <p className="text-[10px] text-muted-foreground">su {formatCurrency(stats.uscite)}</p>
        </div>
      </div>
    </div>
  );
}
