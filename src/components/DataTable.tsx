import { useState, useMemo, useRef, useCallback, ReactNode, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
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
import { ArrowUpDown, ArrowUp, ArrowDown, Columns3, Search, GripVertical, RotateCcw, X, ChevronRight, ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";

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
  summaryRender?: (rows: T[]) => ReactNode;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  expandable?: (row: T) => boolean;
  renderExpandedContent?: (row: T) => ReactNode;
  defaultSort?: { key: string; dir: SortDir };
  toolbarPortalRef?: React.RefObject<HTMLDivElement | null>;
  tableId?: string;
}

type SortDir = "asc" | "desc" | null;

// Debounce hook for search inputs
function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const ROW_HEIGHT = 32;
const OVERSCAN = 8;

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  onRowClick,
  rowClassName,
  expandable,
  renderExpandedContent,
  defaultSort,
  toolbarPortalRef,
  tableId,
}: DataTableProps<T>) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSort?.dir ?? null);
  const [globalSearchInput, setGlobalSearchInput] = useState("");
  const globalSearch = useDebouncedValue(globalSearchInput, 200);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    if (tableId) {
      try {
        const saved = localStorage.getItem(`dt-cols-${tableId}`);
        if (saved) return new Set(JSON.parse(saved) as string[]);
      } catch { /* ignore */ }
    }
    return new Set(columns.filter((c) => !c.defaultHidden).map((c) => c.key));
  });
  const [filterOpen, setFilterOpen] = useState<string | null>(null);

  // Persist visible columns to localStorage
  useEffect(() => {
    if (tableId) {
      localStorage.setItem(`dt-cols-${tableId}`, JSON.stringify([...visibleColumns]));
    }
  }, [visibleColumns, tableId]);

  const [columnOrder, setColumnOrder] = useState<string[]>(() => columns.map((c) => c.key));
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const w: Record<string, number> = {};
    columns.forEach((c) => { if (c.defaultWidth) w[c.key] = c.defaultWidth; });
    return w;
  });
  const [draggedCol, setDraggedCol] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const resizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // Virtual scroll state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

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

  const handleDragStart = useCallback((key: string) => { setDraggedCol(key); }, []);
  const handleDragOver = useCallback((key: string, e: React.DragEvent) => {
    e.preventDefault();
    if (draggedCol && draggedCol !== key) setDragOverCol(key);
  }, [draggedCol]);
  const handleDrop = useCallback((targetKey: string) => {
    if (!draggedCol || draggedCol === targetKey) { setDraggedCol(null); setDragOverCol(null); return; }
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
  const handleDragEnd = useCallback(() => { setDraggedCol(null); setDragOverCol(null); }, []);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
      else setSortDir("asc");
    } else { setSortKey(key); setSortDir("asc"); }
  };

  const globalFiltered = useMemo(() => {
    if (!globalSearch) return data;
    const lower = globalSearch.toLowerCase();
    return data.filter((row) => columns.some((col) => {
      const cellVal = col.filterValue ? col.filterValue(row) : String(row[col.key] ?? "");
      return cellVal.toLowerCase().includes(lower);
    }));
  }, [data, globalSearch, columns]);

  const filtered = useMemo(() => {
    let result = globalFiltered;
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
  }, [globalFiltered, columnFilters, columns]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      const as = String(av ?? "");
      const bs = String(bv ?? "");
      // Handle dd/mm/yyyy date strings
      const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
      const aMatch = as.match(dateRegex);
      const bMatch = bs.match(dateRegex);
      if (aMatch && bMatch) {
        const aDate = `${aMatch[3]}${aMatch[2].padStart(2, "0")}${aMatch[1].padStart(2, "0")}`;
        const bDate = `${bMatch[3]}${bMatch[2].padStart(2, "0")}${bMatch[1].padStart(2, "0")}`;
        return sortDir === "asc" ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
      }
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [filtered, sortKey, sortDir]);

  const activeColumns = useMemo(() => {
    const colMap = new Map(columns.map((c) => [c.key, c]));
    return columnOrder.filter((key) => visibleColumns.has(key) && colMap.has(key)).map((key) => colMap.get(key)!);
  }, [columns, columnOrder, visibleColumns]);

  const hasActiveFilters = Object.values(columnFilters).some(Boolean) || !!globalSearch;
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

  // Virtual scroll calculations
  const totalRows = sorted.length;
  const useVirtual = totalRows > 100;

  // Measure container
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) setScrollTop(scrollContainerRef.current.scrollTop);
  }, []);

  const { visibleRows, topPadding, bottomPadding } = useMemo(() => {
    if (!useVirtual) return { visibleRows: sorted, topPadding: 0, bottomPadding: 0 };
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + OVERSCAN * 2;
    const endIdx = Math.min(totalRows, startIdx + visibleCount);
    return {
      visibleRows: sorted.slice(startIdx, endIdx),
      topPadding: startIdx * ROW_HEIGHT,
      bottomPadding: Math.max(0, (totalRows - endIdx) * ROW_HEIGHT),
    };
  }, [sorted, scrollTop, containerHeight, totalRows, useVirtual]);

  const toolbarContent = (
    <div className="flex items-center gap-1.5">
      <div className="relative max-w-[220px] flex-1">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Cerca…"
          value={globalSearchInput}
          onChange={(e) => setGlobalSearchInput(e.target.value)}
          className="pl-7 h-7 text-xs"
        />
        {globalSearchInput && (
          <button onClick={() => setGlobalSearchInput("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {(isReordered || Object.keys(columnWidths).length > 0) && (
        <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={resetOrder} title="Ripristina ordine e larghezza colonne">
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="text-xs h-7 px-2" title="Mostra/nascondi colonne">
            <Columns3 className="h-3.5 w-3.5 mr-1.5" /> Colonne
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {columns.map((col) => (
            <DropdownMenuCheckboxItem
              key={col.key}
              checked={visibleColumns.has(col.key)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(checked) => {
                setVisibleColumns((prev) => {
                  const next = new Set(prev);
                  if (checked) next.add(col.key); else next.delete(col.key);
                  return next;
                });
              }}
            >
              {col.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {expandable && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 px-2"
            title="Espandi tutto"
            onClick={() => {
              const allKeys = new Set(sorted.filter((r) => expandable(r)).map((r) => rowKey(r)));
              setExpandedRows(allKeys);
            }}
          >
            <ChevronsUpDown className="h-3.5 w-3.5 mr-1.5" /> Espandi
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 px-2"
            title="Comprimi tutto"
            onClick={() => setExpandedRows(new Set())}
          >
            <ChevronsDownUp className="h-3.5 w-3.5 mr-1.5" /> Comprimi
          </Button>
        </>
      )}
    </div>
  );

  // Force a single re-render once the portal target mounts, without creating an update loop.
  const [, forcePortalRender] = useState(0);
  useEffect(() => {
    if (toolbarPortalRef?.current) {
      forcePortalRender((n) => (n === 0 ? 1 : n));
    }
    // Intentionally empty deps: refs are mutable and don't need to be tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      {/* Toolbar: render inline or via portal */}
      {toolbarPortalRef?.current
        ? createPortal(toolbarContent, toolbarPortalRef.current)
        : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {toolbarContent}
              <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                {sorted.length} di {data.length} righe
                {hasActiveFilters && " (filtrate)"}
              </p>
            </div>
          </div>
        )
      }

      {/* Table */}
      <div
        ref={scrollContainerRef}
        className="rounded-xl border bg-card overflow-auto max-h-[calc(100vh-280px)] min-h-[300px]"
        style={{ position: 'relative' }}
        onScroll={useVirtual ? handleScroll : undefined}
      >
        <Table>
           <TableHeader className="sticky top-0 z-10 bg-card">
            {activeColumns.some((c) => c.summaryRender) && (
              <TableRow className="border-b border-border bg-muted/50">
                {expandable && <TableHead className="w-8 text-xs py-1" />}
                {activeColumns.map((col) => (
                  <TableHead
                    key={`sum-${col.key}`}
                    className={`text-xs py-1.5 font-semibold ${col.align === "right" ? "text-right" : ""}`}
                    style={columnWidths[col.key] ? { width: columnWidths[col.key], minWidth: columnWidths[col.key] } : undefined}
                  >
                    {col.summaryRender ? col.summaryRender(sorted) : null}
                  </TableHead>
                ))}
              </TableRow>
            )}
            <TableRow className="shadow-[0_2px_0_0_hsl(var(--border))] border-b-2 border-border">
              {expandable && <TableHead className="w-8 text-xs" />}
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
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Ordina colonna" onClick={() => toggleSort(col.key)}>
                          {sortKey === col.key && sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : sortKey === col.key && sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                        </Button>
                      )}
                      {col.filterable && (
                        <Button variant="ghost" size="sm" className={`h-6 w-6 p-0 ${columnFilters[col.key] ? "text-primary" : ""}`} title="Filtra colonna" onClick={() => setFilterOpen(filterOpen === col.key ? null : col.key)}>
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
                      onChange={(e) => setColumnFilters((f) => ({ ...f, [col.key]: e.target.value }))}
                      className="mt-1 h-7 text-xs"
                      onKeyDown={(e) => { if (e.key === "Escape") setFilterOpen(null); }}
                    />
                  )}
                  <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 z-20" onMouseDown={(e) => handleResizeStart(col.key, e)} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={activeColumns.length + (expandable ? 1 : 0)} className="text-center text-muted-foreground py-8">
                  Nessun risultato
                </TableCell>
              </TableRow>
            ) : (
              <>
                {topPadding > 0 && (
                  <tr style={{ height: topPadding }}><td colSpan={activeColumns.length + (expandable ? 1 : 0)} /></tr>
                )}
                {visibleRows.map((row) => {
                  const key = rowKey(row);
                  const isExpandable = expandable?.(row) ?? false;
                  const isExpanded = expandedRows.has(key);
                  return (
                    <Fragment key={key}>
                      <TableRow
                        className={`${onRowClick ? "cursor-pointer hover:bg-muted/50" : ""} ${rowClassName?.(row) || ""}`}
                        onClick={() => onRowClick?.(row)}
                        style={useVirtual ? { height: ROW_HEIGHT } : undefined}
                      >
                        {expandable && (
                          <TableCell className="w-8 px-1 text-xs font-sans font-normal">
                            {isExpandable && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                title={isExpanded ? "Comprimi dettaglio" : "Espandi dettaglio"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedRows((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(key)) next.delete(key); else next.add(key);
                                    return next;
                                  });
                                }}
                              >
                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                          </TableCell>
                        )}
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
                      {isExpanded && renderExpandedContent && (
                        <TableRow className="bg-muted/30 hover:bg-muted/40">
                          <TableCell colSpan={activeColumns.length + 1} className="p-0">
                            {renderExpandedContent(row)}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
                {bottomPadding > 0 && (
                  <tr style={{ height: bottomPadding }}><td colSpan={activeColumns.length + (expandable ? 1 : 0)} /></tr>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
