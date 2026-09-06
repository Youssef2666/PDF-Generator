"use client";

/**
 * Participants and the attendance matrix.
 *
 * The matrix is the densest surface in the app, so the per-cell control is a
 * plain select rather than anything clever: it is keyboard-reachable, it
 * shows its current value without a legend, and it has an explicit blank
 * option because "not yet recorded" is a real state that the checklist
 * counts and the attendance rate deliberately excludes.
 *
 * Every figure in the trailing columns comes from compute.ts. Nothing on
 * this screen works out a percentage.
 */

import { useLoadedDraft } from "@/components/draft-provider";
import { ArabicInput, AutoInput } from "@/components/fields";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { newRowId } from "@/lib/empty-draft";
import type { AttendanceStatus, Participant } from "@/lib/schema";

const STATUSES: AttendanceStatus[] = ["present", "late", "absent", "excused"];

const STATUS_TONE: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  late: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
  absent: "bg-red-500/10 text-red-700 dark:text-red-400",
  excused: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

export default function ParticipantsPage() {
  const { draft, update } = useLoadedDraft();
  const t = useT();
  const { participants, sessions } = draft;

  const setParticipant = <K extends keyof Participant>(
    id: string,
    key: K,
    value: Participant[K],
  ) =>
    update((d) => ({
      ...d,
      participants: d.participants.map((p) => (p.id === id ? { ...p, [key]: value } : p)),
    }));

  const setAttendance = (participantId: string, sessionId: string, status: string) =>
    update((d) => ({
      ...d,
      participants: d.participants.map((p) => {
        if (p.id !== participantId) return p;
        const attendance = { ...p.attendance };
        if (status === "") {
          delete attendance[sessionId];
        } else {
          attendance[sessionId] = status as AttendanceStatus;
        }
        return { ...p, attendance };
      }),
    }));

  const addParticipant = () =>
    update((d) => ({
      ...d,
      participants: [
        ...d.participants,
        {
          id: newRowId("p"),
          // The placeholder is Arabic whatever the UI language: the roster
          // itself is Arabic by definition.
          nameAr: "مشارك جديد",
          nameEn: null,
          jobTitle: "",
          department: "",
          attendance: {},
          grades: {},
          outcomeOverride: null,
          outcomeOverrideNote: null,
          computed: {
            presentCount: 0,
            lateCount: 0,
            absentCount: 0,
            excusedCount: 0,
            attendedCount: 0,
            countedCount: 0,
            attendanceRate: null,
            attendedHours: 0,
            totalScore: null,
            computedOutcome: "incomplete",
            outcome: "incomplete",
            outcomeIsOverridden: false,
          },
        },
      ],
    }));

  const removeParticipant = (id: string) =>
    update((d) => ({ ...d, participants: d.participants.filter((p) => p.id !== id) }));

  /** Set one status across every session for one participant. */
  const fillRow = (participantId: string, status: AttendanceStatus) =>
    update((d) => ({
      ...d,
      participants: d.participants.map((p) =>
        p.id === participantId
          ? { ...p, attendance: Object.fromEntries(d.sessions.map((s) => [s.id, status])) }
          : p,
      ),
    }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {t.participants.card}
            <span className="ms-2 text-sm font-normal text-muted-foreground">
              {t.participants.people(draft.computed.participantCount)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-56">{t.participants.columns.nameAr}</TableHead>
                  <TableHead className="min-w-48">{t.participants.columns.nameEn}</TableHead>
                  <TableHead className="min-w-44">{t.participants.columns.jobTitle}</TableHead>
                  <TableHead className="min-w-44">{t.participants.columns.department}</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {participants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      {t.participants.noParticipants}
                    </TableCell>
                  </TableRow>
                ) : (
                  participants.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <ArabicInput
                          value={p.nameAr}
                          onChange={(e) => setParticipant(p.id, "nameAr", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <AutoInput
                          value={p.nameEn ?? ""}
                          onChange={(e) => setParticipant(p.id, "nameEn", e.target.value || null)}
                        />
                      </TableCell>
                      <TableCell>
                        <AutoInput
                          value={p.jobTitle}
                          onChange={(e) => setParticipant(p.id, "jobTitle", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <AutoInput
                          value={p.department}
                          onChange={(e) => setParticipant(p.id, "department", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeParticipant(p.id)}
                          aria-label={t.participants.removeParticipant(p.nameAr)}
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
          <Button variant="outline" onClick={addParticipant}>
            {t.participants.addParticipant}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.participants.attendance}</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 || participants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t.participants.addBefore(sessions.length === 0 ? "sessions" : "participants")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky start-0 z-10 min-w-56 bg-background">
                      {t.participants.participant}
                    </TableHead>
                    {sessions.map((s) => (
                      <TableHead key={s.id} className="min-w-28 text-center">
                        <span className="block text-xs font-medium">
                          {t.participants.sessionShort(s.index)}
                        </span>
                        <span
                          className="block text-xs font-normal text-muted-foreground tabular-nums"
                          dir="ltr"
                        >
                          {s.date.slice(5)}
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="min-w-32 text-center">{t.participants.fillRow}</TableHead>
                    <TableHead className="min-w-24 text-end">{t.participants.rate}</TableHead>
                    <TableHead className="min-w-24 text-end">{t.participants.hours}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {participants.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell
                        className="sticky start-0 z-10 bg-background font-medium"
                        dir="auto"
                      >
                        {p.nameAr}
                        {p.computed.lateCount > 0 ? (
                          <span className="ms-2 text-xs font-normal text-amber-600 dark:text-amber-500">
                            {t.participants.late(p.computed.lateCount)}
                          </span>
                        ) : null}
                      </TableCell>

                      {sessions.map((s) => {
                        const status = p.attendance[s.id];
                        return (
                          <TableCell key={s.id} className="p-1 text-center">
                            <select
                              aria-label={t.participants.cellLabel(p.nameAr, s.index)}
                              className={`w-full rounded-md border border-input bg-transparent px-1 py-1.5 text-xs ${
                                status ? STATUS_TONE[status] : "text-muted-foreground"
                              }`}
                              value={status ?? ""}
                              onChange={(e) => setAttendance(p.id, s.id, e.target.value)}
                            >
                              <option value="">{t.common.none}</option>
                              {STATUSES.map((option) => (
                                <option key={option} value={option}>
                                  {t.attendanceStatus[option]}
                                </option>
                              ))}
                            </select>
                          </TableCell>
                        );
                      })}

                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => fillRow(p.id, "present")}
                          >
                            {t.participants.allPresent}
                          </Button>
                        </div>
                      </TableCell>

                      <TableCell className="text-end tabular-nums">
                        {p.computed.attendanceRate === null ? (
                          <span className="text-muted-foreground">{t.common.none}</span>
                        ) : (
                          `${p.computed.attendanceRate}%`
                        )}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-muted-foreground">
                        {p.computed.attendedHours}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
