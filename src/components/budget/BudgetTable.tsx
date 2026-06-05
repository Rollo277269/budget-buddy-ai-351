import { BudgetMonth, BudgetRow, rowTotal } from "@/lib/budgetEngine";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  months: BudgetMonth[];
  rows: BudgetRow[];
  showTotal?: boolean;
}

function fmt(v: number): string {
  if (!v || Math.abs(v) < 0.005) return "—";
  return formatCurrency(v);
}

export function BudgetTable({ months, rows, showTotal = true }: Props) {
  return (
    <div className="overflow-x-auto border rounded-md bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            <th className="text-left px-2 py-1.5 font-semibold sticky left-0 bg-muted/50 z-10 min-w-[260px]">Voce</th>
            {months.map((m) => (
              <th key={m.key} className="text-right px-2 py-1.5 font-semibold font-mono whitespace-nowrap min-w-[90px]">
                {m.label}
              </th>
            ))}
            {showTotal && (
              <th className="text-right px-2 py-1.5 font-semibold font-mono whitespace-nowrap min-w-[110px] bg-muted">
                Tot. 12m
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isSection = r.kind === "section";
            const isSubtotal = r.kind === "subtotal";
            const isTotal = r.kind === "total";
            const total = rowTotal(r);
            return (
              <tr
                key={r.key}
                className={cn(
                  "border-b",
                  isSection && "bg-muted/30 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground",
                  isSubtotal && "bg-muted/20 font-semibold",
                  isTotal && "bg-primary/5 font-bold border-t-2 border-primary/40",
                )}
              >
                <td className={cn(
                  "px-2 py-1 sticky left-0 z-10 whitespace-nowrap",
                  isSection ? "bg-muted/30" : isSubtotal ? "bg-muted/20" : isTotal ? "bg-primary/5" : "bg-card",
                )}>
                  <span>{r.label}</span>
                  {r.source && !isSection && (
                    <span className="ml-1 text-[9px] text-muted-foreground italic">— {r.source}</span>
                  )}
                </td>
                {months.map((m) => {
                  const v = r.values[m.key] || 0;
                  if (isSection) return <td key={m.key} />;
                  const signedV = r.sign === -1 ? -Math.abs(v) : v;
                  return (
                    <td
                      key={m.key}
                      className={cn(
                        "text-right px-2 py-1 font-mono whitespace-nowrap",
                        signedV < 0 && "text-expense",
                        signedV > 0 && r.sign === 1 && "text-income",
                      )}
                    >
                      {fmt(signedV)}
                    </td>
                  );
                })}
                {showTotal && !isSection && (
                  <td className={cn(
                    "text-right px-2 py-1 font-mono font-semibold whitespace-nowrap bg-muted/30",
                    (r.sign === -1 ? -Math.abs(total) : total) < 0 && "text-expense",
                    (r.sign === -1 ? -Math.abs(total) : total) > 0 && r.sign === 1 && "text-income",
                  )}>
                    {fmt(r.sign === -1 ? -Math.abs(total) : total)}
                  </td>
                )}
                {showTotal && isSection && <td />}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}