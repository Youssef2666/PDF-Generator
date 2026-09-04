"use client";

/**
 * The persistent frame around every editing screen: left navigation, a page
 * header, the save indicator, and the gate that decides whether there is a
 * draft to edit at all.
 *
 * Two design commitments. The sidebar carries a per-screen count of failing
 * required checklist items and a readiness bar, so "what is still missing"
 * is visible from anywhere rather than only on Review. And the page header
 * owns each screen's title and one-line purpose, so the screens themselves
 * start straight at their content.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  Check,
  ClipboardCheck,
  FileUp,
  GraduationCap,
  Loader2,
  MessageSquareText,
  PenLine,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useDraft } from "@/components/draft-provider";
import { Button } from "@/components/ui/button";
import { computeChecklist, type ChecklistItem } from "@/lib/compute";
import { cn } from "@/lib/utils";

interface NavEntry {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  section: ChecklistItem["section"] | null;
}

const NAV: NavEntry[] = [
  {
    href: "/course",
    label: "Course setup",
    description: "Who ran it, for whom, when — and the session schedule.",
    icon: Settings2,
    section: "course",
  },
  {
    href: "/attendance",
    label: "Import attendance",
    description: "Read the client's register, review it beside the page, confirm.",
    icon: FileUp,
    section: null,
  },
  {
    href: "/participants",
    label: "Participants",
    description: "The roster and the attendance matrix.",
    icon: Users,
    section: "participants",
  },
  {
    href: "/grades",
    label: "Grades",
    description: "Columns, weights, marks, and the outcomes they produce.",
    icon: GraduationCap,
    section: "grades",
  },
  {
    href: "/survey",
    label: "Survey",
    description: "Questions and the response tally for each rating.",
    icon: MessageSquareText,
    section: "survey",
  },
  {
    href: "/narrative",
    label: "Narrative",
    description: "The report's prose, in Arabic.",
    icon: PenLine,
    section: "narrative",
  },
  {
    href: "/review",
    label: "Review & finalize",
    description: "The readiness checklist, the computed figures, and export.",
    icon: ClipboardCheck,
    section: null,
  },
];

// ---------------------------------------------------------------------------
// Save indicator
// ---------------------------------------------------------------------------

function SaveIndicator() {
  const { saveState, lastSavedAt, error } = useDraft();

  const text =
    saveState === "saving"
      ? "Saving"
      : saveState === "pending"
        ? "Unsaved changes"
        : saveState === "error"
          ? "Save failed"
          : saveState === "saved"
            ? lastSavedAt
              ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Saved"
            : "No changes";

  const tone =
    saveState === "error"
      ? "border-destructive/30 bg-destructive/5 text-destructive"
      : saveState === "saving" || saveState === "pending"
        ? "border-warning/40 bg-warning/10 text-foreground"
        : "border-border bg-background text-muted-foreground";

  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium tabular-nums",
          tone,
        )}
        role="status"
        aria-live="polite"
        data-testid="save-indicator"
        data-save-state={saveState}
      >
        {saveState === "saving" ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : (
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              saveState === "error"
                ? "bg-destructive"
                : saveState === "pending"
                  ? "bg-warning"
                  : saveState === "saved"
                    ? "bg-success"
                    : "bg-muted-foreground/50",
            )}
          />
        )}
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

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { draft, loading, error, startNewDraft, lastExport } = useDraft();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading draft…
        </p>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-8">
        <div className="w-full max-w-md space-y-5">
          {lastExport ? (
            <div
              className="rounded-2xl border border-success/30 bg-success/5 p-5"
              data-testid="last-export"
            >
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Check className="size-4 text-success" aria-hidden />
                Report finalized
              </p>
              <p className="mt-2 text-sm text-muted-foreground">Written to</p>
              <code className="mt-1 block truncate rounded-md bg-background px-2.5 py-1.5 text-xs">
                output/{lastExport.directory}/
              </code>
              <ul className="mt-3 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                {lastExport.files.map((file) => (
                  <li key={file} className="truncate">
                    {file}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-card p-8 shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]">
            <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <BookOpenText className="size-5" aria-hidden />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">No report in progress</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Start a new report to begin entering course details, participants, grades, survey
              results and narrative.
            </p>
            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            <Button className="mt-6" size="lg" onClick={() => void startNewDraft()}>
              Start a new report
            </Button>
          </div>
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
  const requiredTotal = checklist.items.filter((i) => i.required).length;
  const requiredPassing = requiredTotal - checklist.requiredFailing;
  const progress = requiredTotal === 0 ? 0 : Math.round((requiredPassing / requiredTotal) * 100);

  const current = NAV.find((n) => n.href === pathname);

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* ---------------------------------------------------------------- */}
      <aside className="sticky top-0 flex h-screen w-[268px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpenText className="size-[18px]" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">Course Report Studio</p>
            <p className="truncate text-xs text-muted-foreground" dir="auto">
              {draft.course.titleAr || "Untitled report"}
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3">
          <ul className="space-y-0.5">
            {NAV.map((entry) => {
              const active = pathname === entry.href;
              const failing = entry.section ? (failingBySection.get(entry.section) ?? 0) : 0;
              const Icon = entry.icon;

              return (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
                      active
                        ? "bg-primary/[0.07] font-medium text-primary dark:bg-primary/15"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                    )}
                  >
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-2 -left-3 w-0.5 rounded-full bg-primary"
                      />
                    ) : null}
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground",
                      )}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{entry.label}</span>

                    {failing > 0 ? (
                      <span
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/15 px-1.5 text-[11px] font-semibold tabular-nums text-foreground"
                        title={`${failing} required item(s) outstanding`}
                      >
                        {failing}
                      </span>
                    ) : entry.section ? (
                      <Check className="size-3.5 text-success" aria-hidden />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="rounded-xl border border-border bg-background p-3.5">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-medium">
                {checklist.ready ? "Ready to finalize" : "Readiness"}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {requiredPassing}/{requiredTotal}
              </p>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500",
                  checklist.ready ? "bg-success" : "bg-primary",
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              {checklist.ready
                ? "Every required item passes."
                : `${checklist.requiredFailing} required item${checklist.requiredFailing === 1 ? "" : "s"} outstanding.`}
            </p>
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-8 py-4">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">
                {current?.label ?? "Course Report Studio"}
              </h1>
              {current?.description ? (
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {current.description}
                </p>
              ) : null}
            </div>
            <SaveIndicator />
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-6xl px-8 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
