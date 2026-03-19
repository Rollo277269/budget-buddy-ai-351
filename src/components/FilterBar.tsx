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
    centriCosto?: { value: string; label: string }[];
    centriRicavo?: { value: string; label: string }[];
  };
  hideCliente?: boolean;
  hideFornitore?: boolean;
  compact?: boolean;
}

export function FilterBar({ filters, onFiltersChange, options, hideCliente, hideFornitore, compact }: FilterBarProps) {
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

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Combobox
          value={filters.anno}
          onValueChange={(v) => update("anno", v)}
          options={yearOptions}
          placeholder="Anno"
          searchPlaceholder="Cerca anno..."
          className="w-[130px]"
        />

        {!hideCliente && (
          <Combobox
            value={filters.cliente}
            onValueChange={(v) => update("cliente", v)}
            options={clientOptions}
            placeholder="Cliente"
            searchPlaceholder="Cerca cliente..."
            className="w-[200px]"
          />
        )}

        {!hideFornitore && (
          <Combobox
            value={filters.fornitore}
            onValueChange={(v) => update("fornitore", v)}
            options={supplierOptions}
            placeholder="Fornitore"
            searchPlaceholder="Cerca fornitore..."
            className="w-[200px]"
          />
        )}

        <Combobox
          value={filters.cig}
          onValueChange={(v) => update("cig", v)}
          options={cigOptions}
          placeholder="CIG"
          searchPlaceholder="Cerca CIG..."
          className="w-[160px] font-mono text-xs"
        />

        {options.centriCosto && options.centriCosto.length > 0 && (
          <Combobox
            value={filters.centroCosto}
            onValueChange={(v) => update("centroCosto", v)}
            options={[{ value: "", label: "Tutti i centri" }, ...options.centriCosto]}
            placeholder="C. Costo"
            searchPlaceholder="Cerca centro..."
            className="w-[150px]"
          />
        )}

        {options.centriRicavo && options.centriRicavo.length > 0 && (
          <Combobox
            value={filters.centroRicavo}
            onValueChange={(v) => update("centroRicavo", v)}
            options={[{ value: "", label: "Tutti i centri" }, ...options.centriRicavo]}
            placeholder="C. Ricavo"
            searchPlaceholder="Cerca centro..."
            className="w-[150px]"
          />
        )}

        {hasFilters && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => onFiltersChange({ anno: "", cliente: "", fornitore: "", cig: "", centroCosto: "", centroRicavo: "" })}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  }

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

      {!hideCliente && (
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
      )}

      {!hideFornitore && (
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
      )}

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

      {options.centriCosto && options.centriCosto.length > 0 && (
        <div className="space-y-1.5 min-w-[180px] max-w-[240px]">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Centro Costo</label>
          <Combobox
            value={filters.centroCosto}
            onValueChange={(v) => update("centroCosto", v)}
            options={[{ value: "", label: "Tutti i centri" }, ...options.centriCosto]}
            placeholder="Tutti i centri"
            searchPlaceholder="Cerca centro..."
          />
        </div>
      )}

      {options.centriRicavo && options.centriRicavo.length > 0 && (
        <div className="space-y-1.5 min-w-[180px] max-w-[240px]">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Centro Ricavo</label>
          <Combobox
            value={filters.centroRicavo}
            onValueChange={(v) => update("centroRicavo", v)}
            options={[{ value: "", label: "Tutti i centri" }, ...options.centriRicavo]}
            placeholder="Tutti i centri"
            searchPlaceholder="Cerca centro..."
          />
        </div>
      )}

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFiltersChange({ anno: "", cliente: "", fornitore: "", cig: "", centroCosto: "", centroRicavo: "" })}
          className="text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset
        </Button>
      )}
    </div>
  );
}