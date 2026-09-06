/**
 * Finalize.
 *
 * The tests that matter here are the failure ones. A successful export is
 * easy; what has to be guaranteed is that a *failed* export leaves the draft
 * and the output directory exactly as they were, because the draft is the
 * only copy of hours of manual entry.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ChecklistError,
  ExportError,
  exportPackage,
  getOutputRoot,
  PACKAGE_FILES,
  packageDirName,
  slugify,
} from "@/lib/export-package";
import { recomputeDraft } from "@/lib/compute";
import { DraftSchema, type Draft } from "@/lib/schema";
import demo from "../../fixtures/demo-draft.json";

const draft: Draft = DraftSchema.parse(demo);
const NOW = new Date("2026-03-15T09:00:00.000Z");

let scratch: string;

beforeEach(async () => {
  scratch = await fs.mkdtemp(path.join(os.tmpdir(), "crs-out-"));
  process.env.COURSE_REPORT_OUTPUT_DIR = scratch;
});

afterEach(async () => {
  delete process.env.COURSE_REPORT_OUTPUT_DIR;
  await fs.rm(scratch, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const listOutput = async () => (await fs.readdir(scratch)).sort();

describe("slugify", () => {
  it("prefers plain ASCII", () => {
    expect(slugify("Al-Jabal Al-Akhdar Industries")).toBe("al-jabal-al-akhdar-industries");
    expect(slugify("Modern Managerial Leadership Skills")).toBe(
      "modern-managerial-leadership-skills",
    );
  });

  it("keeps Arabic letters rather than producing an empty slug", () => {
    // An all-Arabic client would otherwise slug to "" and every export would
    // collide on the same directory name.
    expect(slugify("شركة الجبل الأخضر للصناعات")).toContain("شركة");
  });

  it("trims separators and length", () => {
    expect(slugify("  --Hello, World!!  ")).toBe("hello-world");
    expect(slugify("x".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe("packageDirName", () => {
  it("is <date>-<client>-<course>", () => {
    expect(packageDirName(draft, NOW)).toBe(
      "2026-03-15-al-jabal-al-akhdar-industries-modern-managerial-leadership-skills",
    );
  });

  it("falls back to the Arabic name when there is no Latin one", () => {
    const arabicOnly = { ...draft, course: { ...draft.course, clientNameEn: null } };
    expect(packageDirName(arabicOnly, NOW)).toContain("شركة");
  });

  it("falls back again when there is no name at all", () => {
    const nameless = {
      ...draft,
      course: { ...draft.course, clientNameEn: null, clientNameAr: "", titleEn: null, titleAr: "" },
    };
    expect(packageDirName(nameless, NOW)).toBe("2026-03-15-client-course");
  });
});

describe("exportPackage", () => {
  it("writes all four files", async () => {
    const result = await exportPackage(draft, undefined, NOW);

    expect(result.files).toEqual([
      PACKAGE_FILES.docx,
      PACKAGE_FILES.xlsx,
      PACKAGE_FILES.pptx,
      PACKAGE_FILES.json,
    ]);

    const written = (await fs.readdir(result.directory)).sort();
    expect(written).toEqual(
      [
        PACKAGE_FILES.docx,
        PACKAGE_FILES.xlsx,
        PACKAGE_FILES.pptx,
        PACKAGE_FILES.json,
      ].sort(),
    );

    for (const file of written) {
      const stat = await fs.stat(path.join(result.directory, file));
      expect(stat.size, `${file} should not be empty`).toBeGreaterThan(0);
    }
  });

  it("writes report-data.json carrying the whole draft and the profile", async () => {
    const result = await exportPackage(draft, undefined, NOW);
    const json = JSON.parse(
      await fs.readFile(path.join(result.directory, PACKAGE_FILES.json), "utf8"),
    );

    expect(json.generatedAt).toBe(NOW.toISOString());
    expect(json.draft.id).toBe(draft.id);
    expect(json.draft.participants).toHaveLength(8);
    expect(json.profile.fonts.arabic).toBeTruthy();
    expect(json.files).toHaveLength(3);
  });

  it("names the directory after the date, client and course", async () => {
    const result = await exportPackage(draft, undefined, NOW);
    expect(result.name).toBe(packageDirName(draft, NOW));
  });

  it("does not overwrite an existing package for the same day", async () => {
    const first = await exportPackage(draft, undefined, NOW);
    const second = await exportPackage(draft, undefined, NOW);

    expect(second.directory).not.toBe(first.directory);
    expect(second.name).toBe(`${first.name}-2`);
    expect(await listOutput()).toHaveLength(2);
  });

  // --- refusals ------------------------------------------------------------

  it("refuses a draft that fails the checklist, and writes nothing", async () => {
    const incomplete = recomputeDraft({
      ...draft,
      narrative: { ...draft.narrative, conclusion: "" },
    });

    await expect(exportPackage(incomplete, undefined, NOW)).rejects.toBeInstanceOf(
      ChecklistError,
    );
    expect(await listOutput()).toEqual([]);
  });

  it("lists which checklist items failed", async () => {
    const incomplete = recomputeDraft({ ...draft, participants: [] });

    try {
      await exportPackage(incomplete, undefined, NOW);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ChecklistError);
      expect((error as ChecklistError).failing.length).toBeGreaterThan(0);
      expect((error as ChecklistError).failing.join(" ")).toContain("participant");
    }
  });

  // --- the guarantee that matters ------------------------------------------

  it("names the failing section and writes nothing when a renderer throws", async () => {
    const pptx = await import("@/render/pptx");
    vi.spyOn(pptx, "renderPptx").mockRejectedValue(new Error("chart blew up"));

    try {
      await exportPackage(draft, undefined, NOW);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ExportError);
      expect((error as ExportError).section).toBe("PowerPoint deck");
      expect((error as ExportError).message).toContain("chart blew up");
    }

    // The critical assertion: the Word and Excel renders that already
    // succeeded were held in memory, so nothing reached disk.
    expect(await listOutput()).toEqual([]);
  });

  it("leaves no partial directory when a write fails midway", async () => {
    const realWriteFile = fs.writeFile;
    let calls = 0;
    vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 3) throw new Error("disk full");
      return realWriteFile(...(args as Parameters<typeof fs.writeFile>));
    });

    await expect(exportPackage(draft, undefined, NOW)).rejects.toBeInstanceOf(ExportError);

    // The half-written directory is removed rather than left behind looking
    // like a delivery.
    expect(await listOutput()).toEqual([]);
  });

  it("reports the first renderer to fail, not the last", async () => {
    const docx = await import("@/render/docx");
    const pptx = await import("@/render/pptx");
    vi.spyOn(docx, "renderDocx").mockRejectedValue(new Error("first"));
    vi.spyOn(pptx, "renderPptx").mockRejectedValue(new Error("second"));

    try {
      await exportPackage(draft, undefined, NOW);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ExportError).section).toBe("Word report");
    }
  });

  it("uses the output root override", () => {
    expect(getOutputRoot()).toBe(scratch);
  });
});
