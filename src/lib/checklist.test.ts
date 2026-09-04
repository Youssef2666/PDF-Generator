/**
 * The finalize gate (F7). These tests matter more than their size suggests:
 * `ready` is what decides whether an export is allowed to run, so a rule that
 * silently stops firing would let an incomplete report through.
 */

import { describe, expect, it } from "vitest";

import { computeChecklist, recomputeDraft } from "@/lib/compute";
import { DraftSchema, type Draft } from "@/lib/schema";
import demo from "../../fixtures/demo-draft.json";

const complete = recomputeDraft(DraftSchema.parse(demo));

/** Apply a change to the fixture and recompute, as the store would. */
function variant(mutate: (draft: Draft) => void): Draft {
  const copy = DraftSchema.parse(JSON.parse(JSON.stringify(demo)));
  mutate(copy);
  return recomputeDraft(copy);
}

const idsFailing = (draft: Draft) =>
  computeChecklist(draft)
    .items.filter((i) => i.status === "fail")
    .map((i) => i.id);

describe("computeChecklist", () => {
  it("passes cleanly on the demo fixture", () => {
    const result = computeChecklist(complete);

    expect(idsFailing(complete)).toEqual([]);
    expect(result.ready).toBe(true);
    expect(result.requiredFailing).toBe(0);
    expect(result.advisoryFailing).toBe(0);
  });

  it("blocks an empty draft on every required rule", () => {
    const empty = recomputeDraft(
      DraftSchema.parse({
        schemaVersion: 1,
        id: "empty",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        course: {},
        survey: {},
        narrative: {},
        provenance: {},
      }),
    );

    const result = computeChecklist(empty);
    expect(result.ready).toBe(false);
    expect(result.requiredFailing).toBeGreaterThan(5);
  });

  it("catches an incomplete attendance matrix", () => {
    const draft = variant((d) => {
      delete d.participants[0].attendance.s3;
    });

    const item = computeChecklist(draft).items.find((i) => i.id === "attendance-complete");
    expect(item?.status).toBe("fail");
    expect(item?.detail).toContain("1 of 40");
    expect(computeChecklist(draft).ready).toBe(false);
  });

  it("catches grade weights that do not total 100", () => {
    const draft = variant((d) => {
      d.gradeColumns[0].weight = 25;
    });

    const item = computeChecklist(draft).items.find((i) => i.id === "grades-weights");
    expect(item?.status).toBe("fail");
    expect(item?.detail).toContain("105");
  });

  it("catches an unmarked participant, and the incomplete outcome it causes", () => {
    const draft = variant((d) => {
      d.participants[3].grades.g2 = null;
    });

    expect(idsFailing(draft)).toEqual(
      expect.arrayContaining(["grades-complete", "outcomes-decided"]),
    );
  });

  it("catches an empty narrative section", () => {
    const draft = variant((d) => {
      d.narrative.recommendations = "   ";
    });

    const item = computeChecklist(draft).items.find((i) => i.id === "narrative-complete");
    expect(item?.status).toBe("fail");
    expect(item?.detail).toContain("Recommendations");
  });

  it("catches dates that are out of order", () => {
    const draft = variant((d) => {
      d.course.endDate = "2026-02-01";
    });

    const item = computeChecklist(draft).items.find((i) => i.id === "course-dates");
    expect(item?.status).toBe("fail");
    expect(item?.detail).toContain("before the start date");
  });

  it("names exactly which Arabic identity fields are missing", () => {
    const draft = variant((d) => {
      d.course.titleAr = "";
      d.course.trainerNameAr = "";
    });

    const item = computeChecklist(draft).items.find((i) => i.id === "course-identity");
    expect(item?.detail).toContain("Arabic course title");
    expect(item?.detail).toContain("Arabic trainer name");
    expect(item?.detail).not.toContain("client");
  });

  it("reports an unanswered survey question without blocking finalize", () => {
    const draft = variant((d) => {
      d.survey.questions[2].tally = [0, 0, 0, 0, 0];
    });

    const result = computeChecklist(draft);
    const item = result.items.find((i) => i.id === "survey-answered");

    expect(item?.status).toBe("fail");
    expect(item?.required).toBe(false);
    // Advisory: reported, but the report can still be finalized.
    expect(result.ready).toBe(true);
    expect(result.advisoryFailing).toBe(1);
  });

  it("treats a missing job title as advisory, not blocking", () => {
    const draft = variant((d) => {
      d.participants[1].jobTitle = "";
    });

    const result = computeChecklist(draft);
    expect(result.items.find((i) => i.id === "participants-roles")?.status).toBe("fail");
    expect(result.ready).toBe(true);
  });

  it("does not let an override paper over an unmarked column", () => {
    // The override decides the outcome, but the draft is still not fully
    // marked, and the grades rule must keep saying so.
    const draft = variant((d) => {
      d.participants[0].grades.g3 = null;
      d.participants[0].outcomeOverride = "passed";
    });

    const result = computeChecklist(draft);
    expect(result.items.find((i) => i.id === "grades-complete")?.status).toBe("fail");
    expect(result.items.find((i) => i.id === "outcomes-decided")?.status).toBe("pass");
    expect(result.ready).toBe(false);
  });

  it("routes every item to a screen that can fix it", () => {
    const sections = new Set(computeChecklist(complete).items.map((i) => i.section));
    expect([...sections].sort()).toEqual([
      "course",
      "grades",
      "narrative",
      "participants",
      "survey",
    ]);
  });
});
