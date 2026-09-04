import { describe, expect, it } from "vitest";

import {
  computeAttendance,
  computeOutcome,
  computeSurvey,
  computeSurveyQuestion,
  computeTotalHours,
  computeTotalScore,
  recomputeDraft,
} from "@/lib/compute";
import {
  DraftSchema,
  ParticipantSchema,
  SCHEMA_VERSION,
  SessionSchema,
  type Draft,
  type GradeColumn,
  type Participant,
  type Session,
} from "@/lib/schema";

// ---------------------------------------------------------------------------
// Builders — everything goes through the schema so a test can never assert
// against a shape the schema would reject.
// ---------------------------------------------------------------------------

const T0 = "2026-01-05T09:00:00.000Z";

function session(id: string, index: number, durationHours = 3): Session {
  // The date is derived independently of `index`, so a test can hand in a
  // deliberately wrong index (to exercise renumbering) without also
  // producing an out-of-range day.
  const day = String(((index - 1) % 28) + 1).padStart(2, "0");
  return SessionSchema.parse({
    id,
    index,
    date: `2026-01-${day}`,
    startTime: "09:00",
    endTime: "12:00",
    durationHours,
  });
}

function participant(overrides: Record<string, unknown> = {}): Participant {
  return ParticipantSchema.parse({ id: "p1", nameAr: "مشارك", ...overrides });
}

const columns: GradeColumn[] = [
  { id: "g1", labelAr: "اختبار", labelEn: null, maxScore: 20, weight: 40 },
  { id: "g2", labelAr: "مشروع", labelEn: null, maxScore: 50, weight: 60 },
];

function draft(overrides: Record<string, unknown> = {}): Draft {
  return DraftSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: "draft-1",
    createdAt: T0,
    updatedAt: T0,
    course: {},
    survey: {},
    narrative: {},
    provenance: {},
    ...overrides,
  });
}

const fiveSessions = [
  session("s1", 1),
  session("s2", 2),
  session("s3", 3),
  session("s4", 4),
  session("s5", 5),
];

const allLate = Object.fromEntries(fiveSessions.map((s) => [s.id, "late"]));

// ---------------------------------------------------------------------------
// Hours
// ---------------------------------------------------------------------------

describe("computeTotalHours", () => {
  it("sums credited hours", () => {
    expect(computeTotalHours(fiveSessions)).toBe(15);
  });

  it("is 0 for no sessions", () => {
    expect(computeTotalHours([])).toBe(0);
  });

  it("does not accumulate float error", () => {
    expect(computeTotalHours([session("a", 1, 1.1), session("b", 2, 2.2)])).toBe(3.3);
  });
});

// ---------------------------------------------------------------------------
// Attendance — including the all-late case
// ---------------------------------------------------------------------------

describe("computeAttendance", () => {
  it("counts a participant late at every session as fully present", () => {
    const result = computeAttendance(participant({ attendance: allLate }), fiveSessions);

    expect(result.lateCount).toBe(5);
    expect(result.presentCount).toBe(0);
    expect(result.attendedCount).toBe(5);
    expect(result.countedCount).toBe(5);
    // Lateness is reported, not deducted.
    expect(result.attendanceRate).toBe(100);
    expect(result.attendedHours).toBe(15);
  });

  it("removes excused sessions from the denominator", () => {
    const result = computeAttendance(
      participant({
        attendance: { s1: "present", s2: "present", s3: "excused", s4: "absent", s5: "present" },
      }),
      fiveSessions,
    );

    expect(result.excusedCount).toBe(1);
    expect(result.countedCount).toBe(4);
    expect(result.attendanceRate).toBe(75);
  });

  it("does not treat an unrecorded session as an absence", () => {
    const result = computeAttendance(
      participant({ attendance: { s1: "present", s2: "present" } }),
      fiveSessions,
    );

    expect(result.countedCount).toBe(2);
    expect(result.attendanceRate).toBe(100);
    expect(result.absentCount).toBe(0);
  });

  it("returns a null rate when nothing has been recorded", () => {
    expect(computeAttendance(participant(), fiveSessions).attendanceRate).toBeNull();
  });

  it("returns a null rate when every session is excused", () => {
    const every = Object.fromEntries(fiveSessions.map((s) => [s.id, "excused"]));
    expect(computeAttendance(participant({ attendance: every }), fiveSessions).attendanceRate)
      .toBeNull();
  });

  it("credits hours only for sessions attended", () => {
    const result = computeAttendance(
      participant({ attendance: { s1: "present", s2: "late", s3: "absent" } }),
      fiveSessions,
    );
    expect(result.attendedHours).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

describe("computeTotalScore", () => {
  it("weights each column against its own maximum", () => {
    // 20/20 * 40 + 25/50 * 60 = 40 + 30
    expect(computeTotalScore(participant({ grades: { g1: 20, g2: 25 } }), columns)).toBe(70);
  });

  it("is null when any weighted column is unmarked", () => {
    expect(computeTotalScore(participant({ grades: { g1: 20 } }), columns)).toBeNull();
    expect(computeTotalScore(participant({ grades: { g1: 20, g2: null } }), columns)).toBeNull();
  });

  it("is null when there are no weighted columns", () => {
    expect(computeTotalScore(participant({ grades: {} }), [])).toBeNull();
  });

  it("ignores zero-weight columns, marked or not", () => {
    const withUnweighted: GradeColumn[] = [
      ...columns,
      { id: "g3", labelAr: "حضور", labelEn: null, maxScore: 10, weight: 0 },
    ];
    expect(computeTotalScore(participant({ grades: { g1: 20, g2: 25 } }), withUnweighted)).toBe(70);
  });

  it("clamps an out-of-range score rather than throwing", () => {
    expect(computeTotalScore(participant({ grades: { g1: 999, g2: -5 } }), columns)).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// Outcome — including an override
// ---------------------------------------------------------------------------

describe("computeOutcome", () => {
  const passing = { minScore: 60, minAttendanceRate: 75 };

  it("passes only when both thresholds are met", () => {
    expect(computeOutcome(70, 80, passing, null).outcome).toBe("passed");
    expect(computeOutcome(59, 80, passing, null).outcome).toBe("failed");
    expect(computeOutcome(70, 74, passing, null).outcome).toBe("failed");
  });

  it("treats the thresholds as inclusive", () => {
    expect(computeOutcome(60, 75, passing, null).outcome).toBe("passed");
  });

  it("is incomplete when a figure is missing, never failed", () => {
    expect(computeOutcome(null, 80, passing, null).computedOutcome).toBe("incomplete");
    expect(computeOutcome(70, null, passing, null).computedOutcome).toBe("incomplete");
  });

  it("lets an override replace the outcome while preserving the computed one", () => {
    const result = computeOutcome(40, 20, passing, "passed");

    expect(result.computedOutcome).toBe("failed");
    expect(result.outcome).toBe("passed");
    expect(result.outcomeIsOverridden).toBe(true);
  });

  it("can override an incomplete participant to a decision", () => {
    const result = computeOutcome(null, null, passing, "failed");
    expect(result.computedOutcome).toBe("incomplete");
    expect(result.outcome).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// Survey — including the all-zero tally
// ---------------------------------------------------------------------------

describe("computeSurveyQuestion", () => {
  const question = (tally: number[]) => ({
    id: "q1",
    textAr: "سؤال",
    textEn: null,
    tally,
    computed: { responseCount: 0, average: null },
  });

  it("returns a null average for an all-zero tally, not 0", () => {
    const result = computeSurveyQuestion(question([0, 0, 0, 0, 0]), 5);

    expect(result.responseCount).toBe(0);
    expect(result.average).toBeNull();
    expect(result.average).not.toBe(0);
  });

  it("returns a null average for an empty tally", () => {
    expect(computeSurveyQuestion(question([]), 5).average).toBeNull();
  });

  it("weights each bucket by its rating", () => {
    // (1*1 + 2*2 + 3*3 + 4*2 + 5*2) / 10 = 32 / 10
    const result = computeSurveyQuestion(question([1, 2, 3, 2, 2]), 5);
    expect(result.responseCount).toBe(10);
    expect(result.average).toBe(3.2);
  });

  it("drops buckets beyond the scale rather than skewing the mean", () => {
    const result = computeSurveyQuestion(question([0, 0, 2, 0, 0, 99]), 5);
    expect(result.responseCount).toBe(2);
    expect(result.average).toBe(3);
  });

  it("pads a short tally with zeros", () => {
    const result = computeSurveyQuestion(question([4]), 5);
    expect(result.responseCount).toBe(4);
    expect(result.average).toBe(1);
  });
});

describe("computeSurvey", () => {
  it("excludes unanswered questions from the overall average", () => {
    const survey = computeSurvey({
      scaleMax: 5,
      questions: [
        { id: "q1", textAr: "أ", textEn: null, tally: [0, 0, 0, 0, 4], computed: { responseCount: 0, average: null } },
        { id: "q2", textAr: "ب", textEn: null, tally: [0, 0, 0, 0, 0], computed: { responseCount: 0, average: null } },
      ],
      computed: { overallAverage: null, responseCount: 0, answeredQuestionCount: 0 },
    });

    expect(survey.questions[1].computed.average).toBeNull();
    // The unanswered question does not drag the mean toward zero.
    expect(survey.computed.overallAverage).toBe(5);
    expect(survey.computed.answeredQuestionCount).toBe(1);
  });

  it("reports the largest response count, not the sum", () => {
    const survey = computeSurvey({
      scaleMax: 5,
      questions: [
        { id: "q1", textAr: "أ", textEn: null, tally: [0, 0, 0, 0, 8], computed: { responseCount: 0, average: null } },
        { id: "q2", textAr: "ب", textEn: null, tally: [0, 0, 0, 0, 6], computed: { responseCount: 0, average: null } },
      ],
      computed: { overallAverage: null, responseCount: 0, answeredQuestionCount: 0 },
    });

    expect(survey.computed.responseCount).toBe(8);
  });

  it("has a null overall average when nothing was answered", () => {
    const survey = computeSurvey({
      scaleMax: 5,
      questions: [
        { id: "q1", textAr: "أ", textEn: null, tally: [0, 0, 0, 0, 0], computed: { responseCount: 0, average: null } },
      ],
      computed: { overallAverage: null, responseCount: 0, answeredQuestionCount: 0 },
    });

    expect(survey.computed.overallAverage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// recomputeDraft
// ---------------------------------------------------------------------------

describe("recomputeDraft", () => {
  it("fills every computed block and rolls up the totals", () => {
    const result = recomputeDraft(
      draft({
        sessions: fiveSessions,
        gradeColumns: columns,
        participants: [
          participant({ id: "p1", nameAr: "أ", attendance: allLate, grades: { g1: 20, g2: 50 } }),
          participant({
            id: "p2",
            nameAr: "ب",
            attendance: { s1: "absent", s2: "absent", s3: "absent", s4: "present", s5: "present" },
            grades: { g1: 5, g2: 10 },
          }),
        ],
      }),
    );

    expect(result.computed.totalHours).toBe(15);
    expect(result.computed.sessionCount).toBe(5);
    expect(result.computed.participantCount).toBe(2);
    expect(result.computed.totalGradeWeight).toBe(100);

    expect(result.participants[0].computed.outcome).toBe("passed");
    expect(result.participants[0].computed.totalScore).toBe(100);
    expect(result.participants[1].computed.outcome).toBe("failed");

    expect(result.computed.passedCount).toBe(1);
    expect(result.computed.failedCount).toBe(1);
    expect(result.computed.averageAttendanceRate).toBe(70);
  });

  it("carries an override into the draft roll-up", () => {
    const result = recomputeDraft(
      draft({
        sessions: fiveSessions,
        gradeColumns: columns,
        participants: [
          participant({
            attendance: { s1: "absent", s2: "absent", s3: "absent", s4: "absent", s5: "absent" },
            grades: { g1: 0, g2: 0 },
            outcomeOverride: "passed",
            outcomeOverrideNote: "أكمل التقييم البديل",
          }),
        ],
      }),
    );

    const p = result.participants[0];
    expect(p.computed.computedOutcome).toBe("failed");
    expect(p.computed.outcome).toBe("passed");
    expect(p.computed.outcomeIsOverridden).toBe(true);
    // The roll-up follows the effective outcome, not the computed one.
    expect(result.computed.passedCount).toBe(1);
    expect(result.computed.failedCount).toBe(0);
  });

  it("renumbers session indexes to match array order", () => {
    const result = recomputeDraft(
      draft({ sessions: [session("s1", 7), session("s2", 99), session("s3", 3)] }),
    );
    expect(result.sessions.map((s) => s.index)).toEqual([1, 2, 3]);
  });

  it("prunes attendance and grade keys for deleted sessions and columns", () => {
    const result = recomputeDraft(
      draft({
        sessions: [session("s1", 1)],
        gradeColumns: [columns[0]],
        participants: [
          participant({
            attendance: { s1: "present", "deleted-session": "absent" },
            grades: { g1: 10, "deleted-column": 5 },
          }),
        ],
      }),
    );

    expect(Object.keys(result.participants[0].attendance)).toEqual(["s1"]);
    expect(Object.keys(result.participants[0].grades)).toEqual(["g1"]);
  });

  it("does not mutate its input", () => {
    const input = draft({
      sessions: fiveSessions,
      gradeColumns: columns,
      participants: [participant({ attendance: allLate, grades: { g1: 20, g2: 50 } })],
    });
    const snapshot = JSON.stringify(input);

    recomputeDraft(input);

    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("leaves updatedAt alone — the store owns the timestamp", () => {
    const result = recomputeDraft(draft({ sessions: fiveSessions }));
    expect(result.updatedAt).toBe(T0);
  });

  it("is idempotent", () => {
    const once = recomputeDraft(
      draft({
        sessions: fiveSessions,
        gradeColumns: columns,
        participants: [participant({ attendance: allLate, grades: { g1: 13, g2: 31 } })],
      }),
    );
    expect(recomputeDraft(once)).toEqual(once);
  });

  it("produces a draft that still satisfies the schema", () => {
    const result = recomputeDraft(
      draft({
        sessions: fiveSessions,
        gradeColumns: columns,
        participants: [participant({ attendance: allLate, grades: { g1: 20, g2: 50 } })],
      }),
    );
    expect(DraftSchema.safeParse(result).success).toBe(true);
  });

  it("handles a completely empty draft", () => {
    const result = recomputeDraft(draft());

    expect(result.computed.totalHours).toBe(0);
    expect(result.computed.averageAttendanceRate).toBeNull();
    expect(result.computed.averageTotalScore).toBeNull();
    expect(result.survey.computed.overallAverage).toBeNull();
  });
});
