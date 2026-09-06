"use client";

/**
 * A two-way switch between English and Arabic.
 *
 * Each option is written in its own language, so it is always readable by
 * the person who needs it — an operator who does not read English must
 * still be able to find «العربية» on an English screen.
 */

import { Languages } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { LOCALES, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, t, setLocale } = useLocale();

  return (
    <div
      className={cn("inline-flex items-center gap-1.5", className)}
      role="group"
      aria-label={t.language.label}
      data-testid="language-switch"
    >
      <Languages className="size-3.5 text-muted-foreground" aria-hidden />
      <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
        {LOCALES.map((option: Locale) => {
          const active = option === locale;
          return (
            <button
              key={option}
              type="button"
              lang={option}
              aria-pressed={active}
              onClick={() => setLocale(option)}
              className={cn(
                "h-6 rounded-md px-2 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              {t.language.names[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
