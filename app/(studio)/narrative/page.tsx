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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { Narrative } from "@/lib/schema";

const SECTIONS: Array<{ key: keyof Narrative; label: string; hint: string }> = [
  {
    key: "executiveSummary",
    label: "Executive summary",
    hint: "What was run, for whom, and how it went — the paragraph a manager reads alone.",
  },
  {
    key: "objectives",
    label: "Objectives",
    hint: "What the programme set out to change.",
  },
  {
    key: "methodology",
    label: "Methodology",
    hint: "How it was delivered and how participants were assessed.",
  },
  {
    key: "contentSummary",
    label: "Content summary",
    hint: "The topics covered, session by session.",
  },
  {
    key: "participantFeedback",
    label: "Participant feedback",
    hint: "What the survey said, in prose. The figures come from the survey screen.",
  },
  {
    key: "trainerObservations",
    label: "Trainer observations",
    hint: "What the trainer noticed that the numbers do not show.",
  },
  {
    key: "recommendations",
    label: "Recommendations",
    hint: "What should change before this runs again.",
  },
  {
    key: "conclusion",
    label: "Conclusion",
    hint: "Closing statement and formal sign-off.",
  },
];

export default function NarrativePage() {
  const { draft, update } = useLoadedDraft();

  const setSection = (key: keyof Narrative, value: string) =>
    update((d) => ({ ...d, narrative: { ...d.narrative, [key]: value } }));

  const written = SECTIONS.filter((s) => draft.narrative[s.key].trim() !== "").length;

  return (
    <div className="max-w-4xl space-y-6">
      <p className="text-sm text-muted-foreground">
        {written} of {SECTIONS.length} sections written. All fields are right-to-left Arabic.
      </p>

      {SECTIONS.map((section) => {
        const value = draft.narrative[section.key];
        const empty = value.trim() === "";
        return (
          <Card key={section.key}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-baseline justify-between text-base">
                <Label htmlFor={section.key}>{section.label}</Label>
                <span
                  className={
                    empty
                      ? "text-xs font-normal text-amber-600 dark:text-amber-500"
                      : "text-xs font-normal text-muted-foreground tabular-nums"
                  }
                >
                  {empty ? "empty" : `${value.trim().length} characters`}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ArabicTextarea
                id={section.key}
                value={value}
                onChange={(e) => setSection(section.key, e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{section.hint}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
