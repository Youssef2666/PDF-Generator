"use client";

/**
 * F7 — the readiness checklist and the computed figures panel.
 *
 * Both halves are pure output. The checklist comes from
 * `computeChecklist(draft)` — the same function the export gate will use, so
 * what this screen shows and what finalize enforces cannot disagree. The
 * figures are read straight out of the draft's `computed` blocks.
 *
 * The finalize action itself lands in M5; the gate is already wired here so
 * the button can only ever be enabled when the checklist is satisfied.
 */

import Link from "next/link";

import { useLoadedDraft } from "@/components/draft-provider";
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

function Figure({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-lg font-semibold tabular-nums ${muted ? "text-muted-foreground" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

export default function ReviewPage() {
  const { draft, saveState } = useLoadedDraft();
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
          <ul className="space-y-2">
            {required.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 rounded-md border p-3"
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
              <ul className="space-y-2">
                {advisory.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 rounded-md border border-dashed p-3"
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

      <Card>
        <CardHeader>
          <CardTitle>Finalize</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Finalizing renders the Word, Excel and PowerPoint package and then clears the draft.
            It arrives in M5; the gate below is already wired to the checklist.
          </p>
          <Button disabled={!checklist.ready || saveState === "pending" || saveState === "saving"}>
            {checklist.ready ? "Finalize report" : "Checklist incomplete"}
          </Button>
          {checklist.ready ? (
            <p className="text-xs text-muted-foreground">
              Export is not implemented yet — this button becomes active in M5.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
