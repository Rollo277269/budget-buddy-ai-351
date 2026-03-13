import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { FileText } from "lucide-react";
import { useLocation } from "react-router-dom";

const pageTitles: Record<string, string> = {
  "/": "Riepilogo Economico-Finanziario",
  "/vendite": "Vendite",
  "/acquisti": "Acquisti",
  "/banche": "Banche",
  "/commesse": "Commesse",
  "/lista-commesse": "Lista Commesse",
  "/strumenti": "Strumenti"
};

export function AppLayout({ children }: {children: React.ReactNode;}) {
  const location = useLocation();
  const title = pageTitles[location.pathname] || "Riepilogo Economico-Finanziario";

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
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>);

}