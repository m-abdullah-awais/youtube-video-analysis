export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lang";

export const LOCALE_NAMES: Record<Locale, string> = { en: "English", es: "Español" };
/** BCP 47 tags used for number and date formatting. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-US", es: "es-ES" };

export function toLocale(value: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? "") ? (value as Locale) : DEFAULT_LOCALE;
}

/** Reads the language cookie from a raw Cookie header. */
export function localeFromCookieHeader(header: string | null): Locale {
  const match = header?.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
  return toLocale(match?.[1]);
}
