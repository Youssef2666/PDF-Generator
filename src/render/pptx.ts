/**
 * The PowerPoint summary deck.
 *
 * Pure: `(draft, profile) => Buffer`. Nine slides, four of them native
 * charts — real chart parts under `ppt/charts/`, not pictures, so the
 * numbers stay selectable and editable in PowerPoint.
 *
 * ---------------------------------------------------------------------------
 * PowerPoint RTL differs from Word and Excel in one important way.
 * ---------------------------------------------------------------------------
 *
 * In Excel, `rightToLeft` on a sheet view mirrors the columns. In Word,
 * `<w:bidiVisual/>` mirrors a table's columns. In both, the renderer does the
 * mirroring and you must NOT also reverse your arrays, or it flips twice.
 *
 * **Charts have no such flag.** There is no bidi attribute that reorders
 * categories, so an Arabic bar chart renders its first category on the left
 * unless the data itself is reversed. Here, reversing the array is the
 * correct fix rather than the classic mistake. See `rtlCategories()`.
 *
 * Two further gaps, both handled by `hardenPptxRtl()` after packing:
 *
 *   - pptxgenjs writes `<a:pPr>` with no `rtl` attribute inside chart text
 *     properties, and exposes no option for it, so Arabic axis and legend
 *     labels render left-to-right inside an otherwise correct deck.
 *   - core.xml is stamped from the clock, which makes output
 *     non-reproducible.
 *
 * Full catalogue in docs/rtl.md and .claude/skills/office-rtl/SKILL.md.
 */

import pptxgen from "pptxgenjs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { DEFAULT_PROFILE, isRtl, labels, type RenderProfile } from "@/render/profile";
import type { Draft } from "@/lib/schema";

/** Fixed zip timestamp, so two renders of one draft are byte-identical. */
const ZIP_EPOCH = new Date("1980-01-01T00:00:00.000Z");

/** 16:9 at pptxgenjs's default 10in width. */
const W = 10;
const H = 5.625;
const MARGIN = 0.5;

type Slide = ReturnType<pptxgen["addSlide"]>;

/**
 * Order a chart's categories for the reading direction.
 *
 * Unlike a mirrored sheet or table, a chart is not flipped by any flag, so
 * an RTL deck needs its categories reversed in the data to put the first one
 * on the right. Values are reversed in step, obviously — reversing one and
 * not the other silently mislabels every bar.
 */
function rtlCategories<T>(
  labelsIn: string[],
  values: T[],
  profile: RenderProfile,
): { labels: string[]; values: T[] } {
  if (!isRtl(profile)) return { labels: labelsIn, values };
  return { labels: [...labelsIn].reverse(), values: [...values].reverse() };
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function arText(profile: RenderProfile) {
  return {
    fontFace: profile.fonts.arabic,
    rtlMode: isRtl(profile),
    align: isRtl(profile) ? ("right" as const) : ("left" as const),
    color: "1A1A1A",
  };
}

function slideTitle(slide: Slide, text: string, profile: RenderProfile): void {
  slide.addText(text, {
    ...arText(profile),
    x: MARGIN,
    y: 0.3,
    w: W - MARGIN * 2,
    h: 0.7,
    fontSize: 26,
    bold: true,
    color: profile.colors.headerFill,
  });
}

/** A row of headline numbers. Values are LTR even in an RTL deck. */
function figureStrip(
  slide: Slide,
  figures: Array<{ label: string; value: string }>,
  profile: RenderProfile,
  y: number,
): void {
  const gap = 0.15;
  const width = (W - MARGIN * 2 - gap * (figures.length - 1)) / figures.length;

  // Right to left: the first figure sits on the right in an RTL deck.
  const ordered = isRtl(profile) ? [...figures].reverse() : figures;

  ordered.forEach((figure, i) => {
    const x = MARGIN + i * (width + gap);
    slide.addShape("roundRect", {
      x,
      y,
      w: width,
      h: 1.15,
      fill: { color: profile.colors.bandFill },
      line: { color: profile.colors.headerFill, width: 0.5 },
    });
    slide.addText(figure.value, {
      x,
      y: y + 0.12,
      w: width,
      h: 0.55,
      fontFace: profile.fonts.latin,
      fontSize: 24,
      bold: true,
      align: "center",
      color: profile.colors.headerFill,
    });
    slide.addText(figure.label, {
      ...arText(profile),
      x,
      y: y + 0.68,
      w: width,
      h: 0.4,
      fontSize: 11,
      align: "center",
      color: "555555",
    });
  });
}

/** Arabic prose, trimmed to fit a slide. */
function proseBlock(
  slide: Slide,
  text: string,
  profile: RenderProfile,
  y: number,
  h: number,
): void {
  const trimmed = text.trim() || "—";
  slide.addText(trimmed, {
    ...arText(profile),
    x: MARGIN,
    y,
    w: W - MARGIN * 2,
    h,
    fontSize: 13,
    valign: "top",
    shrinkText: true,
  });
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

function titleSlide(pres: pptxgen, draft: Draft, profile: RenderProfile): void {
  const t = labels(profile);
  const slide = pres.addSlide();
  slide.background = { color: profile.colors.headerFill };

  slide.addText(draft.course.titleAr || "—", {
    ...arText(profile),
    x: MARGIN,
    y: 1.5,
    w: W - MARGIN * 2,
    h: 1.1,
    fontSize: 32,
    bold: true,
    align: "center",
    color: profile.colors.headerText,
  });

  if (draft.course.titleEn) {
    slide.addText(draft.course.titleEn, {
      x: MARGIN,
      y: 2.6,
      w: W - MARGIN * 2,
      h: 0.5,
      fontFace: profile.fonts.latin,
      fontSize: 16,
      italic: true,
      align: "center",
      color: profile.colors.headerText,
    });
  }

  slide.addText(`${t.client}: ${draft.course.clientNameAr || "—"}`, {
    ...arText(profile),
    x: MARGIN,
    y: 3.3,
    w: W - MARGIN * 2,
    h: 0.4,
    fontSize: 15,
    align: "center",
    color: profile.colors.headerText,
  });

  slide.addText(`${t.trainer}: ${draft.course.trainerNameAr || "—"}`, {
    ...arText(profile),
    x: MARGIN,
    y: 3.75,
    w: W - MARGIN * 2,
    h: 0.4,
    fontSize: 15,
    align: "center",
    color: profile.colors.headerText,
  });

  slide.addText(`${draft.course.startDate ?? "—"} — ${draft.course.endDate ?? "—"}`, {
    x: MARGIN,
    y: 4.3,
    w: W - MARGIN * 2,
    h: 0.4,
    fontFace: profile.fonts.latin,
    fontSize: 13,
    align: "center",
    color: profile.colors.headerText,
  });
}

function overviewSlide(pres: pptxgen, draft: Draft, profile: RenderProfile): void {
  const t = labels(profile);
  const c = draft.computed;
  const slide = pres.addSlide();
  slideTitle(slide, t.sheetCourseInfo, profile);

  figureStrip(
    slide,
    [
      { label: t.participantCount, value: String(c.participantCount) },
      { label: t.sessionCount, value: String(c.sessionCount) },
      { label: t.totalHours, value: String(c.totalHours) },
      { label: t.passedCount, value: String(c.passedCount) },
      { label: t.averageAttendance, value: c.averageAttendanceRate === null ? "—" : `${c.averageAttendanceRate}%` },
    ],
    profile,
    1.3,
  );

  const rows: Array<[string, string]> = [
    [t.venue, draft.course.venue || "—"],
    [t.code, draft.course.code ?? "—"],
    [t.minScore, String(draft.course.passing.minScore)],
    [t.minAttendance, `${draft.course.passing.minAttendanceRate}%`],
    [t.averageScore, c.averageTotalScore === null ? "—" : String(c.averageTotalScore)],
  ];

  slide.addTable(
    rows.map(([field, value]) => [
      { text: field, options: { ...arText(profile), bold: true, fontSize: 12 } },
      { text: value, options: { ...arText(profile), fontSize: 12 } },
    ]),
    {
      x: MARGIN,
      y: 2.8,
      w: W - MARGIN * 2,
      colW: isRtl(profile) ? [(W - MARGIN * 2) * 0.7, (W - MARGIN * 2) * 0.3] : undefined,
      border: { pt: 0.5, color: "DDDDDD" },
      // TableProps has no rtlMode; direction rides on each cell's text
      // options instead, which is where it actually takes effect.
    },
  );
}

function outcomesSlide(pres: pptxgen, draft: Draft, profile: RenderProfile): void {
  const t = labels(profile);
  const c = draft.computed;
  const slide = pres.addSlide();
  slideTitle(slide, t.outcome, profile);

  const { labels: cats, values } = rtlCategories(
    [t.passed, t.failed, t.incomplete],
    [c.passedCount, c.failedCount, c.incompleteCount],
    profile,
  );

  slide.addChart(
    pres.ChartType.bar,
    [{ name: t.outcome, labels: cats, values }],
    {
      x: MARGIN,
      y: 1.2,
      w: W - MARGIN * 2,
      h: H - 1.7,
      barDir: "col",
      showValue: true,
      chartColors: [profile.colors.pass, profile.colors.fail, "9AA0A6"],
      catAxisLabelFontFace: profile.fonts.arabic,
      catAxisLabelFontSize: 12,
      valAxisLabelFontFace: profile.fonts.latin,
      dataLabelFontFace: profile.fonts.latin,
      showLegend: false,
    },
  );
}

function attendanceSlide(pres: pptxgen, draft: Draft, profile: RenderProfile): void {
  const t = labels(profile);
  const slide = pres.addSlide();
  slideTitle(slide, t.sheetAttendance, profile);

  const { labels: cats, values } = rtlCategories(
    draft.participants.map((p) => p.nameAr),
    draft.participants.map((p) => p.computed.attendanceRate ?? 0),
    profile,
  );

  slide.addChart(
    pres.ChartType.bar,
    [{ name: t.attendanceRate, labels: cats, values }],
    {
      x: MARGIN,
      y: 1.2,
      w: W - MARGIN * 2,
      h: H - 1.7,
      barDir: "bar",
      showValue: true,
      chartColors: [profile.colors.headerFill],
      catAxisLabelFontFace: profile.fonts.arabic,
      catAxisLabelFontSize: 10,
      valAxisLabelFontFace: profile.fonts.latin,
      valAxisMaxVal: 100,
      dataLabelFontFace: profile.fonts.latin,
      showLegend: false,
    },
  );
}

function gradesSlide(pres: pptxgen, draft: Draft, profile: RenderProfile): void {
  const t = labels(profile);
  const slide = pres.addSlide();
  slideTitle(slide, t.sheetGrades, profile);

  const { labels: cats, values } = rtlCategories(
    draft.participants.map((p) => p.nameAr),
    draft.participants.map((p) => p.computed.totalScore ?? 0),
    profile,
  );

  slide.addChart(
    pres.ChartType.bar,
    [{ name: t.totalScore, labels: cats, values }],
    {
      x: MARGIN,
      y: 1.2,
      w: W - MARGIN * 2,
      h: H - 1.7,
      barDir: "bar",
      showValue: true,
      chartColors: [profile.colors.pass],
      catAxisLabelFontFace: profile.fonts.arabic,
      catAxisLabelFontSize: 10,
      valAxisLabelFontFace: profile.fonts.latin,
      valAxisMaxVal: 100,
      dataLabelFontFace: profile.fonts.latin,
      showLegend: false,
    },
  );
}

function surveySlide(pres: pptxgen, draft: Draft, profile: RenderProfile): void {
  const t = labels(profile);
  const slide = pres.addSlide();
  slideTitle(slide, t.sheetSurvey, profile);

  // A question nobody answered has a null average. It is charted as 0 only
  // because a chart has no way to say "absent", so the label says so instead.
  const answered = draft.survey.questions.map((q) => ({
    label: q.computed.average === null ? `${q.textAr} (${t.noResponses})` : q.textAr,
    value: q.computed.average ?? 0,
  }));

  const { labels: cats, values } = rtlCategories(
    answered.map((a) => a.label),
    answered.map((a) => a.value),
    profile,
  );

  slide.addChart(
    pres.ChartType.bar,
    [{ name: t.average, labels: cats, values }],
    {
      x: MARGIN,
      y: 1.2,
      w: W - MARGIN * 2,
      h: H - 1.7,
      barDir: "bar",
      showValue: true,
      chartColors: [profile.colors.headerFill],
      catAxisLabelFontFace: profile.fonts.arabic,
      catAxisLabelFontSize: 9,
      valAxisLabelFontFace: profile.fonts.latin,
      valAxisMaxVal: draft.survey.scaleMax,
      dataLabelFontFace: profile.fonts.latin,
      showLegend: false,
    },
  );
}

function feedbackSlide(pres: pptxgen, draft: Draft, profile: RenderProfile): void {
  const slide = pres.addSlide();
  slideTitle(slide, "آراء المشاركين وملاحظات المدرب", profile);
  proseBlock(slide, draft.narrative.participantFeedback, profile, 1.15, 1.9);
  proseBlock(slide, draft.narrative.trainerObservations, profile, 3.15, 2.0);
}

function recommendationsSlide(pres: pptxgen, draft: Draft, profile: RenderProfile): void {
  const slide = pres.addSlide();
  slideTitle(slide, "التوصيات", profile);
  proseBlock(slide, draft.narrative.recommendations, profile, 1.15, 3.9);
}

function conclusionSlide(pres: pptxgen, draft: Draft, profile: RenderProfile): void {
  const slide = pres.addSlide();
  slideTitle(slide, "الخاتمة", profile);
  proseBlock(slide, draft.narrative.conclusion, profile, 1.15, 3.9);
}

// ---------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------

/**
 * Add what pptxgenjs cannot express, and pin the timestamps.
 *
 * Chart text is the gap that matters. pptxgenjs emits `<a:pPr>` inside a
 * chart's `<c:txPr>` with no `rtl` attribute and offers no option to set one,
 * so a deck whose slides are correctly RTL still renders its axis and legend
 * labels left-to-right. Setting `rtl="1"` on those paragraphs is the fix.
 */
/** Replace the dcterms timestamps in an OOXML core.xml. */
function stampCore(xml: string, timestamp: string): string {
  return xml
    .replace(/(<dcterms:created[^>]*>)[^<]*(<\/dcterms:created>)/, `$1${timestamp}$2`)
    .replace(/(<dcterms:modified[^>]*>)[^<]*(<\/dcterms:modified>)/, `$1${timestamp}$2`);
}

/** Zip entry order follows key order, so it must not depend on insertion order. */
function sortKeys(files: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const name of Object.keys(files).sort()) out[name] = files[name];
  return out;
}

/** Re-pack a chart's embedded workbook with fixed timestamps. */
function normalizeEmbeddedWorkbook(bytes: Uint8Array, timestamp: string): Uint8Array {
  let inner: Record<string, Uint8Array>;
  try {
    inner = unzipSync(bytes);
  } catch {
    // Not a zip we understand; leave it exactly as it came.
    return bytes;
  }

  const rebuilt: Record<string, Uint8Array> = { ...inner };
  if (inner["docProps/core.xml"]) {
    rebuilt["docProps/core.xml"] = strToU8(
      stampCore(strFromU8(inner["docProps/core.xml"]), timestamp),
    );
  }
  return zipSync(sortKeys(rebuilt), { mtime: ZIP_EPOCH });
}

/**
 * Renumber chart and embedded-workbook parts to start at 1.
 *
 * pptxgenjs numbers these from a counter that lives on the module, not on
 * the presentation, so the second deck rendered in a process gets
 * `chart5.xml` where the first got `chart1.xml`. The part names then depend
 * on how many decks happened to be rendered earlier — which makes output
 * non-reproducible for a reason that has nothing to do with the input.
 *
 * Names are rewritten in one pass, in every part path and in every reference
 * inside `[Content_Types].xml` and the `.rels` files.
 */
function normalizeChartNumbering(files: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const indicesOf = (pattern: RegExp) =>
    Object.keys(files)
      .map((name) => name.match(pattern)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number)
      .sort((a, b) => a - b);

  const charts = indicesOf(/^ppt\/charts\/chart(\d+)\.xml$/);
  const embeds = indicesOf(/^ppt\/embeddings\/Microsoft_Excel_Worksheet(\d+)\.xlsx$/);
  if (charts.length === 0 && embeds.length === 0) return files;

  const chartMap = new Map(charts.map((old, i) => [old, i + 1]));
  const embedMap = new Map(embeds.map((old, i) => [old, i + 1]));

  const renumber = (text: string) =>
    text
      .replace(/chart(\d+)\.xml/g, (_m, n) => `chart${chartMap.get(Number(n)) ?? n}.xml`)
      .replace(
        /Microsoft_Excel_Worksheet(\d+)\.xlsx/g,
        (_m, n) => `Microsoft_Excel_Worksheet${embedMap.get(Number(n)) ?? n}.xlsx`,
      );

  const out: Record<string, Uint8Array> = {};
  // Sorted, because zip entry order follows key order and must not depend on
  // the order the parts happened to be created in.
  for (const name of Object.keys(files).sort()) {
    const bytes = files[name];
    out[renumber(name)] =
      name.endsWith(".xml") || name.endsWith(".rels")
        ? strToU8(renumber(strFromU8(bytes)))
        : bytes;
  }
  return out;
}

export function hardenPptxRtl(buffer: Buffer, timestamp: string, rtl: boolean): Buffer {
  const files = normalizeChartNumbering(unzipSync(new Uint8Array(buffer)));
  const out: Record<string, Uint8Array> = { ...files };

  if (rtl) {
    for (const name of Object.keys(files)) {
      if (!/^ppt\/charts\/chart\d+\.xml$/.test(name)) continue;
      // Only paragraphs that carry no rtl attribute already.
      const xml = strFromU8(files[name]).replace(/<a:pPr(?![^>]*\brtl=)/g, '<a:pPr rtl="1"');
      out[name] = strToU8(xml);
    }
  }

  const corePath = "docProps/core.xml";
  if (files[corePath]) {
    out[corePath] = strToU8(stampCore(strFromU8(files[corePath]), timestamp));
  }

  // Each native chart carries an embedded workbook — what PowerPoint opens
  // behind "Edit Data". Those are complete xlsx packages with their own
  // timestamps, so they have to be normalised too or the deck is
  // reproducible everywhere except four nested zips.
  for (const name of Object.keys(files)) {
    if (!/^ppt\/embeddings\/.*\.xlsx$/.test(name)) continue;
    out[name] = normalizeEmbeddedWorkbook(files[name], timestamp);
  }

  return Buffer.from(zipSync(sortKeys(out), { mtime: ZIP_EPOCH }));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export const SLIDE_COUNT = 9;

export async function renderPptx(
  draft: Draft,
  profile: RenderProfile = DEFAULT_PROFILE,
): Promise<Buffer> {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Course Report Studio";
  pres.company = draft.course.clientNameAr;
  pres.title = draft.course.titleAr || "Course report";
  // pptxgenjs reads this when RTL is on; it does not reach charts.
  pres.rtlMode = isRtl(profile);

  titleSlide(pres, draft, profile);
  overviewSlide(pres, draft, profile);
  outcomesSlide(pres, draft, profile);
  attendanceSlide(pres, draft, profile);
  gradesSlide(pres, draft, profile);
  surveySlide(pres, draft, profile);
  feedbackSlide(pres, draft, profile);
  recommendationsSlide(pres, draft, profile);
  conclusionSlide(pres, draft, profile);

  const packed = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  return hardenPptxRtl(Buffer.from(packed), draft.updatedAt, isRtl(profile));
}
