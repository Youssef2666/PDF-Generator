"use client";

/**
 * F4 — grade columns, the marks table, and outcome overrides.
 *
 * The TSV paste box exists because marks almost always start life in a
 * spreadsheet. Pasting a block of cells is one action; retyping forty
 * numbers is forty chances to transpose a digit. The paste is matched to
 * participants by row order, previewed, and only applied on confirmation —
 * an import that silently mismatched rows would be worse than no import.
 */

import { useState } from "react";

import { useLoadedDraft } from "@/components/draft-provider";
import { ArabicInput, AutoInput, LtrInput } from "@/components/fields";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { newRowId } from "@/lib/empty-draft";
import type { GradeColumn, Outcome } from "@/lib/schema";

const OUTCOME_TONE: Record<Outcome, string> = {
  passed: "text-emerald-700 dark:text-emerald-400",
  failed: "text-red-700 dark:text-red-400",
  incomplete: "text-muted-foreground",
};

const OUTCOMES: Outcome[] = ["passed", "failed", "incomplete"];

/** Parse a pasted spreadsheet block into rows of numbers-or-null. */
function parseTsv(text: string): Array<Array<number | null>> {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) =>
      line.split("\t").map((cell) => {
        const trimmed = cell.trim();
        if (trimmed === "") return null;
        const value = Number(trimmed);
        return Number.isFinite(value) ? value : null;
      }),
    );
}

export default function GradesPage() {
  const { draft, update } = useLoadedDraft();
  const t = useT();
  const { gradeColumns, participants } = draft;

  const [paste, setPaste] = useState("");
  const parsed = paste.trim() === "" ? [] : parseTsv(paste);

  const setColumn = <K extends keyof GradeColumn>(id: string, key: K, value: GradeColumn[K]) =>
    update((d) => ({
      ...d,
      gradeColumns: d.gradeColumns.map((c) => (c.id === id ? { ...c, [key]: value } : c)),
    }));

  const addColumn = () =>
    update((d) => ({
      ...d,
      gradeColumns: [
        ...d.gradeColumns,
        // The label is Arabic whatever the UI language: it is printed in
        // the report.
        { id: newRowId("g"), labelAr: "عنصر تقييم", labelEn: null, maxScore: 100, weight: 0 },
      ],
    }));

  const removeColumn = (id: string) =>
    update((d) => ({ ...d, gradeColumns: d.gradeColumns.filter((c) => c.id !== id) }));

  const setMark = (participantId: string, columnId: string, raw: string) =>
    update((d) => ({
      ...d,
      participants: d.participants.map((p) =>
        p.id === participantId
          ? {
              ...p,
              grades: {
                ...p.grades,
                [columnId]: raw.trim() === "" ? null : (Number(raw) ?? null),
              },
            }
          : p,
      ),
    }));

  const setOverride = (participantId: string, value: string) =>
    update((d) => ({
      ...d,
      participants: d.participants.map((p) =>
        p.id === participantId
          ? { ...p, outcomeOverride: value === "" ? null : (value as Outcome) }
          : p,
      ),
    }));

  const setOverrideNote = (participantId: string, note: string) =>
    update((d) => ({
      ...d,
      participants: d.participants.map((p) =>
        p.id === participantId ? { ...p, outcomeOverrideNote: note || null } : p,
      ),
    }));

  const applyPaste = () => {
    update((d) => ({
      ...d,
      participants: d.participants.map((p, rowIndex) => {
        const row = parsed[rowIndex];
        if (!row) return p;
        const grades = { ...p.grades };
        d.gradeColumns.forEach((column, columnIndex) => {
          if (columnIndex < row.length) grades[column.id] = row[columnIndex];
        });
        return { ...p, grades };
      }),
    }));
    setPaste("");
  };

  const weightTone =
    draft.computed.totalGradeWeight === 100
      ? "text-emerald-600 dark:text-emerald-500"
      : "text-amber-600 dark:text-amber-500";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {t.grades.columnsCard}
            <span className={`ms-2 text-sm font-normal ${weightTone}`}>
              {t.grades.weightsTotal(draft.computed.totalGradeWeight)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-56">{t.grades.columns.labelAr}</TableHead>
                  <TableHead className="min-w-48">{t.grades.columns.labelEn}</TableHead>
                  <TableHead className="min-w-32">{t.grades.columns.maxScore}</TableHead>
                  <TableHead className="min-w-32">{t.grades.columns.weight}</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {gradeColumns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      {t.grades.noColumns}
                    </TableCell>
                  </TableRow>
                ) : (
                  gradeColumns.map((column) => (
                    <TableRow key={column.id}>
                      <TableCell>
                        <ArabicInput
                          value={column.labelAr}
                          onChange={(e) => setColumn(column.id, "labelAr", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <AutoInput
                          value={column.labelEn ?? ""}
                          onChange={(e) =>
                            setColumn(column.id, "labelEn", e.target.value || null)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <LtrInput
                          type="number"
                          min={1}
                          value={column.maxScore}
                          onChange={(e) =>
                            setColumn(column.id, "maxScore", Number(e.target.value) || 1)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <LtrInput
                          type="number"
                          min={0}
                          max={100}
                          value={column.weight}
                          onChange={(e) =>
                            setColumn(column.id, "weight", Number(e.target.value) || 0)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeColumn(column.id)}
                          aria-label={t.grades.removeColumn(column.labelAr)}
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
          <Button variant="outline" onClick={addColumn}>
            {t.grades.addColumn}
          </Button>
        </CardContent>
      </Card>

      {gradeColumns.length > 0 && participants.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.grades.pasteCard}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t.grades.pasteBody}</p>
            <Textarea
              dir="ltr"
              rows={4}
              placeholder={"18\t27\t46\n16\t25\t42"}
              className="font-mono text-xs"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            {parsed.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm">
                  {t.grades.pasteParsed(parsed.length, participants.length)}
                  {parsed.length !== participants.length ? (
                    <span className="text-amber-600 dark:text-amber-500">
                      {t.grades.pasteMismatch}
                    </span>
                  ) : null}
                </p>
                <div className="max-h-48 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t.grades.participant}</TableHead>
                        {gradeColumns.map((c) => (
                          <TableHead key={c.id} dir="auto">
                            {c.labelAr}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {participants.map((p, i) => (
                        <TableRow key={p.id}>
                          <TableCell dir="auto">{p.nameAr}</TableCell>
                          {gradeColumns.map((c, ci) => {
                            const value = parsed[i]?.[ci];
                            return (
                              <TableCell key={c.id} className="tabular-nums">
                                {parsed[i] === undefined ? (
                                  <span className="text-muted-foreground">
                                    {t.common.unchanged}
                                  </span>
                                ) : value === null || value === undefined ? (
                                  <span className="text-muted-foreground">{t.common.none}</span>
                                ) : value > c.maxScore ? (
                                  <span className="text-amber-600 dark:text-amber-500">
                                    {t.grades.overMax(value, c.maxScore)}
                                  </span>
                                ) : (
                                  value
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex gap-2">
                  <Button onClick={applyPaste}>{t.grades.apply(parsed.length)}</Button>
                  <Button variant="ghost" onClick={() => setPaste("")}>
                    {t.common.cancel}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.grades.marksCard}</CardTitle>
        </CardHeader>
        <CardContent>
          {gradeColumns.length === 0 || participants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t.grades.addFirst(gradeColumns.length === 0 ? "columns" : "participants")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky start-0 z-10 min-w-56 bg-background">
                      {t.grades.participant}
                    </TableHead>
                    {gradeColumns.map((c) => (
                      <TableHead key={c.id} className="min-w-28 text-center" dir="auto">
                        <span className="block">{c.labelAr}</span>
                        <span
                          className="block text-xs font-normal text-muted-foreground"
                          dir="ltr"
                        >
                          {t.grades.columnMeta(c.maxScore, c.weight)}
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="w-24 text-end">{t.grades.total}</TableHead>
                    <TableHead className="w-24 text-end">{t.grades.attendance}</TableHead>
                    <TableHead className="w-28">{t.grades.outcome}</TableHead>
                    <TableHead className="w-36">{t.grades.override}</TableHead>
                    <TableHead className="min-w-56">{t.grades.overrideNote}</TableHead>
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
                      </TableCell>

                      {gradeColumns.map((c) => (
                        <TableCell key={c.id} className="p-1">
                          <LtrInput
                            type="number"
                            min={0}
                            max={c.maxScore}
                            aria-label={t.grades.markLabel(p.nameAr, c.labelAr)}
                            className="text-center"
                            value={p.grades[c.id] ?? ""}
                            onChange={(e) => setMark(p.id, c.id, e.target.value)}
                          />
                        </TableCell>
                      ))}

                      <TableCell className="text-end tabular-nums font-medium">
                        {p.computed.totalScore ?? (
                          <span className="text-muted-foreground">{t.common.none}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-muted-foreground">
                        {p.computed.attendanceRate === null
                          ? t.common.none
                          : `${p.computed.attendanceRate}%`}
                      </TableCell>

                      <TableCell>
                        <span className={OUTCOME_TONE[p.computed.outcome]}>
                          {t.outcome[p.computed.outcome]}
                        </span>
                        {p.computed.outcomeIsOverridden ? (
                          <span
                            className="block text-xs text-muted-foreground"
                            title={t.grades.wasOutcomeTitle}
                          >
                            {t.grades.wasOutcome(t.outcome[p.computed.computedOutcome])}
                          </span>
                        ) : null}
                      </TableCell>

                      <TableCell>
                        <select
                          aria-label={t.grades.overrideFor(p.nameAr)}
                          className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs"
                          value={p.outcomeOverride ?? ""}
                          onChange={(e) => setOverride(p.id, e.target.value)}
                        >
                          <option value="">{t.grades.noOverride}</option>
                          {OUTCOMES.map((outcome) => (
                            <option key={outcome} value={outcome}>
                              {t.grades.overrideOptions[outcome]}
                            </option>
                          ))}
                        </select>
                      </TableCell>

                      <TableCell>
                        {p.outcomeOverride ? (
                          <ArabicInput
                            aria-label={t.grades.overrideReasonFor(p.nameAr)}
                            value={p.outcomeOverrideNote ?? ""}
                            onChange={(e) => setOverrideNote(p.id, e.target.value)}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">{t.common.none}</span>
                        )}
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
