import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import vi from "./locales/vi.json";

const STORAGE_KEY = "exam-client:locale";

function detectLocale(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "vi") return saved;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "vi";
  return nav.toLowerCase().startsWith("vi") ? "vi" : "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    vi: { translation: vi },
  },
  lng: detectLocale(),
  fallbackLng: "vi",
  interpolation: { escapeValue: false },
});

export function setExamLocale(lng: "vi" | "en"): void {
  void i18n.changeLanguage(lng);
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
}

export default i18n;
