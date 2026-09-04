"use client";

/**
 * Labelled inputs with the text direction already decided.
 *
 * Direction is a property of the *field*, not of the person typing, so it is
 * fixed here once rather than remembered at each of ~40 call sites:
 *
 *   - `ArabicInput` / `ArabicTextarea` — dir="rtl". For fields that are
 *     Arabic by definition: the narrative sections, Arabic titles and names.
 *   - `AutoInput` — dir="auto". For fields whose content legitimately varies,
 *     like a job title or a venue, where the browser should pick the
 *     direction from the first strong character actually typed.
 *   - `LtrInput` — dir="ltr". For values that are never prose: dates, times,
 *     numbers, codes.
 *
 * Getting this wrong is not cosmetic. An Arabic sentence in an LTR field
 * puts its trailing punctuation on the wrong end, and a mixed
 * Arabic-and-digits string reorders visibly.
 */

import type { ComponentProps, ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, className, children }: FieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Arabic by definition. */
export function ArabicInput(props: ComponentProps<typeof Input>) {
  return <Input dir="rtl" lang="ar" {...props} className={cn("text-right", props.className)} />;
}

/** Arabic prose. */
export function ArabicTextarea(props: ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      dir="rtl"
      lang="ar"
      {...props}
      className={cn("min-h-32 text-right leading-relaxed", props.className)}
    />
  );
}

/** Mixed content: let the browser decide from what is typed. */
export function AutoInput(props: ComponentProps<typeof Input>) {
  return <Input dir="auto" {...props} />;
}

/** Never prose — dates, times, numbers, codes. */
export function LtrInput(props: ComponentProps<typeof Input>) {
  return <Input dir="ltr" {...props} />;
}
