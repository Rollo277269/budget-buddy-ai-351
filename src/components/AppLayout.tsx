import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar, defaultItems as sidebarItems } from "@/components/AppSidebar";
import { FileText, LogOut, Maximize, Minimize, Moon, Sun } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LayoutEditModeIndicator } from "@/components/LayoutEditModeIndicator";
import { YearLoadingBadge } from "@/components/YearLoadingBadge";
import { useUserRole } from "@/hooks/useUserRole";
import { Eye } from "lucide-react";

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
    const handler = () => {
      const active = !!document.fullscreenElement;
      setIsFs(active);
      // Remember user's fullscreen preference so we can restore it on next gesture
      // after a browser-initiated exit (e.g. some route changes or focus losses).
      if (active) sessionStorage.setItem("fs-pref", "1");
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      sessionStorage.removeItem("fs-pref");
      document.exitFullscreen();
    } else {
      sessionStorage.setItem("fs-pref", "1");
      document.documentElement.requestFullscreen().catch(() => {});
    }
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
      className="shrink-0 relative z-40"
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
  const { isAdmin, isViewer, loading: roleLoading } = useUserRole();

  // Non-admin users must use the app only in fullscreen mode.
  // Route changes are intercepted so the same navigation click also keeps/restores
  // fullscreen, avoiding any normal-screen intermediate state between sections.
  const mustFullscreen = !roleLoading && !isAdmin;
  const requestFs = useCallback(() => {
    if (!document.fullscreenElement) {
      // Use <html> as the fullscreen target so portals (Dialog, Popover, Sheet,
      // Toaster) that render into document.body remain visible inside fullscreen.
      const target = document.documentElement;
      const request = target.requestFullscreen as (options?: { navigationUI?: "auto" | "hide" | "show" }) => Promise<void>;
      return request.call(target, { navigationUI: "hide" }).catch(() => {});
    }
    return Promise.resolve();
  }, []);
  useEffect(() => {
    if (!mustFullscreen) return;
    sessionStorage.setItem("fs-pref", "1");
    requestFs();

    const handler = () => requestFs();
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) window.setTimeout(() => requestFs(), 0);
    };
    document.addEventListener("click", handler);
    document.addEventListener("keydown", handler);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("keydown", handler);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [mustFullscreen, requestFs]);

  // Mark the document with the current role so global CSS can hide
  // mutation controls ([data-admin-only]) for viewers.
  useEffect(() => {
    if (roleLoading) return;
    if (isViewer) document.body.setAttribute("data-role", "viewer");
    else document.body.removeAttribute("data-role");
    return () => document.body.removeAttribute("data-role");
  }, [isViewer, roleLoading]);

  // Hydrate IDB cache immediately, then schedule fresh-data prefetch when idle.
  useEffect(() => {
    hydratePersistentCache().then(() => schedulePrefetch());
    startWebVitalsWhenIdle();
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
          <header className="sticky top-0 z-20 border-b bg-card h-14 flex items-center px-4 gap-3 shrink-0 bg-slate-400">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary p-1.5">
                <FileText className="h-4 w-4 text-primary-foreground" />
              </div>
              <h1 className="font-bold tracking-tight text-3xl">{title}</h1>
            </div>
            <div className="ml-auto flex items-center gap-1">
              {isViewer && (
                <span
                  className="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 text-[11px] font-medium px-2 py-0.5 mr-1 border border-amber-300"
                  title="Puoi caricare e modificare dati ma non eliminare record né gestire configurazioni"
                >
                  <Eye className="h-3 w-3" /> Permessi limitati
                </span>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleDark} title={dark ? "Modalità chiara" : "Modalità notte"}>
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              {(isAdmin || roleLoading) ? (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFs} title={isFs ? "Esci da schermo intero" : "Schermo intero"}>
                  {isFs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = "/auth";
                }}
                title="Esci"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto bg-white">
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