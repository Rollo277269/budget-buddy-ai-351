import { BudgetMonth, BudgetRow, rowTotal } from "@/lib/budgetEngine";
import { BudgetTable } from "./BudgetTable";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

interface Props {
  months: BudgetMonth[];
  rows: BudgetRow[];
  commesseDetail: Array<{ cig: string; oggetto: string; residuo: number; values: Record<string, number> }>;
}

export function ContoEconomicoPrevisionale({ months, rows, commesseDetail }: Props) {
  const ricaviTot = rows.find((r) => r.key === "tot-ricavi");
  const ebitda = rows.find((r) => r.key === "ebitda");
  const risultato = rows.find((r) => r.key === "risultato");
  const totaleRicavi = ricaviTot ? rowTotal(ricaviTot) : 0;
  const totaleEbitda = ebitda ? rowTotal(ebitda) : 0;
  const totaleRisultato = risultato ? rowTotal(risultato) : 0;
  const ebitdaPct = totaleRicavi > 0 ? (totaleEbitda / totaleRicavi) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ricavi previsti 12m</p>
            <p className="text-lg font-bold font-mono text-income">{formatCurrency(totaleRicavi)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">EBITDA previsto</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(totaleEbitda)}</p>
            <p className="text-[10px] text-muted-foreground">{ebitdaPct.toFixed(1)}% margine</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Risultato ante imposte</p>
            <p className={`text-lg font-bold font-mono ${totaleRisultato < 0 ? "text-expense" : "text-income"}`}>{formatCurrency(totaleRisultato)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Commesse aperte</p>
            <p className="text-lg font-bold">{commesseDetail.length}</p>
            <p className="text-[10px] text-muted-foreground font-mono">
              Residuo: {formatCurrency(commesseDetail.reduce((s, c) => s + c.residuo, 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      <BudgetTable months={months} rows={rows} />

      {commesseDetail.length > 0 && (
        <div className="border rounded-md bg-card">
          <div className="px-3 py-2 border-b bg-muted/30">
            <h3 className="text-xs font-semibold">Dettaglio commesse aperte (ricavi residui)</h3>
            <p className="text-[10px] text-muted-foreground">Distribuzione lineare dell'importo residuo sui mesi di durata contrattuale residua.</p>
          </div>
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/20 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1.5 font-semibold">CIG</th>
                  <th className="text-left px-2 py-1.5 font-semibold">Oggetto</th>
                  <th className="text-right px-2 py-1.5 font-semibold font-mono">Residuo</th>
                  {months.map((m) => (
                    <th key={m.key} className="text-right px-2 py-1.5 font-semibold font-mono whitespace-nowrap">
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commesseDetail
                  .slice()
                  .sort((a, b) => b.residuo - a.residuo)
                  .map((c) => (
                    <tr key={c.cig} className="border-b hover:bg-muted/20">
                      <td className="px-2 py-1 font-mono text-[10px]">{c.cig}</td>
                      <td className="px-2 py-1 truncate max-w-[260px]" title={c.oggetto}>{c.oggetto}</td>
                      <td className="text-right px-2 py-1 font-mono font-semibold text-income">{formatCurrency(c.residuo)}</td>
                      {months.map((m) => {
                        const v = c.values[m.key] || 0;
                        return (
                          <td key={m.key} className="text-right px-2 py-1 font-mono text-muted-foreground whitespace-nowrap">
                            {v ? formatCurrency(v) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}