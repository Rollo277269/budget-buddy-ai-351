import { Unlock } from "lucide-react";
import { useLayoutEditMode } from "@/hooks/useLayoutEditMode";

/**
 * Floating banner shown while the global "edit layout" mode is active.
 * Confirms visually that drag-and-drop is enabled across all reorderable toolbars.
 */
export function LayoutEditModeIndicator() {
  const [active, , toggle] = useLayoutEditMode();
  if (!active) return null;
  return (
    <div className="fixed top-3 right-3 z-[80] pointer-events-auto">
      <button
        onClick={toggle}
        className="flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium shadow-lg ring-2 ring-primary/30 animate-pulse hover:animate-none hover:bg-primary/90 transition-colors"
        title="Clicca per uscire dalla modalità Modifica layout"
      >
        <Unlock className="h-3.5 w-3.5" />
        Modifica layout attiva — trascina i pulsanti
      </button>
    </div>
  );
}