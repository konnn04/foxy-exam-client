import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { DEVELOPMENT_MODE } from "@/config/security.config";
import type { ExamTrackingConfig } from "@/types/exam";
import { Monitor, Mic, Ban, Wifi, Check, AlertTriangle, Loader2, ChevronLeft, RefreshCw } from "lucide-react";
import type { EnvCheckItem } from "@/types/exam";
import { useTranslation } from "react-i18next";

export function EnvironmentStep({
  config, stream, onSuccess, onBack,
}: {
  config: ExamTrackingConfig;
  stream: MediaStream | null;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const initialChecks = useMemo<EnvCheckItem[]>(() => [
    { key: "multiscreen", label: t("precheck.checkMultiScreen"), icon: Monitor, status: "pending" },
    { key: "bannedapps", label: t("precheck.checkBannedApps"), icon: Ban, status: "pending" },
    { key: "network", label: t("precheck.checkNetwork"), icon: Wifi, status: "pending" },
    { key: "mic", label: t("precheck.checkMic"), icon: Mic, status: "pending" },
  ], [t]);

  const [checks, setChecks] = useState<EnvCheckItem[]>(initialChecks);
  const [allDone, setAllDone] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Run checks sequentially
  useEffect(() => {
    if (DEVELOPMENT_MODE.ENABLED && DEVELOPMENT_MODE.BYPASS_ENVIRONMENT_CHECK) {
      setChecks((prev) => prev.map((c) => ({ ...c, status: "pass" as const })));
      setTimeout(() => setAllDone(true), 400);
      return;
    }

    const run = async () => {
      // 1. Multi-screen
      setChecks((prev) => prev.map((c) => c.key === "multiscreen" ? { ...c, status: "checking" } : c));
      await new Promise((r) => setTimeout(r, 500));
      try {
        if (config.noMultiMonitor && window.electronAPI?.getScreenCount) {
          const cnt = await window.electronAPI.getScreenCount();
          if (cnt > 1) {
            setChecks((prev) => prev.map((c) => c.key === "multiscreen"
              ? { ...c, status: "fail", detail: t("precheck.multiScreenDetected", { count: cnt }) } : c));
          } else {
            setChecks((prev) => prev.map((c) => c.key === "multiscreen" ? { ...c, status: "pass" } : c));
          }
        } else {
          setChecks((prev) => prev.map((c) => c.key === "multiscreen" ? { ...c, status: "pass" } : c));
        }
      } catch {
        setChecks((prev) => prev.map((c) => c.key === "multiscreen" ? { ...c, status: "pass" } : c));
      }

      // 2. Banned apps
      setChecks((prev) => prev.map((c) => c.key === "bannedapps" ? { ...c, status: "checking" } : c));
      await new Promise((r) => setTimeout(r, 800));
      try {
        if ((config.detectBannedApps || config.level === "strict") && window.electronAPI?.getRunningBannedApps) {
          const list = Array.isArray(config.bannedApps) ? config.bannedApps : [];
          const wl = Array.isArray(config.bannedAppsWhitelist) ? config.bannedAppsWhitelist : [];
          if (list.length > 0) {
            const found = await window.electronAPI.getRunningBannedApps(list, wl);
            if (found?.length) {
              setChecks((prev) => prev.map((c) => c.key === "bannedapps"
                ? { ...c, status: "fail", detail: t("precheck.bannedAppsDetected", { apps: found.join(", ") }) } : c));
            } else {
              setChecks((prev) => prev.map((c) => c.key === "bannedapps" ? { ...c, status: "pass" } : c));
            }
          } else {
            setChecks((prev) => prev.map((c) => c.key === "bannedapps" ? { ...c, status: "pass" } : c));
          }
        } else {
          setChecks((prev) => prev.map((c) => c.key === "bannedapps" ? { ...c, status: "pass" } : c));
        }
      } catch {
        setChecks((prev) => prev.map((c) => c.key === "bannedapps" ? { ...c, status: "pass" } : c));
      }

      // 3. Network
      setChecks((prev) => prev.map((c) => c.key === "network" ? { ...c, status: "checking" } : c));
      await new Promise((r) => setTimeout(r, 600));
      setChecks((prev) => prev.map((c) => c.key === "network"
        ? { ...c, status: navigator.onLine ? "pass" : "fail", detail: navigator.onLine ? undefined : t("precheck.noNetworkDetected") } : c));

      // 4. Mic
      setChecks((prev) => prev.map((c) => c.key === "mic" ? { ...c, status: "checking" } : c));
      if (!stream || stream.getAudioTracks().length === 0) {
        setChecks((prev) => prev.map((c) => c.key === "mic"
          ? { ...c, status: config.requireMic ? "fail" : "pass", detail: config.requireMic ? t("precheck.noMicDetected") : t("precheck.skipNotRequired") } : c));
      } else {
        await new Promise((r) => setTimeout(r, 400));
        setChecks((prev) => prev.map((c) => c.key === "mic" ? { ...c, status: "pass" } : c));
      }

      setAllDone(true);
    };
    run();
  }, [config, stream, retryCount, t]);

  const hasFail = checks.some((c) => c.status === "fail");

  // Re-run environment checks without full page reload
  const handleRetry = () => {
    setChecks(initialChecks);
    setAllDone(false);
    setRetryCount((c) => c + 1);
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="space-y-2">
        {checks.map((c) => (
          <div key={c.key} className={`
            flex items-center gap-3 rounded-lg border p-3 transition-all
            ${c.status === "checking" ? "border-primary/30 bg-primary/5" : ""}
            ${c.status === "pass" ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20" : ""}
            ${c.status === "fail" ? "border-destructive/50 bg-destructive/10" : ""}
          `}>
            {c.status === "checking" && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
            {c.status === "pass" && <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
            {c.status === "fail" && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
            {c.status === "pending" && <c.icon className="h-4 w-4 text-muted-foreground shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${c.status === "fail" ? "text-destructive" : ""}`}>{c.label}</p>
              {c.detail && <p className="text-xs text-muted-foreground mt-0.5">{c.detail}</p>}
            </div>
          </div>
        ))}
      </div>

      {allDone && (
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />{t("common.back")}</Button>
          {hasFail ? (
            <Button variant="destructive" className="flex-1" onClick={handleRetry}>
              <RefreshCw className="h-4 w-4 mr-1" />{t("precheck.retry")}
            </Button>
          ) : (
            <Button onClick={onSuccess} className="flex-1">
              <Check className="h-4 w-4 mr-1" />{t("precheck.enterExam")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
