import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CentroCR } from "@/hooks/useCentri";

interface CentroCellProps {
  invoiceKey: string;
  tipo: "costo" | "ricavo";
  centri: CentroCR[];
  centroMap: Record<string, string>;
  onAssign: (key: string, codice: string) => void;
}

export function CentroCell({ invoiceKey, tipo, centri, centroMap, onAssign }: CentroCellProps) {
  const filtered = centri.filter((c) => c.tipo === tipo);
  const assigned = centroMap[invoiceKey];

  if (filtered.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <Select value={assigned || ""} onValueChange={(v) => onAssign(invoiceKey, v)}>
      <SelectTrigger className="h-7 text-[11px] w-[130px] font-mono">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {filtered.map((c) => (
          <SelectItem key={c.codice} value={c.codice} className="text-xs">
            <span className="font-mono">{c.codice}</span>
            <span className="text-muted-foreground ml-1">- {c.descrizione}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
