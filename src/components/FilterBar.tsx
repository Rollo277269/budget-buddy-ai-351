import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { Filters } from "@/hooks/useInvoiceData";
import { Combobox } from "@/components/ui/combobox";
import { useMemo } from "react";

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
    onFiltersChange({ ...filters, [key]: value });
  };

  const hasFilters = Object.values(filters).some(Boolean);

  const yearOptions = useMemo(() => [
    { value: "", label: "Tutti gli anni" },
    ...options.years.map((y) => ({ value: String(y), label: String(y) })),
  ], [options.years]);

  const clientOptions = useMemo(() => [
    { value: "", label: "Tutti i clienti" },
    ...options.clients.map((c) => ({ value: c, label: c })),
  ], [options.clients]);

  const supplierOptions = useMemo(() => [
    { value: "", label: "Tutti i fornitori" },
    ...options.suppliers.map((s) => ({ value: s, label: s })),
  ], [options.suppliers]);

  const cigOptions = useMemo(() => [
    { value: "", label: "Tutti i CIG" },
    ...options.cigs.map((c) => ({ value: c, label: c })),
  ], [options.cigs]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5 min-w-[160px]">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Anno</label>
        <Combobox
          value={filters.anno}
          onValueChange={(v) => update("anno", v)}
          options={yearOptions}
          placeholder="Tutti gli anni"
          searchPlaceholder="Cerca anno..."
        />
      </div>

      <div className="space-y-1.5 min-w-[220px] max-w-[300px]">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cliente</label>
        <Combobox
          value={filters.cliente}
          onValueChange={(v) => update("cliente", v)}
          options={clientOptions}
          placeholder="Tutti i clienti"
          searchPlaceholder="Cerca cliente..."
        />
      </div>

      <div className="space-y-1.5 min-w-[220px] max-w-[300px]">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fornitore</label>
        <Combobox
          value={filters.fornitore}
          onValueChange={(v) => update("fornitore", v)}
          options={supplierOptions}
          placeholder="Tutti i fornitori"
          searchPlaceholder="Cerca fornitore..."
        />
      </div>

      <div className="space-y-1.5 min-w-[180px] max-w-[240px]">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">CIG</label>
        <Combobox
          value={filters.cig}
          onValueChange={(v) => update("cig", v)}
          options={cigOptions}
          placeholder="Tutti i CIG"
          searchPlaceholder="Cerca CIG..."
          className="font-mono text-xs"
        />
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
