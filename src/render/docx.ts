/**
 * The Word report.
 *
 * Pure: `(draft, profile) => Buffer`. No IO, no clock, no computation —
 * every figure comes from the draft's `computed` blocks.
 *
 * ---------------------------------------------------------------------------
 * Read this before changing anything about direction.
 * ---------------------------------------------------------------------------
 *
 * Word RTL is not one switch. It is six independent layers, and a document
 * that sets five of them looks *almost* right, which is worse than looking
 * obviously broken because nobody notices until a client does. The layers,
 * outermost first:
 *
 *   0.0  settings.xml   <w:themeFontLang w:bidi="ar-SA">   ← master switch
 *   0    docDefaults    <w:rPr><w:lang w:bidi="ar-SA">
 *   0.5  docDefaults    <w:pPr><w:bidi/><w:jc w:val="start">
 *   1    sectPr         <w:bidi/>                          ← before docGrid
 *   2    tblPr          <w:bidiVisual/>
 *   3    pPr <w:bidi/> and rPr <w:rtl/> on every paragraph and run
 *   5    alignment      w:jc="start"/"end", never left/right
 *
 * The `docx` package (9.7.1) can express layers 2, 3 and 5, and the
 * complex-script font slot. It has **no** API for layer 0.0 or layer 1 —
 * `ISectionPropertiesOptionsBase` has no `bidi` field, and nothing writes
 * `themeFontLang`. Those two are injected into the finished package by
 * `hardenRtl()` at the bottom of this file.
 *
 * Layer 0.0 is the one that makes the difference between "mostly works" and
 * "works": without it Word does not switch its bidi pipeline on at all, and
 * the other five layers are decoration.
 *
 * Full catalogue, with symptoms, in docs/rtl.md and
 * .claude/skills/office-rtl/SKILL.md. The rules are adapted from
 * https://github.com/muhmoosa/claude-arabic-docs (python-docx; the code does
 * not transfer, the rules do).
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type IRunOptions,
} from "docx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { DEFAULT_PROFILE, labels, type RenderProfile } from "@/render/profile";
import type { AttendanceStatus, Draft, Outcome } from "@/lib/schema";

/** BCP-47 tag written into the complex-script language slots. */
const BIDI_LANG = "ar-SA";

/** Fixed zip timestamp, so two renders of one draft are byte-identical. */
const ZIP_EPOCH = new Date("1980-01-01T00:00:00.000Z");

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/**
 * An Arabic run.
 *
 * Three things happen here that all have to happen together:
 *
 *   - `rightToLeft: true` writes <w:rtl/>, marking the run as complex script.
 *   - `font.cs` sets the *complex script* font. This is the slot Word
 *     actually uses to render Arabic. Setting only `ascii`/`hAnsi` — which
 *     is what `font: "Arial"` does — leaves the Arabic to whatever the
 *     reader's machine falls back to, which is how the same file comes to
 *     look different on Windows and macOS.
 *   - `sizeComplexScript` sizes it. Word tracks Latin and complex-script
 *     sizes separately, so a run with only `size` renders Arabic at the
 *     default size no matter what the Latin size says.
 */
function ar(text: string, profile: RenderProfile, extra: Partial<IRunOptions> = {}): TextRun {
  return new TextRun({
    text,
    rightToLeft: true,
    font: {
      ascii: profile.fonts.latin,
      hAnsi: profile.fonts.latin,
      cs: profile.fonts.arabic,
    },
    size: profile.fonts.size * 2, // docx sizes are half-points
    sizeComplexScript: profile.fonts.size * 2,
    language: { bidirectional: BIDI_LANG },
    ...extra,
  });
}

/**
 * A run that is never Arabic: a number, a date, a code, a Latin name.
 *
 * `rightToLeft: false` is deliberate and load-bearing. Inside a bidi
 * paragraph an unmarked run inherits the paragraph's direction, and a long
 * digit string then renders with its parts reordered — the fixture's
 * 20260208114500 comes out scrambled. Marking the run explicitly LTR pins
 * it, and the surrounding Arabic still flows right-to-left around it.
 */
function ltr(text: string, profile: RenderProfile, extra: Partial<IRunOptions> = {}): TextRun {
  return new TextRun({
    text,
    rightToLeft: false,
    font: {
      ascii: profile.fonts.latin,
      hAnsi: profile.fonts.latin,
      cs: profile.fonts.latin,
    },
    size: profile.fonts.size * 2,
    sizeComplexScript: profile.fonts.size * 2,
    ...extra,
  });
}

/**
 * Choose the run type from the content.
 *
 * A participant roster holds both "عبدالسلام الفيتوري" and "Maria Santos" in
 * the same column. Marking the Latin one as an Arabic run leaves it
 * reversed against its punctuation, so the decision is made per value.
 */
function auto(text: string, profile: RenderProfile, extra: Partial<IRunOptions> = {}): TextRun {
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(text)
    ? ar(text, profile, extra)
    : ltr(text, profile, extra);
}

// ---------------------------------------------------------------------------
// Paragraphs
// ---------------------------------------------------------------------------

/**
 * Every paragraph in the document goes through here.
 *
 * `bidirectional: true` writes <w:bidi/>. Alignment defaults to START, never
 * LEFT or RIGHT: Word for Mac reinterprets physical alignment under RTL, so
 * a paragraph pinned to RIGHT is correct on Windows and wrong on a Mac. START
 * means "the side the text begins on" and is right on both.
 */
function para(children: TextRun[], options: Partial<IParagraphOptions> = {}): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.START,
    spacing: { after: 120 },
    ...options,
    children,
  });
}

function heading(text: string, profile: RenderProfile, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return para(
    [
      ar(text, profile, {
        bold: true,
        size: profile.fonts.headerSize * 2 + 6,
        sizeComplexScript: profile.fonts.headerSize * 2 + 6,
        color: profile.colors.headerFill,
      }),
    ],
    { heading: level, spacing: { before: 300, after: 160 } },
  );
}

/** Body prose. Empty strings become an em dash so a gap is visible, not silent. */
function prose(text: string, profile: RenderProfile): Paragraph[] {
  const trimmed = text.trim();
  if (trimmed === "") return [para([ar("—", profile, { color: "999999" })])];

  return trimmed
    .split(/\n{2,}/)
    .map((block) => para(splitRuns(block.trim(), profile), { spacing: { after: 160 } }));
}

/**
 * Split a mixed string into Arabic and non-Arabic runs.
 *
 * Word's own bidi algorithm handles mixed text inside a single run well
 * enough for words, but not for long digit sequences, which is exactly what
 * the fixture's contract number is there to catch. Splitting on runs of
 * Latin/digits and marking each explicitly removes the ambiguity.
 */
function splitRuns(text: string, profile: RenderProfile): TextRun[] {
  const parts = text.split(/([A-Za-z0-9][A-Za-z0-9@._/:\-+]*)/g).filter((p) => p !== "");
  if (parts.length === 0) return [ar(text, profile)];
  return parts.map((part) =>
    /^[A-Za-z0-9]/.test(part) ? ltr(part, profile) : ar(part, profile),
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;

function cell(children: Paragraph[], options: { fill?: string; width?: number } = {}): TableCell {
  return new TableCell({
    children,
    shading: options.fill
      ? { type: ShadingType.CLEAR, color: "auto", fill: options.fill }
      : undefined,
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  });
}

/**
 * A data table.
 *
 * `visuallyRightToLeft` writes <w:bidiVisual/>, which flips the *column
 * order* so the first cell renders on the right. Note what this means for
 * the cells themselves: rows are still built in logical order — first column
 * first — and Word does the mirroring. Reversing the arrays as well would
 * flip it back, exactly as in the Excel renderer.
 */
function dataTable(
  headings: string[],
  rows: TableCell[][],
  profile: RenderProfile,
): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headings.map((text) =>
      cell(
        [
          para(
            [
              auto(text, profile, {
                bold: true,
                color: profile.colors.headerText,
                size: profile.fonts.headerSize * 2,
                sizeComplexScript: profile.fonts.headerSize * 2,
              }),
            ],
            { alignment: AlignmentType.CENTER, spacing: { after: 0 } },
          ),
        ],
        { fill: profile.colors.headerFill },
      ),
    ),
  });

  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...rows.map((children) => new TableRow({ children }))],
  });
}

/** Text cell, direction chosen from the content. */
function textCell(value: string, profile: RenderProfile, fill?: string): TableCell {
  return cell([para([auto(value, profile)], { spacing: { after: 0 } })], { fill });
}

/** Numeric cell — centred, explicitly LTR. */
function numCell(
  value: number | string | null,
  profile: RenderProfile,
  fill?: string,
): TableCell {
  const text = value === null ? "—" : String(value);
  return cell(
    [
      para([ltr(text, profile)], {
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
      }),
    ],
    { fill },
  );
}

function outcomeCell(outcome: Outcome, profile: RenderProfile, fill?: string): TableCell {
  const t = labels(profile);
  const color =
    outcome === "passed"
      ? profile.colors.pass
      : outcome === "failed"
        ? profile.colors.fail
        : undefined;

  return cell(
    [
      para([ar(t[outcome], profile, { bold: true, color })], {
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
      }),
    ],
    { fill },
  );
}

/** Zebra fill for a row index, or undefined for an unshaded row. */
function bandFill(index: number, profile: RenderProfile): string | undefined {
  return index % 2 === 1 ? profile.colors.bandFill : undefined;
}

// ---------------------------------------------------------------------------
// The thirteen sections
// ---------------------------------------------------------------------------

/**
 * The section list is inferred — see docs/data-model.md on the missing PRD.
 * Every narrative field the schema holds is used exactly once, and every
 * data surface (sessions, participants, attendance, grades, survey) appears.
 */
export const SECTION_TITLES_AR = [
  "صفحة الغلاف",
  "الملخص التنفيذي",
  "بيانات الدورة",
  "الجدول الزمني للجلسات",
  "أهداف البرنامج",
  "منهجية التنفيذ",
  "ملخص المحتوى التدريبي",
  "قائمة المشاركين",
  "سجل الحضور",
  "الدرجات والنتائج",
  "نتائج استبانة التقييم",
  "آراء المشاركين وملاحظات المدرب",
  "التوصيات والخاتمة",
] as const;

function coverPage(draft: Draft, profile: RenderProfile): Paragraph[] {
  const t = labels(profile);
  const big = profile.fonts.headerSize * 2 + 16;

  const line = (text: string, opts: Partial<IRunOptions> = {}) =>
    para([auto(text, profile, opts)], {
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    });

  return [
    para([], { spacing: { after: 1200 } }),
    line(draft.course.titleAr || "—", {
      bold: true,
      size: big,
      sizeComplexScript: big,
      color: profile.colors.headerFill,
    }),
    ...(draft.course.titleEn ? [line(draft.course.titleEn, { italics: true })] : []),
    para([], { spacing: { after: 400 } }),
    line(`${t.client}: ${draft.course.clientNameAr || "—"}`),
    line(`${t.trainer}: ${draft.course.trainerNameAr || "—"}`),
    line(`${t.venue}: ${draft.course.venue || "—"}`),
    para(
      [
        ar(`${t.startDate}: `, profile),
        ltr(draft.course.startDate ?? "—", profile),
        ar(`   ${t.endDate}: `, profile),
        ltr(draft.course.endDate ?? "—", profile),
      ],
      { alignment: AlignmentType.CENTER, spacing: { after: 200 } },
    ),
    para(
      [
        ar(`${t.totalHours}: `, profile),
        ltr(String(draft.computed.totalHours), profile),
        ar(`   ${t.participantCount}: `, profile),
        ltr(String(draft.computed.participantCount), profile),
      ],
      { alignment: AlignmentType.CENTER, spacing: { after: 200 } },
    ),
    new Paragraph({ children: [], pageBreakBefore: false, spacing: { after: 0 } }),
  ];
}

function courseInfoTable(draft: Draft, profile: RenderProfile): Table {
  const t = labels(profile);
  const c = draft.computed;
  const delivery = { "in-person": t.inPerson, online: t.online, blended: t.blended }[
    draft.course.deliveryMode
  ];

  const rows: Array<[string, string | number | null]> = [
    [t.courseTitle, draft.course.titleAr],
    [t.client, draft.course.clientNameAr],
    [t.trainer, draft.course.trainerNameAr],
    [t.code, draft.course.code ?? "—"],
    [t.venue, draft.course.venue],
    [t.deliveryMode, delivery],
    [t.startDate, draft.course.startDate ?? "—"],
    [t.endDate, draft.course.endDate ?? "—"],
    [t.sessionCount, c.sessionCount],
    [t.totalHours, c.totalHours],
    [t.participantCount, c.participantCount],
    [t.passedCount, c.passedCount],
    [t.failedCount, c.failedCount],
    [t.averageAttendance, c.averageAttendanceRate],
    [t.averageScore, c.averageTotalScore],
    [t.minScore, draft.course.passing.minScore],
    [t.minAttendance, draft.course.passing.minAttendanceRate],
  ];

  return dataTable(
    [t.field, t.value],
    rows.map(([field, value], i) => {
      const fill = bandFill(i, profile);
      return [
        cell([para([ar(field, profile, { bold: true })], { spacing: { after: 0 } })], { fill }),
        typeof value === "number"
          ? numCell(value, profile, fill)
          : textCell(value ?? "—", profile, fill),
      ];
    }),
    profile,
  );
}

function sessionsTable(draft: Draft, profile: RenderProfile): Table {
  const t = labels(profile);
  return dataTable(
    [t.session, t.date, t.startTime, t.endTime, t.hours, t.topic],
    draft.sessions.map((s, i) => {
      const fill = bandFill(i, profile);
      return [
        numCell(s.index, profile, fill),
        numCell(s.date, profile, fill),
        numCell(s.startTime, profile, fill),
        numCell(s.endTime, profile, fill),
        numCell(s.durationHours, profile, fill),
        textCell(s.topicAr || "—", profile, fill),
      ];
    }),
    profile,
  );
}

function participantsTable(draft: Draft, profile: RenderProfile): Table {
  const t = labels(profile);
  return dataTable(
    [t.name, t.jobTitle, t.department, t.attendanceRate, t.totalScore, t.outcome],
    draft.participants.map((p, i) => {
      const fill = bandFill(i, profile);
      return [
        textCell(p.nameAr, profile, fill),
        textCell(p.jobTitle || "—", profile, fill),
        textCell(p.department || "—", profile, fill),
        numCell(
          p.computed.attendanceRate === null ? null : `${p.computed.attendanceRate}%`,
          profile,
          fill,
        ),
        numCell(p.computed.totalScore, profile, fill),
        outcomeCell(p.computed.outcome, profile, fill),
      ];
    }),
    profile,
  );
}

function attendanceTable(draft: Draft, profile: RenderProfile): Table {
  const t = labels(profile);
  const statusLabel: Record<AttendanceStatus, string> = {
    present: t.present,
    late: t.late,
    absent: t.absent,
    excused: t.excused,
  };

  return dataTable(
    [
      t.name,
      ...draft.sessions.map((s) => `${t.session} ${s.index}`),
      t.attendanceRate,
      t.lateCount,
    ],
    draft.participants.map((p, i) => {
      const fill = bandFill(i, profile);
      return [
        textCell(p.nameAr, profile, fill),
        ...draft.sessions.map((s) => {
          const status = p.attendance[s.id];
          return cell(
            [
              para(
                [
                  ar(status ? statusLabel[status] : t.notRecorded, profile, {
                    color: status === "absent" ? profile.colors.fail : undefined,
                    italics: !status,
                  }),
                ],
                { alignment: AlignmentType.CENTER, spacing: { after: 0 } },
              ),
            ],
            { fill },
          );
        }),
        numCell(
          p.computed.attendanceRate === null ? null : `${p.computed.attendanceRate}%`,
          profile,
          fill,
        ),
        numCell(p.computed.lateCount, profile, fill),
      ];
    }),
    profile,
  );
}

function gradesTable(draft: Draft, profile: RenderProfile): Table {
  const t = labels(profile);
  return dataTable(
    [
      t.name,
      ...draft.gradeColumns.map((c) => `${c.labelAr} (${c.weight}%)`),
      t.totalScore,
      t.outcome,
    ],
    draft.participants.map((p, i) => {
      const fill = bandFill(i, profile);
      return [
        textCell(p.nameAr, profile, fill),
        ...draft.gradeColumns.map((c) => numCell(p.grades[c.id] ?? null, profile, fill)),
        numCell(p.computed.totalScore, profile, fill),
        outcomeCell(p.computed.outcome, profile, fill),
      ];
    }),
    profile,
  );
}

function surveyTable(draft: Draft, profile: RenderProfile): Table {
  const t = labels(profile);
  const ratings = Array.from({ length: draft.survey.scaleMax }, (_, i) => i + 1);

  return dataTable(
    [t.question, ...ratings.map((r) => String(r)), t.responses, t.average],
    draft.survey.questions.map((q, i) => {
      const fill = bandFill(i, profile);
      return [
        textCell(q.textAr, profile, fill),
        ...ratings.map((_, r) => numCell(q.tally[r] ?? 0, profile, fill)),
        numCell(q.computed.responseCount, profile, fill),
        // Never a zero: an unanswered question says so in words.
        q.computed.average === null
          ? textCell(t.noResponses, profile, fill)
          : numCell(q.computed.average, profile, fill),
      ];
    }),
    profile,
  );
}

/** Notes on overridden outcomes, so a reader can see why a rule was set aside. */
function overrideNotes(draft: Draft, profile: RenderProfile): Paragraph[] {
  const t = labels(profile);
  const overridden = draft.participants.filter((p) => p.computed.outcomeIsOverridden);
  if (overridden.length === 0) return [];

  return [
    para([ar(`${t.overrideNote}:`, profile, { bold: true })], {
      spacing: { before: 200, after: 80 },
    }),
    ...overridden.map((p) =>
      para([
        auto(p.nameAr, profile, { bold: true }),
        ar(" — ", profile),
        ar(`${t.computedOutcome}: ${t[p.computed.computedOutcome]}. `, profile),
        ...splitRuns(p.outcomeOverrideNote ?? "—", profile),
      ]),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function buildChildren(draft: Draft, profile: RenderProfile): Array<Paragraph | Table> {
  const S = SECTION_TITLES_AR;
  const h1 = (text: string) => heading(text, profile, HeadingLevel.HEADING_1);
  const n = draft.narrative;

  const spacer = () => para([], { spacing: { after: 200 } });

  return [
    // 1 — cover
    ...coverPage(draft, profile),
    new Paragraph({ children: [], pageBreakBefore: true }),

    // 2 — executive summary
    h1(S[1]),
    ...prose(n.executiveSummary, profile),

    // 3 — course information
    h1(S[2]),
    courseInfoTable(draft, profile),
    spacer(),

    // 4 — session schedule
    h1(S[3]),
    sessionsTable(draft, profile),
    spacer(),

    // 5 — objectives
    h1(S[4]),
    ...prose(n.objectives, profile),

    // 6 — methodology
    h1(S[5]),
    ...prose(n.methodology, profile),

    // 7 — content summary
    h1(S[6]),
    ...prose(n.contentSummary, profile),

    // 8 — participants
    h1(S[7]),
    participantsTable(draft, profile),
    spacer(),

    // 9 — attendance record
    h1(S[8]),
    attendanceTable(draft, profile),
    spacer(),

    // 10 — grades and outcomes
    h1(S[9]),
    gradesTable(draft, profile),
    ...overrideNotes(draft, profile),
    spacer(),

    // 11 — survey results
    h1(S[10]),
    surveyTable(draft, profile),
    spacer(),

    // 12 — participant feedback and trainer observations
    h1(S[11]),
    ...prose(n.participantFeedback, profile),
    ...prose(n.trainerObservations, profile),

    // 13 — recommendations and conclusion
    h1(S[12]),
    ...prose(n.recommendations, profile),
    ...prose(n.conclusion, profile),
  ];
}

// ---------------------------------------------------------------------------
// Post-processing: the layers docx cannot express
// ---------------------------------------------------------------------------

/**
 * Inject the two RTL layers the `docx` package has no API for.
 *
 * This is not a workaround for a bug — the library simply does not model
 * `<w:sectPr><w:bidi/>` or `settings.xml`'s `themeFontLang`. Both are
 * required, and both are invisible in the object graph, so they are added to
 * the finished package and then asserted by scripts/verify-rtl.ts.
 */
export function hardenRtl(buffer: Buffer, timestamp: string): Buffer {
  const files = unzipSync(new Uint8Array(buffer));
  const out: Record<string, Uint8Array> = { ...files };

  // --- Reproducibility: core.xml timestamps --------------------------------
  // The docx package stamps dcterms:created and dcterms:modified from
  // Date.now() and exposes no option to change them, so two renders of one
  // draft differ by milliseconds. Rewriting them from the draft's own
  // updatedAt makes the package byte-reproducible, which is what lets a test
  // compare renders and a reviewer diff two deliveries.
  const corePath = "docProps/core.xml";
  if (files[corePath]) {
    const xml = strFromU8(files[corePath])
      .replace(
        /(<dcterms:created[^>]*>)[^<]*(<\/dcterms:created>)/,
        `$1${timestamp}$2`,
      )
      .replace(
        /(<dcterms:modified[^>]*>)[^<]*(<\/dcterms:modified>)/,
        `$1${timestamp}$2`,
      );
    out[corePath] = strToU8(xml);
  }

  // --- Layer 1: <w:bidi/> inside every <w:sectPr> ---------------------------
  // Schema order matters: w:bidi must appear before w:docGrid, or Word
  // rejects the part. Inserting before </w:sectPr> is not safe for the same
  // reason, since docGrid is usually last.
  const documentPath = "word/document.xml";
  if (files[documentPath]) {
    let xml = strFromU8(files[documentPath]);
    xml = xml.replace(/<w:sectPr(\s[^>]*)?>([\s\S]*?)<\/w:sectPr>/g, (match, attrs, inner) => {
      if (inner.includes("<w:bidi/>") || inner.includes("<w:bidi ")) return match;
      const withBidi = inner.includes("<w:docGrid")
        ? inner.replace(/<w:docGrid/, "<w:bidi/><w:docGrid")
        : `${inner}<w:bidi/>`;
      return `<w:sectPr${attrs ?? ""}>${withBidi}</w:sectPr>`;
    });
    out[documentPath] = strToU8(xml);
  }

  // --- Layer 0.5: docDefaults <w:pPr><w:bidi/> ------------------------------
  // The `docx` package can set the default alignment but not the default
  // direction: `bidirectional` is not part of
  // IParagraphStylePropertiesOptions. Without this, any paragraph Word adds
  // later — when someone edits the delivered file — inherits LTR and reads
  // the wrong way in an otherwise correct document.
  const stylesPath = "word/styles.xml";
  if (files[stylesPath]) {
    let xml = strFromU8(files[stylesPath]);
    if (!/<w:pPrDefault>[\s\S]*?<w:bidi\/>/.test(xml)) {
      if (xml.includes("<w:pPr>")) {
        // Schema order inside w:pPr puts w:bidi before w:jc.
        xml = xml.replace(
          /(<w:pPrDefault>\s*<w:pPr>)/,
          "$1<w:bidi/>",
        );
      } else if (xml.includes("<w:pPrDefault/>")) {
        xml = xml.replace(
          "<w:pPrDefault/>",
          "<w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault>",
        );
      } else if (xml.includes("<w:docDefaults>")) {
        xml = xml.replace(
          "</w:docDefaults>",
          "<w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults>",
        );
      }
      out[stylesPath] = strToU8(xml);
    }
  }

  // --- Layer 0.0: settings.xml themeFontLang --------------------------------
  // The master switch. Without it Word never turns its bidi pipeline on, and
  // every other layer is decoration.
  const settingsPath = "word/settings.xml";
  if (files[settingsPath]) {
    let xml = strFromU8(files[settingsPath]);
    if (!xml.includes("w:themeFontLang")) {
      const tag = `<w:themeFontLang w:val="en-US" w:bidi="${BIDI_LANG}"/>`;
      xml = xml.includes("</w:settings>")
        ? xml.replace("</w:settings>", `${tag}</w:settings>`)
        : xml;
      out[settingsPath] = strToU8(xml);
    }
  }

  // A fixed mtime keeps the package byte-reproducible across renders. It has
  // to sit inside the zip format's 1980-2099 window; the Unix epoch is out
  // of range and fflate rejects it.
  return Buffer.from(zipSync(out, { mtime: ZIP_EPOCH }));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function renderDocx(
  draft: Draft,
  profile: RenderProfile = DEFAULT_PROFILE,
): Promise<Buffer> {
  const document = new Document({
    creator: "Course Report Studio",
    title: draft.course.titleAr || "Course report",
    description: draft.course.clientNameAr,
    // Layers 0 and 0.5: document defaults. These reach every paragraph and
    // run that does not override them, including the ones Word itself adds
    // when someone edits the file later.
    styles: {
      default: {
        document: {
          run: {
            font: {
              ascii: profile.fonts.latin,
              hAnsi: profile.fonts.latin,
              cs: profile.fonts.arabic,
            },
            size: profile.fonts.size * 2,
            sizeComplexScript: profile.fonts.size * 2,
            language: { bidirectional: BIDI_LANG },
          },
          // Only `alignment` can be set here. `bidirectional` is absent from
          // IParagraphStylePropertiesOptions, so the docDefaults <w:bidi/>
          // (layer 0.5) is injected by hardenRtl() instead.
          paragraph: {
            alignment: AlignmentType.START,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },
        },
        children: buildChildren(draft, profile),
      },
    ],
  });

  const packed = await Packer.toBuffer(document);
  return hardenRtl(Buffer.from(packed), draft.updatedAt);
}

/** Exported for tests and for the borderless-cell helper above. */
export const __internal = { NO_BORDER, splitRuns };
