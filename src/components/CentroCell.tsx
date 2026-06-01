import * as React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CentroCR } from "@/hooks/useCentri";

interface CentroCellProps {
  invoiceKey: string;
  tipo: "costo" | "ricavo";
  centri: CentroCR[];
  centroMap: Record<string, string>;
  onAssign: (key: string, codice: string) => void;
  onRemove?: (key: string) => void;
  importo?: number;
}

export function CentroCell({ invoiceKey, tipo, centri, centroMap, onAssign, onRemove, importo }: CentroCellProps) {
  const filtered = centri
    .filter((c) => c.tipo === tipo)
    .sort((a, b) => a.codice.localeCompare(b.codice, "it", { sensitivity: "base" }));
  const assigned = centroMap[invoiceKey];
  const [open, setOpen] = React.useState(false);

  if (filtered.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const disabled = importo == null || Number(importo) === 0;
  if (disabled) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const assignedCentro = filtered.find((c) => c.codice === assigned);

  return (
    <div className="flex items-center gap-0.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "h-7 w-[130px] px-2 justify-between text-[11px] font-normal bg-card",
              !assigned && "text-muted-foreground"
            )}
          >
            <span className="truncate font-mono text-left">
              {assignedCentro ? assignedCentro.codice : "—"}
            </span>
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[280px] p-0 z-[80]"
          align="start"
          onClick={(e) => e.stopPropagation()}
        >
          <Command
            filter={(value, search) => {
              if (!search) return 1;
              return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
            }}
          >
            <CommandInput placeholder="Cerca codice o descrizione..." className="h-8 text-xs" />
            <CommandList className="max-h-[260px]">
              <CommandEmpty className="text-xs py-3 text-center">Nessun risultato.</CommandEmpty>
              <CommandGroup>
                {filtered.map((c) => {
                  const searchValue = `${c.codice} ${c.descrizione} ${c.parole_chiave_matching || ""}`;
                  return (
                    <CommandItem
                      key={c.codice}
                      value={searchValue}
                      onSelect={() => {
                        onAssign(invoiceKey, c.codice);
                        setOpen(false);
                      }}
                      className="text-xs"
                    >
                      <Check className={cn("mr-2 h-3 w-3", assigned === c.codice ? "opacity-100" : "opacity-0")} />
                      <span className="font-mono">{c.codice}</span>
                      <span className="text-muted-foreground ml-2 truncate">{c.descrizione}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {assigned && onRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); onRemove(invoiceKey); }}
          title="Rimuovi assegnazione"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
