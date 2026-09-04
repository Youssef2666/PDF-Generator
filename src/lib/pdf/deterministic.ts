/**
 * Applies a profile to extracted text and produces the table.
 *
 * **This is the only code in the project that turns a PDF into participant
 * rows.** No model is involved, here or anywhere downstream. Given the same
 * PDF and the same profile it produces the same table every time, and when a
 * cell is wrong there is a specific rule to point at — which is the whole
 * argument for the profile design (ADR 0006).
 *
 * It reports a confidence score alongside the table. The score exists to
 * decide whether to *ask* — a low score routes the operator to the review
 * screen with the problems highlighted. It never gates the data silently.
 */

import type { ExtractedPage, TextItem, TextRow } from "@/lib/pdf/extract-text";
import type { ExtractionProfile } from "@/lib/pdf/profile-schema";
import type { AttendanceStatus } from "@/lib/schema";

/** A session column discovered in the header row. */
export interface DetectedSession {
  /** Header cell text — usually a date, read from the document. */
  label: string;
  /** Centre x of the header cell, used to match marks below it. */
  x: number;
  index: number;
}

export interface DetectedParticipant {
  name: string;
  department: string;
  /** One entry per detected session, in order. null means unreadable. */
  marks: Array<AttendanceStatus | null>;
  /** Cell text that did not match any known mark, keyed by session index. */
  unrecognised: Record<number, string>;
  /** Source row y, so the review UI can point at the page. */
  y: number;
}

export interface ExtractionWarning {
  code:
    | "no-header"
    | "no-sessions"
    | "no-rows"
    | "missing-mark"
    | "unknown-mark"
    | "short-name"
    | "duplicate-name";
  message: string;
  /** Row the warning refers to, where it refers to one. */
  row?: number;
}

export interface ExtractionResult {
  sessions: DetectedSession[];
  participants: DetectedParticipant[];
  warnings: ExtractionWarning[];
  /** 0..1. 1 means every cell read cleanly. */
  confidence: number;
  /** The page the table was found on. */
  page: number;
}

/** NFKC-normalised containment, so presentation forms match base letters. */
function contains(haystack: string, needle: string): boolean {
  return haystack.normalize("NFKC").includes(needle.normalize("NFKC"));
}

/** Items whose x falls inside a band, joined in reading order. */
function cellText(row: TextRow, xMin: number, xMax: number): string {
  return row.items
    .filter((item) => item.x >= xMin && item.x <= xMax)
    .map((item) => item.text)
    .join(" ")
    .trim();
}

/**
 * Find the header row.
 *
 * The header is identified by its content, not its position: a client who
 * adds a logo shifts every y on the page, and a profile pinned to a
 * coordinate would break on a document that is otherwise identical.
 */
function findHeaderRow(
  page: ExtractedPage,
  profile: ExtractionProfile,
): { row: TextRow; sessions: DetectedSession[] } | null {
  const pattern = new RegExp(profile.columns.sessions.headerPattern, "u");

  for (const row of page.rows) {
    if (!profile.header.contains.every((fragment) => contains(row.text, fragment))) continue;

    const sessions = row.items
      .filter(
        (item) =>
          item.x >= profile.columns.sessions.xMin &&
          item.x <= profile.columns.sessions.xMax &&
          pattern.test(item.text),
      )
      .sort((a, b) => a.x - b.x)
      .map((item, index) => ({
        label: item.text,
        // Centre, not left edge: marks are centred under their heading.
        x: item.x + item.width / 2,
        index,
      }));

    if (sessions.length >= profile.header.minSessionColumns) return { row, sessions };
  }

  return null;
}

/** The session column a mark belongs to, or null if it is too far from any. */
function nearestSession(
  item: TextItem,
  sessions: DetectedSession[],
  tolerance: number,
): DetectedSession | null {
  const centre = item.x + item.width / 2;
  let best: DetectedSession | null = null;
  let bestDistance = Infinity;

  for (const session of sessions) {
    const distance = Math.abs(centre - session.x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = session;
    }
  }

  return bestDistance <= tolerance ? best : null;
}

/**
 * Apply a profile to a document.
 *
 * Pure: no IO, no clock, no model. Same inputs, same table.
 */
export function applyProfile(
  pages: ExtractedPage[],
  profile: ExtractionProfile,
): ExtractionResult {
  const warnings: ExtractionWarning[] = [];
  const page = pages.find((p) => p.pageNumber === profile.page) ?? pages[0];

  if (!page) {
    return {
      sessions: [],
      participants: [],
      warnings: [{ code: "no-header", message: "The document has no pages." }],
      confidence: 0,
      page: profile.page,
    };
  }

  const header = findHeaderRow(page, profile);
  if (!header) {
    return {
      sessions: [],
      participants: [],
      warnings: [
        {
          code: "no-header",
          message:
            `No header row on page ${page.pageNumber} containing ` +
            `${profile.header.contains.map((c) => `"${c}"`).join(", ")} with at least ` +
            `${profile.header.minSessionColumns} session column(s). The profile may ` +
            "not match this document.",
        },
      ],
      confidence: 0,
      page: page.pageNumber,
    };
  }

  const { sessions } = header;
  const marks = profile.marks;
  const participants: DetectedParticipant[] = [];
  const seenNames = new Set<string>();

  let totalCells = 0;
  let readCells = 0;

  for (const row of page.rows) {
    // Everything above the header, and the header itself, is not data.
    if (row.y <= header.row.y) continue;
    // A stop marker ends the table; so does everything after it.
    if (profile.rowRules.stopBefore.some((marker) => contains(row.text, marker))) break;

    const name = cellText(row, profile.columns.name.xMin, profile.columns.name.xMax);
    if (name.length < profile.rowRules.minNameLength) {
      if (name.length > 0) {
        warnings.push({
          code: "short-name",
          message: `Row at y=${Math.round(row.y)} has a name cell too short to be a participant: "${name}".`,
          row: participants.length,
        });
      }
      continue;
    }

    if (seenNames.has(name)) {
      warnings.push({
        code: "duplicate-name",
        message: `"${name}" appears more than once. One of the rows may have been misread.`,
        row: participants.length,
      });
    }
    seenNames.add(name);

    const department = profile.columns.department
      ? cellText(row, profile.columns.department.xMin, profile.columns.department.xMax)
      : "";

    const rowMarks: Array<AttendanceStatus | null> = sessions.map(() => null);
    const unrecognised: Record<number, string> = {};

    for (const item of row.items) {
      if (
        item.x < profile.columns.sessions.xMin ||
        item.x > profile.columns.sessions.xMax
      ) {
        continue;
      }
      const session = nearestSession(item, sessions, profile.columns.sessions.markTolerance);
      if (!session) continue;

      const status = marks[item.text];
      if (status) {
        rowMarks[session.index] = status;
      } else {
        unrecognised[session.index] = item.text;
      }
    }

    totalCells += sessions.length;
    readCells += rowMarks.filter((m) => m !== null).length;

    for (const [index, text] of Object.entries(unrecognised)) {
      warnings.push({
        code: "unknown-mark",
        message: `"${name}", session ${Number(index) + 1}: "${text}" is not a mark this profile knows.`,
        row: participants.length,
      });
    }
    for (let i = 0; i < rowMarks.length; i += 1) {
      if (rowMarks[i] === null && unrecognised[i] === undefined) {
        warnings.push({
          code: "missing-mark",
          message: `"${name}", session ${i + 1}: the cell is empty.`,
          row: participants.length,
        });
      }
    }

    participants.push({ name, department, marks: rowMarks, unrecognised, y: row.y });
  }

  if (participants.length === 0) {
    warnings.push({
      code: "no-rows",
      message: "The header was found but no participant rows followed it.",
    });
  }

  return {
    sessions,
    participants,
    warnings,
    confidence: scoreConfidence(participants.length, totalCells, readCells, warnings),
    page: page.pageNumber,
  };
}

/**
 * How much of the table read cleanly, 0..1.
 *
 * Deliberately blunt: the proportion of attendance cells that resolved to a
 * known mark, with a floor of 0 when nothing was found at all. It is a
 * prompt to look, not a threshold to act on — every extraction goes through
 * human confirmation regardless of what this returns.
 */
export function scoreConfidence(
  participantCount: number,
  totalCells: number,
  readCells: number,
  warnings: ExtractionWarning[],
): number {
  if (participantCount === 0 || totalCells === 0) return 0;

  const cellRatio = readCells / totalCells;
  // Structural problems matter more than a single blank cell.
  const structural = warnings.filter(
    (w) => w.code === "duplicate-name" || w.code === "short-name",
  ).length;
  const penalty = Math.min(0.3, structural * 0.1);

  return Math.max(0, Math.round((cellRatio - penalty) * 100) / 100);
}
