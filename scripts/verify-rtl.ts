/**
 * Asserts that a generated document actually carries its right-to-left
 * flags.
 *
 * This exists because RTL bugs are invisible from the code. Every renderer
 * in this project *looks* correct — the flag is set on the object, the test
 * for the data passes — and the file still opens with the columns the wrong
 * way round, because the flag never reached the XML, or reached one sheet
 * and not the others. The only way to know is to open the produced file and
 * look at what is really in it, which is what this does.
 *
 * It reads the finished bytes, not the renderer's intentions. Run it with
 * `pnpm verify:rtl`; it exits non-zero if any required flag is missing.
 *
 * Currently covers xlsx. docx (M4) and pptx (M5) plug into the same report
 * shape — see docs/rtl.md.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { unzipSync, strFromU8 } from "fflate";

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

export interface RtlIssue {
  /** Where inside the document, e.g. a sheet name or a part path. */
  where: string;
  /** The rule that failed, named as it appears in docs/rtl.md. */
  rule: string;
  detail: string;
}

export interface RtlReport {
  target: string;
  format: "xlsx" | "docx" | "pptx";
  /** Number of assertions made. A report with zero checks is a failure. */
  checks: number;
  issues: RtlIssue[];
}

export function reportPassed(report: RtlReport): boolean {
  return report.checks > 0 && report.issues.length === 0;
}

// ---------------------------------------------------------------------------
// Zip and XML helpers
// ---------------------------------------------------------------------------

type Parts = Record<string, string>;

/** Read an OOXML package into { partPath: xmlText }. */
function readParts(buffer: Buffer): Parts {
  const files = unzipSync(new Uint8Array(buffer));
  const parts: Parts = {};
  for (const [name, bytes] of Object.entries(files)) {
    if (name.endsWith(".xml") || name.endsWith(".rels")) parts[name] = strFromU8(bytes);
  }
  return parts;
}

/** All occurrences of an element's opening tag, with their raw attributes. */
function findTags(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}(\\s[^>]*?)?/?>`, "g");
  return xml.match(pattern) ?? [];
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? match[1] : null;
}

/** OOXML booleans: "1", "true" and a bare present attribute all mean true. */
function isTrue(value: string | null): boolean {
  return value === "1" || value === "true";
}

// ---------------------------------------------------------------------------
// xlsx
// ---------------------------------------------------------------------------

/** Map each worksheet part to the sheet name shown on its tab. */
function xlsxSheetNames(parts: Parts): Map<string, string> {
  const names = new Map<string, string>();
  const workbook = parts["xl/workbook.xml"];
  const rels = parts["_rels/workbook.xml.rels"] ?? parts["xl/_rels/workbook.xml.rels"];
  if (!workbook || !rels) return names;

  const relTargets = new Map<string, string>();
  for (const tag of findTags(rels, "Relationship")) {
    const id = attr(tag, "Id");
    const target = attr(tag, "Target");
    if (id && target) relTargets.set(id, target.replace(/^\/?(xl\/)?/, ""));
  }

  for (const tag of findTags(workbook, "sheet")) {
    const name = attr(tag, "name");
    const rid = attr(tag, "r:id") ?? attr(tag, "id");
    if (!name || !rid) continue;
    const target = relTargets.get(rid);
    if (target) names.set(`xl/${target}`, name);
  }
  return names;
}

export function verifyXlsx(buffer: Buffer, target = "workbook.xlsx"): RtlReport {
  const report: RtlReport = { target, format: "xlsx", checks: 0, issues: [] };
  const parts = readParts(buffer);
  const names = xlsxSheetNames(parts);

  const sheetPaths = Object.keys(parts)
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort();

  if (sheetPaths.length === 0) {
    report.issues.push({
      where: target,
      rule: "X0 workbook has sheets",
      detail: "No worksheet parts found in the package.",
    });
    return report;
  }

  for (const sheetPath of sheetPaths) {
    const where = names.get(sheetPath) ?? sheetPath;
    const xml = parts[sheetPath];
    const views = findTags(xml, "sheetView");

    // X1 — every sheet is mirrored.
    report.checks += 1;
    if (views.length === 0) {
      report.issues.push({
        where,
        rule: "X1 sheetView rightToLeft",
        detail: "Sheet has no <sheetView> at all, so it cannot carry the RTL flag.",
      });
    } else if (!views.some((view) => isTrue(attr(view, "rightToLeft")))) {
      report.issues.push({
        where,
        rule: "X1 sheetView rightToLeft",
        detail:
          'No <sheetView> carries rightToLeft="1". The sheet will open with column A ' +
          "at the left edge and read the wrong way.",
      });
    }

    // X2 — headers stay visible. Not RTL per se, but this verifier is the
    // only thing that opens the file, and a lost freeze is equally invisible.
    report.checks += 1;
    const panes = findTags(xml, "pane");
    const frozen = panes.some(
      (pane) => attr(pane, "state") === "frozen" || attr(pane, "state") === "frozenSplit",
    );
    if (!frozen) {
      report.issues.push({
        where,
        rule: "X2 frozen header row",
        detail: "No frozen pane. The header row scrolls away on a long table.",
      });
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Placeholders for the milestones that follow
// ---------------------------------------------------------------------------

/** Any character in the Arabic blocks, including presentation forms. */
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** Inner text of a run or paragraph, from its <w:t> elements. */
function textOf(xml: string): string {
  return (xml.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) ?? [])
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join("");
}

/**
 * Word RTL is six independent layers, and five of six looks almost right.
 * Each is asserted separately so a failure names the layer that broke rather
 * than saying "the document is wrong".
 */
export function verifyDocx(buffer: Buffer, target = "report.docx"): RtlReport {
  const report: RtlReport = { target, format: "docx", checks: 0, issues: [] };
  const parts = readParts(buffer);

  const document = parts["word/document.xml"];
  const settings = parts["word/settings.xml"] ?? "";
  const styles = parts["word/styles.xml"] ?? "";

  if (!document) {
    report.issues.push({
      where: target,
      rule: "D0 package has a document",
      detail: "No word/document.xml in the package.",
    });
    return report;
  }

  const fail = (rule: string, where: string, detail: string) =>
    report.issues.push({ rule, where, detail });

  // --- Layer 0.0 -----------------------------------------------------------
  report.checks += 1;
  if (!/<w:themeFontLang[^>]*w:bidi="[^"]+"/.test(settings)) {
    fail(
      "D1 settings themeFontLang bidi",
      "word/settings.xml",
      "Missing <w:themeFontLang w:bidi>. This is the master switch: without " +
        "it Word never turns its bidi pipeline on and every other layer is " +
        "decoration. No docx library writes it by default.",
    );
  }

  // --- Layer 0 -------------------------------------------------------------
  report.checks += 1;
  const docDefaults = styles.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/)?.[0] ?? "";
  if (!/<w:lang[^>]*w:bidi="[^"]+"/.test(docDefaults)) {
    fail(
      "D2 docDefaults lang bidi",
      "word/styles.xml",
      "docDefaults has no <w:lang w:bidi>. Tables survive without it; " +
        "paragraph and heading rendering does not.",
    );
  }

  // --- Layer 0.5 -----------------------------------------------------------
  report.checks += 1;
  if (!/<w:pPrDefault>[\s\S]*?<w:bidi\/>/.test(docDefaults)) {
    fail(
      "D3 docDefaults paragraph bidi",
      "word/styles.xml",
      "docDefaults has no <w:pPr><w:bidi/>. Paragraphs added later, when " +
        "someone edits the delivered file, inherit LTR.",
    );
  }

  // --- Layer 1 -------------------------------------------------------------
  const sectPrs = document.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g) ?? [];
  report.checks += 1;
  if (sectPrs.length === 0) {
    fail("D4 section bidi", "word/document.xml", "No <w:sectPr> found.");
  } else {
    const missing = sectPrs.filter((s) => !/<w:bidi\s*\/>/.test(s));
    if (missing.length > 0) {
      fail(
        "D4 section bidi",
        "word/document.xml",
        `${missing.length} of ${sectPrs.length} <w:sectPr> lack <w:bidi/>.`,
      );
    }
    // Schema order: w:bidi must precede w:docGrid or Word rejects the part.
    report.checks += 1;
    const misordered = sectPrs.filter((s) => {
      const bidi = s.indexOf("<w:bidi/>");
      const grid = s.indexOf("<w:docGrid");
      return bidi !== -1 && grid !== -1 && bidi > grid;
    });
    if (misordered.length > 0) {
      fail(
        "D5 section bidi ordering",
        "word/document.xml",
        "<w:bidi/> appears after <w:docGrid>. The schema requires it before, " +
          "and Word will refuse to open the file.",
      );
    }
  }

  // --- Layer 2 -------------------------------------------------------------
  const tblPrs = document.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/g) ?? [];
  report.checks += 1;
  const tablesWithout = tblPrs.filter((t) => !/<w:bidiVisual\s*\/>/.test(t));
  if (tablesWithout.length > 0) {
    fail(
      "D6 table bidiVisual",
      "word/document.xml",
      `${tablesWithout.length} of ${tblPrs.length} tables lack <w:bidiVisual/>. ` +
        "Their columns render in the wrong order.",
    );
  }

  // --- Layer 3a: every paragraph that holds text ---------------------------
  const paragraphs = document.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? [];
  const withText = paragraphs.filter((p) => textOf(p).trim() !== "");
  report.checks += 1;
  const paraMissing = withText.filter((p) => !/<w:bidi\s*\/>/.test(p));
  if (paraMissing.length > 0) {
    fail(
      "D7 paragraph bidi",
      "word/document.xml",
      `${paraMissing.length} of ${withText.length} text paragraphs lack ` +
        `<w:bidi/>. First offender: "${textOf(paraMissing[0]).slice(0, 60)}".`,
    );
  }

  // --- Layer 3b: every run that holds Arabic -------------------------------
  const runs = document.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) ?? [];
  const arabicRuns = runs.filter((r) => ARABIC.test(textOf(r)));
  report.checks += 1;
  if (arabicRuns.length === 0) {
    fail(
      "D8 run rtl",
      "word/document.xml",
      "No Arabic runs found at all. Either the document is empty or the text " +
        "did not survive rendering.",
    );
  } else {
    const runMissing = arabicRuns.filter((r) => !/<w:rtl\s*\/>/.test(r));
    if (runMissing.length > 0) {
      fail(
        "D8 run rtl",
        "word/document.xml",
        `${runMissing.length} of ${arabicRuns.length} Arabic runs lack <w:rtl/>. ` +
          `First offender: "${textOf(runMissing[0]).slice(0, 40)}".`,
      );
    }
  }

  // --- Complex-script fonts ------------------------------------------------
  report.checks += 1;
  const arabicWithoutCs = arabicRuns.filter((r) => !/w:cs="[^"]+"/.test(r));
  if (arabicWithoutCs.length > 0 && !/<w:rFonts[^>]*w:cs="[^"]+"/.test(docDefaults)) {
    fail(
      "D9 complex-script font",
      "word/document.xml",
      `${arabicWithoutCs.length} Arabic runs set no w:cs font, and docDefaults ` +
        "does not supply one. Arabic then renders in whatever the reader's " +
        "machine falls back to, differently on Windows and macOS.",
    );
  }

  // --- Layer 5: logical alignment ------------------------------------------
  report.checks += 1;
  const physical = document.match(/<w:jc w:val="(left|right)"/g) ?? [];
  if (physical.length > 0) {
    fail(
      "D10 logical alignment",
      "word/document.xml",
      `${physical.length} paragraphs use physical <w:jc w:val="left|right">. ` +
        "Word for Mac reinterprets physical alignment under RTL, so these are " +
        'correct on Windows and wrong on a Mac. Use "start"/"end".',
    );
  }

  return report;
}

/**
 * PowerPoint.
 *
 * Slides and charts fail differently and are checked separately: a deck
 * whose slides are correctly RTL can still have every chart axis reading
 * left-to-right, because pptxgenjs writes no `rtl` attribute into chart text
 * properties and offers no option for it.
 */
export function verifyPptx(buffer: Buffer, target = "deck.pptx"): RtlReport {
  const report: RtlReport = { target, format: "pptx", checks: 0, issues: [] };
  const parts = readParts(buffer);

  const slidePaths = Object.keys(parts)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort();
  const chartPaths = Object.keys(parts)
    .filter((p) => /^ppt\/charts\/chart\d+\.xml$/.test(p))
    .sort();

  if (slidePaths.length === 0) {
    report.issues.push({
      where: target,
      rule: "P0 deck has slides",
      detail: "No slide parts found in the package.",
    });
    return report;
  }

  // --- P1: Arabic paragraphs on slides carry rtl="1" -----------------------
  for (const slidePath of slidePaths) {
    const xml = parts[slidePath];
    const slideName = slidePath.replace("ppt/slides/", "");

    // Only judge slides that actually contain Arabic.
    const paragraphs = xml.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? [];
    const arabicParagraphs = paragraphs.filter((p) => ARABIC.test(p));
    if (arabicParagraphs.length === 0) continue;

    report.checks += 1;
    const missing = arabicParagraphs.filter((p) => !/<a:pPr[^>]*\brtl="1"/.test(p));
    if (missing.length > 0) {
      report.issues.push({
        where: slideName,
        rule: "P1 slide paragraph rtl",
        detail:
          `${missing.length} of ${arabicParagraphs.length} Arabic paragraphs lack ` +
          'rtl="1" on their <a:pPr>.',
      });
    }
  }

  // --- P2: charts are native, not pictures ---------------------------------
  report.checks += 1;
  if (chartPaths.length === 0) {
    report.issues.push({
      where: target,
      rule: "P2 native charts",
      detail:
        "No ppt/charts/chartN.xml parts. The deck has no native charts — if " +
        "figures were rendered as images they cannot be selected, edited or " +
        "re-themed in PowerPoint.",
    });
  }

  // --- P3: chart text carries rtl="1" --------------------------------------
  for (const chartPath of chartPaths) {
    const xml = parts[chartPath];
    if (!ARABIC.test(xml)) continue;

    report.checks += 1;
    const paragraphs = xml.match(/<a:pPr[^>]*>/g) ?? [];
    const missing = paragraphs.filter((p) => !/\brtl="1"/.test(p));
    if (missing.length > 0) {
      report.issues.push({
        where: chartPath.replace("ppt/charts/", ""),
        rule: "P3 chart text rtl",
        detail:
          `${missing.length} of ${paragraphs.length} <a:pPr> in this chart lack ` +
          'rtl="1". pptxgenjs writes none by default and exposes no option, so ' +
          "axis and legend labels render left-to-right inside an otherwise " +
          "correct deck.",
      });
    }
  }

  return report;
}

/** Dispatch on extension. */
export function verifyBuffer(buffer: Buffer, target: string): RtlReport {
  const extension = path.extname(target).toLowerCase();
  if (extension === ".xlsx") return verifyXlsx(buffer, target);
  if (extension === ".docx") return verifyDocx(buffer, target);
  if (extension === ".pptx") return verifyPptx(buffer, target);
  return {
    target,
    format: "xlsx",
    checks: 0,
    issues: [
      { where: target, rule: "unknown format", detail: `No verifier for "${extension}".` },
    ],
  };
}

export function formatReport(report: RtlReport): string {
  const lines: string[] = [];
  const status = reportPassed(report) ? "PASS" : "FAIL";
  lines.push(`${status}  ${report.target}  (${report.checks} checks)`);
  for (const issue of report.issues) {
    lines.push(`      ${issue.rule} — ${issue.where}`);
    lines.push(`        ${issue.detail}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * With arguments: verify those files. Without: render the committed fixture
 * and verify that, so `pnpm verify:rtl` is meaningful with no setup.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reports: RtlReport[] = [];

  if (args.length > 0) {
    for (const file of args) {
      const buffer = await fs.readFile(file);
      reports.push(verifyBuffer(buffer, file));
    }
  } else {
    const { renderXlsx } = await import("@/render/xlsx");
    const { renderDocx } = await import("@/render/docx");
    const { DraftSchema } = await import("@/lib/schema");

    const fixturePath = path.join(process.cwd(), "fixtures", "demo-draft.json");
    const draft = DraftSchema.parse(JSON.parse(await fs.readFile(fixturePath, "utf8")));
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "crs-rtl-"));

    const xlsx = await renderXlsx(draft);
    const xlsxPath = path.join(scratch, "demo.xlsx");
    await fs.writeFile(xlsxPath, xlsx);
    reports.push(verifyXlsx(xlsx, xlsxPath));

    const docx = await renderDocx(draft);
    const docxPath = path.join(scratch, "demo.docx");
    await fs.writeFile(docxPath, docx);
    reports.push(verifyDocx(docx, docxPath));

    const { renderPptx } = await import("@/render/pptx");
    const pptx = await renderPptx(draft);
    const pptxPath = path.join(scratch, "demo.pptx");
    await fs.writeFile(pptxPath, pptx);
    reports.push(verifyPptx(pptx, pptxPath));

    console.log(`Rendered fixture to ${scratch}`);
  }

  for (const report of reports) console.log(formatReport(report));

  const failed = reports.filter((r) => !reportPassed(r));
  if (failed.length > 0) {
    console.error(`\n${failed.length} of ${reports.length} file(s) failed RTL verification.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nAll ${reports.length} file(s) passed.`);
}

// Only run the CLI when executed directly, so the checks above can be
// imported by tests without the script firing.
if (process.argv[1] && /verify-rtl\.(ts|js|mts)$/.test(process.argv[1])) {
  void main();
}
