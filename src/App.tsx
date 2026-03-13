import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import VenditePage from "./pages/Vendite";
import AcquistiPage from "./pages/Acquisti";
import BanchePage from "./pages/Banche";
import CommessePage from "./pages/Commesse";
import ListaCommessePage from "./pages/ListaCommesse";
import StrumentiPage from "./pages/Strumenti";
import ScadenzarioPage from "./pages/Scadenzario";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/vendite" element={<VenditePage />} />
            <Route path="/acquisti" element={<AcquistiPage />} />
            <Route path="/banche" element={<BanchePage />} />
            <Route path="/commesse" element={<CommessePage />} />
            <Route path="/lista-commesse" element={<ListaCommessePage />} />
            <Route path="/strumenti" element={<StrumentiPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
