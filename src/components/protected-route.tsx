import { Navigate, useLocation } from "react-router-dom";
import { useUserStore } from "@/hooks/use-user";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
