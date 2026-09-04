/**
 * The Excel renderer, and the verifier that guards it.
 *
 * Two things are being tested, and the second matters as much as the first:
 * that the workbook carries its RTL flags, and that the *verifier would
 * notice if it did not*. A check that cannot fail proves nothing, so the
 * negative controls below strip the flags out of a real workbook and assert
 * that verification then fails.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { renderXlsx } from "@/render/xlsx";
import { DEFAULT_PROFILE, labels, RenderProfileSchema } from "@/render/profile";
import { recomputeDraft } from "@/lib/compute";
import { DraftSchema, type Draft } from "@/lib/schema";
import { reportPassed, verifyXlsx } from "../../scripts/verify-rtl";
import demo from "../../fixtures/demo-draft.json";

const draft: Draft = DraftSchema.parse(demo);
const t = labels(DEFAULT_PROFILE);

/** Unzip, transform each XML part, re-zip. */
function rewritePackage(buffer: Buffer, transform: (path: string, xml: string) => string): Buffer {
  const files = unzipSync(new Uint8Array(buffer));
  const out: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(files)) {
    out[name] = name.endsWith(".xml")
      ? strToU8(transform(name, strFromU8(bytes)))
      : bytes;
  }
  return Buffer.from(zipSync(out));
}

function partOf(buffer: Buffer, name: string): string {
  return strFromU8(unzipSync(new Uint8Array(buffer))[name]);
}

/**
 * Cell text lives in the shared-strings table, not in the worksheet XML —
 * a sheet cell only holds an index into it. Any assertion about text a user
 * would read has to look here.
 */
function sharedStrings(buffer: Buffer): string {
  return partOf(buffer, "xl/sharedStrings.xml");
}

function sheetParts(buffer: Buffer): string[] {
  return Object.keys(unzipSync(new Uint8Array(buffer)))
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort();
}

describe("renderXlsx", () => {
  it("produces a workbook with the five expected sheets", async () => {
    const buffer = await renderXlsx(draft);
    const workbook = partOf(buffer, "xl/workbook.xml");

    for (const name of [
      t.sheetParticipants,
      t.sheetAttendance,
      t.sheetGrades,
      t.sheetSurvey,
      t.sheetCourseInfo,
    ]) {
      expect(workbook).toContain(name);
    }
    expect(sheetParts(buffer)).toHaveLength(5);
  });

  it("is deterministic — the same draft renders to the same bytes", async () => {
    const [a, b] = await Promise.all([renderXlsx(draft), renderXlsx(draft)]);
    expect(a.equals(b)).toBe(true);
  });

  it("does not stamp the current time", async () => {
    const buffer = await renderXlsx(draft);
    const core = partOf(buffer, "docProps/core.xml");
    // The draft's updatedAt, not today's date.
    expect(core).toContain("2026-02-13");
  });

  it("writes the figures compute.ts stored, without recomputing", async () => {
    const buffer = await renderXlsx(draft);
    const sheets = sheetParts(buffer).map((p) => partOf(buffer, p));
    const all = sheets.join("");

    // The all-late participant's 100% and the overridden participant's 60%
    // both appear as stored.
    expect(all).toContain("<v>100</v>");
    expect(all).toContain("<v>16</v>"); // totalHours on the course info sheet

    // Every stored total score reaches the file.
    for (const p of draft.participants) {
      if (p.computed.totalScore !== null) {
        expect(all).toContain(`<v>${p.computed.totalScore}</v>`);
      }
    }
  });

  it("keeps the computed outcome visible beside an override", async () => {
    const buffer = await renderXlsx(draft);
    const overridden = draft.participants.find((p) => p.computed.outcomeIsOverridden);
    expect(overridden).toBeDefined();

    // The override reason travels into the workbook, so a reader can see why.
    expect(sharedStrings(buffer)).toContain("تقييماً بديلاً");
    // And the outcome the rules produced is still there beside it.
    expect(sharedStrings(buffer)).toContain(t[overridden!.computed.computedOutcome]);
  });

  it("writes an unanswered survey question as text, never as zero", async () => {
    const withGap = recomputeDraft({
      ...draft,
      survey: {
        ...draft.survey,
        questions: draft.survey.questions.map((q, i) =>
          i === 0 ? { ...q, tally: [0, 0, 0, 0, 0] } : q,
        ),
      },
    });
    expect(withGap.survey.questions[0].computed.average).toBeNull();

    const buffer = await renderXlsx(withGap);

    expect(sharedStrings(buffer)).toContain(t.noResponses);
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

    const buffer = await renderXlsx(empty);
    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(reportPassed(verifyXlsx(buffer, "empty.xlsx"))).toBe(true);
  });

  it("honours a profile's fonts and colours", async () => {
    const profile = RenderProfileSchema.parse({
      fonts: { arabic: "Dubai", latin: "Calibri", size: 12, headerSize: 13 },
      colors: {
        headerFill: "AA0000",
        headerText: "FFFFFF",
        bandFill: "EEEEEE",
        pass: "00AA00",
        fail: "AA0000",
      },
    });

    const buffer = await renderXlsx(draft, profile);
    const styles = partOf(buffer, "xl/styles.xml");

    expect(styles).toContain("Dubai");
    expect(styles).toContain("Calibri");
    expect(styles.toUpperCase()).toContain("AA0000");
  });
});

describe("verifyXlsx", () => {
  it("passes a freshly rendered workbook", async () => {
    const buffer = await renderXlsx(draft);
    const report = verifyXlsx(buffer, "demo.xlsx");

    expect(report.issues).toEqual([]);
    expect(reportPassed(report)).toBe(true);
    // Two assertions on each of five sheets.
    expect(report.checks).toBe(10);
  });

  it("sets rightToLeft on every sheet, not just the first", async () => {
    const buffer = await renderXlsx(draft);
    for (const part of sheetParts(buffer)) {
      expect(partOf(buffer, part)).toMatch(/<sheetView[^>]*rightToLeft="1"/);
    }
  });

  // --- negative controls ---------------------------------------------------

  it("fails when rightToLeft is stripped from every sheet", async () => {
    const buffer = await renderXlsx(draft);
    const broken = rewritePackage(buffer, (name, xml) =>
      name.startsWith("xl/worksheets/") ? xml.replace(/\srightToLeft="1"/g, "") : xml,
    );

    const report = verifyXlsx(broken, "broken.xlsx");
    expect(reportPassed(report)).toBe(false);
    expect(report.issues).toHaveLength(5);
    expect(report.issues[0].rule).toContain("X1");
  });

  it("fails when a single sheet loses the flag", async () => {
    const buffer = await renderXlsx(draft);
    const target = sheetParts(buffer)[2];
    const broken = rewritePackage(buffer, (name, xml) =>
      name === target ? xml.replace(/\srightToLeft="1"/g, "") : xml,
    );

    const report = verifyXlsx(broken, "one-bad.xlsx");
    expect(reportPassed(report)).toBe(false);
    // Exactly one sheet is wrong — the check is per sheet, not per workbook.
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].where).toBe(labels(DEFAULT_PROFILE).sheetGrades);
  });

  it("fails when the header freeze is lost", async () => {
    const buffer = await renderXlsx(draft);
    const broken = rewritePackage(buffer, (name, xml) =>
      name.startsWith("xl/worksheets/") ? xml.replace(/<pane[^>]*\/>/g, "") : xml,
    );

    const report = verifyXlsx(broken, "unfrozen.xlsx");
    expect(reportPassed(report)).toBe(false);
    expect(report.issues.every((i) => i.rule.includes("X2"))).toBe(true);
  });

  it("fails a package with no worksheets at all", () => {
    const empty = Buffer.from(zipSync({ "[Content_Types].xml": strToU8("<Types/>") }));
    const report = verifyXlsx(empty, "hollow.xlsx");

    expect(reportPassed(report)).toBe(false);
    expect(report.checks).toBe(0);
  });

  it("treats a zero-check report as a failure, not a pass", () => {
    expect(reportPassed({ target: "x", format: "xlsx", checks: 0, issues: [] })).toBe(false);
  });
});
