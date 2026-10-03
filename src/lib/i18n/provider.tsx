"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { INTL_LOCALE, LOCALE_COOKIE, type Locale } from "./locale";
import { MESSAGES, type Messages } from "./messages";

type I18n = {
  locale: Locale;
  t: Messages;
  setLocale: (locale: Locale) => void;
  /** Formats a number for the current language. */
  n: (value: number) => string;
  /** Formats a date for the current language. */
  date: (value: string | number) => string;
  dateTime: (value: number) => string;
};

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    setLocaleState(next);
  }, []);

  const value = useMemo<I18n>(() => {
    const tag = INTL_LOCALE[locale];
    const numbers = new Intl.NumberFormat(tag);
    return {
      locale,
      t: MESSAGES[locale],
      setLocale,
      n: (v) => numbers.format(v),
      date: (v) => new Date(v).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" }),
      dateTime: (v) => new Date(v).toLocaleString(tag, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
