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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { computeChecklist, type ChecklistItem } from "@/lib/compute";

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
          message: body?.error ?? `Export failed (HTTP ${response.status})`,
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
          <CardTitle>Report finalized</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">
            Written to{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              output/{state.directory}/
            </code>
          </p>
          <ul className="text-sm text-muted-foreground">
            {state.files.map((file) => (
              <li key={file}>· {file}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            The draft has been cleared. Start a new report from any screen.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Finalize</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Renders the Word report, Excel workbook and PowerPoint deck into{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">output/</code>, writes
          report-data.json alongside them, and then clears the draft.
        </p>

        <Button onClick={() => void finalize()} disabled={!ready || busy || unsaved}>
          {busy
            ? "Rendering…"
            : !ready
              ? "Checklist incomplete"
              : unsaved
                ? "Waiting for save…"
                : "Finalize report"}
        </Button>

        {state.phase === "failed" ? (
          <div className="space-y-1 rounded-md border border-destructive/40 p-3">
            <p className="text-sm font-medium text-destructive">
              {state.section ? `${state.section} failed.` : "Export failed."}
            </p>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            {state.failing?.length ? (
              <ul className="text-sm text-muted-foreground">
                {state.failing.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Nothing was written and your draft is untouched.
            </p>
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

export default function ReviewPage() {
  const { draft } = useLoadedDraft();
  const checklist = computeChecklist(draft);
  const c = draft.computed;

  const required = checklist.items.filter((i) => i.required);
  const advisory = checklist.items.filter((i) => !i.required);

  return (
    <div className="max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Readiness</span>
            <span
              className={
                checklist.ready
                  ? "text-sm font-normal text-emerald-600 dark:text-emerald-500"
                  : "text-sm font-normal text-amber-600 dark:text-amber-500"
              }
              data-testid="readiness"
              data-ready={checklist.ready}
            >
              {checklist.ready
                ? "All required items pass"
                : `${checklist.requiredFailing} required item(s) outstanding`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
            {required.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 px-4 py-3"
                data-testid={`check-${item.id}`}
                data-status={item.status}
              >
                <span
                  aria-hidden
                  className={
                    item.status === "pass"
                      ? "mt-0.5 text-emerald-600 dark:text-emerald-500"
                      : "mt-0.5 text-amber-600 dark:text-amber-500"
                  }
                >
                  {item.status === "pass" ? "✓" : "•"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.detail}</p>
                </div>
                {item.status === "fail" ? (
                  <Link
                    href={SECTION_HREF[item.section]}
                    className="shrink-0 text-sm underline underline-offset-4"
                  >
                    Fix
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>

          {advisory.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Advisory — reported, does not block finalize
              </p>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-dashed border-border bg-background">
                {advisory.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 px-4 py-3"
                    data-testid={`check-${item.id}`}
                    data-status={item.status}
                  >
                    <span
                      aria-hidden
                      className={
                        item.status === "pass"
                          ? "mt-0.5 text-emerald-600 dark:text-emerald-500"
                          : "mt-0.5 text-muted-foreground"
                      }
                    >
                      {item.status === "pass" ? "✓" : "•"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                    {item.status === "fail" ? (
                      <Link
                        href={SECTION_HREF[item.section]}
                        className="shrink-0 text-sm underline underline-offset-4"
                      >
                        Review
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Computed figures</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Every figure below is produced by compute.ts and stored in the draft. The exported
            documents render these same values.
          </p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Figure label="Participants" value={String(c.participantCount)} />
            <Figure label="Sessions" value={String(c.sessionCount)} />
            <Figure label="Total hours" value={String(c.totalHours)} />
            <Figure label="Grade weight" value={String(c.totalGradeWeight)} />
            <Figure label="Passed" value={String(c.passedCount)} />
            <Figure label="Failed" value={String(c.failedCount)} />
            <Figure
              label="Incomplete"
              value={String(c.incompleteCount)}
              muted={c.incompleteCount === 0}
            />
            <Figure
              label="Avg attendance"
              value={c.averageAttendanceRate === null ? "—" : `${c.averageAttendanceRate}%`}
              muted={c.averageAttendanceRate === null}
            />
            <Figure
              label="Avg score"
              value={c.averageTotalScore === null ? "—" : String(c.averageTotalScore)}
              muted={c.averageTotalScore === null}
            />
            <Figure
              label="Survey average"
              value={
                draft.survey.computed.overallAverage === null
                  ? "—"
                  : `${draft.survey.computed.overallAverage} / ${draft.survey.scaleMax}`
              }
              muted={draft.survey.computed.overallAverage === null}
            />
            <Figure
              label="Survey responses"
              value={String(draft.survey.computed.responseCount)}
              muted={draft.survey.computed.responseCount === 0}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outcomes by participant</CardTitle>
        </CardHeader>
        <CardContent>
          {draft.participants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No participants yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Participant</TableHead>
                    <TableHead className="text-right">Attendance</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draft.participants.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell dir="auto">{p.nameAr}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.computed.attendanceRate === null ? "—" : `${p.computed.attendanceRate}%`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.computed.totalScore ?? "—"}
                      </TableCell>
                      <TableCell>
                        {p.computed.outcome}
                        {p.computed.outcomeIsOverridden ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            overridden from {p.computed.computedOutcome}
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
