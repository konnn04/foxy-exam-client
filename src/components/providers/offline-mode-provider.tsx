import { PropsWithChildren, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getOfflineModeEventName,
  isOfflineModeActive,
  isOfflineModeFeatureEnabled,
  setOfflineModeActive,
} from "@/lib/offline-mode";

export function OfflineModeProvider({ children }: PropsWithChildren) {
  const location = useLocation();
  const [isOfflineMode, setIsOfflineMode] = useState(isOfflineModeActive());
  const featureEnabled = isOfflineModeFeatureEnabled();

  useEffect(() => {
    const syncOfflineMode = () => {
      setIsOfflineMode(isOfflineModeActive());
    };

    const handleModeChange = () => {
      syncOfflineMode();
    };

    window.addEventListener(getOfflineModeEventName(), handleModeChange as EventListener);
    window.addEventListener("storage", syncOfflineMode);

    return () => {
      window.removeEventListener(getOfflineModeEventName(), handleModeChange as EventListener);
      window.removeEventListener("storage", syncOfflineMode);
    };
  }, []);

  const handleBackOnline = () => {
    setOfflineModeActive(false);
    window.location.reload();
  };

  const shouldShowFooter = featureEnabled && isOfflineMode && location.pathname !== "/disconnected";

  return (
    <>
      {children}
      {shouldShowFooter && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-amber-400/50 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-950 dark:text-amber-200">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-start gap-2 text-sm">
              <WifiOff className="mt-0.5 h-4 w-4" />
              <p className="leading-relaxed">
                Bạn đang ở chế độ offline mode. Các hành động trực tuyến đã bị chặn cho đến khi quay lại trực tuyến.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBackOnline}
              className="border-amber-500/60 bg-transparent hover:bg-amber-100 dark:hover:bg-amber-900"
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Trở lại chế độ trực tuyến
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
