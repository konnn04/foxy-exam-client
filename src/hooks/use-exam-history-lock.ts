import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToastCustom } from "@/hooks/use-toast-custom";

/**
 * While mounted: discourage browser Back/Forward by re-pushing the same URL on popstate.
 * Does not block Electron in-app navigation; improves accidental browser history escape.
 */
export function useExamHistoryLock(enabled: boolean) {
  const { t } = useTranslation();
  const toast = useToastCustom();
  const urlRef = useRef<string>("");

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    urlRef.current = window.location.href;
    window.history.pushState({ examClientLock: true }, "", urlRef.current);

    const onPopState = () => {
      window.history.pushState({ examClientLock: true }, "", urlRef.current);
      toast.info(t("exam.historyBlocked"));
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [enabled, t, toast]);
}
