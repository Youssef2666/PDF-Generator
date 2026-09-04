import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createEmptyDraft,
  deleteDraft,
  DraftValidationError,
  getDraftDir,
  getDraftPath,
  prepareDraft,
  readDraft,
  writeDraft,
} from "@/lib/draft-store";
import { SCHEMA_VERSION } from "@/lib/schema";

// Every test runs against a scratch data root, so a real in-progress draft in
// data/drafts/ can never be read or destroyed by the suite.
let scratch: string;

beforeEach(async () => {
  scratch = await fs.mkdtemp(path.join(os.tmpdir(), "crs-store-"));
  process.env.COURSE_REPORT_DATA_DIR = scratch;
});

afterEach(async () => {
  delete process.env.COURSE_REPORT_DATA_DIR;
  await fs.rm(scratch, { recursive: true, force: true });
});

/** Files sitting in the drafts directory, sorted. */
async function draftDirEntries(): Promise<string[]> {
  try {
    return (await fs.readdir(getDraftDir())).sort();
  } catch {
    return [];
  }
}

describe("path resolution", () => {
  it("honours COURSE_REPORT_DATA_DIR", () => {
    expect(getDraftPath()).toBe(path.join(scratch, "drafts", "current.json"));
  });
});

describe("createEmptyDraft", () => {
  it("produces a draft that already satisfies the schema", () => {
    const draft = createEmptyDraft(new Date("2026-03-01T10:00:00.000Z"));

    expect(draft.schemaVersion).toBe(SCHEMA_VERSION);
    expect(draft.id).not.toHaveLength(0);
    expect(draft.participants).toEqual([]);
    expect(draft.computed.totalHours).toBe(0);
    expect(draft.updatedAt).toBe("2026-03-01T10:00:00.000Z");
  });
});

describe("readDraft", () => {
  it("returns null when no draft exists", async () => {
    await expect(readDraft()).resolves.toBeNull();
  });

  it("round-trips a written draft", async () => {
    const written = await writeDraft(createEmptyDraft());
    await expect(readDraft()).resolves.toEqual(written);
  });

  it("throws rather than reporting 'no draft' for malformed JSON", async () => {
    await fs.mkdir(getDraftDir(), { recursive: true });
    await fs.writeFile(getDraftPath(), "{ not json", "utf8");

    await expect(readDraft()).rejects.toBeInstanceOf(DraftValidationError);
  });

  it("throws for JSON that is not a draft", async () => {
    await fs.mkdir(getDraftDir(), { recursive: true });
    await fs.writeFile(getDraftPath(), JSON.stringify({ hello: "world" }), "utf8");

    await expect(readDraft()).rejects.toBeInstanceOf(DraftValidationError);
  });
});

describe("writeDraft", () => {
  it("recomputes before storing, so the file never holds a stale figure", async () => {
    const draft = createEmptyDraft();
    // A caller sends a deliberately wrong computed block.
    const tampered = {
      ...draft,
      sessions: [
        {
          id: "s1",
          index: 1,
          date: "2026-01-05",
          startTime: "09:00",
          endTime: "12:00",
          durationHours: 3,
          topicAr: "",
          topicEn: null,
        },
      ],
      computed: { ...draft.computed, totalHours: 999 },
    };

    const stored = await writeDraft(tampered);
    expect(stored.computed.totalHours).toBe(3);

    const onDisk = JSON.parse(await fs.readFile(getDraftPath(), "utf8"));
    expect(onDisk.computed.totalHours).toBe(3);
  });

  it("stamps updatedAt", async () => {
    const stored = await writeDraft(createEmptyDraft(), new Date("2026-04-02T08:30:00.000Z"));
    expect(stored.updatedAt).toBe("2026-04-02T08:30:00.000Z");
  });

  it("throws and writes nothing when the input is invalid", async () => {
    const invalid = { ...createEmptyDraft(), schemaVersion: 999 };

    await expect(writeDraft(invalid)).rejects.toBeInstanceOf(DraftValidationError);
    await expect(readDraft()).resolves.toBeNull();
    expect(await draftDirEntries()).toEqual([]);
  });

  it("leaves an existing draft untouched when a later write is invalid", async () => {
    const good = await writeDraft(createEmptyDraft());

    await expect(writeDraft({ garbage: true })).rejects.toBeInstanceOf(DraftValidationError);

    await expect(readDraft()).resolves.toEqual(good);
  });

  it("leaves no temporary file behind", async () => {
    await writeDraft(createEmptyDraft());
    expect(await draftDirEntries()).toEqual(["current.json"]);
  });

  it("creates the drafts directory if it is missing", async () => {
    await fs.rm(getDraftDir(), { recursive: true, force: true });
    await writeDraft(createEmptyDraft());
    await expect(readDraft()).resolves.not.toBeNull();
  });

  it("serialises concurrent writes without interleaving", async () => {
    const base = createEmptyDraft();
    const writes = Array.from({ length: 12 }, (_, i) =>
      writeDraft({ ...base, course: { ...base.course, titleAr: `دورة ${i}` } }),
    );

    await Promise.all(writes);

    // Whichever won, the file is one complete valid draft and no tmp files
    // are left over.
    const draft = await readDraft();
    expect(draft).not.toBeNull();
    expect(draft?.course.titleAr).toMatch(/^دورة \d+$/);
    expect(await draftDirEntries()).toEqual(["current.json"]);
  });
});

describe("deleteDraft", () => {
  it("removes the draft and reports that it did", async () => {
    await writeDraft(createEmptyDraft());

    await expect(deleteDraft()).resolves.toBe(true);
    await expect(readDraft()).resolves.toBeNull();
  });

  it("reports false when there was nothing to remove", async () => {
    await expect(deleteDraft()).resolves.toBe(false);
  });
});

describe("prepareDraft", () => {
  it("validates without touching the filesystem", async () => {
    expect(() => prepareDraft({ nope: true })).toThrow(DraftValidationError);
    expect(await draftDirEntries()).toEqual([]);
  });

  it("carries a one-line summary on the error", () => {
    try {
      prepareDraft({ schemaVersion: 1, id: "", createdAt: "nope", updatedAt: "nope" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(DraftValidationError);
      const summary = (error as DraftValidationError).summary;
      expect(summary).toContain("id");
      expect(summary).not.toContain("\n");
    }
  });
});
