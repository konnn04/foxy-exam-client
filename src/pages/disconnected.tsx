import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CONNECTION_RECOVERY_TIMING, SESSION_KEYS, API_CONFIG } from "@/config";
import { isOfflineModeFeatureEnabled, setOfflineModeActive } from "@/lib/offline-mode";
import api from "@/lib/api";

const RETRY_DELAYS = CONNECTION_RECOVERY_TIMING.RETRY_DELAYS_SECONDS;
const MAX_AUTO_RETRIES = CONNECTION_RECOVERY_TIMING.MAX_AUTO_RETRIES;

export default function DisconnectedPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const from =
    (location.state as { from?: string } | null)?.from ||
    sessionStorage.getItem(SESSION_KEYS.DISCONNECTED_RETURN_PATH) ||
    "/dashboard";

  const initialRetryCount = Math.min(
    MAX_AUTO_RETRIES,
    Math.max(
      0,
      Number(sessionStorage.getItem(SESSION_KEYS.DISCONNECTED_RETRY_COUNT) || "0") || 0
    )
  );

  const [retryIndex] = useState(initialRetryCount);
  const [countdown, setCountdown] = useState(
    RETRY_DELAYS[Math.min(initialRetryCount, RETRY_DELAYS.length - 1)]
  );
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const isOfflineModeEnabled = isOfflineModeFeatureEnabled();

  const canAutoRetry = retryIndex < MAX_AUTO_RETRIES;
  const currentDelay = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)];
  const progress = useMemo(() => {
    if (!canAutoRetry) return 100;
    const elapsed = currentDelay - countdown;
    return Math.max(0, Math.min(100, Math.round((elapsed / currentDelay) * 100)));
  }, [canAutoRetry, countdown, currentDelay]);

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEYS.DISCONNECTED_RETRY_COUNT, String(retryIndex));

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!canAutoRetry) return;

    setCountdown(currentDelay);

    const tickTimer = window.setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    const retryTimer = window.setTimeout(async () => {
      if (!navigator.onLine) {
        const nextRetry = Math.min(MAX_AUTO_RETRIES, retryIndex + 1);
        sessionStorage.setItem(SESSION_KEYS.DISCONNECTED_RETRY_COUNT, String(nextRetry));
        window.location.reload();
        return;
      }

      try {
        await api.get("/", { baseURL: API_CONFIG.BASE_URL.replace('/api', '') });
        sessionStorage.removeItem(SESSION_KEYS.DISCONNECTED_RETRY_COUNT);
        sessionStorage.removeItem(SESSION_KEYS.DISCONNECTED_RETURN_PATH);
        setOfflineModeActive(false);
        navigate(from, { replace: true });
      } catch {
        const nextRetry = Math.min(MAX_AUTO_RETRIES, retryIndex + 1);
        sessionStorage.setItem(SESSION_KEYS.DISCONNECTED_RETRY_COUNT, String(nextRetry));
        window.location.reload();
      }
    }, currentDelay * 1000);

    return () => {
      window.clearInterval(tickTimer);
      window.clearTimeout(retryTimer);
    };
  }, [canAutoRetry, currentDelay, retryIndex]);

  const [isManualRetrying, setIsManualRetrying] = useState(false);

  const handleManualRetry = async () => {
    setIsManualRetrying(true);
    try {
      await api.get("/", { baseURL: API_CONFIG.BASE_URL.replace('/api', '') });
      sessionStorage.removeItem(SESSION_KEYS.DISCONNECTED_RETRY_COUNT);
      sessionStorage.removeItem(SESSION_KEYS.DISCONNECTED_RETURN_PATH);
      setOfflineModeActive(false);
      navigate(from, { replace: true });
    } catch {
      window.location.reload();
    }
  };

  const handleExitApp = () => {
    if (window.electronAPI?.quitApp) {
      window.electronAPI.quitApp();
      return;
    }
    window.close();
  };

  const handleContinueOfflineMode = () => {
    setOfflineModeActive(true);
    sessionStorage.removeItem(SESSION_KEYS.DISCONNECTED_RETRY_COUNT);
    sessionStorage.removeItem(SESSION_KEYS.DISCONNECTED_RETURN_PATH);
    navigate(from, { replace: true });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.12),transparent_45%),radial-gradient(circle_at_80%_0%,hsl(var(--destructive)/0.08),transparent_35%)]" />

      <Card className="relative z-10 w-full max-w-xl border-border/60 shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-destructive">
              {isOnline ? <Wifi className="h-6 w-6" /> : <WifiOff className="h-6 w-6" />}
            </div>
            <div>
              <CardTitle className="text-2xl">{t("disconnected.title")}</CardTitle>
              <CardDescription>
                {isOnline
                  ? t("disconnected.descOnline")
                  : isOfflineModeEnabled
                    ? t("disconnected.descOfflineMode")
                    : t("disconnected.descOffline")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/40 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("disconnected.autoRetry")}</span>
              <span className="font-medium">{Math.min(retryIndex + 1, MAX_AUTO_RETRIES)} / {MAX_AUTO_RETRIES}</span>
            </div>

            {canAutoRetry ? (
              <>
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-muted-foreground">
                  {t("disconnected.retryCountdown", { seconds: countdown, delay: currentDelay })}
                </p>
              </>
            ) : (
              <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <p>{t("disconnected.retryFailed")}</p>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {!canAutoRetry ? (
              <Button onClick={handleManualRetry} variant="default" className="w-full" disabled={isManualRetrying}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isManualRetrying ? 'animate-spin' : ''}`} />
                {isManualRetrying ? t("disconnected.retrying") : t("disconnected.manualRetry")}
              </Button>
            ) : (
              <Button variant="outline" className="w-full" disabled>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("disconnected.autoRetrying")}
              </Button>
            )}

            {isOfflineModeEnabled ? (
              <Button onClick={handleContinueOfflineMode} variant="secondary" className="w-full">
                {t("disconnected.offlineMode")}
              </Button>
            ) : (
              <Button onClick={handleExitApp} variant="secondary" className="w-full">
                {t("disconnected.exitApp")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
