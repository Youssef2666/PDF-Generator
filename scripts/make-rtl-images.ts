/**
 * Renders docs/images/rtl-before.png and rtl-after.png.
 *
 * An honest caveat, stated here and repeated in docs/rtl.md: **these are not
 * screenshots of Excel.** Nothing in this environment can open an .xlsx, so
 * the sheet is reproduced in a browser from the same fixture data the
 * renderer uses, with and without the two rules under discussion:
 *
 *   X1  rightToLeft on the sheet view  — mirrors the column order
 *   X3  readingOrder on cells          — instead of physical alignment
 *
 * What it shows is what those rules *do*. The real change is the XML diff
 * printed alongside it in docs/rtl.md, which is generated from the actual
 * workbook.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

import { DraftSchema } from "@/lib/schema";
import { labels, DEFAULT_PROFILE } from "@/render/profile";

const OUT_DIR = path.join(process.cwd(), "docs", "images");

const CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px; background: #fff;
    font: 14px/1.45 "Segoe UI", system-ui, sans-serif; color: #1a1a1a;
  }
  .label {
    font-size: 12px; font-weight: 600; letter-spacing: .04em;
    text-transform: uppercase; margin-bottom: 10px;
  }
  .bad  { color: #b42318; }
  .good { color: #1e7a46; }
  .note { font-size: 12px; color: #667085; margin-top: 10px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th {
    background: #1f3864; color: #fff; font-weight: 600;
    padding: 8px 10px; text-align: center; white-space: nowrap;
  }
  td { padding: 7px 10px; border-bottom: 1px solid #e4e7ec; }
  tr:nth-child(even) td { background: #f2f5fa; }
  td.num { text-align: center; font-variant-numeric: tabular-nums; direction: ltr; }
  .pass { color: #1e7a46; font-weight: 600; }
  .fail { color: #b42318; font-weight: 600; }
  .marker {
    outline: 2px solid #b42318; outline-offset: -2px;
  }
`;

function table(
  rows: Array<{ name: string; dept: string; rate: string; score: string; outcome: string; passed: boolean }>,
  headings: string[],
  rtl: boolean,
): string {
  // The "before" case pins cells to the right, physically — which is the
  // mistake X3 describes. The "after" case sets direction and lets the
  // renderer choose the edge.
  const dir = rtl ? "rtl" : "ltr";
  const cellDir = rtl ? "" : `text-align:right;`;

  const body = rows
    .map(
      (row) => `<tr>
        <td style="${cellDir}" class="${/^[\x20-\x7E]+$/.test(row.name) ? "marker" : ""}">${row.name}</td>
        <td style="${cellDir}">${row.dept}</td>
        <td class="num">${row.rate}</td>
        <td class="num">${row.score}</td>
        <td class="num"><span class="${row.passed ? "pass" : "fail"}">${row.outcome}</span></td>
      </tr>`,
    )
    .join("");

  return `<table dir="${dir}">
    <thead><tr>${headings.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

async function main(): Promise<void> {
  const draft = DraftSchema.parse(
    JSON.parse(await fs.readFile(path.join(process.cwd(), "fixtures", "demo-draft.json"), "utf8")),
  );
  const t = labels(DEFAULT_PROFILE);

  const rows = draft.participants.map((p) => ({
    name: p.nameAr,
    dept: p.department,
    rate: p.computed.attendanceRate === null ? "—" : `${p.computed.attendanceRate}%`,
    score: p.computed.totalScore === null ? "—" : String(p.computed.totalScore),
    outcome: t[p.computed.outcome],
    passed: p.computed.outcome === "passed",
  }));

  const headings = [t.name, t.department, t.attendanceRate, t.totalScore, t.outcome];

  const page = (title: string, tone: string, note: string, html: string) => `
    <!doctype html><meta charset="utf-8"><style>${CSS}</style>
    <div class="label ${tone}">${title}</div>
    ${html}
    <div class="note">${note}</div>`;

  const browser = await chromium.launch();
  try {
    const tab = await browser.newPage({
      viewport: { width: 900, height: 460 },
      deviceScaleFactor: 2,
    });

    await fs.mkdir(OUT_DIR, { recursive: true });

    await tab.setContent(
      page(
        "Before — no sheet direction, cells pinned right",
        "bad",
        "The name column sits on the left and the table reads outward from the wrong side. " +
          "The outlined row is the Latin-script name: pinned to the right physically, it fights its own content.",
        table(rows, headings, false),
      ),
    );
    await tab.screenshot({ path: path.join(OUT_DIR, "rtl-before.png"), fullPage: true });

    await tab.setContent(
      page(
        "After — X1 sheet direction, X3 reading order",
        "good",
        "The name column anchors the table on the right and the columns run leftwards. " +
          "The Latin name sits correctly inside the same mirrored column, because the edge follows the content.",
        table(rows, headings, true),
      ),
    );
    await tab.screenshot({ path: path.join(OUT_DIR, "rtl-after.png"), fullPage: true });

    console.log(`Wrote ${path.relative(process.cwd(), OUT_DIR)}/rtl-{before,after}.png`);
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
