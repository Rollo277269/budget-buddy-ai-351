import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GripVertical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLayoutEditMode } from "@/hooks/useLayoutEditMode";

export interface ReorderableItem {
  /** Stable id used for ordering and persistence */
  id: string;
  /** Optional human-friendly label (used as tooltip in edit mode) */
  label?: string;
  /** The actual element to render (button, drop-zone, etc.) */
  node: ReactNode;
}

interface ReorderableToolbarProps {
  /** Unique key used as localStorage namespace, e.g. "acquisti-header" */
  storageKey: string;
  items: ReorderableItem[];
  /** Only render the edit toggle if true. When false, items are displayed in saved/default order, non-draggable. */
  canEdit?: boolean;
  className?: string;
  /** Optional content rendered before the items (not reorderable) */
  prefix?: ReactNode;
}

const STORAGE_PREFIX = "reorderable-toolbar:";

function loadOrder(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveOrder(key: string, order: string[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(order));
  } catch {
    // ignore quota errors
  }
}

function clearOrder(key: string) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch { /* noop */ }
}

export function ReorderableToolbar({ storageKey, items, canEdit = true, className, prefix }: ReorderableToolbarProps) {
  const [globalEdit] = useLayoutEditMode();
  const editMode = canEdit && globalEdit;
  const [order, setOrder] = useState<string[]>(() => {
    const saved = loadOrder(storageKey);
    return saved ?? items.map((i) => i.id);
  });
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Reconcile: append new items, drop removed ones — preserve user order otherwise.
  useEffect(() => {
    setOrder((prev) => {
      const ids = items.map((i) => i.id);
      const filtered = prev.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !filtered.includes(id));
      const next = [...filtered, ...missing];
      const same = next.length === prev.length && next.every((v, i) => v === prev[i]);
      return same ? prev : next;
    });
  }, [items]);

  const orderedItems = useMemo(() => {
    const map = new Map(items.map((i) => [i.id, i] as const));
    return order.map((id) => map.get(id)).filter(Boolean) as ReorderableItem[];
  }, [items, order]);

  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    if (!editMode) return;
    dragId.current = id;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch { /* noop */ }
  };

  const handleDragOver = (id: string) => (e: React.DragEvent) => {
    if (!editMode || !dragId.current || dragId.current === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overId !== id) setOverId(id);
  };

  const handleDrop = (id: string) => (e: React.DragEvent) => {
    if (!editMode) return;
    e.preventDefault();
    const from = dragId.current;
    dragId.current = null;
    setOverId(null);
    if (!from || from === id) return;
    setOrder((prev) => {
      const fromIdx = prev.indexOf(from);
      const toIdx = prev.indexOf(id);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = prev.slice();
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      saveOrder(storageKey, next);
      return next;
    });
  };

  const handleDragEnd = () => {
    dragId.current = null;
    setOverId(null);
  };

  const handleReset = () => {
    clearOrder(storageKey);
    setOrder(items.map((i) => i.id));
  };

  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
      {prefix}
      {orderedItems.map((it) => (
        <div
          key={it.id}
          draggable={editMode}
          onDragStart={handleDragStart(it.id)}
          onDragOver={handleDragOver(it.id)}
          onDrop={handleDrop(it.id)}
          onDragEnd={handleDragEnd}
          title={editMode ? `Trascina per spostare: ${it.label ?? it.id}` : undefined}
          className={cn(
            "relative inline-flex items-center transition-all rounded-md",
            editMode && "cursor-grab active:cursor-grabbing ring-1 ring-dashed ring-primary/40 ring-offset-1 ring-offset-background",
            editMode && overId === it.id && "ring-2 ring-primary",
          )}
        >
          {editMode && (
            <GripVertical className="h-3 w-3 text-muted-foreground mr-0.5 shrink-0" />
          )}
          {it.node}
        </div>
      ))}

      {editMode && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          onClick={handleReset}
          title="Ripristina l'ordine predefinito"
        >
          <RotateCcw className="h-3 w-3 mr-1" />Reset
        </Button>
      )}
    </div>
  );
}