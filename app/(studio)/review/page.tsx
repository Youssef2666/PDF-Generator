"use client";

/**
 * F7 — the readiness checklist, the computed figures panel, and finalize.
 *
 * The first two halves are pure output. The checklist comes from
 * `computeChecklist(draft)` — the very function the export route enforces —
 * so what this screen shows and what finalize allows cannot disagree. The
 * figures are read straight out of the draft's `computed` blocks.
 *
 * The gate is enforced twice on purpose: the button is disabled here, and
 * the route re-checks. A request arriving some other way meets the same bar.
 */

import Link from "next/link";

import { useState } from "react";

import { useDraft, useLoadedDraft } from "@/components/draft-provider";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { computeChecklist, type ChecklistItem } from "@/lib/compute";
import { describeChecklistItem, type Dictionary } from "@/lib/i18n";

const SECTION_HREF: Record<ChecklistItem["section"], string> = {
  course: "/course",
  participants: "/participants",
  grades: "/grades",
  survey: "/survey",
  narrative: "/narrative",
};

type FinalizeState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; directory: string; files: string[] }
  | { phase: "failed"; message: string; section?: string; failing?: string[] };

/**
 * Finalize.
 *
 * Gated on the checklist, and on there being nothing unsaved — exporting a
 * draft whose last edit is still in flight would render the previous state.
 * The button flushes first for exactly that reason.
 *
 * On failure the message names the section that broke and states plainly
 * that the draft survived, because the first thing anyone wants to know when
 * an export fails is whether their work is gone.
 */
function FinalizeCard({ ready }: { ready: boolean }) {
  const { saveState, flush, clearLocalDraft, recordExport } = useDraft();
  const t = useT();
  const [state, setState] = useState<FinalizeState>({ phase: "idle" });

  const busy = state.phase === "running";
  const unsaved = saveState === "pending" || saveState === "saving";

  const finalize = async () => {
    setState({ phase: "running" });
    try {
      // Push any pending edit before rendering, or the package would be
      // built from the previous save.
      await flush();

      const response = await fetch("/api/export", { method: "POST" });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setState({
          phase: "failed",
          message: body?.error ?? t.review.exportFailedHttp(response.status),
          section: body?.section,
          failing: body?.failing,
        });
        return;
      }

      setState({ phase: "done", directory: body.directory, files: body.files });
      // Record it on the provider *before* dropping the draft. Clearing the
      // draft unmounts this screen, so a confirmation held only here would
      // vanish along with the path it was reporting.
      recordExport({ directory: body.directory, files: body.files });
      clearLocalDraft();
    } catch (error) {
      setState({
        phase: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (state.phase === "done") {
    return (
      <Card className="border-emerald-600/40">
        <CardHeader>
          <CardTitle>{t.review.finalized}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">
            {t.review.writtenTo}{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs" dir="ltr">
              output/{state.directory}/
            </code>
          </p>
          <ul className="text-sm text-muted-foreground" dir="ltr">
            {state.files.map((file) => (
              <li key={file}>· {file}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t.review.draftCleared}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.review.finalize}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t.review.finalizeBody.before}
          <code className="rounded bg-muted px-1 py-0.5 text-xs" dir="ltr">
            output/
          </code>
          {t.review.finalizeBody.after}
        </p>

        <Button onClick={() => void finalize()} disabled={!ready || busy || unsaved}>
          {busy
            ? t.review.rendering
            : !ready
              ? t.review.checklistIncomplete
              : unsaved
                ? t.review.waitingForSave
                : t.review.finalizeReport}
        </Button>

        {state.phase === "failed" ? (
          <div className="space-y-1 rounded-md border border-destructive/40 p-3">
            <p className="text-sm font-medium text-destructive">
              {state.section ? t.review.sectionFailed(state.section) : t.review.exportFailed}
            </p>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            {state.failing?.length ? (
              <ul className="text-sm text-muted-foreground">
                {state.failing.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-muted-foreground">{t.review.nothingWritten}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={`mt-1.5 text-2xl font-semibold tracking-tight tabular-nums ${
          muted ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ChecklistRow({
  item,
  t,
  linkLabel,
  passTone,
  failTone,
}: {
  item: ChecklistItem;
  t: Dictionary;
  linkLabel: string;
  passTone: string;
  failTone: string;
}) {
  const { label, detail } = describeChecklistItem(item, t);
  return (
    <li
      className="flex items-start gap-3 px-4 py-3"
      data-testid={`check-${item.id}`}
      data-status={item.status}
    >
      <span aria-hidden className={item.status === "pass" ? passTone : failTone}>
        {item.status === "pass" ? "✓" : "•"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      {item.status === "fail" ? (
        <Link
          href={SECTION_HREF[item.section]}
          className="shrink-0 text-sm underline underline-offset-4"
        >
          {linkLabel}
        </Link>
      ) : null}
    </li>
  );
}

export default function ReviewPage() {
  const { draft } = useLoadedDraft();
  const t = useT();
  const checklist = computeChecklist(draft);
  const c = draft.computed;

  const required = checklist.items.filter((i) => i.required);
  const advisory = checklist.items.filter((i) => !i.required);

  return (
    <div className="max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{t.review.readiness}</span>
            <span
              className={
                checklist.ready
                  ? "text-sm font-normal text-emerald-600 dark:text-emerald-500"
                  : "text-sm font-normal text-amber-600 dark:text-amber-500"
              }
              data-testid="readiness"
              data-ready={checklist.ready}
            >
              {checklist.ready ? t.review.allPass : t.review.outstanding(checklist.requiredFailing)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
            {required.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                t={t}
                linkLabel={t.review.fix}
                passTone="mt-0.5 text-emerald-600 dark:text-emerald-500"
                failTone="mt-0.5 text-amber-600 dark:text-amber-500"
              />
            ))}
          </ul>

          {advisory.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t.review.advisory}
              </p>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-dashed border-border bg-background">
                {advisory.map((item) => (
                  <ChecklistRow
                    key={item.id}
                    item={item}
                    t={t}
                    linkLabel={t.review.reviewLink}
                    passTone="mt-0.5 text-emerald-600 dark:text-emerald-500"
                    failTone="mt-0.5 text-muted-foreground"
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.review.figures}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t.review.figuresBody}</p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Figure label={t.review.figure.participants} value={String(c.participantCount)} />
            <Figure label={t.review.figure.sessions} value={String(c.sessionCount)} />
            <Figure label={t.review.figure.totalHours} value={String(c.totalHours)} />
            <Figure label={t.review.figure.gradeWeight} value={String(c.totalGradeWeight)} />
            <Figure label={t.review.figure.passed} value={String(c.passedCount)} />
            <Figure label={t.review.figure.failed} value={String(c.failedCount)} />
            <Figure
              label={t.review.figure.incomplete}
              value={String(c.incompleteCount)}
              muted={c.incompleteCount === 0}
            />
            <Figure
              label={t.review.figure.avgAttendance}
              value={c.averageAttendanceRate === null ? "—" : `${c.averageAttendanceRate}%`}
              muted={c.averageAttendanceRate === null}
            />
            <Figure
              label={t.review.figure.avgScore}
              value={c.averageTotalScore === null ? "—" : String(c.averageTotalScore)}
              muted={c.averageTotalScore === null}
            />
            <Figure
              label={t.review.figure.surveyAverage}
              value={
                draft.survey.computed.overallAverage === null
                  ? "—"
                  : `${draft.survey.computed.overallAverage} / ${draft.survey.scaleMax}`
              }
              muted={draft.survey.computed.overallAverage === null}
            />
            <Figure
              label={t.review.figure.surveyResponses}
              value={String(draft.survey.computed.responseCount)}
              muted={draft.survey.computed.responseCount === 0}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.review.outcomesCard}</CardTitle>
        </CardHeader>
        <CardContent>
          {draft.participants.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.review.noParticipants}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.review.participant}</TableHead>
                    <TableHead className="text-end">{t.review.attendance}</TableHead>
                    <TableHead className="text-end">{t.review.score}</TableHead>
                    <TableHead>{t.review.outcome}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draft.participants.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell dir="auto">{p.nameAr}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {p.computed.attendanceRate === null ? "—" : `${p.computed.attendanceRate}%`}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {p.computed.totalScore ?? "—"}
                      </TableCell>
                      <TableCell>
                        {t.outcome[p.computed.outcome]}
                        {p.computed.outcomeIsOverridden ? (
                          <span className="ms-2 text-xs text-muted-foreground">
                            {t.review.overriddenFrom(t.outcome[p.computed.computedOutcome])}
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <FinalizeCard ready={checklist.ready} />
    </div>
  );
}
