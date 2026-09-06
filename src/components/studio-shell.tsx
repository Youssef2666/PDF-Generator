"use client";

/**
 * The persistent frame around every editing screen: the navigation rail, a
 * page header, the save indicator, and the gate that decides whether there
 * is a draft to edit at all.
 *
 * Two design commitments. The sidebar carries a per-screen count of failing
 * required checklist items and a readiness bar, so "what is still missing"
 * is visible from anywhere rather than only on Review. And the page header
 * owns each screen's title and one-line purpose, so the screens themselves
 * start straight at their content.
 *
 * Every string comes from the dictionary, and every offset is logical
 * (`ms-`, `border-e`, `start-0`) rather than physical, so the same markup
 * mirrors correctly when the root element is dir="rtl".
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
import { LanguageSwitch } from "@/components/language-switch";
import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { computeChecklist, type ChecklistItem } from "@/lib/compute";
import { intlTagOf, type Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface NavEntry {
  href: string;
  key: keyof Dictionary["nav"];
  icon: LucideIcon;
  section: ChecklistItem["section"] | null;
}

const NAV: NavEntry[] = [
  { href: "/course", key: "course", icon: Settings2, section: "course" },
  { href: "/attendance", key: "attendance", icon: FileUp, section: null },
  { href: "/participants", key: "participants", icon: Users, section: "participants" },
  { href: "/grades", key: "grades", icon: GraduationCap, section: "grades" },
  { href: "/survey", key: "survey", icon: MessageSquareText, section: "survey" },
  { href: "/narrative", key: "narrative", icon: PenLine, section: "narrative" },
  { href: "/review", key: "review", icon: ClipboardCheck, section: null },
];

// ---------------------------------------------------------------------------
// Save indicator
// ---------------------------------------------------------------------------

function SaveIndicator() {
  const { saveState, lastSavedAt, error } = useDraft();
  const { locale, t } = useLocale();

  const text =
    saveState === "saving"
      ? t.save.saving
      : saveState === "pending"
        ? t.save.pending
        : saveState === "error"
          ? t.save.error
          : saveState === "saved"
            ? lastSavedAt
              ? t.save.savedAt(
                  lastSavedAt.toLocaleTimeString(intlTagOf(locale), {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                )
              : t.save.saved
            : t.save.idle;

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
  const { t } = useLocale();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t.shell.loading}
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
                {t.shell.finalized}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{t.shell.writtenTo}</p>
              <code
                className="mt-1 block truncate rounded-md bg-background px-2.5 py-1.5 text-xs"
                dir="ltr"
              >
                output/{lastExport.directory}/
              </code>
              <ul className="mt-3 grid grid-cols-2 gap-1 text-xs text-muted-foreground" dir="ltr">
                {lastExport.files.map((file) => (
                  <li key={file} className="truncate">
                    {file}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-card p-8 shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <BookOpenText className="size-5" aria-hidden />
              </div>
              <LanguageSwitch />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{t.shell.noReport}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t.shell.noReportBody}
            </p>
            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            <Button className="mt-6" size="lg" onClick={() => void startNewDraft()}>
              {t.shell.start}
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
  const currentCopy = current ? t.nav[current.key] : null;

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* ---------------------------------------------------------------- */}
      <aside className="sticky top-0 flex h-screen w-[268px] shrink-0 flex-col border-e border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpenText className="size-[18px]" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">{t.appName}</p>
            <p className="truncate text-xs text-muted-foreground" dir="auto">
              {draft.course.titleAr || t.untitledReport}
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
                        className="absolute inset-y-2 -start-3 w-0.5 rounded-full bg-primary"
                      />
                    ) : null}
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground",
                      )}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{t.nav[entry.key].label}</span>

                    {failing > 0 ? (
                      <span
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/15 px-1.5 text-[11px] font-semibold tabular-nums text-foreground"
                        title={t.shell.outstandingBadge(failing)}
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

        <div className="space-y-3 border-t border-sidebar-border p-4">
          <div className="rounded-xl border border-border bg-background p-3.5">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-medium">
                {checklist.ready ? t.shell.readyToFinalize : t.shell.readiness}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground" dir="ltr">
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
                ? t.shell.everyRequiredPasses
                : t.shell.outstanding(checklist.requiredFailing)}
            </p>
          </div>
          <LanguageSwitch className="px-1" />
        </div>
      </aside>

      {/* ---------------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-8 py-4">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">
                {currentCopy?.label ?? t.appName}
              </h1>
              {currentCopy?.description ? (
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {currentCopy.description}
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
