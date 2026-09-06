"use client";

/**
 * F6 — the report prose.
 *
 * Every field here is Arabic by definition, so every textarea is dir="rtl"
 * and lang="ar". These eight sections map onto the narrative parts of the
 * Word document; the tables and figures around them come from the other
 * screens.
 */

import { useLoadedDraft } from "@/components/draft-provider";
import { ArabicTextarea } from "@/components/fields";
import { useT } from "@/components/locale-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { Narrative } from "@/lib/schema";

const SECTIONS: Array<keyof Narrative> = [
  "executiveSummary",
  "objectives",
  "methodology",
  "contentSummary",
  "participantFeedback",
  "trainerObservations",
  "recommendations",
  "conclusion",
];

export default function NarrativePage() {
  const { draft, update } = useLoadedDraft();
  const t = useT();

  const setSection = (key: keyof Narrative, value: string) =>
    update((d) => ({ ...d, narrative: { ...d.narrative, [key]: value } }));

  const written = SECTIONS.filter((key) => draft.narrative[key].trim() !== "").length;

  return (
    <div className="max-w-4xl space-y-6">
      <p className="text-sm text-muted-foreground">{t.narrative.progress(written, SECTIONS.length)}</p>

      {SECTIONS.map((key) => {
        const value = draft.narrative[key];
        const empty = value.trim() === "";
        return (
          <Card key={key}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-baseline justify-between text-base">
                <Label htmlFor={key}>{t.narrative.sections[key]}</Label>
                <span
                  className={
                    empty
                      ? "text-xs font-normal text-amber-600 dark:text-amber-500"
                      : "text-xs font-normal text-muted-foreground tabular-nums"
                  }
                >
                  {empty ? t.common.empty : t.narrative.characters(value.trim().length)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ArabicTextarea
                id={key}
                value={value}
                onChange={(e) => setSection(key, e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t.narrative.hints[key]}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
