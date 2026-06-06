import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { lazy, Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { runLocalStorageMigration } from "@/lib/localStorageMigration";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { TextOverridesProvider } from "@/components/EditableText";
const AuthPage = lazy(() => import("./pages/Auth"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPassword"));

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
const BudgetPage = lazy(() => import("./pages/Budget"));
const StrumentiPage = lazy(() => import("./pages/Strumenti"));
const ScadenzarioPage = lazy(() => import("./pages/Calendario"));
const IvaPage = lazy(() => import("./pages/Iva"));
const RubricaPage = lazy(() => import("./pages/Rubrica"));
const SociPage = lazy(() => import("./pages/Soci"));
const KpiPage = lazy(() => import("./pages/Kpi"));
const DiagnosticaPage = lazy(() => import("./pages/Diagnostica"));
const PolizzePage = lazy(() => import("./pages/Polizze"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

const App = () => {
  useEffect(() => {
    runLocalStorageMigration();
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <TextOverridesProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="*"
              element={
                <ProtectedRoute>
                  <AppLayout>
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
                      <Route path="/budget" element={<BudgetPage />} />
                      <Route path="/strumenti" element={<AdminRoute><StrumentiPage /></AdminRoute>} />
                      <Route path="/iva" element={<IvaPage />} />
                      <Route path="/rubrica" element={<RubricaPage />} />
                      <Route path="/soci" element={<SociPage />} />
                      <Route path="/kpi" element={<KpiPage />} />
                      <Route path="/diagnostica" element={<AdminRoute><DiagnosticaPage /></AdminRoute>} />
                      <Route path="/polizze" element={<PolizzePage />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
      </TextOverridesProvider>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
