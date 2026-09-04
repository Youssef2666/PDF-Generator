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

export function verifyDocx(_buffer: Buffer, target = "report.docx"): RtlReport {
  return {
    target,
    format: "docx",
    checks: 0,
    issues: [
      {
        where: target,
        rule: "D0 not implemented",
        detail: "docx verification arrives with the Word renderer in M4.",
      },
    ],
  };
}

export function verifyPptx(_buffer: Buffer, target = "deck.pptx"): RtlReport {
  return {
    target,
    format: "pptx",
    checks: 0,
    issues: [
      {
        where: target,
        rule: "P0 not implemented",
        detail: "pptx verification arrives with the PowerPoint renderer in M5.",
      },
    ],
  };
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
    const { DraftSchema } = await import("@/lib/schema");

    const fixturePath = path.join(process.cwd(), "fixtures", "demo-draft.json");
    const draft = DraftSchema.parse(JSON.parse(await fs.readFile(fixturePath, "utf8")));

    const buffer = await renderXlsx(draft);
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "crs-rtl-"));
    const out = path.join(scratch, "demo.xlsx");
    await fs.writeFile(out, buffer);

    console.log(`Rendered fixture to ${out}`);
    reports.push(verifyXlsx(buffer, out));
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
