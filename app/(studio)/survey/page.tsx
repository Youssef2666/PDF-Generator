"use client";

/**
 * F5 — the end-of-course survey.
 *
 * Responses are entered as a tally per rating, not one row per respondent,
 * because that is the form the paper feedback sheets are counted into. The
 * average beside each question comes from compute.ts; a question nobody
 * answered shows "no responses" rather than a zero, which is the whole point
 * of that rule.
 */

import { useLoadedDraft } from "@/components/draft-provider";
import { ArabicInput, AutoInput, Field, LtrInput } from "@/components/fields";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { newRowId } from "@/lib/empty-draft";
import type { SurveyQuestion } from "@/lib/schema";

export default function SurveyPage() {
  const { draft, update } = useLoadedDraft();
  const t = useT();
  const { survey } = draft;
  const ratings = Array.from({ length: survey.scaleMax }, (_, i) => i + 1);

  const setQuestion = <K extends keyof SurveyQuestion>(
    id: string,
    key: K,
    value: SurveyQuestion[K],
  ) =>
    update((d) => ({
      ...d,
      survey: {
        ...d.survey,
        questions: d.survey.questions.map((q) => (q.id === id ? { ...q, [key]: value } : q)),
      },
    }));

  const setTally = (id: string, ratingIndex: number, raw: string) =>
    update((d) => ({
      ...d,
      survey: {
        ...d.survey,
        questions: d.survey.questions.map((q) => {
          if (q.id !== id) return q;
          const tally = Array.from(
            { length: d.survey.scaleMax },
            (_, i) => q.tally[i] ?? 0,
          );
          tally[ratingIndex] = Math.max(0, Math.trunc(Number(raw) || 0));
          return { ...q, tally };
        }),
      },
    }));

  const setScaleMax = (raw: string) => {
    const scaleMax = Math.min(10, Math.max(2, Math.trunc(Number(raw) || 5)));
    update((d) => ({ ...d, survey: { ...d.survey, scaleMax } }));
  };

  const addQuestion = () =>
    update((d) => ({
      ...d,
      survey: {
        ...d.survey,
        questions: [
          ...d.survey.questions,
          {
            id: newRowId("q"),
            // Arabic whatever the UI language: the survey text is Arabic
            // by definition.
            textAr: "سؤال جديد",
            textEn: null,
            tally: Array.from({ length: d.survey.scaleMax }, () => 0),
            computed: { responseCount: 0, average: null },
          },
        ],
      },
    }));

  const removeQuestion = (id: string) =>
    update((d) => ({
      ...d,
      survey: { ...d.survey, questions: d.survey.questions.filter((q) => q.id !== id) },
    }));

  return (
    <div className="max-w-6xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {t.survey.card}
            <span className="ms-2 text-sm font-normal text-muted-foreground">
              {survey.computed.overallAverage === null
                ? t.survey.noResponses
                : t.survey.overall(
                    survey.computed.overallAverage,
                    survey.scaleMax,
                    survey.computed.responseCount,
                  )}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            label={t.survey.scale}
            htmlFor="scaleMax"
            hint={t.survey.scaleHint}
            className="max-w-48"
          >
            <LtrInput
              id="scaleMax"
              type="number"
              min={2}
              max={10}
              value={survey.scaleMax}
              onChange={(e) => setScaleMax(e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.survey.questionsCard}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-72">{t.survey.columns.questionAr}</TableHead>
                  <TableHead className="min-w-56">{t.survey.columns.questionEn}</TableHead>
                  {ratings.map((rating) => (
                    <TableHead key={rating} className="w-20 text-center">
                      {rating}
                    </TableHead>
                  ))}
                  <TableHead className="w-20 text-end">{t.survey.columns.n}</TableHead>
                  <TableHead className="w-24 text-end">{t.survey.columns.average}</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {survey.questions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={ratings.length + 5}
                      className="text-center text-sm text-muted-foreground"
                    >
                      {t.survey.noQuestions}
                    </TableCell>
                  </TableRow>
                ) : (
                  survey.questions.map((question) => (
                    <TableRow key={question.id}>
                      <TableCell>
                        <ArabicInput
                          value={question.textAr}
                          onChange={(e) => setQuestion(question.id, "textAr", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <AutoInput
                          value={question.textEn ?? ""}
                          onChange={(e) =>
                            setQuestion(question.id, "textEn", e.target.value || null)
                          }
                        />
                      </TableCell>

                      {ratings.map((rating, i) => (
                        <TableCell key={rating} className="p-1">
                          <LtrInput
                            type="number"
                            min={0}
                            aria-label={t.survey.tallyLabel(question.textAr, rating)}
                            className="text-center"
                            value={question.tally[i] ?? 0}
                            onChange={(e) => setTally(question.id, i, e.target.value)}
                          />
                        </TableCell>
                      ))}

                      <TableCell className="text-end tabular-nums text-muted-foreground">
                        {question.computed.responseCount}
                      </TableCell>
                      <TableCell className="text-end tabular-nums font-medium">
                        {question.computed.average === null ? (
                          <span
                            className="text-xs font-normal text-amber-600 dark:text-amber-500"
                            title={t.survey.noResponsesTitle}
                          >
                            {t.survey.noResponsesCell}
                          </span>
                        ) : (
                          question.computed.average
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeQuestion(question.id)}
                          aria-label={t.survey.removeQuestion(question.textAr)}
                        >
                          {t.common.remove}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <Button variant="outline" onClick={addQuestion}>
            {t.survey.addQuestion}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
