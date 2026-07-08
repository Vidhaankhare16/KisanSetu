"use client";
// Global UI language for KisanSetu. Defaults to English; the user's choice is
// persisted and applied everywhere instantly (UI strings + AI answer language).
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Lang } from "./types";
import { LANG_LABELS } from "./types";
import { MESSAGES } from "./translations";

const LS_KEY = "kisansetu.lang";

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translate;
}

const Ctx = createContext<I18nCtx>({ lang: "en", setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // Restore the saved choice after mount (SSR always renders English).
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY) as Lang | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved && MESSAGES[saved]) setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem(LS_KEY, l);
  }

  const t: Translate = (key, vars) => {
    let s = MESSAGES[lang][key] ?? MESSAGES.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    }
    return s;
  };

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}

/** Localized display name for a stored (English) crop name; unknown crops pass through. */
export function cropLabel(name: string, t: Translate): string {
  const key = `crop.${name.toLowerCase().trim()}`;
  const v = t(key);
  return v === key ? name : v;
}

/** Localize a stored crop list for display, e.g. ["groundnut","tur"] → "मूंगफली, अरहर". */
export function cropsLabel(crops: string[], t: Translate, sep = ", "): string {
  return crops.map((c) => cropLabel(c, t)).join(sep);
}

/** Language dropdown shown in every header — switching re-renders the whole UI. */
export function LangSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      aria-label={t("lang.label")}
      title={t("lang.label")}
      className={`rounded-lg border border-border bg-surface px-2 py-1.5 text-sm font-medium text-foreground ${className}`}
    >
      {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
        <option key={l} value={l}>🌐 {LANG_LABELS[l]}</option>
      ))}
    </select>
  );
}
