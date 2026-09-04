// @vitest-environment happy-dom

/**
 * The autosave contract.
 *
 * M2's acceptance is "close the browser at any point and lose nothing", and
 * with a 500ms debounce there is nearly always an edit in flight. These
 * tests cover the paths where work actually gets lost: a debounce that never
 * fires, a tab closed mid-timer, and a slow save response landing on top of
 * something the user typed while it was travelling.
 */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DraftProvider, useDraft } from "@/components/draft-provider";
import { createEmptyDraft } from "@/lib/empty-draft";
import type { Draft } from "@/lib/schema";

const base = createEmptyDraft(new Date("2026-05-01T00:00:00.000Z"));

/** A fetch stand-in that records PUTs and echoes a recomputed-looking draft. */
function mockFetch(options: { initial?: Draft | null; putDelayMs?: number } = {}) {
  const puts: Draft[] = [];
  const keepalives: boolean[] = [];

  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    if (!init || init.method === undefined || init.method === "GET") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ draft: options.initial ?? base }),
      } as unknown as Response;
    }

    if (init.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Draft;
      puts.push(body);
      keepalives.push(Boolean(init.keepalive));
      if (options.putDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.putDelayMs));
      }
      // The server stamps updatedAt; mirror that so the client adopting the
      // response is observable.
      return {
        ok: true,
        status: 200,
        json: async () => ({ draft: { ...body, updatedAt: "2026-05-02T00:00:00.000Z" } }),
      } as unknown as Response;
    }

    return { ok: true, status: 200, json: async () => ({ deleted: true }) } as unknown as Response;
  });

  vi.stubGlobal("fetch", impl);
  return { puts, keepalives, impl };
}

/** Renders the provider and exposes its context to the test. */
function Probe() {
  const { draft, update, saveState, loading } = useDraft();
  return (
    <div>
      <span data-testid="state">{saveState}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="title">{draft?.course.titleAr ?? ""}</span>
      <span data-testid="updatedAt">{draft?.updatedAt ?? ""}</span>
      <button
        onClick={() => update((d) => ({ ...d, course: { ...d.course, titleAr: "دورة" } }))}
      >
        edit
      </button>
      <button
        onClick={() => update((d) => ({ ...d, course: { ...d.course, titleAr: "لاحق" } }))}
      >
        edit-again
      </button>
    </div>
  );
}

async function renderProvider() {
  render(
    <DraftProvider>
      <Probe />
    </DraftProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  // Vitest is not running with `globals: true`, so RTL's automatic cleanup
  // is not installed. Without this, each render stays mounted and
  // getByTestId matches several nodes at once.
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DraftProvider autosave", () => {
  it("loads the draft on mount", async () => {
    mockFetch();
    await renderProvider();

    expect(screen.getByTestId("title").textContent).toBe("");
    expect(screen.getByTestId("state").textContent).toBe("idle");
  });

  it("marks an edit pending immediately and saves after the debounce", async () => {
    const { puts } = mockFetch();
    await renderProvider();

    act(() => screen.getByText("edit").click());

    // Visible at once, and not yet saved.
    expect(screen.getByTestId("title").textContent).toBe("دورة");
    expect(screen.getByTestId("state").textContent).toBe("pending");
    expect(puts).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].course.titleAr).toBe("دورة");
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("saved"));
  });

  it("coalesces rapid edits into one save", async () => {
    const { puts } = mockFetch();
    await renderProvider();

    act(() => screen.getByText("edit").click());
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    act(() => screen.getByText("edit-again").click());
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(puts).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].course.titleAr).toBe("لاحق");
  });

  it("adopts the server's copy once it lands", async () => {
    mockFetch();
    await renderProvider();

    act(() => screen.getByText("edit").click());
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await waitFor(() =>
      expect(screen.getByTestId("updatedAt").textContent).toBe("2026-05-02T00:00:00.000Z"),
    );
  });

  it("does not let a slow save overwrite an edit made while it was in flight", async () => {
    const { puts } = mockFetch({ putDelayMs: 300 });
    await renderProvider();

    act(() => screen.getByText("edit").click());
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    // The PUT is now travelling. Type again before it returns.
    act(() => screen.getByText("edit-again").click());

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // The later edit survives; the stale response was discarded.
    await waitFor(() => expect(screen.getByTestId("title").textContent).toBe("لاحق"));
    await waitFor(() => expect(puts.length).toBeGreaterThanOrEqual(2));
    expect(puts[puts.length - 1].course.titleAr).toBe("لاحق");
  });

  it("flushes a pending edit when the page is hidden", async () => {
    const { puts, keepalives } = mockFetch();
    await renderProvider();

    act(() => screen.getByText("edit").click());
    expect(puts).toHaveLength(0);

    // Tab closed / navigated away before the 500ms timer fires.
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].course.titleAr).toBe("دورة");
    // keepalive is what lets the request outlive the page.
    expect(keepalives[0]).toBe(true);
  });

  it("does not fire a flush when there is nothing pending", async () => {
    const { puts } = mockFetch();
    await renderProvider();

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(puts).toHaveLength(0);
  });

  it("surfaces a rejected save without discarding the edit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (!init || init.method === "GET" || init.method === undefined) {
          return { ok: true, status: 200, json: async () => ({ draft: base }) } as Response;
        }
        return {
          ok: false,
          status: 422,
          json: async () => ({ error: "Draft failed validation", summary: "course: bad" }),
        } as Response;
      }),
    );

    await renderProvider();
    act(() => screen.getByText("edit").click());
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("error"));
    // The user's text is still on screen — a failed save must not roll back.
    expect(screen.getByTestId("title").textContent).toBe("دورة");
  });

  it("recomputes derived values locally so the screen is never stale", async () => {
    mockFetch();

    function ComputedProbe() {
      const { draft, update, loading } = useDraft();
      return (
        <div>
          <span data-testid="loading">{String(loading)}</span>
          <span data-testid="hours">{draft?.computed.totalHours ?? -1}</span>
          <button
            onClick={() =>
              update((d) => ({
                ...d,
                sessions: [
                  {
                    id: "s1",
                    index: 1,
                    date: "2026-05-01",
                    startTime: "09:00",
                    endTime: "12:00",
                    durationHours: 3,
                    topicAr: "",
                    topicEn: null,
                  },
                ],
              }))
            }
          >
            add-session
          </button>
        </div>
      );
    }

    render(
      <DraftProvider>
        <ComputedProbe />
      </DraftProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    expect(screen.getByTestId("hours").textContent).toBe("0");
    act(() => screen.getByText("add-session").click());

    // Updated before any network round trip, by the same compute.ts the
    // server runs.
    expect(screen.getByTestId("hours").textContent).toBe("3");
  });
});
