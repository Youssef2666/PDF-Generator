/**
 * The two UI languages, and how the choice travels.
 *
 * The locale is a UI preference, not part of the draft: the report is
 * always produced in Arabic regardless of which language the operator
 * reads the screens in. It is kept in a cookie so the server can render
 * `<html lang dir>` correctly on the first byte — a page that hydrates
 * from LTR to RTL flashes the whole layout across the screen.
 */

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Cookie carrying the operator's UI language. One year; never httpOnly. */
export const LOCALE_COOKIE = "crs-locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type Direction = "ltr" | "rtl";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Anything unrecognised — a stale cookie, a typo — falls back to English. */
export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function directionOf(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * BCP 47 tag for Intl formatting. Libya writes Western digits, so `ar-LY`
 * formats a time as 10:45 rather than ١٠:٤٥ — the same digits the report
 * documents use.
 */
export function intlTagOf(locale: Locale): string {
  return locale === "ar" ? "ar-LY" : "en-GB";
}
