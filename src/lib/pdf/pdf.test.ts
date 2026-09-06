/**
 * The extraction pipeline.
 *
 * Two things are being defended here, and the second is the one that would
 * matter if it broke silently:
 *
 *   1. A committed profile extracts the committed sample correctly.
 *   2. **Nothing identifying can reach a model.** The anonymisation tests
 *      assert against the real fixture — every participant name in the PDF
 *      is checked, individually, for absence from the payload.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { recomputeDraft } from "@/lib/compute";
import { createEmptyDraft } from "@/lib/empty-draft";
import { DraftSchema } from "@/lib/schema";
import { applyTableToDraft, type ConfirmedTable } from "@/lib/pdf/to-draft";
import { applyProfile, scoreConfidence } from "@/lib/pdf/deterministic";
import { extractText, groupIntoRows, normalizeText, type ExtractedPage } from "@/lib/pdf/extract-text";
import {
  assertNoParticipantData,
  parseProfile,
  type ExtractionProfile,
} from "@/lib/pdf/profile-schema";
import {
  assembleProfile,
  assertSampleIsAnonymised,
  buildAnonymisedSample,
  MARK_MAX_LENGTH,
  maskDigits,
  MAX_SAMPLE_ROWS,
  proposalEnabled,
  ProposalDisabledError,
  proposeProfile,
} from "@/lib/pdf/propose-profile";

const FIXTURE_PDF = path.join(process.cwd(), "fixtures", "attendance-sample.pdf");
const FIXTURE_PROFILE = path.join(process.cwd(), "fixtures", "attendance-sample.profile.json");

/** The names really in the sample. Used to prove they never leave. */
const REAL_NAMES = [
  "عبدالسلام محمد الفيتوري",
  "خديجة عمر المصراتي",
  "Maria Santos",
  "عبدالحميد سالم الورفلي",
  "سالمة عبدالله الدرسي",
  "خالد مفتاح الزنتاني",
  "فاطمة بشير الغرياني",
  "ميلاد رمضان الترهوني",
];

let pages: ExtractedPage[];
let profile: ExtractionProfile;

beforeAll(async () => {
  pages = await extractText(new Uint8Array(await fs.readFile(FIXTURE_PDF)));
  profile = parseProfile(JSON.parse(await fs.readFile(FIXTURE_PROFILE, "utf8")));
});

// ---------------------------------------------------------------------------
// extract-text
// ---------------------------------------------------------------------------

describe("normalizeText", () => {
  it("folds Arabic presentation forms to base letters", () => {
    // Presentation form of محمد, as many real PDFs store it.
    expect(normalizeText("ﻣﺤﻤﺪ")).toBe("محمد");
  });

  it("splits the lam-alef ligature", () => {
    expect(normalizeText("ﻻ")).toBe("لا");
  });

  it("strips bidi control characters", () => {
    expect(normalizeText("‫مرحبا‬")).toBe("مرحبا");
  });

  it("collapses whitespace", () => {
    expect(normalizeText("  a   b  ")).toBe("a b");
  });
});

describe("groupIntoRows", () => {
  it("groups by baseline and orders left to right", () => {
    const rows = groupIntoRows([
      { text: "b", x: 50, y: 100, width: 10, height: 10 },
      { text: "a", x: 10, y: 101, width: 10, height: 10 },
      { text: "c", x: 10, y: 140, width: 10, height: 10 },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].text).toBe("a b");
    expect(rows[1].text).toBe("c");
  });

  it("does not merge rows further apart than the tolerance", () => {
    const rows = groupIntoRows(
      [
        { text: "a", x: 10, y: 100, width: 10, height: 10 },
        { text: "b", x: 10, y: 106, width: 10, height: 10 },
      ],
      4,
    );
    expect(rows).toHaveLength(2);
  });
});

describe("extractText", () => {
  it("reads the sample register", () => {
    expect(pages).toHaveLength(1);
    expect(pages[0].items.length).toBeGreaterThan(50);
    expect(pages[0].rows.length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// profile guard
// ---------------------------------------------------------------------------

describe("assertNoParticipantData", () => {
  it("accepts the committed profile", () => {
    expect(() => assertNoParticipantData(JSON.parse(JSON.stringify(profile)))).not.toThrow();
  });

  it("refuses a profile carrying a roster", () => {
    expect(() =>
      assertNoParticipantData({ ...profile, participants: [{ name: "x" }] }),
    ).toThrow(/participants/);
  });

  it("refuses each data-shaped key", () => {
    for (const key of ["rows", "names", "roster", "attendees", "records", "people"]) {
      expect(() => assertNoParticipantData({ [key]: [] }), key).toThrow(new RegExp(key));
    }
  });

  it("refuses a mark token long enough to be a name", () => {
    expect(() =>
      assertNoParticipantData({ marks: { "عبدالسلام محمد": "present" } }),
    ).toThrow(/too long to be a tick/);
  });

  it("runs before Zod strips unknown keys", () => {
    // This is the whole point of guarding the raw input: Zod would drop
    // `participants` silently and the breach would never be visible.
    expect(() => parseProfile({ ...profile, participants: [{ name: "x" }] })).toThrow(
      /participants/,
    );
  });

  it("rejects a profile whose header pattern is not a valid regex", () => {
    expect(() =>
      parseProfile({
        ...profile,
        columns: {
          ...profile.columns,
          sessions: { ...profile.columns.sessions, headerPattern: "([unclosed" },
        },
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// deterministic extraction — the acceptance criterion
// ---------------------------------------------------------------------------

describe("applyProfile", () => {
  it("extracts the committed sample from its committed profile", () => {
    const result = applyProfile(pages, profile);

    expect(result.warnings).toEqual([]);
    expect(result.confidence).toBe(1);
    expect(result.participants).toHaveLength(8);
    expect(result.sessions).toHaveLength(5);
  });

  it("reads the session dates from the document, not the profile", () => {
    const result = applyProfile(pages, profile);
    expect(result.sessions.map((s) => s.label)).toEqual([
      "2026-02-08",
      "2026-02-09",
      "2026-02-10",
      "2026-02-11",
      "2026-02-12",
    ]);
    // Confirming the obvious: no date appears in the profile itself.
    expect(JSON.stringify(profile)).not.toContain("2026-02");
  });

  it("reads names, departments and marks correctly", () => {
    const result = applyProfile(pages, profile);

    expect(result.participants.map((p) => p.name)).toEqual(REAL_NAMES);
    expect(result.participants[3].marks).toEqual([
      "late",
      "late",
      "late",
      "late",
      "late",
    ]);
    expect(result.participants[4].marks[2]).toBe("excused");
    expect(result.participants[2].name).toBe("Maria Santos");
    expect(result.participants[0].department).toBe("العمليات");
  });

  it("stops at the footer rather than treating it as a participant", () => {
    const result = applyProfile(pages, profile);
    expect(result.participants.some((p) => p.name.includes("إجمالي"))).toBe(false);
  });

  it("is deterministic", () => {
    expect(applyProfile(pages, profile)).toEqual(applyProfile(pages, profile));
  });

  it("reports a clear failure when the profile does not match the document", () => {
    const wrong = parseProfile({
      ...profile,
      header: { ...profile.header, contains: ["NOT-IN-THIS-DOCUMENT"] },
    });
    const result = applyProfile(pages, wrong);

    expect(result.confidence).toBe(0);
    expect(result.participants).toEqual([]);
    expect(result.warnings[0].code).toBe("no-header");
    expect(result.warnings[0].message).toContain("may not match this document");
  });

  it("flags marks it does not recognise instead of guessing", () => {
    const partial = parseProfile({ ...profile, marks: { "ح": "present" } });
    const result = applyProfile(pages, partial);

    expect(result.confidence).toBeLessThan(1);
    expect(result.warnings.some((w) => w.code === "unknown-mark")).toBe(true);
    // The unknown ones are null, not silently defaulted to anything.
    expect(result.participants[3].marks).toEqual([null, null, null, null, null]);
  });
});

describe("scoreConfidence", () => {
  it("is 0 with no participants", () => {
    expect(scoreConfidence(0, 0, 0, [])).toBe(0);
  });

  it("is the share of cells read", () => {
    expect(scoreConfidence(2, 10, 5, [])).toBe(0.5);
  });

  it("penalises structural problems", () => {
    const warn = [{ code: "duplicate-name" as const, message: "" }];
    expect(scoreConfidence(2, 10, 10, warn)).toBe(0.9);
  });

  it("never goes negative", () => {
    const warns = Array.from({ length: 9 }, () => ({
      code: "duplicate-name" as const,
      message: "",
    }));
    expect(scoreConfidence(2, 10, 0, warns)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// anonymisation — the privacy boundary
// ---------------------------------------------------------------------------

describe("buildAnonymisedSample", () => {
  it("sends at most three data rows", () => {
    const sample = buildAnonymisedSample(pages)!;
    expect(sample.rows.length).toBeGreaterThan(0);
    expect(sample.rows.length).toBeLessThanOrEqual(MAX_SAMPLE_ROWS);
  });

  it("contains no participant name — checked name by name", () => {
    const sample = buildAnonymisedSample(pages)!;

    for (const name of REAL_NAMES) {
      expect(sample.payload, `"${name}" leaked into the payload`).not.toContain(name);
    }
  });

  it("contains no department name either", () => {
    const sample = buildAnonymisedSample(pages)!;
    for (const dept of ["العمليات", "الموارد البشرية", "الجودة", "الإنتاج"]) {
      expect(sample.payload).not.toContain(dept);
    }
  });

  it("replaces the first substantive cell of each row with PERSON_n", () => {
    const sample = buildAnonymisedSample(pages)!;
    sample.rows.forEach((row, i) => {
      const redacted = row.cells.filter((c) => c.redacted);
      expect(redacted.length).toBeGreaterThan(0);
      expect(redacted[0].text).toBe(`PERSON_${i + 1}`);
    });
  });

  it("keeps geometry so the layout is still describable", () => {
    const sample = buildAnonymisedSample(pages)!;
    const first = sample.rows[0];

    expect(first.cells.length).toBeGreaterThan(5);
    for (const cell of first.cells) {
      expect(typeof cell.x).toBe("number");
      expect(typeof cell.width).toBe("number");
    }
    expect(sample.pageWidth).toBeGreaterThan(0);
  });

  it("keeps mark symbols, which are vocabulary rather than identity", () => {
    const sample = buildAnonymisedSample(pages)!;
    const marks = sample.rows.flatMap((r) => r.cells.filter((c) => !c.redacted));

    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) {
      expect(mark.text.length).toBeLessThanOrEqual(MARK_MAX_LENGTH);
    }
  });

  it("keeps the header row, which is column labels", () => {
    const sample = buildAnonymisedSample(pages)!;
    expect(sample.header.cells.some((c) => c.text.includes("الاسم"))).toBe(true);
  });

  it("masks the digits in header cells, keeping only their shape", () => {
    const sample = buildAnonymisedSample(pages)!;

    // The model needs to see that a session heading looks like a date so it
    // can write a pattern for one. It does not need the actual dates, which
    // are course data.
    expect(sample.payload).toContain("0000-00-00");
    for (const date of [
      "2026-02-08",
      "2026-02-09",
      "2026-02-10",
      "2026-02-11",
      "2026-02-12",
    ]) {
      expect(sample.payload, `${date} leaked`).not.toContain(date);
    }
  });

  it("masks Arabic-Indic digits too", () => {
    expect(maskDigits("٢٠٢٦-٠٢-٠٨")).toBe("0000-00-00");
    expect(maskDigits("الجلسة ٣")).toBe("الجلسة 0");
  });

  it("redacts anything longer than a mark, whatever the column", () => {
    // A synthetic page where the long text is NOT in the first column: a
    // rule keyed to "the name column" would miss this.
    const synthetic: ExtractedPage[] = [
      {
        pageNumber: 1,
        width: 800,
        height: 600,
        items: [],
        rows: [
          {
            y: 100,
            text: "h",
            items: [
              { text: "col1", x: 10, y: 100, width: 20, height: 10 },
              { text: "col2", x: 100, y: 100, width: 20, height: 10 },
              { text: "col3", x: 200, y: 100, width: 20, height: 10 },
            ],
          },
          {
            y: 130,
            text: "r",
            items: [
              { text: "ح", x: 10, y: 130, width: 8, height: 10 },
              { text: "Secret Person Name", x: 100, y: 130, width: 90, height: 10 },
              { text: "غ", x: 200, y: 130, width: 8, height: 10 },
            ],
          },
        ],
      },
    ];

    const sample = buildAnonymisedSample(synthetic)!;
    expect(sample.payload).not.toContain("Secret Person Name");
    expect(sample.payload).toContain("PERSON_1");
    // The marks around it survive.
    expect(sample.payload).toContain("ح");
  });

  it("returns null when there is no table-like structure", () => {
    const prose: ExtractedPage[] = [
      {
        pageNumber: 1,
        width: 600,
        height: 800,
        items: [],
        rows: [{ y: 10, text: "hello", items: [{ text: "hello", x: 1, y: 10, width: 5, height: 5 }] }],
      },
    ];
    expect(buildAnonymisedSample(prose)).toBeNull();
  });
});

describe("assertSampleIsAnonymised", () => {
  it("passes for a correctly built sample", () => {
    const sample = buildAnonymisedSample(pages)!;
    expect(() => assertSampleIsAnonymised(sample, pages)).not.toThrow();
  });

  it("catches a sample that smuggled real text through", () => {
    const sample = buildAnonymisedSample(pages)!;
    // Simulate a builder bug.
    sample.rows[0].cells[0] = {
      text: "عبدالسلام محمد الفيتوري",
      x: 60,
      width: 100,
      redacted: false,
    };

    expect(() => assertSampleIsAnonymised(sample, pages)).toThrow(
      /Anonymisation failed/,
    );
  });
});

// ---------------------------------------------------------------------------
// the switches
// ---------------------------------------------------------------------------

describe("proposeProfile gating", () => {
  it("refuses without consent, and sends nothing", async () => {
    await expect(
      proposeProfile(pages, { consent: false, enabled: true }),
    ).rejects.toBeInstanceOf(ProposalDisabledError);
  });

  it("refuses when the environment flag is off, even with consent", async () => {
    await expect(
      proposeProfile(pages, { consent: true, enabled: false }),
    ).rejects.toThrow(/disabled/);
  });

  it("is off by default", () => {
    delete process.env.COURSE_REPORT_ALLOW_PROFILE_PROPOSAL;
    expect(proposalEnabled()).toBe(false);

    process.env.COURSE_REPORT_ALLOW_PROFILE_PROPOSAL = "1";
    expect(proposalEnabled()).toBe(true);
    delete process.env.COURSE_REPORT_ALLOW_PROFILE_PROPOSAL;
  });
});

// ---------------------------------------------------------------------------
// The round trip: a proposed profile must reproduce the committed table
// ---------------------------------------------------------------------------

describe("assembleProfile round trip", () => {
  /**
   * The layout a model is asked to produce, written by hand from the same
   * anonymised sample it would receive. This covers everything in the
   * fallback path except the network hop itself — assembly, the guard,
   * parsing, and extraction — so the acceptance criterion can be checked
   * without an API key.
   */
  const layout = {
    reasoning:
      "Name in the leftmost text column, a second text column beside it, " +
      "and ISO-dated session columns to the right with centred single-letter marks.",
    nameColumn: { xMin: 40, xMax: 240 },
    departmentColumn: { xMin: 241, xMax: 380 },
    sessionColumns: {
      xMin: 381,
      xMax: 820,
      // [0-9] rather than \d: equivalent, and it survives every layer of
      // quoting between here and the JSON profile without an escaping bug.
      headerPattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
      markTolerance: 30,
    },
    headerContains: ["الاسم"],
    stopBefore: ["إجمالي"],
    marks: {
      "ح": "present" as const,
      "غ": "absent" as const,
      "م": "late" as const,
      "ع": "excused" as const,
    },
  };

  it("produces the same table as the committed profile", () => {
    const proposed = assembleProfile(layout, 1);
    const fromProposed = applyProfile(pages, proposed);
    const fromCommitted = applyProfile(pages, profile);

    expect(fromProposed.participants).toEqual(fromCommitted.participants);
    expect(fromProposed.sessions).toEqual(fromCommitted.sessions);
    expect(fromProposed.confidence).toBe(1);
    expect(fromProposed.warnings).toEqual([]);
  });

  it("marks the result as proposed, not committed", () => {
    expect(assembleProfile(layout, 1).origin).toBe("proposed");
  });

  it("drops anything the model added beyond the layout fields", () => {
    // assembleProfile copies named fields only, so a smuggled roster cannot
    // reach the profile at all — it is discarded rather than rejected. The
    // guard in parseProfile is the second line of defence, for callers that
    // hand it a raw object.
    const leaky = { ...layout, participants: [{ name: "عبدالسلام محمد" }] } as never;
    const assembled = assembleProfile(leaky, 1);

    expect(JSON.stringify(assembled)).not.toContain("عبدالسلام");
    expect(JSON.stringify(assembled)).not.toContain("participants");
  });

  it("refuses a layout whose marks are long enough to be names", () => {
    const leaky = {
      ...layout,
      marks: { "عبدالسلام محمد الفيتوري": "present" as const },
    };
    expect(() => assembleProfile(leaky, 1)).toThrow(/too long to be a tick/);
  });
});

// ---------------------------------------------------------------------------
// Into the draft
// ---------------------------------------------------------------------------

describe("applyTableToDraft", () => {
  const base = createEmptyDraft(new Date("2026-03-01T00:00:00.000Z"));

  const table: ConfirmedTable = {
    sessions: [
      { date: "2026-02-08", startTime: "09:00", endTime: "12:00", durationHours: 3 },
      { date: "2026-02-09", startTime: "09:00", endTime: "12:00", durationHours: 3 },
    ],
    participants: [
      { name: "عبدالسلام", department: "العمليات", marks: ["present", "late"] },
      { name: "Maria Santos", department: "الجودة", marks: ["present", null] },
    ],
    provenance: {
      attendanceSource: "pdf-committed-profile",
      profileId: "al-jabal-al-akhdar-register-v1",
      confidence: 1,
      sourceFilename: "register.pdf",
    },
  };

  it("writes participants and sessions with linked attendance", () => {
    const result = recomputeDraft(
      applyTableToDraft(base, table, new Date("2026-03-02T00:00:00.000Z")),
    );

    expect(result.participants).toHaveLength(2);
    expect(result.sessions).toHaveLength(2);

    const [first, second] = result.participants;
    expect(first.attendance[result.sessions[0].id]).toBe("present");
    expect(first.attendance[result.sessions[1].id]).toBe("late");
    // An unread cell stays unrecorded rather than being invented.
    expect(second.attendance[result.sessions[1].id]).toBeUndefined();
    expect(second.computed.countedCount).toBe(1);
  });

  it("records provenance, including that a human confirmed it", () => {
    const result = applyTableToDraft(base, table, new Date("2026-03-02T00:00:00.000Z"));

    expect(result.provenance).toEqual({
      attendanceSource: "pdf-committed-profile",
      profileId: "al-jabal-al-akhdar-register-v1",
      confidence: 1,
      sourceFilename: "register.pdf",
      extractedAt: "2026-03-02T00:00:00.000Z",
      humanConfirmed: true,
    });
  });

  it("produces a draft that still satisfies the schema", () => {
    const result = recomputeDraft(applyTableToDraft(base, table));
    expect(DraftSchema.safeParse(result).success).toBe(true);
  });

  it("records a manual table as manual", () => {
    const manual = applyTableToDraft(base, {
      ...table,
      provenance: {
        attendanceSource: "manual",
        profileId: null,
        confidence: null,
        sourceFilename: null,
      },
    });
    expect(manual.provenance.attendanceSource).toBe("manual");
    expect(manual.provenance.humanConfirmed).toBe(true);
  });

  it("does not mutate the draft it was given", () => {
    const snapshot = JSON.stringify(base);
    applyTableToDraft(base, table);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});
