---
status: accepted
date: 2026-09-06
deciders: project owner
---

# 0012 — The UI language lives in a cookie, not in the URL

## Context and Problem Statement

The report package has always been Arabic. The screens that build it were
English only, which is wrong for the operators who type Arabic rosters and
Arabic narrative all day. The app needed an Arabic UI, mirrored
right-to-left, with a switch that does not lose a half-typed field.

Where should the choice of language live, and how should the first paint
already be in the right direction?

## Decision Drivers

* A page that hydrates from LTR to RTL flips the whole layout across the
  screen. The server has to know the direction before it sends the first byte.
* The draft is the only copy of hours of manual entry. Switching language
  must not navigate, reload, or otherwise interrupt the debounced autosave.
* The report is Arabic regardless of the UI language. The locale is an
  operator preference, not a property of the document, so it must not enter
  the draft or the export.
* The e2e test, the demo recorder and the component tests drive the app by
  its visible labels. Whatever mechanism is chosen must leave English as the
  default so those keep working unchanged.

## Considered Options

1. **A cookie**, read by the root layout to set `<html lang dir>`, written by
   the switch, with every string looked up from a typed dictionary through a
   React context.
2. **A locale segment in the URL** (`/ar/course`), the pattern the Next.js
   internationalization guide describes, with a proxy redirecting bare paths.
3. **A field on the draft** (`draft.uiLocale`), saved with everything else.
4. **`Accept-Language` only** — follow the browser, offer no switch.

## Decision Outcome

**Option 1.** `src/lib/i18n/` holds `en.ts`, whose shape is the `Dictionary`
type, and `ar.ts`, typed against it, so a key added to one without the other
fails to compile. `app/layout.tsx` reads the `crs-locale` cookie on the server
and renders `lang` and `dir` on the root element. `LocaleProvider` seeds a
context from that value; `LanguageSwitch` writes the cookie and flips the root
element in place. Every offset in the shell and the screens is logical
(`ms-`, `text-end`, `border-e`, `start-0`), so one set of markup mirrors.

Checklist items get a `detailCode` and `params` beside their English
`detail`; the Arabic dictionary translates by code and falls back to the
English text for any code it does not know. compute.ts remains the only place
a figure is derived.

### Consequences

* Reading the cookie in the root layout makes every route dynamic. This app
  edits a live draft on every screen, so nothing was static to lose.
* The default stays English. Tests and the recorder are unaffected, and the
  recorder now switches to Arabic on its second frame to show the feature.
* **Cost:** the locale is per browser. Two operators sharing a machine share
  a language, and an incognito window is English again. Acceptable for a tool
  with one operator at a time.
* **Cost:** strings in server responses — the export route's error summary,
  the validation hook's `reason` — stay English. They are read by a developer
  or an agent, not shown to the operator as the primary message.

## Pros and Cons of the Options

### Option 1 — cookie plus context

* Good, because the server renders the right direction on the first byte.
* Good, because switching is a state change, not a navigation: the autosave
  timer and the focused field survive it.
* Good, because the dictionary is a plain object with functions for counts,
  so Arabic dual and plural forms are expressed directly rather than through
  a template language.
* Bad, because the choice does not travel in a link.

### Option 2 — locale in the URL

* Good, because a link carries its language and the framework documents it.
* Bad, because every route moves under `app/[lang]/`, every `href` in the
  shell and the review page needs the prefix, and the e2e test, the demo
  recorder, the `PostToolUse` hook target and the runbook all change paths.
* Bad, because switching is a navigation, which races the debounced save.
* Rejected on cost, not correctness. If the app ever needs shareable,
  language-specific links, this is the option to revisit.

### Option 3 — a field on the draft

* Good, because it needs no cookie and no server read.
* Bad, because there is no draft on the empty screen, which is exactly where
  an Arabic-reading operator first needs the switch.
* Bad, because it puts an operator preference into the document's provenance
  and into `report-data.json`, where it means nothing.

### Option 4 — `Accept-Language` only

* Good, because it needs no UI at all.
* Bad, because a shared machine's browser language is whatever the last
  installer chose, and an operator cannot correct it without leaving the app.
* Bad, because the demo and the tests would depend on the browser's settings.
