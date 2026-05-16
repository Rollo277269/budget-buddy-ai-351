import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar, defaultItems as sidebarItems } from "@/components/AppSidebar";
import { FileText, Maximize, Minimize, Moon, Sun } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LayoutEditModeIndicator } from "@/components/LayoutEditModeIndicator";
import { YearLoadingBadge } from "@/components/YearLoadingBadge";

// Lazy-load the floating assistant — it's non-critical for first paint and
// pulls in react-markdown (~70KB).
const RitaAssistant = lazy(() =>
  import("@/components/RitaAssistant").then((m) => ({ default: m.RitaAssistant }))
);

// Background prefetch of frequently used datasets so navigation between pages is instant.
function prefetchSharedData() {
  // Fire-and-forget; each loader has its own module-scope cache and dedup.
  import("@/hooks/useInvoiceData").then((m) => m.prefetchInvoices()).catch(() => {});
  import("@/hooks/useCentri").then((m) => { m.fetchCentriFromDb(); m.fetchCategorieFromDb(); }).catch(() => {});
}

// Hydrate persistent IndexedDB cache as early as possible so first paint of
// data-heavy pages can show cached rows instantly (stale-while-revalidate).
async function hydratePersistentCache() {
  try {
    const [inv, cen] = await Promise.all([
      import("@/hooks/useInvoiceData"),
      import("@/hooks/useCentri"),
    ]);
    await Promise.all([inv.hydrateInvoicesFromIdb(), cen.hydrateCentriFromIdb()]);
  } catch { /* ignore */ }
}

// Schedule prefetch when the browser is idle so it does not compete with the
// initial render / lazy-loaded route chunks. Falls back to a small timeout.
function schedulePrefetch() {
  const run = () => prefetchSharedData();
  const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout: number }) => number);
  if (typeof ric === "function") {
    ric(run, { timeout: 4000 });
  } else {
    setTimeout(run, 1500);
  }
}

// Lazily start the Web Vitals logger so it does not delay first paint.
function startWebVitalsWhenIdle() {
  const run = () => {
    import("@/lib/webVitalsLogger").then((m) => m.startWebVitalsLogger()).catch(() => {});
  };
  const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout: number }) => number);
  if (typeof ric === "function") ric(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}

const extraTitles: Record<string, string> = {
  "/diagnostica": "Diagnostica Performance",
};
const pageTitles: Record<string, string> = {
  ...Object.fromEntries(sidebarItems.map((i) => [i.url, i.title])),
  ...extraTitles,
};

function useDarkMode() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = useCallback(() => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }, [dark]);
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") { document.documentElement.classList.add("dark"); setDark(true); }
    else if (saved === "light") { document.documentElement.classList.remove("dark"); setDark(false); }
  }, []);
  return { dark, toggle };
}

function useFullscreen() {
  const [isFs, setIsFs] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const handler = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }, []);
  return { isFs, toggle };
}

function SidebarHoverWrapper({ children, locked }: { children: React.ReactNode; locked: boolean }) {
  const { setOpen } = useSidebar();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOpen(locked);
  }, [locked, setOpen]);

  const handleMouseEnter = useCallback(() => {
    if (locked) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  }, [setOpen, locked]);

  const handleMouseLeave = useCallback(() => {
    if (locked) return;
    timeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 300);
  }, [setOpen, locked]);

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="shrink-0"
    >
      {children}
    </div>
  );
}

export function AppLayout({ children }: {children: React.ReactNode;}) {
  const location = useLocation();
   const title = pageTitles[location.pathname] || "Rubrica";
  const { dark, toggle: toggleDark } = useDarkMode();
  const { isFs, toggle: toggleFs } = useFullscreen();
  const [sidebarLocked, setSidebarLocked] = useState(() => localStorage.getItem("sidebar-locked") === "true");

  // Hydrate IDB cache immediately, then schedule fresh-data prefetch when idle.
  useEffect(() => {
    hydratePersistentCache().then(() => schedulePrefetch());
    startWebVitalsWhenIdle();
  }, []);

  // Auto-enter fullscreen on first user interaction (browsers require a user gesture).
  useEffect(() => {
    if (sessionStorage.getItem("fs-auto-done") === "1") return;
    const tryFs = () => {
      sessionStorage.setItem("fs-auto-done", "1");
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      window.removeEventListener("pointerdown", tryFs);
      window.removeEventListener("keydown", tryFs);
    };
    window.addEventListener("pointerdown", tryFs, { once: true });
    window.addEventListener("keydown", tryFs, { once: true });
    return () => {
      window.removeEventListener("pointerdown", tryFs);
      window.removeEventListener("keydown", tryFs);
    };
  }, []);

  const toggleLock = useCallback(() => {
    setSidebarLocked(prev => {
      const next = !prev;
      localStorage.setItem("sidebar-locked", String(next));
      return next;
    });
  }, []);

  return (
    <SidebarProvider defaultOpen={sidebarLocked}>
      <div className="min-h-screen flex w-full">
        <SidebarHoverWrapper locked={sidebarLocked}>
          <AppSidebar locked={sidebarLocked} onToggleLock={toggleLock} />
        </SidebarHoverWrapper>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 border-b bg-card h-14 flex items-center px-4 gap-3 shrink-0 bg-zinc-200">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary p-1.5">
                <FileText className="h-4 w-4 text-primary-foreground" />
              </div>
              <h1 className="font-bold tracking-tight text-3xl">{title}</h1>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleDark} title={dark ? "Modalità chiara" : "Modalità notte"}>
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFs} title={isFs ? "Esci da schermo intero" : "Schermo intero"}>
                {isFs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
      <Suspense fallback={null}>
        <RitaAssistant />
      </Suspense>
      <LayoutEditModeIndicator />
      <YearLoadingBadge />
    </SidebarProvider>);
}