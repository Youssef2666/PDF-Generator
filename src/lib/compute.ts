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
  Narrative,
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

// ---------------------------------------------------------------------------
// Finalize checklist (F7)
// ---------------------------------------------------------------------------

/**
 * The readiness checklist lives here rather than in the review screen, for
 * the same reason every other figure does: the UI renders derived values, it
 * does not produce them. A checklist computed inside a component could
 * disagree with what the export gate actually enforces, and the two would
 * drift without anyone noticing.
 *
 * Readiness is deliberately not part of DraftSchema. A half-finished draft
 * must still parse and save — see docs/data-model.md. These rules are what
 * "finished" means; they are evaluated fresh on render and never stored.
 */

export type ChecklistStatus = "pass" | "fail";

export interface ChecklistItem {
  id: string;
  /** What the reviewer needs to do, in plain terms. */
  label: string;
  status: ChecklistStatus;
  /** Why it is failing, or confirmation of what was found. */
  detail: string;
  /**
   * Required items gate finalize. Advisory items are reported but do not
   * block: they flag things that are usually mistakes but are legitimately
   * someone's call.
   */
  required: boolean;
  /** The screen that fixes this item. */
  section: "course" | "participants" | "grades" | "survey" | "narrative";
}

export interface ChecklistResult {
  items: ChecklistItem[];
  /** True when every required item passes. Gates the finalize button. */
  ready: boolean;
  requiredFailing: number;
  advisoryFailing: number;
}

const NARRATIVE_LABELS: Record<keyof Narrative, string> = {
  executiveSummary: "Executive summary",
  objectives: "Objectives",
  methodology: "Methodology",
  contentSummary: "Content summary",
  participantFeedback: "Participant feedback",
  trainerObservations: "Trainer observations",
  recommendations: "Recommendations",
  conclusion: "Conclusion",
};

/** Evaluate every finalize rule against a draft. */
export function computeChecklist(draft: Draft): ChecklistResult {
  const items: ChecklistItem[] = [];

  const add = (
    id: string,
    section: ChecklistItem["section"],
    label: string,
    ok: boolean,
    detail: string,
    required = true,
  ) => {
    items.push({ id, section, label, status: ok ? "pass" : "fail", detail, required });
  };

  // --- Course -------------------------------------------------------------
  const { course } = draft;
  const missingCourseFields = (
    [
      ["titleAr", "Arabic course title"],
      ["clientNameAr", "Arabic client name"],
      ["trainerNameAr", "Arabic trainer name"],
    ] as const
  )
    .filter(([key]) => course[key].trim() === "")
    .map(([, label]) => label);

  add(
    "course-identity",
    "course",
    "Course, client and trainer are named in Arabic",
    missingCourseFields.length === 0,
    missingCourseFields.length === 0
      ? "All three are filled in."
      : `Missing: ${missingCourseFields.join(", ")}.`,
  );

  const hasDates = course.startDate !== null && course.endDate !== null;
  const datesOrdered = hasDates && course.startDate! <= course.endDate!;
  add(
    "course-dates",
    "course",
    "Start and end dates are set and in order",
    datesOrdered,
    !hasDates
      ? "Both a start date and an end date are required."
      : datesOrdered
        ? `${course.startDate} to ${course.endDate}.`
        : "The end date falls before the start date.",
  );

  // --- Sessions -----------------------------------------------------------
  const sessionsWithHours = draft.sessions.filter((s) => s.durationHours > 0).length;
  add(
    "sessions-exist",
    "course",
    "At least one session",
    draft.sessions.length > 0,
    draft.sessions.length > 0
      ? `${draft.sessions.length} sessions, ${draft.computed.totalHours} hours in total.`
      : "Add sessions, or generate them in bulk from the date range.",
  );

  add(
    "sessions-have-hours",
    "course",
    "Every session has credited hours",
    draft.sessions.length > 0 && sessionsWithHours === draft.sessions.length,
    draft.sessions.length === 0
      ? "No sessions yet."
      : sessionsWithHours === draft.sessions.length
        ? "All sessions carry a duration."
        : `${draft.sessions.length - sessionsWithHours} session(s) have zero hours.`,
  );

  // --- Participants -------------------------------------------------------
  add(
    "participants-exist",
    "participants",
    "At least one participant",
    draft.participants.length > 0,
    draft.participants.length > 0
      ? `${draft.participants.length} participants.`
      : "Add participants manually, or import an attendance PDF.",
  );

  const missingRoles = draft.participants.filter(
    (p) => p.jobTitle.trim() === "" || p.department.trim() === "",
  );
  add(
    "participants-roles",
    "participants",
    "Every participant has a job title and department",
    missingRoles.length === 0,
    missingRoles.length === 0
      ? "All participants carry both."
      : `${missingRoles.length} participant(s) are missing a job title or department.`,
    false,
  );

  // --- Attendance ---------------------------------------------------------
  const totalCells = draft.participants.length * draft.sessions.length;
  const recordedCells = draft.participants.reduce(
    (sum, p) => sum + draft.sessions.filter((s) => p.attendance[s.id] !== undefined).length,
    0,
  );
  const attendanceComplete = totalCells > 0 && recordedCells === totalCells;
  add(
    "attendance-complete",
    "participants",
    "Attendance recorded for every participant and session",
    attendanceComplete,
    totalCells === 0
      ? "Nothing to record yet."
      : attendanceComplete
        ? `All ${totalCells} cells recorded.`
        : `${totalCells - recordedCells} of ${totalCells} cells are still blank.`,
  );

  // --- Grades -------------------------------------------------------------
  add(
    "grades-exist",
    "grades",
    "At least one grade column",
    draft.gradeColumns.length > 0,
    draft.gradeColumns.length > 0
      ? `${draft.gradeColumns.length} columns.`
      : "Add the columns this course is marked against.",
  );

  const weightOk = draft.gradeColumns.length > 0 && draft.computed.totalGradeWeight === 100;
  add(
    "grades-weights",
    "grades",
    "Grade weights total 100",
    weightOk,
    draft.gradeColumns.length === 0
      ? "No columns to weight."
      : weightOk
        ? "Weights total 100."
        : `Weights total ${draft.computed.totalGradeWeight}, not 100.`,
  );

  const unmarked = draft.participants.filter((p) => p.computed.totalScore === null);
  add(
    "grades-complete",
    "grades",
    "Every participant is fully marked",
    draft.participants.length > 0 && unmarked.length === 0,
    draft.participants.length === 0
      ? "No participants yet."
      : unmarked.length === 0
        ? "All participants have a total score."
        : `${unmarked.length} participant(s) have an unmarked column.`,
  );

  // --- Outcomes -----------------------------------------------------------
  add(
    "outcomes-decided",
    "grades",
    "No participant is left incomplete",
    draft.participants.length > 0 && draft.computed.incompleteCount === 0,
    draft.participants.length === 0
      ? "No participants yet."
      : draft.computed.incompleteCount === 0
        ? `${draft.computed.passedCount} passed, ${draft.computed.failedCount} failed.`
        : `${draft.computed.incompleteCount} participant(s) still resolve to incomplete.`,
  );

  // --- Survey -------------------------------------------------------------
  add(
    "survey-exists",
    "survey",
    "At least one survey question",
    draft.survey.questions.length > 0,
    draft.survey.questions.length > 0
      ? `${draft.survey.questions.length} questions.`
      : "Add the questions this cohort was asked.",
  );

  const unanswered = draft.survey.questions.filter((q) => q.computed.average === null);
  add(
    "survey-answered",
    "survey",
    "Every survey question has responses",
    draft.survey.questions.length > 0 && unanswered.length === 0,
    draft.survey.questions.length === 0
      ? "No questions yet."
      : unanswered.length === 0
        ? `Overall average ${draft.survey.computed.overallAverage}.`
        : `${unanswered.length} question(s) have no responses and will render as "no data".`,
    false,
  );

  // --- Narrative ----------------------------------------------------------
  const emptyNarrative = (Object.keys(NARRATIVE_LABELS) as Array<keyof Narrative>).filter(
    (key) => draft.narrative[key].trim() === "",
  );
  add(
    "narrative-complete",
    "narrative",
    "Every narrative section is written",
    emptyNarrative.length === 0,
    emptyNarrative.length === 0
      ? "All eight sections are filled in."
      : `Empty: ${emptyNarrative.map((k) => NARRATIVE_LABELS[k]).join(", ")}.`,
  );

  const requiredFailing = items.filter((i) => i.required && i.status === "fail").length;
  const advisoryFailing = items.filter((i) => !i.required && i.status === "fail").length;

  return { items, ready: requiredFailing === 0, requiredFailing, advisoryFailing };
}
