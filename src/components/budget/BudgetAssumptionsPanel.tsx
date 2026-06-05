import { BudgetAssumptions } from "@/lib/budgetEngine";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

interface Props {
  assumptions: BudgetAssumptions;
  onChange: (a: BudgetAssumptions) => void;
}

export function BudgetAssumptionsPanel({ assumptions, onChange }: Props) {
  const update = (patch: Partial<BudgetAssumptions>) => onChange({ ...assumptions, ...patch });

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-semibold">Parametri previsionali</h3>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <Label>Anni di storico per le medie</Label>
              <span className="font-mono font-semibold">{assumptions.historyYears}</span>
            </div>
            <Slider
              value={[assumptions.historyYears]}
              min={1} max={5} step={1}
              onValueChange={([v]) => update({ historyYears: v })}
            />
            <p className="text-[10px] text-muted-foreground">Media dei costi struttura e altri ricavi calcolata sugli ultimi N anni.</p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <Label>Inflazione costi struttura (%)</Label>
              <span className="font-mono font-semibold">{assumptions.inflationPct}%</span>
            </div>
            <Slider
              value={[assumptions.inflationPct]}
              min={0} max={15} step={0.5}
              onValueChange={([v]) => update({ inflationPct: v })}
            />
            <p className="text-[10px] text-muted-foreground">Applicata alla media storica dei costi fissi.</p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <Label>Costi diretti commessa (% sui ricavi)</Label>
              <span className="font-mono font-semibold">{assumptions.directCostPct}%</span>
            </div>
            <Slider
              value={[assumptions.directCostPct]}
              min={30} max={95} step={1}
              onValueChange={([v]) => update({ directCostPct: v })}
            />
            <p className="text-[10px] text-muted-foreground">Stima del costo variabile per generare il margine di contribuzione.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Mese di partenza</Label>
            <Input
              type="month"
              value={assumptions.startMonth || ""}
              onChange={(e) => update({ startMonth: e.target.value || undefined })}
              className="h-8 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">Lasciare vuoto per partire dal mese corrente.</p>
          </div>

          <div className="pt-2 border-t flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              {Object.keys(assumptions.overrides).length} override manuali attivi
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => update({ overrides: {} })}
              disabled={Object.keys(assumptions.overrides).length === 0}
            >
              <RotateCcw className="h-3 w-3 mr-1" />Reset override
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2 text-xs">
          <h3 className="text-sm font-semibold">Note metodologiche</h3>
          <ul className="space-y-1.5 text-muted-foreground list-disc pl-4">
            <li>Schema CE riclassificato a margine di contribuzione (gestionale, OIC 11 - postulati di chiarezza e veridicità).</li>
            <li>Cash flow mensile metodo diretto, ispirato a OIC 10 (rendiconto finanziario).</li>
            <li>Conforme alle indicazioni del Codice della Crisi d'Impresa (D.Lgs. 14/2019, art. 3): assetti adeguati per la rilevazione tempestiva della crisi, incluso budget di tesoreria a 12 mesi.</li>
            <li>Ricavi da commesse aperte: importo contrattuale residuo distribuito linearmente sui mesi di durata residua del contratto.</li>
            <li>Costi diretti commessa: stimati come % sui ricavi residui (parametro modificabile).</li>
            <li>Costi struttura e altri ricavi: media mensile dello storico × (1 + inflazione%).</li>
            <li>Le previsioni sono indicative e non sostituiscono il bilancio civilistico (art. 2425 c.c.).</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}