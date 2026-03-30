import { OFFLINE_MODE_FEATURE_ENABLED } from "@/config/security.config";
import { STORAGE_KEYS } from "@/config";

const OFFLINE_MODE_EVENT = "app:offline-mode-changed";

export function isOfflineModeFeatureEnabled(): boolean {
  return OFFLINE_MODE_FEATURE_ENABLED;
}

export function isOfflineModeActive(): boolean {
  if (!OFFLINE_MODE_FEATURE_ENABLED) {
    return false;
  }

  return localStorage.getItem(STORAGE_KEYS.OFFLINE_MODE_ACTIVE) === "1";
}

export function setOfflineModeActive(active: boolean): void {
  if (!OFFLINE_MODE_FEATURE_ENABLED) {
    return;
  }

  if (active) {
    localStorage.setItem(STORAGE_KEYS.OFFLINE_MODE_ACTIVE, "1");
  } else {
    localStorage.removeItem(STORAGE_KEYS.OFFLINE_MODE_ACTIVE);
  }

  window.dispatchEvent(
    new CustomEvent(OFFLINE_MODE_EVENT, {
      detail: { active },
    })
  );
}

export function getOfflineModeEventName(): string {
  return OFFLINE_MODE_EVENT;
}
