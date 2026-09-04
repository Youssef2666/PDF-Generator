/**
 * The only code that touches data/drafts/current.json.
 *
 * Three guarantees, in order of importance:
 *
 *   1. A write either lands whole or does not land at all. The draft is
 *      written to a uniquely named temporary file in the same directory and
 *      then renamed over the target. Rename within a directory is atomic, so
 *      a crash mid-write leaves the previous draft intact rather than a
 *      half-serialised file. A browser that autosaves every 500ms will
 *      eventually be interrupted mid-write; this is what makes that safe.
 *
 *   2. Nothing invalid is ever persisted. Every write parses through
 *      DraftSchema and runs recomputeDraft() before a byte is written. A
 *      failing parse throws and writes nothing — the temporary file is
 *      removed and the existing draft is untouched.
 *
 *   3. Concurrent writes do not interleave. Calls are serialised through a
 *      promise chain, so the last writer wins cleanly instead of two writers
 *      racing between the same tmp path and rename.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { recomputeDraft } from "@/lib/compute";
import { DraftSchema, summariseZodError, type Draft } from "@/lib/schema";

/**
 * Where drafts live. Resolved per call rather than frozen at import time so
 * that COURSE_REPORT_DATA_DIR can redirect it — the tests point it at a
 * scratch directory, which is the only reason a test run cannot destroy a
 * real in-progress draft. In normal operation the variable is unset and this
 * is data/drafts under the project root.
 */
export function getDraftDir(): string {
  const root = process.env.COURSE_REPORT_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(root, "drafts");
}

export function getDraftPath(): string {
  return path.join(getDraftDir(), "current.json");
}

/**
 * Thrown when a draft fails to parse, on the way in or on the way out.
 * Carries a one-line summary suitable for an API body or a hook `reason`.
 */
export class DraftValidationError extends Error {
  readonly summary: string;

  constructor(summary: string) {
    super(`Draft failed validation: ${summary}`);
    this.name = "DraftValidationError";
    this.summary = summary;
  }
}

/** Serialises writes and deletes so two callers cannot interleave. */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation, operation);
  // Keep the chain alive regardless of this operation's outcome, without
  // creating an unhandled rejection on the internal handle.
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

/**
 * Validate, recompute and stamp. Shared by writeDraft() and by anything that
 * needs to know whether a value would be storable without storing it.
 */
export function prepareDraft(input: unknown, now: Date = new Date()): Draft {
  const parsed = DraftSchema.safeParse(input);
  if (!parsed.success) {
    throw new DraftValidationError(summariseZodError(parsed.error));
  }
  // The store owns updatedAt; recomputeDraft is pure and deliberately will
  // not stamp it.
  return { ...recomputeDraft(parsed.data), updatedAt: now.toISOString() };
}

// Re-exported so server-side callers have one obvious import for the whole
// draft lifecycle. The implementation lives in a node-free module because the
// editor needs it too — see empty-draft.ts.
export { createEmptyDraft } from "@/lib/empty-draft";

/**
 * The current draft, or null when there is none.
 *
 * A file that exists but does not parse throws rather than returning null.
 * Silently reporting "no draft" for a corrupt one would invite the editor to
 * start a fresh draft straight over the top of it.
 */
export async function readDraft(): Promise<Draft | null> {
  let raw: string;
  try {
    raw = await fs.readFile(getDraftPath(), "utf8");
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new DraftValidationError(
      `not valid JSON (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  const parsed = DraftSchema.safeParse(json);
  if (!parsed.success) {
    throw new DraftValidationError(summariseZodError(parsed.error));
  }
  return parsed.data;
}

/**
 * Validate, recompute, and persist atomically. Returns the draft as stored,
 * so a caller never has to guess what the computed fields became.
 *
 * Throws DraftValidationError before any filesystem work if the input is not
 * a valid draft.
 */
export async function writeDraft(input: unknown, now: Date = new Date()): Promise<Draft> {
  // Validate before touching the disk, so an invalid write cannot even
  // create a temporary file.
  const draft = prepareDraft(input, now);
  const serialised = `${JSON.stringify(draft, null, 2)}\n`;

  return enqueue(async () => {
    const draftDir = getDraftDir();
    await fs.mkdir(draftDir, { recursive: true });

    // Unique per attempt: two processes writing at once must not share a
    // temporary path, or one truncates the other's file before the rename.
    const tmpPath = path.join(draftDir, `current.json.${process.pid}.${randomUUID()}.tmp`);

    let handle: fs.FileHandle | undefined;
    try {
      handle = await fs.open(tmpPath, "w");
      await handle.writeFile(serialised, "utf8");
      // Flush before the rename, so the rename cannot expose a file whose
      // contents are still only in the page cache.
      await handle.sync();
      await handle.close();
      handle = undefined;

      await fs.rename(tmpPath, getDraftPath());
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      await fs.rm(tmpPath, { force: true }).catch(() => undefined);
      throw error;
    }

    return draft;
  });
}

/** Remove the draft. Returns false when there was nothing to remove. */
export async function deleteDraft(): Promise<boolean> {
  return enqueue(async () => {
    try {
      await fs.unlink(getDraftPath());
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  });
}
