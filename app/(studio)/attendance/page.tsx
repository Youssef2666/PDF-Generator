"use client";

/**
 * F3 — import an attendance register.
 *
 * The shape of this screen follows from the rule that governs the whole
 * feature: extraction proposes, a human disposes. Nothing reaches the draft
 * until someone has seen the parsed table beside the page it came from and
 * pressed confirm. Every cell is editable up to that moment, because the
 * fastest way to fix one misread mark should never be "start again".
 *
 * Three routes in, in descending order of preference:
 *   1. a committed profile matches       — deterministic, no model, instant
 *   2. the model proposes a profile      — off by default, explicit consent
 *   3. the manual table                  — always available, always visible
 */

import { useState } from "react";

import { useLoadedDraft } from "@/components/draft-provider";
import { ArabicInput, AutoInput, LtrInput } from "@/components/fields";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { applyTableToDraft, type ConfirmedTable } from "@/lib/pdf/to-draft";
import type { AttendanceStatus } from "@/lib/schema";

const STATUSES: AttendanceStatus[] = ["present", "late", "absent", "excused"];

interface Warning {
  code: string;
  message: string;
}

interface Match {
  profileId: string;
  profileName: string;
  origin: string;
  confidence: number;
  sessions: Array<{ label: string; index: number }>;
  participants: Array<{
    name: string;
    department: string;
    marks: Array<AttendanceStatus | null>;
  }>;
  warnings: Warning[];
}

interface EditableRow {
  name: string;
  department: string;
  marks: Array<AttendanceStatus | null>;
}

type Source = "pdf-committed-profile" | "pdf-proposed-profile" | "manual";

export default function AttendancePage() {
  const { draft, update } = useLoadedDraft();
  const t = useT();

  const [uploadId, setUploadId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [source, setSource] = useState<Source>("manual");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [sessionDates, setSessionDates] = useState<string[]>([]);
  const [rows, setRows] = useState<EditableRow[] | null>(null);

  // The model path, all of it opt-in.
  const [proposal, setProposal] = useState<{
    enabled: boolean;
    hasCredentials: boolean;
    payload: string | null;
    redactedCellCount: number;
  } | null>(null);
  const [consent, setConsent] = useState(false);

  const reset = () => {
    setError(null);
    setNotice(null);
  };

  async function upload(file: File) {
    reset();
    setBusy(true);
    setRows(null);
    setProposal(null);
    setConsent(false);

    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/pdf/extract", { method: "POST", body: form });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body?.error ?? t.attendanceImport.uploadFailed(response.status));
      }

      setUploadId(body.upload.id);
      setFilename(body.upload.filename);

      if (body.match) {
        const match = body.match as Match;
        setSource("pdf-committed-profile");
        setProfileId(match.profileId);
        setConfidence(match.confidence);
        setWarnings(match.warnings);
        setSessionDates(match.sessions.map((s) => s.label));
        setRows(match.participants.map((p) => ({ ...p })));
        setNotice(
          t.attendanceImport.matched(match.profileName, Math.round(match.confidence * 100)),
        );
      } else {
        setNotice(t.attendanceImport.noMatch(body.profilesTried));
        // Fetch the proposal preview so the operator can see what it would send.
        const preview = await fetch(`/api/pdf/propose?upload=${body.upload.id}`);
        if (preview.ok) setProposal(await preview.json());
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function propose() {
    if (!uploadId) return;
    reset();
    setBusy(true);

    try {
      const response = await fetch("/api/pdf/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload: uploadId, consent: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? t.attendanceImport.proposalFailed);

      setSource("pdf-proposed-profile");
      setProfileId(body.profile.id);
      setConfidence(body.confidence);
      setWarnings(body.warnings ?? []);
      setSessionDates(body.sessions.map((s: { label: string }) => s.label));
      setRows(body.participants.map((p: EditableRow) => ({ ...p })));
      setNotice(t.attendanceImport.proposed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function startManual() {
    reset();
    setSource("manual");
    setProfileId(null);
    setConfidence(null);
    setWarnings([]);
    setSessionDates(
      draft.sessions.length > 0
        ? draft.sessions.map((s) => s.date)
        : [new Date().toISOString().slice(0, 10)],
    );
    setRows([{ name: "", department: "", marks: [null] }]);
    setNotice(t.attendanceImport.blank);
  }

  function confirm() {
    if (!rows) return;
    const table: ConfirmedTable = {
      sessions: sessionDates.map((date) => ({
        date,
        startTime: "09:00",
        endTime: "12:00",
        durationHours: 3,
      })),
      participants: rows.filter((row) => row.name.trim() !== ""),
      provenance: {
        attendanceSource: source,
        profileId,
        confidence,
        sourceFilename: filename,
      },
    };

    update((d) => applyTableToDraft(d, table));
    setRows(null);
    setNotice(t.attendanceImport.written(table.participants.length, table.sessions.length));
  }

  const setRow = (index: number, patch: Partial<EditableRow>) =>
    setRows((current) =>
      current ? current.map((row, i) => (i === index ? { ...row, ...patch } : row)) : current,
    );

  const setMark = (rowIndex: number, markIndex: number, value: string) =>
    setRows((current) =>
      current
        ? current.map((row, i) =>
            i === rowIndex
              ? {
                  ...row,
                  marks: row.marks.map((m, j) =>
                    j === markIndex ? (value === "" ? null : (value as AttendanceStatus)) : m,
                  ),
                }
              : row,
          )
        : current,
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.attendanceImport.card}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t.attendanceImport.body}</p>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept="application/pdf"
              disabled={busy}
              className="text-sm file:me-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button variant="outline" onClick={startManual} disabled={busy}>
              {t.attendanceImport.byHand}
            </Button>
          </div>

          {busy ? (
            <p className="text-sm text-muted-foreground">{t.attendanceImport.working}</p>
          ) : null}
          {notice ? <p className="text-sm text-emerald-700 dark:text-emerald-500">{notice}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <p className="text-xs text-muted-foreground">
            {t.attendanceImport.provenance}{" "}
            <strong dir="ltr">{draft.provenance.attendanceSource}</strong>
            {" · "}
            {draft.provenance.humanConfirmed
              ? t.attendanceImport.confirmed
              : t.attendanceImport.notConfirmed}
            {draft.provenance.sourceFilename ? (
              <>
                {" · "}
                <span dir="ltr">{draft.provenance.sourceFilename}</span>
              </>
            ) : null}
          </p>
        </CardContent>
      </Card>

      {proposal && !rows ? (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="text-base">{t.attendanceImport.proposeCard}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              {t.attendanceImport.proposeBody.before}
              <em>{t.attendanceImport.proposeBody.emphasis}</em>
              {t.attendanceImport.proposeBody.after}
            </p>

            <div className="rounded-md border bg-muted/40 p-3">
              <p className="mb-2 text-xs font-medium">
                {t.attendanceImport.payloadHeading(proposal.redactedCellCount)}
              </p>
              <pre className="max-h-56 overflow-auto text-xs" dir="ltr">
                {proposal.payload ?? t.attendanceImport.nothingToSend}
              </pre>
            </div>

            {!proposal.enabled ? (
              <p className="text-sm text-muted-foreground">
                {t.attendanceImport.disabled.before}
                <code dir="ltr">COURSE_REPORT_ALLOW_PROFILE_PROPOSAL=1</code>
                {t.attendanceImport.disabled.after}
              </p>
            ) : !proposal.hasCredentials ? (
              <p className="text-sm text-muted-foreground">{t.attendanceImport.noCredentials}</p>
            ) : (
              <>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>{t.attendanceImport.consent}</span>
                </label>
                <Button onClick={() => void propose()} disabled={!consent || busy}>
                  {t.attendanceImport.propose}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {rows ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {/* --- the parsed table, every cell editable --- */}
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-baseline justify-between text-base">
                <span>{t.attendanceImport.parsedTable}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {source === "manual"
                    ? t.attendanceImport.manualEntry
                    : t.attendanceImport.profileRead(
                        profileId ?? "",
                        Math.round((confidence ?? 0) * 100),
                      )}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {warnings.length > 0 ? (
                <div className="rounded-md border border-amber-500/40 p-3">
                  <p className="text-xs font-medium">
                    {t.attendanceImport.thingsToCheck(warnings.length)}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {warnings.slice(0, 8).map((w, i) => (
                      <li key={i}>· {w.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-48">{t.attendanceImport.name}</TableHead>
                      <TableHead className="min-w-32">{t.attendanceImport.department}</TableHead>
                      {sessionDates.map((date, i) => (
                        <TableHead key={i} className="min-w-28">
                          <LtrInput
                            aria-label={t.attendanceImport.sessionDate(i + 1)}
                            className="h-7 text-xs"
                            value={date}
                            onChange={(e) =>
                              setSessionDates((d) =>
                                d.map((v, j) => (j === i ? e.target.value : v)),
                              )
                            }
                          />
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, r) => (
                      <TableRow key={r}>
                        <TableCell>
                          <ArabicInput
                            aria-label={t.attendanceImport.nameRow(r + 1)}
                            value={row.name}
                            onChange={(e) => setRow(r, { name: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <AutoInput
                            aria-label={t.attendanceImport.departmentRow(r + 1)}
                            value={row.department}
                            onChange={(e) => setRow(r, { department: e.target.value })}
                          />
                        </TableCell>
                        {sessionDates.map((_, s) => (
                          <TableCell key={s} className="p-1">
                            <select
                              aria-label={t.attendanceImport.cell(r + 1, s + 1)}
                              className={`w-full rounded-md border border-input bg-transparent px-1 py-1.5 text-xs ${
                                row.marks[s] ? "" : "border-amber-500/60 text-muted-foreground"
                              }`}
                              value={row.marks[s] ?? ""}
                              onChange={(e) => setMark(r, s, e.target.value)}
                            >
                              <option value="">{t.common.none}</option>
                              {STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {t.attendanceStatus[status]}
                                </option>
                              ))}
                            </select>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    setRows((current) =>
                      current
                        ? [
                            ...current,
                            {
                              name: "",
                              department: "",
                              marks: sessionDates.map(() => null),
                            },
                          ]
                        : current,
                    )
                  }
                >
                  {t.attendanceImport.addRow}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSessionDates((d) => [...d, ""]);
                    setRows((current) =>
                      current
                        ? current.map((row) => ({ ...row, marks: [...row.marks, null] }))
                        : current,
                    );
                  }}
                >
                  {t.attendanceImport.addSession}
                </Button>
                <Button variant="ghost" onClick={() => setRows(null)}>
                  {t.common.discard}
                </Button>
              </div>

              <div className="border-t pt-3">
                <Button onClick={confirm} disabled={rows.every((r) => r.name.trim() === "")}>
                  {t.attendanceImport.confirm}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t.attendanceImport.confirmNote}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* --- the page it came from --- */}
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-base">{t.attendanceImport.sourcePage}</CardTitle>
            </CardHeader>
            <CardContent>
              {uploadId ? (
                <object
                  data={`/api/pdf/file/${uploadId}`}
                  type="application/pdf"
                  className="h-[70vh] w-full rounded-md border"
                  aria-label={t.attendanceImport.uploadedRegister}
                >
                  <p className="p-4 text-sm text-muted-foreground">
                    {t.attendanceImport.cannotDisplay}{" "}
                    <a className="underline" href={`/api/pdf/file/${uploadId}`}>
                      {t.attendanceImport.openInTab}
                    </a>
                    .
                  </p>
                </object>
              ) : (
                <p className="text-sm text-muted-foreground">{t.attendanceImport.noDocument}</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
