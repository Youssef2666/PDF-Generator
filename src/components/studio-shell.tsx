"use client";

/**
 * The persistent frame around every editing screen: left navigation, the
 * save indicator, and the gate that decides whether there is a draft to edit
 * at all.
 *
 * The nav shows a per-screen count of failing required checklist items, so
 * "what is still missing" is visible from anywhere rather than only on the
 * review screen.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useDraft } from "@/components/draft-provider";
import { Button } from "@/components/ui/button";
import { computeChecklist, type ChecklistItem } from "@/lib/compute";
import { cn } from "@/lib/utils";

const NAV: Array<{ href: string; label: string; section: ChecklistItem["section"] | null }> = [
  { href: "/course", label: "Course setup", section: "course" },
  { href: "/participants", label: "Participants & attendance", section: "participants" },
  { href: "/grades", label: "Grades", section: "grades" },
  { href: "/survey", label: "Survey", section: "survey" },
  { href: "/narrative", label: "Narrative", section: "narrative" },
  { href: "/review", label: "Review", section: null },
];

function SaveIndicator() {
  const { saveState, lastSavedAt, error } = useDraft();

  const text =
    saveState === "saving"
      ? "Saving…"
      : saveState === "pending"
        ? "Unsaved changes"
        : saveState === "error"
          ? "Save failed"
          : saveState === "saved"
            ? lastSavedAt
              ? `Saved ${lastSavedAt.toLocaleTimeString()}`
              : "Saved"
            : "No changes";

  const tone =
    saveState === "error"
      ? "text-destructive"
      : saveState === "saving" || saveState === "pending"
        ? "text-amber-600 dark:text-amber-500"
        : "text-muted-foreground";

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span
        className={cn("text-xs tabular-nums", tone)}
        role="status"
        aria-live="polite"
        data-testid="save-indicator"
        data-save-state={saveState}
      >
        {text}
      </span>
      {saveState === "error" && error ? (
        <span className="max-w-md truncate text-xs text-destructive" title={error}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { draft, loading, error, startNewDraft } = useDraft();

  if (loading) {
    return <p className="p-8 text-sm text-muted-foreground">Loading draft…</p>;
  }

  if (!draft) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-8">
        <h1 className="text-xl font-semibold">No report in progress</h1>
        <p className="text-sm text-muted-foreground">
          Start a new report to begin entering course details, participants, grades, survey
          results and narrative.
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div>
          <Button onClick={() => void startNewDraft()}>Start a new report</Button>
        </div>
      </div>
    );
  }

  const checklist = computeChecklist(draft);
  const failingBySection = new Map<string, number>();
  for (const item of checklist.items) {
    if (item.required && item.status === "fail") {
      failingBySection.set(item.section, (failingBySection.get(item.section) ?? 0) + 1);
    }
  }

  return (
    <div className="flex min-h-screen">
      <nav className="w-64 shrink-0 border-r bg-muted/30 p-4">
        <div className="mb-6">
          <p className="text-sm font-semibold">Course Report Studio</p>
          <p className="truncate text-xs text-muted-foreground" dir="auto">
            {draft.course.titleAr || "Untitled report"}
          </p>
        </div>

        <ul className="space-y-1">
          {NAV.map((entry) => {
            const active = pathname === entry.href;
            const failing = entry.section ? (failingBySection.get(entry.section) ?? 0) : 0;
            return (
              <li key={entry.href}>
                <Link
                  href={entry.href}
                  className={cn(
                    "flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-background font-medium shadow-sm"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                  )}
                >
                  <span>{entry.label}</span>
                  {failing > 0 ? (
                    <span
                      className="rounded-full bg-amber-500/15 px-1.5 text-xs tabular-nums text-amber-700 dark:text-amber-500"
                      title={`${failing} required item(s) outstanding`}
                    >
                      {failing}
                    </span>
                  ) : entry.section ? (
                    <span className="text-xs text-emerald-600 dark:text-emerald-500">✓</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 border-t pt-4 text-xs text-muted-foreground">
          <p>
            {checklist.ready
              ? "Ready to finalize."
              : `${checklist.requiredFailing} required item(s) outstanding.`}
          </p>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-8 py-3">
          <h1 className="text-sm font-medium">
            {NAV.find((n) => n.href === pathname)?.label ?? "Course Report Studio"}
          </h1>
          <SaveIndicator />
        </header>
        <main className="min-w-0 flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
