/**
 * Dictionaries by locale, and the one helper that reads a checklist item
 * in the operator's language.
 */

import type { ChecklistItem } from "@/lib/compute";
import { ar } from "./ar";
import { en, type Dictionary } from "./en";
import type { Locale } from "./locale";

export { ar } from "./ar";
export { en, type Dictionary } from "./en";
export * from "./locale";

export const DICTIONARIES: Record<Locale, Dictionary> = { en, ar };

/**
 * A checklist item's label and detail, translated where the dictionary
 * knows the id and code, and otherwise exactly what compute.ts produced.
 * The fallback is what keeps a new rule in compute.ts from rendering as a
 * blank line on the Arabic screen before its translation lands.
 */
export function describeChecklistItem(
  item: ChecklistItem,
  t: Dictionary,
): { label: string; detail: string } {
  const label = t.checklist.labels[item.id] ?? item.label;
  const translate = t.checklist.details[item.detailCode];
  const detail = translate ? translate(item.params) : item.detail;
  return { label, detail };
}
