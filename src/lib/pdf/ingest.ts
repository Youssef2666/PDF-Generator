/**
 * Storing uploads, finding a profile that fits, and turning a confirmed
 * table into draft rows.
 *
 * The upload directory is append-only by policy: extraction reads source
 * PDFs and nothing rewrites them, which is enforced for agents by
 * `.claude/hooks/protect-uploads.mjs`. Uploaded documents are the one thing
 * in this project that cannot be regenerated.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { applyProfile, type ExtractionResult } from "@/lib/pdf/deterministic";
import { extractText, type ExtractedPage } from "@/lib/pdf/extract-text";
import { parseProfile, type ExtractionProfile } from "@/lib/pdf/profile-schema";

function dataRoot(): string {
  return process.env.COURSE_REPORT_DATA_DIR ?? path.join(process.cwd(), "data");
}

export function getUploadsDir(): string {
  return path.join(dataRoot(), "uploads");
}

export function getProfilesDir(): string {
  return path.join(dataRoot(), "profiles");
}

/** Uploads are named by a generated id; the original filename is metadata. */
export interface StoredUpload {
  id: string;
  filename: string;
  bytes: number;
}

export async function storeUpload(data: Uint8Array, filename: string): Promise<StoredUpload> {
  const dir = getUploadsDir();
  await fs.mkdir(dir, { recursive: true });

  const id = randomUUID();
  await fs.writeFile(path.join(dir, `${id}.pdf`), data);
  await fs.writeFile(
    path.join(dir, `${id}.json`),
    `${JSON.stringify({ id, filename, bytes: data.byteLength }, null, 2)}\n`,
  );

  return { id, filename, bytes: data.byteLength };
}

export async function readUpload(id: string): Promise<Uint8Array | null> {
  // Ids are generated UUIDs; anything else is not ours to open.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    return new Uint8Array(await fs.readFile(path.join(getUploadsDir(), `${id}.pdf`)));
  } catch {
    return null;
  }
}

/**
 * Every committed profile: the ones saved for clients, plus the sample's,
 * so a fresh checkout can demonstrate extraction without setup.
 */
export async function loadCommittedProfiles(): Promise<ExtractionProfile[]> {
  const profiles: ExtractionProfile[] = [];

  const candidates: string[] = [path.join(process.cwd(), "fixtures", "attendance-sample.profile.json")];
  try {
    const dir = getProfilesDir();
    for (const name of await fs.readdir(dir)) {
      if (name.endsWith(".json")) candidates.push(path.join(dir, name));
    }
  } catch {
    // No saved profiles yet.
  }

  for (const file of candidates) {
    try {
      profiles.push(parseProfile(JSON.parse(await fs.readFile(file, "utf8"))));
    } catch {
      // A malformed profile must not stop the others being tried.
    }
  }
  return profiles;
}

export async function saveProfile(profile: ExtractionProfile): Promise<string> {
  const dir = getProfilesDir();
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${profile.id}.json`);
  await fs.writeFile(file, `${JSON.stringify(profile, null, 2)}\n`);
  return file;
}

export interface ProfileAttempt {
  profile: ExtractionProfile;
  result: ExtractionResult;
}

/**
 * Try every committed profile and return them ranked by confidence.
 *
 * Ranked rather than "first that works", because two profiles can both find
 * a header and one can be markedly better. The operator sees the winner and
 * confirms it either way.
 */
export function rankProfiles(
  pages: ExtractedPage[],
  profiles: ExtractionProfile[],
): ProfileAttempt[] {
  return profiles
    .map((profile) => ({ profile, result: applyProfile(pages, profile) }))
    .sort((a, b) => b.result.confidence - a.result.confidence);
}

export interface ExtractionAttemptSummary {
  pages: ExtractedPage[];
  best: ProfileAttempt | null;
  tried: number;
}

export async function extractWithCommittedProfiles(
  data: Uint8Array,
): Promise<ExtractionAttemptSummary> {
  const pages = await extractText(data);
  const profiles = await loadCommittedProfiles();
  const ranked = rankProfiles(pages, profiles);

  return {
    pages,
    best: ranked[0]?.result.participants.length ? ranked[0] : null,
    tried: profiles.length,
  };
}

// ---------------------------------------------------------------------------
// Into the draft
// ---------------------------------------------------------------------------

// The pure part lives in a node-free module so the review screen — a client
// component — can import it without dragging node:fs into the browser
// bundle. Re-exported so server-side callers have one import for the whole
// ingest path.
export { applyTableToDraft, type ConfirmedTable } from "@/lib/pdf/to-draft";
