// @vitest-environment happy-dom

/**
 * A real screen, mounted and driven.
 *
 * The provider tests cover saving in isolation; this covers the other half
 * of M2's acceptance — that a screen actually renders against a draft, that
 * typing into it reaches the draft, and that the bulk session generator
 * produces what the schema and compute layer expect.
 *
 * Course setup is the screen chosen because it has no router dependency, so
 * it exercises the editing path without mocking Next's navigation.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CoursePage from "./page";
import { DraftProvider, useDraft } from "@/components/draft-provider";
import { createEmptyDraft } from "@/lib/empty-draft";
import type { Draft } from "@/lib/schema";

/**
 * Screens use useLoadedDraft(), which throws when no draft is loaded — they
 * are only ever mounted inside StudioShell, which does not render its
 * children until the draft has arrived. This stands in for that gate so the
 * test does not have to pull in Next's router for a screen that has none.
 */
function Gate({ children }: { children: React.ReactNode }) {
  const { draft } = useDraft();
  return draft ? <>{children}</> : null;
}

let saved: Draft[] = [];

function mockFetch(initial: Draft) {
  saved = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") {
        return { ok: true, status: 200, json: async () => ({ draft: initial }) } as Response;
      }
      const body = JSON.parse(String(init.body)) as Draft;
      saved.push(body);
      return { ok: true, status: 200, json: async () => ({ draft: body }) } as Response;
    }),
  );
}

async function mount(initial = createEmptyDraft(new Date("2026-05-01T00:00:00.000Z"))) {
  mockFetch(initial);
  render(
    <DraftProvider>
      <Gate>
        <CoursePage />
      </Gate>
    </DraftProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText("Course title (Arabic)")).toBeTruthy());
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Course setup screen", () => {
  it("renders against an empty draft without crashing", async () => {
    await mount();

    expect(screen.getByText("No sessions yet.")).toBeTruthy();
    expect((screen.getByLabelText("Course title (Arabic)") as HTMLInputElement).value).toBe("");
  });

  it("gives Arabic fields dir=rtl and mixed fields dir=auto", async () => {
    await mount();

    expect(screen.getByLabelText("Course title (Arabic)").getAttribute("dir")).toBe("rtl");
    expect(screen.getByLabelText("Client (Arabic)").getAttribute("dir")).toBe("rtl");
    expect(screen.getByLabelText("Trainer (Arabic)").getAttribute("dir")).toBe("rtl");

    // Venue and the Latin name fields take whatever is typed.
    expect(screen.getByLabelText("Venue").getAttribute("dir")).toBe("auto");
    expect(screen.getByLabelText("Course title (English)").getAttribute("dir")).toBe("auto");

    // Dates are never prose.
    expect(screen.getByLabelText("Start date").getAttribute("dir")).toBe("ltr");
  });

  it("carries a typed Arabic title into the saved draft", async () => {
    await mount();

    fireEvent.change(screen.getByLabelText("Course title (Arabic)"), {
      target: { value: "مهارات القيادة" },
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await waitFor(() => expect(saved.length).toBeGreaterThan(0));
    expect(saved[saved.length - 1].course.titleAr).toBe("مهارات القيادة");
  });

  it("generates one session per weekday across the course dates", async () => {
    await mount();

    // 2026-02-08 is a Sunday; 2026-02-12 a Thursday. Fri/Sat are skipped, so
    // the whole range is working days: five sessions.
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-02-08" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-02-12" } });

    await waitFor(() => expect(screen.getByText("Generate 5 sessions")).toBeTruthy());
    fireEvent.click(screen.getByText("Generate 5 sessions"));

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await waitFor(() => expect(saved.length).toBeGreaterThan(0));
    const latest = saved[saved.length - 1];
    expect(latest.sessions).toHaveLength(5);
    expect(latest.sessions.map((s) => s.date)).toEqual([
      "2026-02-08",
      "2026-02-09",
      "2026-02-10",
      "2026-02-11",
      "2026-02-12",
    ]);
    // 09:00-12:00 is three credited hours each, and compute.ts totals them.
    expect(latest.sessions.every((s) => s.durationHours === 3)).toBe(true);
    expect(latest.computed.totalHours).toBe(15);
    // Indexes are contiguous, which every renderer relies on.
    expect(latest.sessions.map((s) => s.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it("excludes Friday and Saturday when asked to", async () => {
    await mount();

    // 2026-02-08 (Sun) to 2026-02-15 (Sun) spans one Fri and one Sat.
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-02-08" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-02-15" } });

    await waitFor(() => expect(screen.getByText("Generate 6 sessions")).toBeTruthy());

    // Unchecking includes the full eight days.
    fireEvent.click(screen.getByLabelText("Skip Fri/Sat"));
    await waitFor(() => expect(screen.getByText("Generate 8 sessions")).toBeTruthy());
  });

  it("shows the stored total hours rather than recomputing them in the view", async () => {
    await mount();

    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-02-08" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-02-10" } });
    await waitFor(() => expect(screen.getByText("Generate 3 sessions")).toBeTruthy());
    fireEvent.click(screen.getByText("Generate 3 sessions"));

    // 3 sessions x 3h, straight out of draft.computed.
    await waitFor(() => expect(screen.getByText(/3 sessions · 9 hours/)).toBeTruthy());
  });
});
