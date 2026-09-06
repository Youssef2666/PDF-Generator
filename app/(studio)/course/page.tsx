"use client";

/**
 * F2 — course setup and the session schedule.
 *
 * The bulk session generator exists because a five-day course entered one
 * session at a time is five near-identical forms. It fills the range from
 * the course dates and the usual daily hours, and everything it produces is
 * editable afterwards.
 */

import { useState } from "react";

import { useLoadedDraft } from "@/components/draft-provider";
import { ArabicInput, AutoInput, Field, LtrInput } from "@/components/fields";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { newRowId } from "@/lib/empty-draft";
import type { Course, Session } from "@/lib/schema";

/** Hours between two HH:MM times, to one decimal. Negative spans give 0. */
function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  return minutes > 0 ? Number((minutes / 60).toFixed(1)) : 0;
}

/** Every date from start to end inclusive, as YYYY-MM-DD. */
function datesInRange(start: string, end: string, skipWeekends: boolean): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime()) || cursor > last) return out;

  while (cursor <= last && out.length < 366) {
    const day = cursor.getUTCDay();
    // Friday (5) and Saturday (6) are the weekend in Libya and across most
    // of the Arab world, which is the context this tool is built for.
    if (!skipWeekends || (day !== 5 && day !== 6)) {
      out.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

const DELIVERY_MODES: Array<Course["deliveryMode"]> = ["in-person", "online", "blended"];

export default function CoursePage() {
  const { draft, update } = useLoadedDraft();
  const t = useT();
  const { course, sessions } = draft;

  const [genStart, setGenStart] = useState("09:00");
  const [genEnd, setGenEnd] = useState("12:00");
  const [skipWeekends, setSkipWeekends] = useState(true);

  const setCourse = <K extends keyof Course>(key: K, value: Course[K]) =>
    update((d) => ({ ...d, course: { ...d.course, [key]: value } }));

  const setSession = <K extends keyof Session>(id: string, key: K, value: Session[K]) =>
    update((d) => ({
      ...d,
      sessions: d.sessions.map((s) => (s.id === id ? { ...s, [key]: value } : s)),
    }));

  const addSession = () =>
    update((d) => ({
      ...d,
      sessions: [
        ...d.sessions,
        {
          id: newRowId("s"),
          index: d.sessions.length + 1,
          date: d.course.startDate ?? new Date().toISOString().slice(0, 10),
          startTime: "09:00",
          endTime: "12:00",
          durationHours: 3,
          topicAr: "",
          topicEn: null,
        },
      ],
    }));

  const removeSession = (id: string) =>
    update((d) => ({ ...d, sessions: d.sessions.filter((s) => s.id !== id) }));

  const generateSessions = () => {
    if (!course.startDate || !course.endDate) return;
    const dates = datesInRange(course.startDate, course.endDate, skipWeekends);
    const duration = hoursBetween(genStart, genEnd);

    update((d) => ({
      ...d,
      sessions: dates.map((date, i) => ({
        id: newRowId("s"),
        index: i + 1,
        date,
        startTime: genStart,
        endTime: genEnd,
        durationHours: duration,
        topicAr: "",
        topicEn: null,
      })),
    }));
  };

  const canGenerate = Boolean(course.startDate && course.endDate);
  const previewCount = canGenerate
    ? datesInRange(course.startDate!, course.endDate!, skipWeekends).length
    : 0;

  return (
    <div className="max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.course.card}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t.course.titleAr} htmlFor="titleAr">
            <ArabicInput
              id="titleAr"
              value={course.titleAr}
              onChange={(e) => setCourse("titleAr", e.target.value)}
            />
          </Field>
          <Field label={t.course.titleEn} htmlFor="titleEn">
            <AutoInput
              id="titleEn"
              value={course.titleEn ?? ""}
              onChange={(e) => setCourse("titleEn", e.target.value || null)}
            />
          </Field>
          <Field label={t.course.clientAr} htmlFor="clientNameAr">
            <ArabicInput
              id="clientNameAr"
              value={course.clientNameAr}
              onChange={(e) => setCourse("clientNameAr", e.target.value)}
            />
          </Field>
          <Field label={t.course.clientEn} htmlFor="clientNameEn">
            <AutoInput
              id="clientNameEn"
              value={course.clientNameEn ?? ""}
              onChange={(e) => setCourse("clientNameEn", e.target.value || null)}
            />
          </Field>
          <Field label={t.course.trainerAr} htmlFor="trainerNameAr">
            <ArabicInput
              id="trainerNameAr"
              value={course.trainerNameAr}
              onChange={(e) => setCourse("trainerNameAr", e.target.value)}
            />
          </Field>
          <Field label={t.course.trainerEn} htmlFor="trainerNameEn">
            <AutoInput
              id="trainerNameEn"
              value={course.trainerNameEn ?? ""}
              onChange={(e) => setCourse("trainerNameEn", e.target.value || null)}
            />
          </Field>
          <Field label={t.course.code} htmlFor="code">
            <LtrInput
              id="code"
              value={course.code ?? ""}
              onChange={(e) => setCourse("code", e.target.value || null)}
            />
          </Field>
          <Field label={t.course.venue} htmlFor="venue" hint={t.course.venueHint}>
            <AutoInput
              id="venue"
              value={course.venue}
              onChange={(e) => setCourse("venue", e.target.value)}
            />
          </Field>
          <Field label={t.course.deliveryMode}>
            <Select
              value={course.deliveryMode}
              onValueChange={(v) => setCourse("deliveryMode", v as Course["deliveryMode"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t.course.delivery[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t.course.startDate} htmlFor="startDate">
              <LtrInput
                id="startDate"
                type="date"
                value={course.startDate ?? ""}
                onChange={(e) => setCourse("startDate", e.target.value || null)}
              />
            </Field>
            <Field label={t.course.endDate} htmlFor="endDate">
              <LtrInput
                id="endDate"
                type="date"
                value={course.endDate ?? ""}
                onChange={(e) => setCourse("endDate", e.target.value || null)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.course.passingRule}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t.course.minScore} htmlFor="minScore" hint={t.course.minScoreHint}>
            <LtrInput
              id="minScore"
              type="number"
              min={0}
              max={100}
              value={course.passing.minScore}
              onChange={(e) =>
                setCourse("passing", {
                  ...course.passing,
                  minScore: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
          <Field
            label={t.course.minAttendance}
            htmlFor="minAttendance"
            hint={t.course.minAttendanceHint}
          >
            <LtrInput
              id="minAttendance"
              type="number"
              min={0}
              max={100}
              value={course.passing.minAttendanceRate}
              onChange={(e) =>
                setCourse("passing", {
                  ...course.passing,
                  minAttendanceRate: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.course.generate}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t.course.generateBody} <strong>{t.course.generateWarning}</strong>
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <Field label={t.course.dailyStart} htmlFor="genStart" className="w-32">
              <LtrInput
                id="genStart"
                type="time"
                value={genStart}
                onChange={(e) => setGenStart(e.target.value)}
              />
            </Field>
            <Field label={t.course.dailyEnd} htmlFor="genEnd" className="w-32">
              <LtrInput
                id="genEnd"
                type="time"
                value={genEnd}
                onChange={(e) => setGenEnd(e.target.value)}
              />
            </Field>
            <div className="flex items-center gap-2 pb-2">
              <Input
                id="skipWeekends"
                type="checkbox"
                className="size-4"
                checked={skipWeekends}
                onChange={(e) => setSkipWeekends(e.target.checked)}
              />
              <Label htmlFor="skipWeekends" className="text-sm font-normal">
                {t.course.skipWeekends}
              </Label>
            </div>
            <Button onClick={generateSessions} disabled={!canGenerate || previewCount === 0}>
              {t.course.generateButton(previewCount)}
            </Button>
          </div>
          {!canGenerate ? (
            <p className="text-sm text-amber-600 dark:text-amber-500">{t.course.setDatesFirst}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t.course.sessions}
            <span className="ms-2 text-sm font-normal text-muted-foreground">
              {t.course.sessionsSummary(draft.computed.sessionCount, draft.computed.totalHours)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">{t.course.columns.index}</TableHead>
                  <TableHead className="w-40">{t.course.columns.date}</TableHead>
                  <TableHead className="w-28">{t.course.columns.start}</TableHead>
                  <TableHead className="w-28">{t.course.columns.end}</TableHead>
                  <TableHead className="w-24">{t.course.columns.hours}</TableHead>
                  <TableHead>{t.course.columns.topic}</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      {t.course.noSessions}
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {session.index}
                      </TableCell>
                      <TableCell>
                        <LtrInput
                          type="date"
                          value={session.date}
                          onChange={(e) => setSession(session.id, "date", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <LtrInput
                          type="time"
                          value={session.startTime}
                          onChange={(e) => setSession(session.id, "startTime", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <LtrInput
                          type="time"
                          value={session.endTime}
                          onChange={(e) => setSession(session.id, "endTime", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <LtrInput
                          type="number"
                          min={0}
                          step={0.5}
                          value={session.durationHours}
                          onChange={(e) =>
                            setSession(session.id, "durationHours", Number(e.target.value) || 0)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <ArabicInput
                          value={session.topicAr}
                          onChange={(e) => setSession(session.id, "topicAr", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSession(session.id)}
                          aria-label={t.course.removeSession(session.index)}
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
          <Button variant="outline" onClick={addSession}>
            {t.course.addSession}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
