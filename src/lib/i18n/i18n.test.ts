/**
 * The Arabic dictionary against what compute.ts actually emits.
 *
 * The type system already guarantees `ar` has every key `en` has. What it
 * cannot guarantee is that the checklist maps — keyed by item id and detail
 * code as plain strings — cover every id and code `computeChecklist`
 * produces. A missing entry is not an error at runtime: it falls back to
 * English, which is the silent failure this file exists to catch.
 */

import { describe, expect, it } from "vitest";

import demo from "../../../fixtures/demo-draft.json";
import { computeChecklist, recomputeDraft } from "@/lib/compute";
import { createEmptyDraft } from "@/lib/empty-draft";
import { ar, en, describeChecklistItem, DICTIONARIES, parseLocale } from "@/lib/i18n";
import { DraftSchema, type Draft } from "@/lib/schema";

const full: Draft = DraftSchema.parse(demo);
const empty = createEmptyDraft(new Date("2026-03-01T00:00:00.000Z"));

/** Drafts that between them hit every branch of every checklist rule. */
function variants(): Draft[] {
  const reversedDates = recomputeDraft({
    ...full,
    course: { ...full.course, startDate: "2026-02-12", endDate: "2026-02-08" },
  });
  const zeroHours = recomputeDraft({
    ...full,
    sessions: full.sessions.map((s, i) => (i === 0 ? { ...s, durationHours: 0 } : s)),
  });
  const partial = recomputeDraft({
    ...full,
    course: { ...full.course, titleAr: "" },
    participants: full.participants.map((p, i) =>
      i === 0
        ? { ...p, jobTitle: "", attendance: {}, grades: {} }
        : i === 1
          ? { ...p, grades: { ...p.grades, g1: null }, outcomeOverride: "incomplete" as const }
          : p,
    ),
    gradeColumns: full.gradeColumns.map((c, i) => (i === 0 ? { ...c, weight: 10 } : c)),
    survey: {
      ...full.survey,
      questions: full.survey.questions.map((q, i) =>
        i === 0 ? { ...q, tally: q.tally.map(() => 0) } : q,
      ),
    },
    narrative: { ...full.narrative, conclusion: "" },
  });
  return [full, empty, reversedDates, zeroHours, partial];
}

describe("Arabic checklist coverage", () => {
  const items = variants().flatMap((draft) => computeChecklist(draft).items);

  it("has an Arabic label for every checklist id", () => {
    const missing = [...new Set(items.map((i) => i.id))].filter((id) => !ar.checklist.labels[id]);
    expect(missing).toEqual([]);
  });

  it("has an Arabic detail for every code compute.ts emits", () => {
    const missing = [...new Set(items.map((i) => i.detailCode))].filter(
      (code) => !ar.checklist.details[code],
    );
    expect(missing).toEqual([]);
  });

  it("renders each Arabic detail with the same figures as the English one", () => {
    for (const item of items) {
      const arabic = describeChecklistItem(item, ar).detail;
      expect(arabic, item.detailCode).toMatch(/[؀-ۿ]/);
      // Every number in the English sentence appears in the Arabic one —
      // except one and two, which Arabic writes as the singular and the dual
      // («جلسة واحدة», «جلستان») rather than as digits.
      for (const figure of item.detail.match(/\d+(\.\d+)?/g) ?? []) {
        if (figure === "1" || figure === "2") continue;
        expect(arabic, `${item.detailCode} should carry ${figure}`).toContain(figure);
      }
    }
  });

  it("translates the field and section names inside a detail", () => {
    const identity = computeChecklist(empty).items.find((i) => i.id === "course-identity")!;
    expect(describeChecklistItem(identity, ar).detail).toContain("عنوان الدورة بالعربية");
    expect(describeChecklistItem(identity, ar).detail).not.toContain("titleAr");

    const narrative = computeChecklist(empty).items.find((i) => i.id === "narrative-complete")!;
    expect(describeChecklistItem(narrative, ar).detail).toContain("الخاتمة");
  });
});

describe("English falls back to compute.ts", () => {
  it("shows exactly the label and detail compute.ts produced", () => {
    for (const item of computeChecklist(full).items) {
      expect(describeChecklistItem(item, en)).toEqual({ label: item.label, detail: item.detail });
    }
  });
});

describe("locale parsing", () => {
  it("accepts the two locales and falls back to English", () => {
    expect(parseLocale("ar")).toBe("ar");
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("fr")).toBe("en");
    expect(parseLocale(undefined)).toBe("en");
    expect(Object.keys(DICTIONARIES).sort()).toEqual(["ar", "en"]);
  });
});

describe("Arabic count agreement", () => {
  it("uses the singular, the dual, and the two plural forms", () => {
    expect(ar.course.generateButton(1)).toBe("توليد جلسة واحدة");
    expect(ar.course.generateButton(2)).toBe("توليد جلستان");
    expect(ar.course.generateButton(5)).toBe("توليد 5 جلسات");
    expect(ar.course.generateButton(12)).toBe("توليد 12 جلسة");
  });
});
