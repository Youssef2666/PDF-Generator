/**
 * Turning a confirmed table into draft rows.
 *
 * Kept apart from ingest.ts because that module imports node:fs and so
 * cannot be pulled into a browser bundle — and the review screen, which is a
 * client component, needs exactly this function. Same split, and same
 * reason, as empty-draft.ts against draft-store.ts.
 *
 * Pure: no IO, no clock beyond the timestamp the caller supplies.
 */

import { newRowId } from "@/lib/empty-draft";
import type { AttendanceStatus, Draft, Participant, Session } from "@/lib/schema";

/** The confirmed table, as the review screen returns it. */
export interface ConfirmedTable {
  sessions: Array<{ date: string; startTime: string; endTime: string; durationHours: number }>;
  participants: Array<{
    name: string;
    department: string;
    marks: Array<AttendanceStatus | null>;
  }>;
  provenance: {
    attendanceSource: "pdf-committed-profile" | "pdf-proposed-profile" | "manual";
    profileId: string | null;
    confidence: number | null;
    sourceFilename: string | null;
  };
}

/**
 * Merge a confirmed table into a draft.
 *
 * Replaces sessions and participants wholesale rather than merging row by
 * row. A partial merge would need a rule for matching people across two
 * spellings of the same name, and getting that subtly wrong is worse than
 * asking the operator to confirm a complete table — which, by the time this
 * runs, they have just done.
 */
export function applyTableToDraft(
  draft: Draft,
  table: ConfirmedTable,
  now: Date = new Date(),
): Draft {
  const sessions: Session[] = table.sessions.map((session, index) => ({
    id: newRowId("s"),
    index: index + 1,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    durationHours: session.durationHours,
    topicAr: "",
    topicEn: null,
  }));

  const participants: Participant[] = table.participants.map((row) => ({
    id: newRowId("p"),
    nameAr: row.name,
    nameEn: null,
    jobTitle: "",
    department: row.department,
    attendance: Object.fromEntries(
      row.marks
        .map((mark, i) => [sessions[i]?.id, mark] as const)
        .filter((entry): entry is readonly [string, AttendanceStatus] =>
          Boolean(entry[0]) && entry[1] !== null,
        ),
    ),
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
  }));

  return {
    ...draft,
    sessions,
    participants,
    provenance: {
      attendanceSource: table.provenance.attendanceSource,
      profileId: table.provenance.profileId,
      confidence: table.provenance.confidence,
      sourceFilename: table.provenance.sourceFilename,
      extractedAt: now.toISOString(),
      // Reaching this function means a human pressed confirm.
      humanConfirmed: true,
    },
  };
}
