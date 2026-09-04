/**
 * The Excel workbook.
 *
 * Pure: `(draft, profile) => Buffer`. It reads no files, consults no clock,
 * and computes nothing — every figure it writes was produced by compute.ts
 * and is already sitting in the draft. Rendering the same draft twice
 * produces byte-identical output, which is what lets a test assert against
 * it at all.
 *
 * The RTL rules applied here are documented, with their reasons, in
 * docs/rtl.md. The two that matter most:
 *
 *   1. `rightToLeft: true` in every sheet's view. This is what mirrors the
 *      sheet — Excel then renders column A at the *right* edge and runs
 *      leftwards. Columns are therefore written in ordinary logical order;
 *      reversing the array as well would mirror it a second time and put
 *      the sheet back the way it started.
 *
 *   2. Arabic cells get `alignment.readingOrder = "rtl"` and are left on
 *      `general` horizontal alignment, so Excel resolves the edge from the
 *      reading order. Pinning `horizontal: "right"` looks identical until a
 *      cell holds a Latin name or a number, at which point the physical
 *      setting fights the content.
 */

import ExcelJS from "exceljs";

import { DEFAULT_PROFILE, isRtl, labels, type RenderProfile } from "@/render/profile";
import type { AttendanceStatus, Draft, Outcome } from "@/lib/schema";

/** Widths are in Excel's character units. */
const WIDTH = { name: 28, text: 20, narrow: 10, tiny: 7, wide: 46 };

type Sheet = ExcelJS.Worksheet;

/**
 * Every sheet gets the same view. `rightToLeft` mirrors the sheet;
 * `frozen` with ySplit keeps the header visible, and xSplit pins the
 * participant name column — which, on a mirrored sheet, is the rightmost.
 */
function applyView(sheet: Sheet, profile: RenderProfile, freezeColumns = 0): void {
  sheet.views = [
    {
      state: "frozen",
      xSplit: freezeColumns,
      ySplit: 1,
      rightToLeft: isRtl(profile),
      showGridLines: true,
    },
  ];
}

function headerStyle(cell: ExcelJS.Cell, profile: RenderProfile): void {
  cell.font = {
    name: profile.fonts.arabic,
    size: profile.fonts.headerSize,
    bold: true,
    color: { argb: `FF${profile.colors.headerText}` },
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${profile.colors.headerFill}` },
  };
  cell.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
    readingOrder: isRtl(profile) ? "rtl" : "ltr",
  };
}

/** A text cell whose content is Arabic, or may be. */
function textCell(cell: ExcelJS.Cell, value: string, profile: RenderProfile): void {
  cell.value = value;
  cell.font = { name: profile.fonts.arabic, size: profile.fonts.size };
  // No `horizontal`: general alignment lets Excel pick the edge from the
  // reading order, so a Latin name in this column still sits correctly.
  cell.alignment = { readingOrder: isRtl(profile) ? "rtl" : "ltr", vertical: "middle" };
}

/** A number, percentage or other value that is never prose. */
function numberCell(
  cell: ExcelJS.Cell,
  value: number | null,
  profile: RenderProfile,
  format?: string,
): void {
  cell.value = value;
  cell.font = { name: profile.fonts.latin, size: profile.fonts.size };
  // Numbers read left-to-right in Arabic documents too.
  cell.alignment = { horizontal: "center", vertical: "middle", readingOrder: "ltr" };
  if (format) cell.numFmt = format;
}

function outcomeColor(outcome: Outcome, profile: RenderProfile): string | undefined {
  if (outcome === "passed") return profile.colors.pass;
  if (outcome === "failed") return profile.colors.fail;
  return undefined;
}

function writeHeader(sheet: Sheet, headings: string[], profile: RenderProfile): void {
  const row = sheet.getRow(1);
  headings.forEach((heading, i) => {
    const cell = row.getCell(i + 1);
    cell.value = heading;
    headerStyle(cell, profile);
  });
  row.height = 28;
  row.commit();
}

function band(sheet: Sheet, rowNumber: number, columns: number, profile: RenderProfile): void {
  if (rowNumber % 2 === 1) return;
  for (let i = 1; i <= columns; i += 1) {
    sheet.getRow(rowNumber).getCell(i).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${profile.colors.bandFill}` },
    };
  }
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

function participantsSheet(book: ExcelJS.Workbook, draft: Draft, profile: RenderProfile): void {
  const t = labels(profile);
  const sheet = book.addWorksheet(t.sheetParticipants);

  const headings = [
    t.name,
    t.nameLatin,
    t.jobTitle,
    t.department,
    t.attendanceRate,
    t.attendedHours,
    t.totalScore,
    t.outcome,
  ];
  writeHeader(sheet, headings, profile);
  sheet.columns = [
    { width: WIDTH.name },
    { width: WIDTH.text },
    { width: WIDTH.text },
    { width: WIDTH.text },
    { width: WIDTH.narrow },
    { width: WIDTH.narrow },
    { width: WIDTH.narrow },
    { width: WIDTH.narrow },
  ];

  draft.participants.forEach((p, i) => {
    const row = sheet.getRow(i + 2);
    textCell(row.getCell(1), p.nameAr, profile);
    textCell(row.getCell(2), p.nameEn ?? "", profile);
    textCell(row.getCell(3), p.jobTitle, profile);
    textCell(row.getCell(4), p.department, profile);
    numberCell(row.getCell(5), p.computed.attendanceRate, profile, '0.0"%"');
    numberCell(row.getCell(6), p.computed.attendedHours, profile, "0.0");
    numberCell(row.getCell(7), p.computed.totalScore, profile, "0.0");

    const outcomeCell = row.getCell(8);
    textCell(outcomeCell, t[p.computed.outcome], profile);
    outcomeCell.alignment = { ...outcomeCell.alignment, horizontal: "center" };
    const color = outcomeColor(p.computed.outcome, profile);
    if (color) {
      outcomeCell.font = { ...outcomeCell.font, bold: true, color: { argb: `FF${color}` } };
    }

    band(sheet, i + 2, headings.length, profile);
    row.commit();
  });

  applyView(sheet, profile, 1);
}

function attendanceSheet(book: ExcelJS.Workbook, draft: Draft, profile: RenderProfile): void {
  const t = labels(profile);
  const sheet = book.addWorksheet(t.sheetAttendance);

  const statusLabel: Record<AttendanceStatus, string> = {
    present: t.present,
    late: t.late,
    absent: t.absent,
    excused: t.excused,
  };

  const headings = [
    t.name,
    ...draft.sessions.map((s) => `${t.session} ${s.index}\n${s.date}`),
    t.attendanceRate,
    t.lateCount,
    t.attendedHours,
  ];
  writeHeader(sheet, headings, profile);
  sheet.columns = [
    { width: WIDTH.name },
    ...draft.sessions.map(() => ({ width: WIDTH.narrow })),
    { width: WIDTH.narrow },
    { width: WIDTH.narrow },
    { width: WIDTH.narrow },
  ];

  draft.participants.forEach((p, i) => {
    const row = sheet.getRow(i + 2);
    textCell(row.getCell(1), p.nameAr, profile);

    draft.sessions.forEach((session, sessionIndex) => {
      const status = p.attendance[session.id];
      const cell = row.getCell(sessionIndex + 2);
      textCell(cell, status ? statusLabel[status] : t.notRecorded, profile);
      cell.alignment = { ...cell.alignment, horizontal: "center" };
      if (!status) {
        cell.font = { ...cell.font, italic: true, color: { argb: "FF9AA0A6" } };
      } else if (status === "absent") {
        cell.font = { ...cell.font, color: { argb: `FF${profile.colors.fail}` } };
      }
    });

    const tail = draft.sessions.length + 2;
    numberCell(row.getCell(tail), p.computed.attendanceRate, profile, '0.0"%"');
    numberCell(row.getCell(tail + 1), p.computed.lateCount, profile, "0");
    numberCell(row.getCell(tail + 2), p.computed.attendedHours, profile, "0.0");

    band(sheet, i + 2, headings.length, profile);
    row.commit();
  });

  applyView(sheet, profile, 1);
}

function gradesSheet(book: ExcelJS.Workbook, draft: Draft, profile: RenderProfile): void {
  const t = labels(profile);
  const sheet = book.addWorksheet(t.sheetGrades);

  const headings = [
    t.name,
    ...draft.gradeColumns.map((c) => `${c.labelAr}\n/${c.maxScore} · ${c.weight}%`),
    t.totalScore,
    t.outcome,
    t.computedOutcome,
    t.overrideNote,
  ];
  writeHeader(sheet, headings, profile);
  sheet.columns = [
    { width: WIDTH.name },
    ...draft.gradeColumns.map(() => ({ width: WIDTH.narrow })),
    { width: WIDTH.narrow },
    { width: WIDTH.narrow },
    { width: WIDTH.narrow },
    { width: WIDTH.wide },
  ];

  draft.participants.forEach((p, i) => {
    const row = sheet.getRow(i + 2);
    textCell(row.getCell(1), p.nameAr, profile);

    draft.gradeColumns.forEach((column, columnIndex) => {
      numberCell(row.getCell(columnIndex + 2), p.grades[column.id] ?? null, profile, "0.##");
    });

    const tail = draft.gradeColumns.length + 2;
    numberCell(row.getCell(tail), p.computed.totalScore, profile, "0.0");

    const outcomeCell = row.getCell(tail + 1);
    textCell(outcomeCell, t[p.computed.outcome], profile);
    outcomeCell.alignment = { ...outcomeCell.alignment, horizontal: "center" };
    const color = outcomeColor(p.computed.outcome, profile);
    if (color) {
      outcomeCell.font = { ...outcomeCell.font, bold: true, color: { argb: `FF${color}` } };
    }

    // The computed outcome is carried even when an override replaced it, so
    // a reader can always see what the rules produced.
    const computedCell = row.getCell(tail + 2);
    textCell(
      computedCell,
      p.computed.outcomeIsOverridden ? t[p.computed.computedOutcome] : "",
      profile,
    );
    computedCell.alignment = { ...computedCell.alignment, horizontal: "center" };

    textCell(row.getCell(tail + 3), p.outcomeOverrideNote ?? "", profile);

    band(sheet, i + 2, headings.length, profile);
    row.commit();
  });

  applyView(sheet, profile, 1);
}

function surveySheet(book: ExcelJS.Workbook, draft: Draft, profile: RenderProfile): void {
  const t = labels(profile);
  const sheet = book.addWorksheet(t.sheetSurvey);
  const ratings = Array.from({ length: draft.survey.scaleMax }, (_, i) => i + 1);

  const headings = [
    t.question,
    ...ratings.map((r) => `${t.rating} ${r}`),
    t.responses,
    t.average,
  ];
  writeHeader(sheet, headings, profile);
  sheet.columns = [
    { width: WIDTH.wide },
    ...ratings.map(() => ({ width: WIDTH.tiny })),
    { width: WIDTH.narrow },
    { width: WIDTH.narrow },
  ];

  draft.survey.questions.forEach((question, i) => {
    const row = sheet.getRow(i + 2);
    textCell(row.getCell(1), question.textAr, profile);

    ratings.forEach((_, ratingIndex) => {
      numberCell(row.getCell(ratingIndex + 2), question.tally[ratingIndex] ?? 0, profile, "0");
    });

    const tail = ratings.length + 2;
    numberCell(row.getCell(tail), question.computed.responseCount, profile, "0");

    // A question nobody answered is written as text, not as a zero. Zero is
    // a rating the scale cannot express, and putting it in a numeric column
    // would drag any chart or average built on this sheet toward the floor.
    const averageCell = row.getCell(tail + 1);
    if (question.computed.average === null) {
      textCell(averageCell, t.noResponses, profile);
      averageCell.alignment = { ...averageCell.alignment, horizontal: "center" };
      averageCell.font = { ...averageCell.font, italic: true, color: { argb: "FF9AA0A6" } };
    } else {
      numberCell(averageCell, question.computed.average, profile, "0.0");
    }

    band(sheet, i + 2, headings.length, profile);
    row.commit();
  });

  applyView(sheet, profile, 1);
}

function courseInfoSheet(book: ExcelJS.Workbook, draft: Draft, profile: RenderProfile): void {
  const t = labels(profile);
  const sheet = book.addWorksheet(t.sheetCourseInfo);
  const c = draft.computed;

  const deliveryLabel = {
    "in-person": t.inPerson,
    online: t.online,
    blended: t.blended,
  }[draft.course.deliveryMode];

  const rows: Array<[string, string | number | null]> = [
    [t.courseTitle, draft.course.titleAr],
    [t.client, draft.course.clientNameAr],
    [t.trainer, draft.course.trainerNameAr],
    [t.code, draft.course.code ?? ""],
    [t.venue, draft.course.venue],
    [t.deliveryMode, deliveryLabel],
    [t.startDate, draft.course.startDate ?? ""],
    [t.endDate, draft.course.endDate ?? ""],
    [t.sessionCount, c.sessionCount],
    [t.totalHours, c.totalHours],
    [t.participantCount, c.participantCount],
    [t.passedCount, c.passedCount],
    [t.failedCount, c.failedCount],
    [t.incompleteCount, c.incompleteCount],
    [t.averageAttendance, c.averageAttendanceRate],
    [t.averageScore, c.averageTotalScore],
    [t.surveyAverage, draft.survey.computed.overallAverage],
    [t.minScore, draft.course.passing.minScore],
    [t.minAttendance, draft.course.passing.minAttendanceRate],
    [t.generatedAt, draft.updatedAt],
  ];

  writeHeader(sheet, [t.field, t.value], profile);
  sheet.columns = [{ width: WIDTH.name }, { width: WIDTH.wide }];

  rows.forEach(([field, value], i) => {
    const row = sheet.getRow(i + 2);
    const fieldCell = row.getCell(1);
    textCell(fieldCell, field, profile);
    fieldCell.font = { ...fieldCell.font, bold: true };

    if (typeof value === "number") {
      numberCell(row.getCell(2), value, profile, "0.##");
    } else {
      textCell(row.getCell(2), value ?? "—", profile);
    }

    band(sheet, i + 2, 2, profile);
    row.commit();
  });

  applyView(sheet, profile, 0);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Render the workbook.
 *
 * Returns a Promise because exceljs serialises asynchronously; the function
 * is still pure in every sense that matters — no IO, no clock, deterministic
 * output for a given draft and profile.
 */
export async function renderXlsx(
  draft: Draft,
  profile: RenderProfile = DEFAULT_PROFILE,
): Promise<Buffer> {
  const book = new ExcelJS.Workbook();

  // Timestamps come from the draft, not from Date.now(). A workbook that
  // stamped the current time would differ on every render and could not be
  // compared, diffed or checksummed.
  const stamp = new Date(draft.updatedAt);
  book.creator = "Course Report Studio";
  book.lastModifiedBy = "Course Report Studio";
  book.created = stamp;
  book.modified = stamp;

  participantsSheet(book, draft, profile);
  attendanceSheet(book, draft, profile);
  gradesSheet(book, draft, profile);
  surveySheet(book, draft, profile);
  courseInfoSheet(book, draft, profile);

  const arrayBuffer = await book.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
