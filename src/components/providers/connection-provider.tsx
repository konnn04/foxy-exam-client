import { PropsWithChildren, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SESSION_KEYS } from "@/config";
import { isOfflineModeActive } from "@/lib/offline-mode";

const PUBLIC_PATHS = ["/login", "/disconnected"];

export function ConnectionProvider({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const location = useLocation();
  const hasRedirectedRef = useRef(false);

  const isPublicRoute = useMemo(
    () => PUBLIC_PATHS.includes(location.pathname),
    [location.pathname]
  );

  useEffect(() => {
    const redirectToDisconnected = () => {
      if (isOfflineModeActive()) {
        return;
      }

      if (isPublicRoute || location.pathname === "/disconnected") {
        return;
      }

      if (hasRedirectedRef.current) {
        return;
      }

      hasRedirectedRef.current = true;
      sessionStorage.setItem(
        SESSION_KEYS.DISCONNECTED_RETURN_PATH,
        `${location.pathname}${location.search}`
      );
      sessionStorage.setItem(SESSION_KEYS.DISCONNECTED_RETRY_COUNT, "0");
      navigate("/disconnected", {
        replace: true,
        state: {
          from: `${location.pathname}${location.search}`,
        },
      });
    };

    const handleOnline = () => {
      hasRedirectedRef.current = false;
      sessionStorage.removeItem(SESSION_KEYS.DISCONNECTED_RETRY_COUNT);
    };

    const handleOffline = () => {
      redirectToDisconnected();
    };

    const handleNetworkError = () => {
      redirectToDisconnected();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("app:network-error", handleNetworkError as EventListener);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("app:network-error", handleNetworkError as EventListener);
    };
  }, [isPublicRoute, location.pathname, location.search, navigate]);

  return <>{children}</>;
}
