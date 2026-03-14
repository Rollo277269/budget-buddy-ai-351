import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { lazy, Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { runLocalStorageMigration } from "@/lib/localStorageMigration";

// Lazy load all pages for faster initial render
const Index = lazy(() => import("./pages/Index"));
const VenditePage = lazy(() => import("./pages/Vendite"));
const AcquistiPage = lazy(() => import("./pages/Acquisti"));
const BanchePage = lazy(() => import("./pages/Banche"));
const CommessePage = lazy(() => import("./pages/Commesse"));
const ListaCommessePage = lazy(() => import("./pages/ListaCommesse"));
const OffertePage = lazy(() => import("./pages/Offerte"));
const SchedeContabiliPage = lazy(() => import("./pages/SchedeContabili"));
const BilancioPage = lazy(() => import("./pages/Bilancio"));
const StrumentiPage = lazy(() => import("./pages/Strumenti"));
const ScadenzarioPage = lazy(() => import("./pages/Scadenzario"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/scadenzario" element={<ScadenzarioPage />} />
              <Route path="/vendite" element={<VenditePage />} />
              <Route path="/acquisti" element={<AcquistiPage />} />
              <Route path="/banche" element={<BanchePage />} />
              <Route path="/commesse" element={<CommessePage />} />
              <Route path="/lista-commesse" element={<ListaCommessePage />} />
              <Route path="/offerte" element={<OffertePage />} />
              <Route path="/schede-contabili" element={<SchedeContabiliPage />} />
              <Route path="/bilancio" element={<BilancioPage />} />
              <Route path="/strumenti" element={<StrumentiPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
