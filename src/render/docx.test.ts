/**
 * The Word renderer.
 *
 * The negative controls are the point of this file. Word RTL is six
 * independent layers and five-of-six looks almost right, so every layer gets
 * a test that breaks it deliberately and asserts the verifier notices. A
 * check nobody has watched fail is not evidence.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { renderDocx, SECTION_TITLES_AR } from "@/render/docx";
import { DEFAULT_PROFILE, labels, RenderProfileSchema } from "@/render/profile";
import { recomputeDraft } from "@/lib/compute";
import { DraftSchema, type Draft } from "@/lib/schema";
import { reportPassed, verifyDocx } from "../../scripts/verify-rtl";
import demo from "../../fixtures/demo-draft.json";

const draft: Draft = DraftSchema.parse(demo);
const t = labels(DEFAULT_PROFILE);

function partOf(buffer: Buffer, name: string): string {
  return strFromU8(unzipSync(new Uint8Array(buffer))[name]);
}

const documentXml = (buffer: Buffer) => partOf(buffer, "word/document.xml");

function rewrite(buffer: Buffer, transform: (path: string, xml: string) => string): Buffer {
  const files = unzipSync(new Uint8Array(buffer));
  const out: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(files)) {
    out[name] = name.endsWith(".xml") ? strToU8(transform(name, strFromU8(bytes))) : bytes;
  }
  return Buffer.from(zipSync(out, { mtime: new Date("1980-01-01T00:00:00.000Z") }));
}

/** The <w:r> element containing a given piece of text. */
function runContaining(xml: string, needle: string): string | undefined {
  return (xml.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) ?? []).find((run) =>
    run.includes(needle),
  );
}

describe("renderDocx", () => {
  it("passes every RTL layer check", async () => {
    const buffer = await renderDocx(draft);
    const report = verifyDocx(buffer, "demo.docx");

    expect(report.issues).toEqual([]);
    expect(reportPassed(report)).toBe(true);
  });

  it("contains all thirteen sections", async () => {
    const xml = documentXml(await renderDocx(draft));
    // The cover page is section 1 and carries the course title rather than a
    // heading, so the other twelve headings are the ones to find.
    for (const title of SECTION_TITLES_AR.slice(1)) {
      expect(xml, `missing section heading: ${title}`).toContain(title);
    }
    expect(SECTION_TITLES_AR).toHaveLength(13);
  });

  it("writes every narrative field into the document", async () => {
    const xml = documentXml(await renderDocx(draft));
    for (const [field, text] of Object.entries(draft.narrative)) {
      // Compare on a distinctive fragment; the renderer splits prose into runs.
      const fragment = text.trim().slice(0, 24);
      expect(xml.replace(/<[^>]+>/g, ""), `narrative.${field} missing`).toContain(fragment);
    }
  });

  it("is deterministic", async () => {
    const [a, b] = await Promise.all([renderDocx(draft), renderDocx(draft)]);
    expect(a.equals(b)).toBe(true);
  });

  // --- the two bidi traps the fixture exists to catch ----------------------

  it("marks a Latin participant name as an LTR run", async () => {
    const xml = documentXml(await renderDocx(draft));
    const run = runContaining(xml, "Maria Santos");

    expect(run, "Maria Santos should appear in the document").toBeDefined();
    // Not marked as complex script: an Arabic run here would leave the name
    // reversed against its punctuation inside the RTL table.
    expect(run).not.toMatch(/<w:rtl\s*\/>/);
  });

  it("keeps a long digit string in a single LTR run", async () => {
    const xml = documentXml(await renderDocx(draft));
    // The contract number planted in narrative.conclusion.
    const run = runContaining(xml, "20260208114500");

    expect(run, "the long digit string should survive rendering").toBeDefined();
    expect(run).not.toMatch(/<w:rtl\s*\/>/);
    // It must not have been split apart, which is how digits get reordered.
    expect(run).toContain("20260208114500");
  });

  it("still marks the Arabic around a digit string as RTL", async () => {
    const xml = documentXml(await renderDocx(draft));
    const arabicRuns = (xml.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) ?? []).filter((r) =>
      /[؀-ۿ]/.test(r),
    );
    expect(arabicRuns.length).toBeGreaterThan(50);
    expect(arabicRuns.every((r) => /<w:rtl\s*\/>/.test(r))).toBe(true);
  });

  // --- structure -----------------------------------------------------------

  it("sets the complex-script font, not just the Latin one", async () => {
    const profile = RenderProfileSchema.parse({
      fonts: { arabic: "Dubai", latin: "Calibri", size: 11, headerSize: 12 },
    });
    const xml = documentXml(await renderDocx(draft, profile));

    // The cs slot is what Word actually uses for Arabic.
    expect(xml).toMatch(/w:cs="Dubai"/);
    expect(xml).toMatch(/w:ascii="Calibri"/);
  });

  it("uses logical alignment everywhere", async () => {
    const xml = documentXml(await renderDocx(draft));
    expect(xml).not.toMatch(/<w:jc w:val="(left|right)"/);
    expect(xml).toMatch(/<w:jc w:val="start"/);
  });

  it("puts section bidi before docGrid", async () => {
    const xml = documentXml(await renderDocx(draft));
    const sectPr = xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)![0];

    expect(sectPr).toContain("<w:bidi/>");
    expect(sectPr.indexOf("<w:bidi/>")).toBeLessThan(sectPr.indexOf("<w:docGrid"));
  });

  it("marks every table bidiVisual", async () => {
    const xml = documentXml(await renderDocx(draft));
    const tblPrs = xml.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/g) ?? [];

    expect(tblPrs.length).toBeGreaterThanOrEqual(6);
    expect(tblPrs.every((p) => p.includes("<w:bidiVisual/>"))).toBe(true);
  });

  it("reports an unanswered survey question in words, not as zero", async () => {
    const withGap = recomputeDraft({
      ...draft,
      survey: {
        ...draft.survey,
        questions: draft.survey.questions.map((q, i) =>
          i === 1 ? { ...q, tally: [0, 0, 0, 0, 0] } : q,
        ),
      },
    });

    const xml = documentXml(await renderDocx(withGap));
    expect(xml).toContain(t.noResponses);
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

    const buffer = await renderDocx(empty);
    expect(buffer.byteLength).toBeGreaterThan(0);
    // Still structurally RTL even with nothing in it.
    const report = verifyDocx(buffer, "empty.docx");
    expect(report.issues.filter((i) => !i.rule.startsWith("D8"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Negative controls — one per layer
// ---------------------------------------------------------------------------

describe("verifyDocx negative controls", () => {
  const failingRules = async (
    transform: (path: string, xml: string) => string,
  ): Promise<string[]> => {
    const buffer = await renderDocx(draft);
    const broken = rewrite(buffer, transform);
    const report = verifyDocx(broken, "broken.docx");
    expect(reportPassed(report)).toBe(false);
    return report.issues.map((i) => i.rule);
  };

  it("catches a missing themeFontLang (layer 0.0, the master switch)", async () => {
    const rules = await failingRules((name, xml) =>
      name === "word/settings.xml" ? xml.replace(/<w:themeFontLang[^>]*\/>/g, "") : xml,
    );
    expect(rules.some((r) => r.startsWith("D1"))).toBe(true);
  });

  it("catches missing docDefaults language (layer 0)", async () => {
    const rules = await failingRules((name, xml) =>
      name === "word/styles.xml" ? xml.replace(/<w:lang[^>]*\/>/g, "") : xml,
    );
    expect(rules.some((r) => r.startsWith("D2"))).toBe(true);
  });

  it("catches missing docDefaults paragraph bidi (layer 0.5)", async () => {
    const rules = await failingRules((name, xml) =>
      name === "word/styles.xml"
        ? xml.replace(/(<w:pPrDefault>\s*<w:pPr>)<w:bidi\/>/, "$1")
        : xml,
    );
    expect(rules.some((r) => r.startsWith("D3"))).toBe(true);
  });

  it("catches missing section bidi (layer 1)", async () => {
    const rules = await failingRules((name, xml) =>
      name === "word/document.xml"
        ? xml.replace(/(<w:sectPr[\s\S]*?)<w:bidi\/>/, "$1")
        : xml,
    );
    expect(rules.some((r) => r.startsWith("D4"))).toBe(true);
  });

  it("catches section bidi placed after docGrid", async () => {
    const rules = await failingRules((name, xml) =>
      name === "word/document.xml"
        ? xml.replace(
            /<w:bidi\/>(<w:docGrid[^>]*\/>)/,
            "$1<w:bidi/>",
          )
        : xml,
    );
    expect(rules.some((r) => r.startsWith("D5"))).toBe(true);
  });

  it("catches a table that lost bidiVisual (layer 2)", async () => {
    const rules = await failingRules((name, xml) =>
      name === "word/document.xml" ? xml.replace("<w:bidiVisual/>", "") : xml,
    );
    expect(rules.some((r) => r.startsWith("D6"))).toBe(true);
  });

  it("catches paragraphs that lost bidi (layer 3a)", async () => {
    const rules = await failingRules((name, xml) =>
      name === "word/document.xml"
        ? xml.replace(/<w:pPr>((?:(?!<\/w:pPr>)[\s\S])*?)<w:bidi\/>/g, "<w:pPr>$1")
        : xml,
    );
    expect(rules.some((r) => r.startsWith("D7"))).toBe(true);
  });

  it("catches Arabic runs that lost rtl (layer 3b)", async () => {
    const rules = await failingRules((name, xml) =>
      name === "word/document.xml" ? xml.replace(/<w:rtl\/>/g, "") : xml,
    );
    expect(rules.some((r) => r.startsWith("D8"))).toBe(true);
  });

  it("catches physical alignment (layer 5, the Word-for-Mac trap)", async () => {
    const rules = await failingRules((name, xml) =>
      name === "word/document.xml"
        ? xml.replace(/<w:jc w:val="start"\/>/g, '<w:jc w:val="right"/>')
        : xml,
    );
    expect(rules.some((r) => r.startsWith("D10"))).toBe(true);
  });

  it("fails a package with no document part at all", () => {
    const hollow = Buffer.from(
      zipSync(
        { "[Content_Types].xml": strToU8("<Types/>") },
        { mtime: new Date("1980-01-01T00:00:00.000Z") },
      ),
    );
    const report = verifyDocx(hollow, "hollow.docx");
    expect(reportPassed(report)).toBe(false);
    expect(report.checks).toBe(0);
  });
});
