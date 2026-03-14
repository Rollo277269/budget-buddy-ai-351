import { useState, useMemo, useRef, useCallback, ReactNode } from "react";
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
import { ArrowUpDown, ArrowUp, ArrowDown, Columns3, Search, GripVertical, RotateCcw, X } from "lucide-react";

export interface ColumnDef<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  headerRender?: () => ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  filterValue?: (row: T) => string;
  align?: "left" | "right";
  defaultHidden?: boolean;
  wrap?: boolean;
  minWidth?: number;
  defaultWidth?: number;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
}

type SortDir = "asc" | "desc" | null;

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  onRowClick,
  rowClassName,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    return new Set(columns.filter((c) => !c.defaultHidden).map((c) => c.key));
  });
  const [filterOpen, setFilterOpen] = useState<string | null>(null);

  // Column order (array of keys)
  const [columnOrder, setColumnOrder] = useState<string[]>(() => columns.map((c) => c.key));

  // Column widths
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const w: Record<string, number> = {};
    columns.forEach((c) => { if (c.defaultWidth) w[c.key] = c.defaultWidth; });
    return w;
  });

  // Drag-to-reorder state
  const [draggedCol, setDraggedCol] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Resize state
  const resizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.target as HTMLElement).closest("th");
    const startWidth = th?.getBoundingClientRect().width || 120;
    resizeRef.current = { key, startX: e.clientX, startWidth };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const diff = ev.clientX - resizeRef.current.startX;
      const col = columns.find((c) => c.key === resizeRef.current!.key);
      const min = col?.minWidth || 60;
      const newWidth = Math.max(min, resizeRef.current.startWidth + diff);
      setColumnWidths((prev) => ({ ...prev, [resizeRef.current!.key]: newWidth }));
    };
    const onUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [columns]);

  // Drag handlers for reorder
  const handleDragStart = useCallback((key: string) => {
    setDraggedCol(key);
  }, []);

  const handleDragOver = useCallback((key: string, e: React.DragEvent) => {
    e.preventDefault();
    if (draggedCol && draggedCol !== key) {
      setDragOverCol(key);
    }
  }, [draggedCol]);

  const handleDrop = useCallback((targetKey: string) => {
    if (!draggedCol || draggedCol === targetKey) {
      setDraggedCol(null);
      setDragOverCol(null);
      return;
    }
    setColumnOrder((prev) => {
      const order = [...prev];
      const fromIdx = order.indexOf(draggedCol);
      const toIdx = order.indexOf(targetKey);
      if (fromIdx === -1 || toIdx === -1) return prev;
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, draggedCol);
      return order;
    });
    setDraggedCol(null);
    setDragOverCol(null);
  }, [draggedCol]);

  const handleDragEnd = useCallback(() => {
    setDraggedCol(null);
    setDragOverCol(null);
  }, []);

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
        const col = columns.find((c) => c.key === key);
        result = result.filter((r) => {
          const cellVal = col?.filterValue ? col.filterValue(r) : String(r[key] ?? "");
          return cellVal.toLowerCase().includes(lower);
        });
      }
    }
    return result;
  }, [data, columnFilters, columns]);

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

  // Ordered + visible columns
  const activeColumns = useMemo(() => {
    const colMap = new Map(columns.map((c) => [c.key, c]));
    return columnOrder
      .filter((key) => visibleColumns.has(key) && colMap.has(key))
      .map((key) => colMap.get(key)!);
  }, [columns, columnOrder, visibleColumns]);

  const hasActiveFilters = Object.values(columnFilters).some(Boolean);

  const isReordered = useMemo(() => {
    const defaultOrder = columns.map((c) => c.key);
    return columnOrder.some((k, i) => k !== defaultOrder[i]);
  }, [columns, columnOrder]);

  const resetOrder = useCallback(() => {
    setColumnOrder(columns.map((c) => c.key));
    setColumnWidths(() => {
      const w: Record<string, number> = {};
      columns.forEach((c) => { if (c.defaultWidth) w[c.key] = c.defaultWidth; });
      return w;
    });
  }, [columns]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {sorted.length} di {data.length} righe
          {hasActiveFilters && " (filtrate)"}
        </p>
        <div className="flex items-center gap-1.5">
          {(isReordered || Object.keys(columnWidths).length > 0) && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={resetOrder} title="Ripristina ordine e larghezza colonne">
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Reset
            </Button>
          )}
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
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card [&>div]:max-h-[calc(100vh-280px)]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="shadow-[0_2px_0_0_hsl(var(--border))] border-b-2 border-border">
              {activeColumns.map((col) => (
                <TableHead
                  key={col.key}
                  className={`text-xs relative select-none ${col.align === "right" ? "text-right" : ""} ${dragOverCol === col.key ? "bg-accent" : ""}`}
                  style={columnWidths[col.key] ? { width: columnWidths[col.key], minWidth: columnWidths[col.key] } : col.defaultWidth ? { width: col.defaultWidth, minWidth: col.minWidth || 60 } : undefined}
                  draggable
                  onDragStart={() => handleDragStart(col.key)}
                  onDragOver={(e) => handleDragOver(col.key, e)}
                  onDrop={() => handleDrop(col.key)}
                  onDragEnd={handleDragEnd}
                >
                  <div className={`flex items-center gap-1 ${col.align === "right" ? "justify-end" : ""}`}>
                    <GripVertical className="h-3 w-3 opacity-30 cursor-grab shrink-0" />
                    {col.headerRender ? col.headerRender() : <span className="whitespace-normal break-words leading-tight">{col.label}</span>}
                    <div className="flex items-center shrink-0">
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
                  {/* Resize handle */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 z-20"
                    onMouseDown={(e) => handleResizeStart(col.key, e)}
                  />
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
                  className={`${onRowClick ? "cursor-pointer hover:bg-muted/50" : ""} ${rowClassName?.(row) || ""}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {activeColumns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={`${col.align === "right" ? "text-right" : ""} ${col.wrap ? "whitespace-pre-wrap break-words" : ""}`}
                      style={columnWidths[col.key] ? { width: columnWidths[col.key], minWidth: columnWidths[col.key] } : undefined}
                    >
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
  );
}
