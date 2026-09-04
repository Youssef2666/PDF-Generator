/**
 * Turning a finished draft into a delivered package.
 *
 * The ordering rule that governs this file: **render everything before
 * writing anything, and delete the draft last.** A renderer that throws
 * halfway through must leave the working state exactly as it was — the draft
 * intact, the output directory absent — because the draft is the only copy
 * of hours of manual entry, and a partially written package is worse than no
 * package at all.
 *
 * So:
 *   1. render all three documents into memory
 *   2. only then create the directory and write
 *   3. if any write fails, remove the partial directory and rethrow
 *   4. the caller deletes the draft, and only on success
 */

import fs from "node:fs/promises";
import path from "node:path";

import { computeChecklist } from "@/lib/compute";
import type { Draft } from "@/lib/schema";
import { renderDocx } from "@/render/docx";
import { renderPptx } from "@/render/pptx";
import { renderXlsx } from "@/render/xlsx";
import { DEFAULT_PROFILE, type RenderProfile } from "@/render/profile";

/**
 * Carries which section failed, so the UI can say "PowerPoint" rather than
 * "export failed".
 */
export class ExportError extends Error {
  readonly section: string;

  constructor(section: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`${section} failed: ${reason}`);
    this.name = "ExportError";
    this.section = section;
    this.cause = cause;
  }
}

/** Thrown when the draft is not ready to finalize. */
export class ChecklistError extends Error {
  readonly failing: string[];

  constructor(failing: string[]) {
    super(`Checklist incomplete: ${failing.join("; ")}`);
    this.name = "ChecklistError";
    this.failing = failing;
  }
}

/**
 * Output root. Overridable so tests never write into the real output/
 * directory — the same seam the draft store uses.
 */
export function getOutputRoot(): string {
  return process.env.COURSE_REPORT_OUTPUT_DIR ?? path.join(process.cwd(), "output");
}

/**
 * A filesystem-safe slug.
 *
 * `\p{Letter}` keeps Arabic letters, so an all-Arabic client name still
 * produces a readable directory rather than an empty string. Latin is
 * preferred where the draft offers it, because an ASCII path is easier to
 * type, script against and paste into an email.
 */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Latin name if there is one, else the Arabic, else the fallback. */
function nameSlug(latin: string | null, arabic: string, fallback: string): string {
  return slugify(latin ?? "") || slugify(arabic) || fallback;
}

/** `<YYYY-MM-DD>-<client-slug>-<course-slug>`. */
export function packageDirName(draft: Draft, now: Date): string {
  const date = now.toISOString().slice(0, 10);
  const client = nameSlug(draft.course.clientNameEn, draft.course.clientNameAr, "client");
  const course = nameSlug(draft.course.titleEn, draft.course.titleAr, "course");
  return `${date}-${client}-${course}`;
}

/**
 * First directory name that does not already exist: `name`, `name-2`, ...
 *
 * Exporting the same course twice in a day must not overwrite the first
 * delivery. Silently replacing a package someone may already have sent is
 * the kind of data loss that is only discovered later.
 */
async function reserveDirectory(root: string, base: string): Promise<string> {
  for (let suffix = 1; suffix < 100; suffix += 1) {
    const name = suffix === 1 ? base : `${base}-${suffix}`;
    const candidate = path.join(root, name);
    try {
      await fs.mkdir(candidate, { recursive: false });
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error(`Could not find a free output directory for "${base}".`);
}

export interface ExportResult {
  /** Absolute path to the created directory. */
  directory: string;
  /** Path relative to the output root, for display. */
  name: string;
  /** File names written, in the order written. */
  files: string[];
}

export const PACKAGE_FILES = {
  docx: "report.docx",
  xlsx: "workbook.xlsx",
  pptx: "deck.pptx",
  json: "report-data.json",
} as const;

/**
 * Render, write, and report where it went.
 *
 * Does **not** delete the draft — the caller does that, and only after this
 * resolves. Keeping deletion outside means an export can be exercised in a
 * test without any draft existing at all.
 */
export async function exportPackage(
  draft: Draft,
  profile: RenderProfile = DEFAULT_PROFILE,
  now: Date = new Date(),
): Promise<ExportResult> {
  // --- gate ---------------------------------------------------------------
  // The button is disabled client-side, but the rule lives here too: a
  // request that arrives some other way must meet the same bar.
  const checklist = computeChecklist(draft);
  if (!checklist.ready) {
    throw new ChecklistError(
      checklist.items
        .filter((i) => i.required && i.status === "fail")
        .map((i) => `${i.label} — ${i.detail}`),
    );
  }

  // --- render everything first --------------------------------------------
  const rendered: Array<[string, Buffer]> = [];

  for (const [section, file, render] of [
    ["Word report", PACKAGE_FILES.docx, renderDocx],
    ["Excel workbook", PACKAGE_FILES.xlsx, renderXlsx],
    ["PowerPoint deck", PACKAGE_FILES.pptx, renderPptx],
  ] as const) {
    try {
      rendered.push([file, await render(draft, profile)]);
    } catch (error) {
      // Nothing has been written and nothing is deleted.
      throw new ExportError(section, error);
    }
  }

  const reportData = Buffer.from(
    `${JSON.stringify(
      {
        generatedAt: now.toISOString(),
        schemaVersion: draft.schemaVersion,
        profile,
        files: rendered.map(([name]) => name),
        draft,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  rendered.push([PACKAGE_FILES.json, reportData]);

  // --- write ---------------------------------------------------------------
  const root = getOutputRoot();
  await fs.mkdir(root, { recursive: true });
  const directory = await reserveDirectory(root, packageDirName(draft, now));

  try {
    for (const [name, buffer] of rendered) {
      await fs.writeFile(path.join(directory, name), buffer);
    }
  } catch (error) {
    // A half-written package is worse than none. Remove it and leave the
    // draft alone.
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw new ExportError("Writing the package", error);
  }

  return {
    directory,
    name: path.basename(directory),
    files: rendered.map(([name]) => name),
  };
}
