import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "viewer" | null;

export function useUserRole() {
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) {
        if (!cancelled) { setRole(null); setLoading(false); }
        return;
      }
      const { data } = await supabase
        .from("user_roles" as any)
        .select("role")
        .eq("user_id", uid);
      if (cancelled) return;
      const roles = (data as any[] || []).map((r) => r.role);
      setRole(roles.includes("admin") ? "admin" : (roles.includes("viewer") ? "viewer" : null));
      setLoading(false);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  return {
    role,
    isAdmin: role === "admin",
    isViewer: role === "viewer",
    // Any authenticated user with a role can insert/update data.
    // Only admins can delete or manage configuration.
    canEdit: role === "admin" || role === "viewer",
    canDelete: role === "admin",
    loading,
  };
}