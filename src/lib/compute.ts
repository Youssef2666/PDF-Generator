/**
 * Every derived figure in a report is produced here, and nowhere else.
 *
 * The UI does not compute. The renderers do not compute. They read the
 * `computed` blocks that recomputeDraft() writes, so that a number shown on
 * screen and the same number in the Word file cannot drift apart.
 *
 * Everything in this file is pure: same input, same output, no clock, no
 * filesystem, no randomness. recomputeDraft() in particular does not touch
 * `updatedAt` — stamping that is the store's job, and keeping it out of here
 * is what makes the whole module trivially testable.
 */

import type {
  Draft,
  DraftComputed,
  GradeColumn,
  Outcome,
  Participant,
  PassingRule,
  Session,
  Survey,
  SurveyQuestion,
} from "@/lib/schema";

/** Round to one decimal place, avoiding binary-float artefacts. */
function round1(value: number): number {
  return Number(value.toFixed(1));
}

/** Mean of the values that are actually present, or null if none are. */
function meanOrNull(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return round1(present.reduce((a, b) => a + b, 0) / present.length);
}

// ---------------------------------------------------------------------------
// Hours
// ---------------------------------------------------------------------------

/** Sum of every session's credited hours. */
export function computeTotalHours(sessions: readonly Session[]): number {
  return round1(sessions.reduce((total, s) => total + s.durationHours, 0));
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export interface AttendanceResult {
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  attendedCount: number;
  countedCount: number;
  attendanceRate: number | null;
  attendedHours: number;
}

/**
 * Attendance for one participant across the draft's sessions.
 *
 * Three rules, each of which changes the answer:
 *
 *   - `late` counts as attended. Someone who arrived late at every session
 *     was present at every session, and scores 100% with a lateCount of N.
 *     Lateness is reported, not punished, by this figure.
 *   - `excused` leaves the denominator. An excused absence is neither a
 *     miss nor a hit; it is removed from the question.
 *   - A session with no recorded status is *not* assumed absent. It leaves
 *     the denominator too, and `countedCount` reports how many of the
 *     sessions actually carried a mark, so the F7 checklist can insist on a
 *     complete matrix before finalizing.
 */
export function computeAttendance(
  participant: Participant,
  sessions: readonly Session[],
): AttendanceResult {
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let excusedCount = 0;
  let attendedHours = 0;

  for (const session of sessions) {
    const status = participant.attendance[session.id];
    switch (status) {
      case "present":
        presentCount += 1;
        attendedHours += session.durationHours;
        break;
      case "late":
        lateCount += 1;
        attendedHours += session.durationHours;
        break;
      case "absent":
        absentCount += 1;
        break;
      case "excused":
        excusedCount += 1;
        break;
      default:
        // Unrecorded: counted nowhere.
        break;
    }
  }

  const attendedCount = presentCount + lateCount;
  const countedCount = attendedCount + absentCount;

  return {
    presentCount,
    lateCount,
    absentCount,
    excusedCount,
    attendedCount,
    countedCount,
    attendanceRate: countedCount === 0 ? null : round1((attendedCount / countedCount) * 100),
    attendedHours: round1(attendedHours),
  };
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

/**
 * Weighted total for one participant.
 *
 * Each column contributes `score / maxScore * weight`. A score outside
 * 0..maxScore is clamped rather than rejected, because a typo in the grades
 * table must not be able to throw from inside a save.
 *
 * Returns null when any weighted column is unmarked: a partial total would
 * read as a low score rather than as missing data, and it is that
 * distinction that produces an `incomplete` outcome instead of a `failed`
 * one. Columns carrying zero weight are ignored entirely, marked or not.
 */
export function computeTotalScore(
  participant: Participant,
  gradeColumns: readonly GradeColumn[],
): number | null {
  const weighted = gradeColumns.filter((column) => column.weight > 0);
  if (weighted.length === 0) return null;

  let total = 0;
  for (const column of weighted) {
    const raw = participant.grades[column.id];
    if (raw === null || raw === undefined || Number.isNaN(raw)) return null;
    const clamped = Math.min(Math.max(raw, 0), column.maxScore);
    total += (clamped / column.maxScore) * column.weight;
  }
  return round1(total);
}

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

export interface OutcomeResult {
  computedOutcome: Outcome;
  outcome: Outcome;
  outcomeIsOverridden: boolean;
}

/**
 * Pass/fail for one participant, and the effect of any human override.
 *
 * Both thresholds must be met. A missing score or a missing attendance
 * figure yields `incomplete` — the rules cannot answer a question they have
 * no data for, and saying `failed` there would be a lie about the
 * participant rather than about the draft.
 *
 * An override replaces the outcome but never erases the computed one: both
 * are kept, so a reviewer can always see what the rules said and what a
 * human said instead.
 */
export function computeOutcome(
  totalScore: number | null,
  attendanceRate: number | null,
  passing: PassingRule,
  override: Outcome | null,
): OutcomeResult {
  let computedOutcome: Outcome;
  if (totalScore === null || attendanceRate === null) {
    computedOutcome = "incomplete";
  } else if (totalScore >= passing.minScore && attendanceRate >= passing.minAttendanceRate) {
    computedOutcome = "passed";
  } else {
    computedOutcome = "failed";
  }

  return {
    computedOutcome,
    outcome: override ?? computedOutcome,
    outcomeIsOverridden: override !== null,
  };
}

// ---------------------------------------------------------------------------
// Survey
// ---------------------------------------------------------------------------

export interface SurveyQuestionResult {
  responseCount: number;
  average: number | null;
}

/**
 * Mean rating for one question.
 *
 * The tally is normalised to `scaleMax` buckets first, so that lowering the
 * scale after responses were entered drops the out-of-range buckets rather
 * than skewing the mean.
 *
 * A tally of all zeros means nobody answered, and the average is null — not
 * 0. Zero is a rating this scale cannot express, so returning it would put a
 * bottom score on the chart for a question that was simply never asked.
 */
export function computeSurveyQuestion(
  question: SurveyQuestion,
  scaleMax: number,
): SurveyQuestionResult {
  const buckets = Array.from({ length: scaleMax }, (_, i) => question.tally[i] ?? 0);
  const responseCount = buckets.reduce((a, b) => a + b, 0);
  if (responseCount === 0) return { responseCount: 0, average: null };

  const weighted = buckets.reduce((sum, count, i) => sum + count * (i + 1), 0);
  return { responseCount, average: round1(weighted / responseCount) };
}

/** Per-question figures plus the survey-level roll-up. */
export function computeSurvey(survey: Survey): Survey {
  const questions = survey.questions.map((question) => ({
    ...question,
    computed: computeSurveyQuestion(question, survey.scaleMax),
  }));

  const answered = questions.filter((q) => q.computed.average !== null);

  return {
    ...survey,
    questions,
    computed: {
      overallAverage: meanOrNull(questions.map((q) => q.computed.average)),
      // The best available N rather than a sum: respondents answer many
      // questions, so summing would multiply the sample size by the
      // questionnaire length.
      responseCount: questions.reduce((max, q) => Math.max(max, q.computed.responseCount), 0),
      answeredQuestionCount: answered.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Whole draft
// ---------------------------------------------------------------------------

/** One participant's computed block, given the draft context. */
export function computeParticipant(
  participant: Participant,
  sessions: readonly Session[],
  gradeColumns: readonly GradeColumn[],
  passing: PassingRule,
): Participant {
  const attendance = computeAttendance(participant, sessions);
  const totalScore = computeTotalScore(participant, gradeColumns);
  const outcome = computeOutcome(
    totalScore,
    attendance.attendanceRate,
    passing,
    participant.outcomeOverride,
  );

  return {
    ...participant,
    computed: { ...attendance, totalScore, ...outcome },
  };
}

/**
 * Drop attendance and grade keys pointing at sessions or columns that no
 * longer exist. Deleting a session in the UI would otherwise leave orphan
 * entries that never surface but travel into report-data.json.
 */
function pruneOrphanKeys(
  participant: Participant,
  sessionIds: ReadonlySet<string>,
  columnIds: ReadonlySet<string>,
): Participant {
  const attendance = Object.fromEntries(
    Object.entries(participant.attendance).filter(([id]) => sessionIds.has(id)),
  );
  const grades = Object.fromEntries(
    Object.entries(participant.grades).filter(([id]) => columnIds.has(id)),
  );
  return { ...participant, attendance, grades };
}

/**
 * Recompute every derived value in a draft and return a new draft.
 *
 * The input is not mutated. `updatedAt` is deliberately left alone: this
 * function is pure and the store owns the timestamp.
 *
 * Two normalisations happen alongside the arithmetic, because both would
 * otherwise produce quietly wrong output downstream:
 *   - session `index` is reassigned to array position, guaranteeing the
 *     contiguous 1..n ordering every renderer assumes for its columns;
 *   - orphan attendance and grade keys are pruned.
 */
export function recomputeDraft(draft: Draft): Draft {
  const sessions = draft.sessions.map((session, i) => ({ ...session, index: i + 1 }));
  const sessionIds = new Set(sessions.map((s) => s.id));
  const columnIds = new Set(draft.gradeColumns.map((c) => c.id));

  const participants = draft.participants.map((participant) =>
    computeParticipant(
      pruneOrphanKeys(participant, sessionIds, columnIds),
      sessions,
      draft.gradeColumns,
      draft.course.passing,
    ),
  );

  const survey = computeSurvey(draft.survey);

  const countOutcome = (outcome: Outcome) =>
    participants.filter((p) => p.computed.outcome === outcome).length;

  const computed: DraftComputed = {
    sessionCount: sessions.length,
    participantCount: participants.length,
    totalHours: computeTotalHours(sessions),
    passedCount: countOutcome("passed"),
    failedCount: countOutcome("failed"),
    incompleteCount: countOutcome("incomplete"),
    averageAttendanceRate: meanOrNull(participants.map((p) => p.computed.attendanceRate)),
    averageTotalScore: meanOrNull(participants.map((p) => p.computed.totalScore)),
    totalGradeWeight: round1(draft.gradeColumns.reduce((sum, c) => sum + c.weight, 0)),
  };

  return { ...draft, sessions, participants, survey, computed };
}
