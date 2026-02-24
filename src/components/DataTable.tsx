import { useState, useMemo, ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowUpDown, ArrowUp, ArrowDown, Columns3, Search } from "lucide-react";

export interface ColumnDef<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  align?: "left" | "right";
  defaultHidden?: boolean;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}

type SortDir = "asc" | "desc" | null;

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  onRowClick,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    return new Set(columns.filter((c) => !c.defaultHidden).map((c) => c.key));
  });
  const [filterOpen, setFilterOpen] = useState<string | null>(null);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
      else setSortDir("asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    let result = data;
    for (const [key, val] of Object.entries(columnFilters)) {
      if (val) {
        const lower = val.toLowerCase();
        result = result.filter((r) => String(r[key] ?? "").toLowerCase().includes(lower));
      }
    }
    return result;
  }, [data, columnFilters]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av ?? "");
      const bs = String(bv ?? "");
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [filtered, sortKey, sortDir]);

  const activeColumns = columns.filter((c) => visibleColumns.has(c.key));
  const hasActiveFilters = Object.values(columnFilters).some(Boolean);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {sorted.length} di {data.length} righe
          {hasActiveFilters && " (filtrate)"}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs">
              <Columns3 className="h-3.5 w-3.5 mr-1.5" />
              Colonne
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {columns.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.key}
                checked={visibleColumns.has(col.key)}
                onCheckedChange={(checked) => {
                  setVisibleColumns((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(col.key);
                    else next.delete(col.key);
                    return next;
                  });
                }}
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                {activeColumns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={`text-xs ${col.align === "right" ? "text-right" : ""}`}
                  >
                    <div className={`flex items-center gap-1 ${col.align === "right" ? "justify-end" : ""}`}>
                      <span>{col.label}</span>
                      <div className="flex items-center">
                        {col.sortable && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleSort(col.key)}
                          >
                            {sortKey === col.key && sortDir === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : sortKey === col.key && sortDir === "desc" ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </Button>
                        )}
                        {col.filterable && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-6 w-6 p-0 ${columnFilters[col.key] ? "text-primary" : ""}`}
                            onClick={() => setFilterOpen(filterOpen === col.key ? null : col.key)}
                          >
                            <Search className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {filterOpen === col.key && col.filterable && (
                      <Input
                        autoFocus
                        placeholder={`Filtra ${col.label.toLowerCase()}...`}
                        value={columnFilters[col.key] || ""}
                        onChange={(e) =>
                          setColumnFilters((f) => ({ ...f, [col.key]: e.target.value }))
                        }
                        className="mt-1 h-7 text-xs"
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setFilterOpen(null);
                        }}
                      />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={activeColumns.length} className="text-center text-muted-foreground py-8">
                    Nessun risultato
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row) => (
                  <TableRow
                    key={rowKey(row)}
                    className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
                    onClick={() => onRowClick?.(row)}
                  >
                    {activeColumns.map((col) => (
                      <TableCell key={col.key} className={col.align === "right" ? "text-right" : ""}>
                        {col.render(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
