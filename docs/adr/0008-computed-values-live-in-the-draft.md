---
status: accepted
date: 2026-09-04
deciders: project owner
---

# 0008 — Computed values are stored in the draft

## Context and Problem Statement

A report is mostly derived numbers: attendance rates, weighted scores,
pass/fail outcomes, survey averages, totals. Each one is shown on screen
while the report is being built, and printed into three documents when it is
delivered.

The question is where those numbers live. Every consumer could derive them on
demand, or they could be computed once and stored in the draft alongside the
inputs.

The failure this is guarding against is specific and expensive: a figure on
screen disagreeing with the same figure in the delivered Word file. Nobody
notices until a client adds up a column.

## Decision Drivers

* A number the operator approves must be the number that ships.
* There must be exactly one implementation of each rule.
* The draft is serialised to JSON constantly and read by three renderers, a
  browser, and an audit agent.
* `report-data.json` accompanies every delivery and should account for the
  figures in it.

## Considered Options

1. **Derive on read.** Consumers call `compute*()` when they need a value.
2. **Store computed values in the draft**, filled by `recomputeDraft()` on
   every write.
3. **Store, and derive again in the renderers** as a cross-check.

## Decision Outcome

**Option 2.** Every level of the draft carries a `computed` block, filled by
`recomputeDraft()`, which `draft-store.ts` runs before any write. Consumers
render what they find; they never derive.

`recomputeDraft` is pure — no clock, no filesystem — which is what lets it
run identically in the browser and on the server.

### Consequences

* The screen and the documents render the same bytes, so they cannot
  disagree. This is the whole point.
* `report-data.json` is self-describing: the numbers are in it, not
  reconstructable from it.
* An audit agent can check a stored value against its inputs and find a
  write that bypassed the store — a real class of bug that "derive on read"
  makes structurally invisible.
* The cost: **the draft carries redundant state, and redundant state can go
  stale.** A write that skips `recomputeDraft` leaves wrong numbers sitting
  in the file looking authoritative. Three things contain that: the store is
  the only writer and always recomputes; `fixture.test.ts` fails if the
  committed fixture drifts from what `compute.ts` produces; and the
  `report-auditor` checks stored values against their inputs.
* `recomputeDraft` must be idempotent, and is tested for it.

A note on the client. The editor calls `recomputeDraft` locally on every
edit, so figures react immediately rather than lagging a 500ms debounce
behind. That does not violate "the UI never computes" — the UI is calling the
single implementation, not carrying a second one. The server's response is
still adopted as authoritative.

## Pros and Cons of the Options

### 1. Derive on read

* Good, because there is no redundant state and nothing can go stale.
* Good, because the draft file is smaller and simpler to read by eye.
* Bad, because every consumer must remember to derive, and one that forgets
  renders a raw input as though it were a total.
* Bad, because `report-data.json` becomes a file you cannot check without
  re-running the application.
* Bad, because it makes the disagreement failure *harder to detect*: there is
  no stored value to compare against, so an auditor has nothing to check.

### 2. Store computed values (chosen)

* Good, because approved figures are shipped figures.
* Good, because the stored values are checkable — by tests, by an auditor, by
  a person reading the JSON.
* Bad, because redundant state must be kept fresh, and the failure mode when
  it is not is silent and confident.
* Bad, because the draft file is noticeably larger and noisier to read.

### 3. Store and re-derive as a cross-check

* Good, because it would catch a stale value at render time.
* Bad, because it puts a second call site for every rule in the renderers,
  and the renderers are the code most likely to drift.
* Bad, because it answers "these disagree" at the worst possible moment —
  during a delivery — with no way to tell which is right.
* Rejected: the cross-check belongs in a test and an auditor, where it can
  fail early and loudly, not in the render path.

## More Information

Rules and their edge cases: [docs/data-model.md](../data-model.md).
Implementation: `src/lib/compute.ts`.
