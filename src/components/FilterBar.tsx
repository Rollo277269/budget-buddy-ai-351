import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { Filters } from "@/hooks/useInvoiceData";

interface FilterBarProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  options: {
    years: number[];
    clients: string[];
    suppliers: string[];
    cigs: string[];
  };
}

export function FilterBar({ filters, onFiltersChange, options }: FilterBarProps) {
  const update = (key: keyof Filters, value: string) => {
    onFiltersChange({ ...filters, [key]: value === "all" ? "" : value });
  };

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5 min-w-[160px]">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Anno</label>
        <Select value={filters.anno || "all"} onValueChange={(v) => update("anno", v)}>
          <SelectTrigger className="bg-card">
            <SelectValue placeholder="Tutti gli anni" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli anni</SelectItem>
            {options.years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 min-w-[220px] max-w-[300px]">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cliente</label>
        <Select value={filters.cliente || "all"} onValueChange={(v) => update("cliente", v)}>
          <SelectTrigger className="bg-card">
            <SelectValue placeholder="Tutti i clienti" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i clienti</SelectItem>
            {options.clients.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 min-w-[220px] max-w-[300px]">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fornitore</label>
        <Select value={filters.fornitore || "all"} onValueChange={(v) => update("fornitore", v)}>
          <SelectTrigger className="bg-card">
            <SelectValue placeholder="Tutti i fornitori" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i fornitori</SelectItem>
            {options.suppliers.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 min-w-[180px] max-w-[240px]">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">CIG</label>
        <Select value={filters.cig || "all"} onValueChange={(v) => update("cig", v)}>
          <SelectTrigger className="bg-card font-mono text-xs">
            <SelectValue placeholder="Tutti i CIG" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i CIG</SelectItem>
            {options.cigs.map((c) => (
              <SelectItem key={c} value={c} className="font-mono text-xs">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFiltersChange({ anno: "", cliente: "", fornitore: "", cig: "" })}
          className="text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset
        </Button>
      )}
    </div>
  );
}
