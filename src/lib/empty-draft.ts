/**
 * Builds a new, empty draft.
 *
 * This lives apart from draft-store.ts because the store imports node:fs and
 * therefore cannot be pulled into a browser bundle — but the editor needs to
 * be able to start a report, and "what an empty draft looks like" must have
 * exactly one definition regardless of which side asks. The store imports
 * this module and re-exports it, so server and client build the same object.
 */

import { recomputeDraft } from "@/lib/compute";
import { DraftSchema, SCHEMA_VERSION, type Draft } from "@/lib/schema";

/** crypto.randomUUID is standard in both Node 22+ and every target browser. */
function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** A valid, empty draft: the starting point for a new report. */
export function createEmptyDraft(now: Date = new Date()): Draft {
  const timestamp = now.toISOString();
  return recomputeDraft(
    DraftSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: newId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      course: {},
      sessions: [],
      gradeColumns: [],
      participants: [],
      survey: {},
      narrative: {},
      provenance: {},
    }),
  );
}

/** Stable, collision-resistant ids for rows the editor creates. */
export function newRowId(prefix: string): string {
  return `${prefix}_${newId().slice(0, 8)}`;
}
