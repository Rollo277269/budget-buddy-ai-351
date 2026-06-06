import { ReactNode } from "react";
import { useUserRole } from "@/hooks/useUserRole";

/**
 * Renders children only when the current user has the `admin` role.
 * While the role is still being resolved nothing is shown so that
 * mutation controls do not flash for viewers.
 */
export function AdminOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const { isAdmin, loading } = useUserRole();
  if (loading) return null;
  return <>{isAdmin ? children : fallback}</>;
}

export default AdminOnly;