import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { renderPptx, SLIDE_COUNT } from "@/render/pptx";
import { DEFAULT_PROFILE, labels, RenderProfileSchema } from "@/render/profile";
import { recomputeDraft } from "@/lib/compute";
import { DraftSchema, type Draft } from "@/lib/schema";
import { reportPassed, verifyPptx } from "../../scripts/verify-rtl";
import demo from "../../fixtures/demo-draft.json";

const draft: Draft = DraftSchema.parse(demo);
const t = labels(DEFAULT_PROFILE);
const EPOCH = new Date("1980-01-01T00:00:00.000Z");

function parts(buffer: Buffer): Record<string, string> {
  const files = unzipSync(new Uint8Array(buffer));
  const out: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(files)) {
    if (name.endsWith(".xml")) out[name] = strFromU8(bytes);
  }
  return out;
}

const named = (buffer: Buffer, re: RegExp) =>
  Object.keys(parts(buffer))
    .filter((p) => re.test(p))
    .sort();

function rewrite(buffer: Buffer, transform: (path: string, xml: string) => string): Buffer {
  const files = unzipSync(new Uint8Array(buffer));
  const out: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(files)) {
    out[name] = name.endsWith(".xml") ? strToU8(transform(name, strFromU8(bytes))) : bytes;
  }
  return Buffer.from(zipSync(out, { mtime: EPOCH }));
}

describe("renderPptx", () => {
  it("passes RTL verification", async () => {
    const buffer = await renderPptx(draft);
    const report = verifyPptx(buffer, "demo.pptx");

    expect(report.issues).toEqual([]);
    expect(reportPassed(report)).toBe(true);
  });

  it("produces the expected number of slides", async () => {
    const buffer = await renderPptx(draft);
    expect(named(buffer, /^ppt\/slides\/slide\d+\.xml$/)).toHaveLength(SLIDE_COUNT);
    expect(SLIDE_COUNT).toBeGreaterThanOrEqual(7);
    expect(SLIDE_COUNT).toBeLessThanOrEqual(9);
  });

  it("uses native chart parts, not images", async () => {
    const buffer = await renderPptx(draft);
    const charts = named(buffer, /^ppt\/charts\/chart\d+\.xml$/);

    expect(charts.length).toBe(4);
    // No raster media at all — a chart rendered as a picture would land here.
    // Directory entries end in "/" and are not files.
    const media = Object.keys(unzipSync(new Uint8Array(buffer))).filter(
      (p) => p.startsWith("ppt/media/") && !p.endsWith("/"),
    );
    expect(media).toEqual([]);
  });

  it("charts carry the real values from the draft", async () => {
    const buffer = await renderPptx(draft);
    const charts = named(buffer, /^ppt\/charts\/chart\d+\.xml$/).map((p) => parts(buffer)[p]);
    const all = charts.join("");

    // Outcome counts, straight from computed.
    expect(all).toContain(`<c:v>${draft.computed.passedCount}</c:v>`);
    // A participant's stored attendance rate.
    expect(all).toContain("<c:v>100</c:v>");
  });

  it("is deterministic", async () => {
    const [a, b] = await Promise.all([renderPptx(draft), renderPptx(draft)]);
    expect(a.equals(b)).toBe(true);
  });

  it("does not stamp the current time", async () => {
    const buffer = await renderPptx(draft);
    expect(parts(buffer)["docProps/core.xml"]).toContain("2026-02-13");
  });

  // --- the RTL rule specific to PowerPoint ---------------------------------

  it("reverses chart categories so the first reads on the right", async () => {
    const buffer = await renderPptx(draft);
    const chartXml = named(buffer, /^ppt\/charts\/chart\d+\.xml$/)
      .map((p) => parts(buffer)[p])
      .find((xml) => xml.includes(draft.participants[0].nameAr));

    expect(chartXml).toBeDefined();

    // Category points in document order.
    const cats = (chartXml!.match(/<c:v>([^<]*)<\/c:v>/g) ?? []).map((v) =>
      v.replace(/<\/?c:v>/g, ""),
    );
    const names = draft.participants.map((p) => p.nameAr);
    const positions = names.map((n) => cats.indexOf(n));

    // Every name present, and in reverse of the draft order.
    expect(positions.every((i) => i >= 0)).toBe(true);
    const reversed = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual([...reversed].reverse());
  });

  it("keeps labels and values reversed together", async () => {
    const buffer = await renderPptx(draft);
    const chartXml = named(buffer, /^ppt\/charts\/chart\d+\.xml$/)
      .map((p) => parts(buffer)[p])
      .find((xml) => xml.includes(draft.participants[0].nameAr))!;

    // The last participant in draft order must be the first category, and
    // its attendance rate the first value.
    const last = draft.participants[draft.participants.length - 1];
    const firstCat = chartXml.indexOf(`<c:v>${last.nameAr}</c:v>`);
    const firstOther = chartXml.indexOf(`<c:v>${draft.participants[0].nameAr}</c:v>`);
    expect(firstCat).toBeGreaterThan(0);
    expect(firstCat).toBeLessThan(firstOther);
  });

  it("does not reverse categories for an LTR profile", async () => {
    const ltr = RenderProfileSchema.parse({ labelLanguage: "en" });
    const buffer = await renderPptx(draft, ltr);
    const chartXml = named(buffer, /^ppt\/charts\/chart\d+\.xml$/)
      .map((p) => parts(buffer)[p])
      .find((xml) => xml.includes(draft.participants[0].nameAr))!;

    const first = chartXml.indexOf(`<c:v>${draft.participants[0].nameAr}</c:v>`);
    const last = chartXml.indexOf(
      `<c:v>${draft.participants[draft.participants.length - 1].nameAr}</c:v>`,
    );
    expect(first).toBeLessThan(last);
  });

  it("labels an unanswered survey question rather than charting a bare zero", async () => {
    const withGap = recomputeDraft({
      ...draft,
      survey: {
        ...draft.survey,
        questions: draft.survey.questions.map((q, i) =>
          i === 0 ? { ...q, tally: [0, 0, 0, 0, 0] } : q,
        ),
      },
    });

    const buffer = await renderPptx(withGap);
    const all = named(buffer, /^ppt\/charts\/chart\d+\.xml$/)
      .map((p) => parts(buffer)[p])
      .join("");

    expect(all).toContain(t.noResponses);
  });

  it("renders an empty draft without throwing", async () => {
    const empty = recomputeDraft(
      DraftSchema.parse({
        schemaVersion: 1,
        id: "empty",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        course: {},
        survey: {},
        narrative: {},
        provenance: {},
      }),
    );

    const buffer = await renderPptx(empty);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});

describe("verifyPptx negative controls", () => {
  it("catches slide paragraphs that lost rtl", async () => {
    const buffer = await renderPptx(draft);
    const broken = rewrite(buffer, (name, xml) =>
      name.startsWith("ppt/slides/") ? xml.replace(/ rtl="1"/g, "") : xml,
    );

    const report = verifyPptx(broken, "broken.pptx");
    expect(reportPassed(report)).toBe(false);
    expect(report.issues.some((i) => i.rule.startsWith("P1"))).toBe(true);
  });

  it("catches chart text that lost rtl — the gap pptxgenjs leaves by default", async () => {
    const buffer = await renderPptx(draft);
    const broken = rewrite(buffer, (name, xml) =>
      name.startsWith("ppt/charts/") ? xml.replace(/<a:pPr rtl="1"/g, "<a:pPr") : xml,
    );

    const report = verifyPptx(broken, "broken.pptx");
    expect(reportPassed(report)).toBe(false);
    expect(report.issues.some((i) => i.rule.startsWith("P3"))).toBe(true);
  });

  it("catches a deck whose charts were replaced by images", async () => {
    const buffer = await renderPptx(draft);
    const files = unzipSync(new Uint8Array(buffer));
    const withoutCharts: Record<string, Uint8Array> = {};
    for (const [name, bytes] of Object.entries(files)) {
      if (!name.startsWith("ppt/charts/")) withoutCharts[name] = bytes;
    }

    const report = verifyPptx(Buffer.from(zipSync(withoutCharts, { mtime: EPOCH })), "flat.pptx");
    expect(reportPassed(report)).toBe(false);
    expect(report.issues.some((i) => i.rule.startsWith("P2"))).toBe(true);
  });

  it("fails a package with no slides", () => {
    const hollow = Buffer.from(
      zipSync({ "[Content_Types].xml": strToU8("<Types/>") }, { mtime: EPOCH }),
    );
    const report = verifyPptx(hollow, "hollow.pptx");

    expect(reportPassed(report)).toBe(false);
    expect(report.checks).toBe(0);
  });
});
