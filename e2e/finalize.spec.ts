/**
 * The one end-to-end test: empty draft in, three-document package out.
 *
 * It exercises the seams the unit tests deliberately mock — a real browser,
 * a real Next server, real autosave over HTTP, real renderers writing real
 * files. Everything in between is covered far more thoroughly elsewhere; the
 * point of this test is that the *whole* path is connected.
 *
 * The draft is seeded through the API rather than typed into forty form
 * fields. Typing is covered by the component tests; what is being checked
 * here is that a checklist-passing draft becomes a package on disk and the
 * draft is then gone.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

const DATA_DIR = path.join(process.cwd(), "e2e", ".tmp", "data");
const OUTPUT_DIR = path.join(process.cwd(), "e2e", ".tmp", "output");
const DRAFT = path.join(DATA_DIR, "drafts", "current.json");

async function readFixture() {
  return JSON.parse(
    await fs.readFile(path.join(process.cwd(), "fixtures", "demo-draft.json"), "utf8"),
  );
}

test.beforeEach(async () => {
  await fs.rm(path.join(process.cwd(), "e2e", ".tmp"), { recursive: true, force: true });
});

test("an empty draft becomes a three-document package", async ({ page, request }) => {
  // --- 1. nothing to begin with -------------------------------------------
  await page.goto("/course");
  await expect(page.getByText("No report in progress")).toBeVisible();
  await expect(fs.access(DRAFT)).rejects.toThrow();

  // --- 2. start a report ---------------------------------------------------
  await page.getByRole("button", { name: "Start a new report" }).click();
  await expect(page.getByLabel("Course title (Arabic)")).toBeVisible();

  // The editor is live: a typed value reaches the server.
  await page.getByLabel("Course title (Arabic)").fill("دورة اختبارية");
  await expect(page.getByTestId("save-indicator")).toHaveAttribute(
    "data-save-state",
    "saved",
  );

  // --- 3. fill it from the fixture ----------------------------------------
  const fixture = await readFixture();
  const put = await request.put("/api/draft", {
    data: { ...fixture, id: "e2e-draft" },
  });
  expect(put.ok()).toBeTruthy();

  // --- 4. the checklist agrees it is ready --------------------------------
  await page.goto("/review");
  const readiness = page.getByTestId("readiness");
  await expect(readiness).toHaveAttribute("data-ready", "true");
  await expect(readiness).toContainText("All required items pass");

  // Every required check passes, individually.
  for (const id of [
    "course-identity",
    "course-dates",
    "sessions-exist",
    "participants-exist",
    "attendance-complete",
    "grades-weights",
    "grades-complete",
    "outcomes-decided",
    "narrative-complete",
  ]) {
    await expect(page.getByTestId(`check-${id}`)).toHaveAttribute("data-status", "pass");
  }

  // --- 5. finalize ---------------------------------------------------------
  await page.getByRole("button", { name: "Finalize report" }).click();

  // Finalize deletes the draft, which returns the shell to its empty state.
  // The confirmation has to survive that — it carries the only reference to
  // where the files went.
  const confirmation = page.getByTestId("last-export");
  await expect(confirmation).toBeVisible({ timeout: 90_000 });
  await expect(confirmation).toContainText("Report finalized");
  await expect(confirmation).toContainText("report.docx");

  // --- 6. three documents and the data file, on disk ----------------------
  const directories = await fs.readdir(OUTPUT_DIR);
  expect(directories).toHaveLength(1);

  const packageDir = path.join(OUTPUT_DIR, directories[0]);
  const files = (await fs.readdir(packageDir)).sort();
  expect(files).toEqual([
    "deck.pptx",
    "report-data.json",
    "report.docx",
    "workbook.xlsx",
  ]);

  for (const file of files) {
    const stat = await fs.stat(path.join(packageDir, file));
    expect(stat.size, `${file} should not be empty`).toBeGreaterThan(1000);
  }

  // The package names itself after the date, client and course.
  expect(directories[0]).toMatch(/^\d{4}-\d{2}-\d{2}-al-ufuq-industries-/);

  // report-data.json carries the whole draft, for provenance.
  const reportData = JSON.parse(
    await fs.readFile(path.join(packageDir, "report-data.json"), "utf8"),
  );
  expect(reportData.draft.participants).toHaveLength(8);

  // --- 7. and the draft is gone -------------------------------------------
  await expect(fs.access(DRAFT)).rejects.toThrow();
  // The confirmation names the package it wrote, on the same screen that now
  // offers to start the next report.
  await expect(confirmation).toContainText(directories[0]);
  await expect(page.getByText("No report in progress")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a new report" })).toBeVisible();

  // A hard reload loses it — `lastExport` is session state, not persisted.
  // The files are on disk regardless, and the directory is named after the
  // date, client and course, so it stays findable.
  await page.reload();
  await expect(page.getByTestId("last-export")).toHaveCount(0);
});

test("an incomplete draft cannot be finalized", async ({ page, request }) => {
  const fixture = await readFixture();
  // Blank one narrative section: a required checklist item now fails.
  await request.put("/api/draft", {
    data: { ...fixture, narrative: { ...fixture.narrative, conclusion: "" } },
  });

  await page.goto("/review");
  await expect(page.getByTestId("readiness")).toHaveAttribute("data-ready", "false");
  await expect(page.getByTestId("check-narrative-complete")).toHaveAttribute(
    "data-status",
    "fail",
  );

  // The button is disabled rather than failing after the fact.
  await expect(page.getByRole("button", { name: "Checklist incomplete" })).toBeDisabled();

  // And the server refuses independently of the button.
  const response = await request.post("/api/export");
  expect(response.status()).toBe(422);
  expect((await response.json()).error).toContain("checklist is not complete");

  // Nothing was written and the draft survives.
  await expect(fs.access(OUTPUT_DIR)).rejects.toThrow();
  await expect(fs.access(DRAFT)).resolves.toBeUndefined();
});
