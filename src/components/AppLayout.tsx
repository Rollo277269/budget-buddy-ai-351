import { useState, useEffect, useCallback } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { FileText, Maximize, Minimize, Moon, Sun } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RitaAssistant } from "@/components/RitaAssistant";

const pageTitles: Record<string, string> = {
  "/": "Riepilogo Economico-Finanziario",
  "/scadenzario": "Scadenzario",
  "/vendite": "Vendite",
  "/acquisti": "Acquisti",
  "/banche": "Banche",
  "/commesse": "Commesse",
  "/lista-commesse": "Lista Commesse",
  "/strumenti": "Strumenti"
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

export function AppLayout({ children }: {children: React.ReactNode;}) {
  const location = useLocation();
  const title = pageTitles[location.pathname] || "Riepilogo Economico-Finanziario";
  const { dark, toggle: toggleDark } = useDarkMode();
  const { isFs, toggle: toggleFs } = useFullscreen();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="border-b bg-card h-14 flex items-center px-4 gap-3 shrink-0">
            <SidebarTrigger />
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
      <RitaAssistant />
    </SidebarProvider>);
}