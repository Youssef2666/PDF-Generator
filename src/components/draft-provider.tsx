"use client";

/**
 * Holds the one draft the whole editor edits, and keeps it saved.
 *
 * State model, deliberately small: this is server state plus local form
 * state, held in a React context. There is no global state library, and
 * there is no second copy of the draft anywhere — every screen reads and
 * mutates this one object through `update()`.
 *
 * On derived values. The rule is that the UI never *implements* a
 * computation, and this respects it: `update()` runs the draft through
 * `recomputeDraft` — the identical function the server runs — so figures on
 * screen react immediately to an edit without any screen knowing a single
 * rule. The server's response is then adopted as authoritative. The UI
 * therefore always displays what compute.ts produces, never its own idea of
 * a total.
 *
 * On not losing work. A 500ms debounce means there is nearly always an
 * unsaved change in flight, so a plain debounce would lose the last edit
 * whenever a tab is closed mid-timer. The pending save is flushed on
 * pagehide and on the tab being hidden, using `keepalive` so the request
 * outlives the page.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { recomputeDraft } from "@/lib/compute";
import { createEmptyDraft } from "@/lib/empty-draft";
import type { Draft } from "@/lib/schema";

const DEBOUNCE_MS = 500;

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

interface DraftContextValue {
  draft: Draft | null;
  loading: boolean;
  /** Set when the draft could not be loaded or saved. */
  error: string | null;
  saveState: SaveState;
  lastSavedAt: Date | null;
  /** Apply a change. The mutator receives the current draft and returns a new one. */
  update: (mutate: (draft: Draft) => Draft) => void;
  /** Write any pending change now, and resolve when it has landed. */
  flush: () => Promise<void>;
  startNewDraft: () => Promise<void>;
  discardDraft: () => Promise<void>;
}

const DraftContext = createContext<DraftContextValue | null>(null);

export function useDraft(): DraftContextValue {
  const context = useContext(DraftContext);
  if (!context) throw new Error("useDraft must be used inside <DraftProvider>");
  return context;
}

/**
 * The draft, guaranteed non-null. For screens rendered inside the studio
 * layout, which already gates on the draft existing.
 */
export function useLoadedDraft(): DraftContextValue & { draft: Draft } {
  const context = useDraft();
  if (!context.draft) throw new Error("No draft loaded");
  return context as DraftContextValue & { draft: Draft };
}

async function putDraft(draft: Draft, keepalive = false): Promise<Draft> {
  const response = await fetch("/api/draft", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
    keepalive,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.summary ?? body?.error ?? `Save failed (HTTP ${response.status})`);
  }
  return body.draft as Draft;
}

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // The newest draft, readable from timers and event handlers that close over
  // a stale render.
  const latest = useRef<Draft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Incremented on every local edit. A save response is only adopted if no
  // edit happened while it was in flight, so the server's copy can never
  // overwrite something the user typed a moment ago.
  const version = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);

  // --- initial load -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/draft");
        const body = await response.json();
        if (!response.ok) throw new Error(body?.summary ?? body?.error ?? "Could not load draft");
        if (cancelled) return;
        latest.current = body.draft;
        setDraft(body.draft);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // --- saving -------------------------------------------------------------
  const save = useCallback(async (): Promise<void> => {
    const pending = latest.current;
    if (!pending) return;

    const sentVersion = version.current;
    setSaveState("saving");

    try {
      const stored = await putDraft(pending);
      // Only adopt the server's copy if nothing was edited meanwhile.
      if (version.current === sentVersion) {
        latest.current = stored;
        setDraft(stored);
        setSaveState("saved");
        setLastSavedAt(new Date());
        setError(null);
      }
    } catch (cause) {
      setSaveState("error");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const running = inFlight.current ?? save();
    inFlight.current = running;
    await running;
    inFlight.current = null;
  }, [save]);

  const update = useCallback(
    (mutate: (draft: Draft) => Draft) => {
      const current = latest.current;
      if (!current) return;

      // Recompute through the same function the server uses, so the screen
      // shows compute.ts's answer immediately rather than a stale one.
      const next = recomputeDraft(mutate(current));
      latest.current = next;
      version.current += 1;
      setDraft(next);
      setSaveState("pending");

      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void save();
      }, DEBOUNCE_MS);
    },
    [save],
  );

  // --- do not lose the last edit -----------------------------------------
  useEffect(() => {
    const flushSync = () => {
      if (timer.current === null || !latest.current) return;
      clearTimeout(timer.current);
      timer.current = null;
      // keepalive lets the request finish after the page goes away. A normal
      // fetch would be cancelled on unload and the edit would be lost.
      void putDraft(latest.current, true).catch(() => undefined);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushSync();
    };

    window.addEventListener("pagehide", flushSync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushSync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Clear the debounce timer if the provider itself unmounts.
  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  // --- lifecycle ----------------------------------------------------------
  const startNewDraft = useCallback(async () => {
    setSaveState("saving");
    try {
      const stored = await putDraft(createEmptyDraft());
      latest.current = stored;
      version.current += 1;
      setDraft(stored);
      setSaveState("saved");
      setLastSavedAt(new Date());
      setError(null);
    } catch (cause) {
      setSaveState("error");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const discardDraft = useCallback(async () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    try {
      const response = await fetch("/api/draft", { method: "DELETE" });
      if (!response.ok) throw new Error(`Could not discard draft (HTTP ${response.status})`);
      latest.current = null;
      version.current += 1;
      setDraft(null);
      setSaveState("idle");
      setLastSavedAt(null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const value = useMemo(
    () => ({
      draft,
      loading,
      error,
      saveState,
      lastSavedAt,
      update,
      flush,
      startNewDraft,
      discardDraft,
    }),
    [draft, loading, error, saveState, lastSavedAt, update, flush, startNewDraft, discardDraft],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}
