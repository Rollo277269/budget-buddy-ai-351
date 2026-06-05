import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const location = useLocation();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}