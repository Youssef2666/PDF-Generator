/**
 * The single source of truth for the shape of a report draft.
 *
 * Nothing else in the codebase defines these types. Renderers, the compute
 * layer, the API routes and the fixtures all derive from here. If a field
 * changes, it changes here first and everything else follows.
 *
 * Two rules govern what belongs in this file:
 *
 *   1. It validates SHAPE, not READINESS. A half-finished draft must still
 *      parse, because the editor autosaves on every keystroke and the store
 *      re-validates on every write. "Do the grade weights total 100?" and
 *      "is the narrative filled in?" are finalize-time checklist questions
 *      (F7), not schema questions. The only values rejected here are ones
 *      that could never be correct at any stage.
 *
 *   2. Computed fields live in the draft, under a `computed` key at each
 *      level. The UI never derives a value; it renders what compute.ts
 *      stored. Every `computed` block therefore carries a default, so a
 *      freshly built object parses before recomputeDraft() has run.
 */

import { z } from "zod";

/** Bumped whenever a change here would invalidate an already-stored draft. */
export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const Id = z.string().min(1, { error: "id must not be empty" });
const NonEmpty = z.string().min(1);
const IsoDate = z.iso.date();
const IsoDateTime = z.iso.datetime();

/** 24-hour wall-clock time, HH:MM. */
const ClockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "expected HH:MM in 24-hour form" });

/**
 * `late` is a form of attendance, not a form of absence: it counts toward the
 * attendance rate and is tracked separately for reporting. `excused` leaves
 * the denominator entirely rather than counting as a miss.
 */
export const AttendanceStatusSchema = z.enum(["present", "late", "absent", "excused"]);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

export const OutcomeSchema = z.enum(["passed", "failed", "incomplete"]);
export type Outcome = z.infer<typeof OutcomeSchema>;

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export const SessionSchema = z.object({
  id: Id,
  /** 1-based ordinal, driving column order in every renderer. */
  index: z.number().int().positive(),
  date: IsoDate,
  startTime: ClockTime,
  endTime: ClockTime,
  /**
   * Credited hours. Held separately from start/end rather than derived from
   * them, because credited time excludes breaks and the two legitimately
   * disagree.
   */
  durationHours: z.number().nonnegative().max(24),
  topicAr: z.string().default(""),
  topicEn: z.string().nullable().default(null),
});
export type Session = z.infer<typeof SessionSchema>;

// ---------------------------------------------------------------------------
// Grade column
// ---------------------------------------------------------------------------

export const GradeColumnSchema = z.object({
  id: Id,
  labelAr: NonEmpty,
  labelEn: z.string().nullable().default(null),
  /** Raw ceiling for this column, e.g. 20 for a task marked out of 20. */
  maxScore: z.number().positive(),
  /**
   * Share of the final 100-point score. Weights are expected to total 100 at
   * finalize time; that is a checklist concern, not a schema one, so a draft
   * mid-edit stays storable.
   */
  weight: z.number().min(0).max(100),
});
export type GradeColumn = z.infer<typeof GradeColumnSchema>;

// ---------------------------------------------------------------------------
// Survey
// ---------------------------------------------------------------------------

export const SurveyQuestionSchema = z.object({
  id: Id,
  textAr: NonEmpty,
  textEn: z.string().nullable().default(null),
  /**
   * tally[i] is the number of respondents who chose rating i+1. Its length is
   * expected to equal survey.scaleMax; compute.ts normalises rather than
   * throwing, so changing the scale mid-edit cannot corrupt a draft.
   */
  tally: z.array(z.number().int().nonnegative()).default([]),
  computed: z
    .object({
      responseCount: z.number().int().nonnegative(),
      /** null when nobody answered, which is distinct from an average of 0. */
      average: z.number().nullable(),
    })
    .default({ responseCount: 0, average: null }),
});
export type SurveyQuestion = z.infer<typeof SurveyQuestionSchema>;

export const SurveySchema = z.object({
  /** Points on the Likert scale. 5 means ratings 1..5. */
  scaleMax: z.number().int().min(2).max(10).default(5),
  questions: z.array(SurveyQuestionSchema).default([]),
  computed: z
    .object({
      /** Mean of every non-null question average; null when there are none. */
      overallAverage: z.number().nullable(),
      /** Highest per-question response count: the best available N. */
      responseCount: z.number().int().nonnegative(),
      answeredQuestionCount: z.number().int().nonnegative(),
    })
    .default({ overallAverage: null, responseCount: 0, answeredQuestionCount: 0 }),
});
export type Survey = z.infer<typeof SurveySchema>;

// ---------------------------------------------------------------------------
// Participant
// ---------------------------------------------------------------------------

export const ParticipantSchema = z.object({
  id: Id,
  nameAr: NonEmpty,
  /** Set for participants whose name is recorded in Latin script. */
  nameEn: z.string().nullable().default(null),
  jobTitle: z.string().default(""),
  department: z.string().default(""),
  /** Keyed by Session.id. A missing key means "not recorded". */
  attendance: z.record(z.string(), AttendanceStatusSchema).default({}),
  /** Keyed by GradeColumn.id. null means "not yet marked". */
  grades: z.record(z.string(), z.number().nullable()).default({}),
  /** Set by a human to replace the computed outcome. */
  outcomeOverride: OutcomeSchema.nullable().default(null),
  outcomeOverrideNote: z.string().nullable().default(null),
  computed: z
    .object({
      presentCount: z.number().int().nonnegative(),
      lateCount: z.number().int().nonnegative(),
      absentCount: z.number().int().nonnegative(),
      excusedCount: z.number().int().nonnegative(),
      /** Sessions credited as attended: present + late. */
      attendedCount: z.number().int().nonnegative(),
      /** Denominator: every session minus the excused ones. */
      countedCount: z.number().int().nonnegative(),
      /** Percentage 0..100 to one decimal. null when nothing counts. */
      attendanceRate: z.number().nullable(),
      attendedHours: z.number().nonnegative(),
      /** Weighted score out of 100 to one decimal. null when unmarked. */
      totalScore: z.number().nullable(),
      /** What the rules produce, before any override. */
      computedOutcome: OutcomeSchema,
      /** Effective outcome: the override when set, else computedOutcome. */
      outcome: OutcomeSchema,
      outcomeIsOverridden: z.boolean(),
    })
    .default({
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
    }),
});
export type Participant = z.infer<typeof ParticipantSchema>;

// ---------------------------------------------------------------------------
// Course
// ---------------------------------------------------------------------------

export const PassingRuleSchema = z.object({
  /** Minimum weighted score, 0..100. */
  minScore: z.number().min(0).max(100).default(60),
  /** Minimum attendance percentage, 0..100. */
  minAttendanceRate: z.number().min(0).max(100).default(75),
});
export type PassingRule = z.infer<typeof PassingRuleSchema>;

export const CourseSchema = z.object({
  titleAr: z.string().default(""),
  titleEn: z.string().nullable().default(null),
  code: z.string().nullable().default(null),
  clientNameAr: z.string().default(""),
  clientNameEn: z.string().nullable().default(null),
  trainerNameAr: z.string().default(""),
  trainerNameEn: z.string().nullable().default(null),
  venue: z.string().default(""),
  deliveryMode: z.enum(["in-person", "online", "blended"]).default("in-person"),
  startDate: IsoDate.nullable().default(null),
  endDate: IsoDate.nullable().default(null),
  passing: PassingRuleSchema.prefault({ minScore: 60, minAttendanceRate: 75 }),
});
export type Course = z.infer<typeof CourseSchema>;

// ---------------------------------------------------------------------------
// Narrative
// ---------------------------------------------------------------------------

/**
 * Free-text report prose, authored in Arabic. These fields carry no language
 * suffix because they are single-language by definition; the editor gives
 * them dir="rtl".
 */
export const NarrativeSchema = z.object({
  executiveSummary: z.string().default(""),
  objectives: z.string().default(""),
  methodology: z.string().default(""),
  contentSummary: z.string().default(""),
  participantFeedback: z.string().default(""),
  trainerObservations: z.string().default(""),
  recommendations: z.string().default(""),
  conclusion: z.string().default(""),
});
export type Narrative = z.infer<typeof NarrativeSchema>;

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * How the attendance table reached the draft. Written by the M6 review step
 * and carried into report-data.json, so a finished package can always account
 * for where its numbers came from.
 */
export const ProvenanceSchema = z.object({
  attendanceSource: z
    .enum(["manual", "pdf-committed-profile", "pdf-proposed-profile"])
    .default("manual"),
  /** Which profile was applied, when the source was a PDF. */
  profileId: z.string().nullable().default(null),
  /** The deterministic extractor's confidence, 0..1. */
  confidence: z.number().min(0).max(1).nullable().default(null),
  sourceFilename: z.string().nullable().default(null),
  extractedAt: IsoDateTime.nullable().default(null),
  /** True once a human confirmed the parsed table in the review UI. */
  humanConfirmed: z.boolean().default(false),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

export const DraftComputedSchema = z.object({
  sessionCount: z.number().int().nonnegative(),
  participantCount: z.number().int().nonnegative(),
  /** Sum of every session's credited hours. */
  totalHours: z.number().nonnegative(),
  passedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  incompleteCount: z.number().int().nonnegative(),
  /** Mean participant attendance rate, 0..100. null with no participants. */
  averageAttendanceRate: z.number().nullable(),
  /** Mean participant total score, 0..100. null when nobody is marked. */
  averageTotalScore: z.number().nullable(),
  /** Total weight across grade columns; 100 when the draft is well-formed. */
  totalGradeWeight: z.number(),
});
export type DraftComputed = z.infer<typeof DraftComputedSchema>;

export const DraftSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  course: CourseSchema,
  sessions: z.array(SessionSchema).default([]),
  gradeColumns: z.array(GradeColumnSchema).default([]),
  participants: z.array(ParticipantSchema).default([]),
  survey: SurveySchema,
  narrative: NarrativeSchema,
  provenance: ProvenanceSchema,
  computed: DraftComputedSchema.prefault({
    sessionCount: 0,
    participantCount: 0,
    totalHours: 0,
    passedCount: 0,
    failedCount: 0,
    incompleteCount: 0,
    averageAttendanceRate: null,
    averageTotalScore: null,
    totalGradeWeight: 0,
  }),
});
export type Draft = z.infer<typeof DraftSchema>;

/**
 * Input accepted when building or patching a draft: every field the compute
 * layer owns may be omitted, and will be filled in.
 */
export type DraftInput = z.input<typeof DraftSchema>;

// ---------------------------------------------------------------------------
// Error reporting
// ---------------------------------------------------------------------------

/**
 * Flatten a ZodError into one line, for a hook `reason` whose reader is a
 * model or a terminal rather than a UI.
 */
export function summariseZodError(error: z.ZodError, limit = 6): string {
  const issues = error.issues.slice(0, limit).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
  const omitted = error.issues.length - issues.length;
  const tail = omitted > 0 ? ` (+${omitted} more)` : "";
  return issues.join("; ") + tail;
}
