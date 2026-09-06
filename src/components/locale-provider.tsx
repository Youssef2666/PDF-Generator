"use client";

/**
 * Holds the UI language and hands every component its dictionary.
 *
 * The server decides the initial locale from the cookie and renders
 * `<html lang dir>` to match, so the first paint is already in the right
 * direction. Switching writes the cookie and flips the root element in
 * place; no navigation, nothing lost in a half-typed field.
 *
 * Outside a provider — component tests mount screens bare — the hook
 * returns English, so a screen never has to be wrapped just to render.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import {
  DEFAULT_LOCALE,
  DICTIONARIES,
  directionOf,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Dictionary,
  type Direction,
  type Locale,
} from "@/lib/i18n";

interface LocaleContextValue {
  locale: Locale;
  dir: Direction;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const FALLBACK: LocaleContextValue = {
  locale: DEFAULT_LOCALE,
  dir: directionOf(DEFAULT_LOCALE),
  t: DICTIONARIES[DEFAULT_LOCALE],
  setLocale: () => undefined,
};

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext) ?? FALLBACK;
}

/** The dictionary alone, for components that only read strings. */
export function useT(): Dictionary {
  return useLocale().t;
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    // The root element is owned by the server-rendered layout; flip it here
    // so the whole page mirrors without a reload.
    document.documentElement.lang = next;
    document.documentElement.dir = directionOf(next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, dir: directionOf(locale), t: DICTIONARIES[locale], setLocale }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
