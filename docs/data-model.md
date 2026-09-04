# Data model

`src/lib/schema.ts` is the single source of truth. This document explains the
decisions behind it and the rules the compute layer applies. If the two ever
disagree, the schema is right and this file is stale.

> **Provenance of this schema — read first.**
>
> `docs/PRD.md` was not present in the repository when M1 was built, so the
> types below were **derived from the milestone briefs** rather than
> transcribed from PRD §9. Everything the briefs pin down is honoured
> exactly: the five type names, the five computed fields, participant
> name/job title/department, the fixture's 8/5/3/6 shape, `draft.provenance`,
> and the three edge cases the unit tests must cover.
>
> Everything else — exact field names, optionality, and the pass/fail
> thresholds — is inference. The **Assumptions** section at the end lists
> each one so reconciling against the real §9 is a checklist rather than an
> excavation. When §9 arrives, changes ripple to: this file, `schema.ts`,
> `compute.ts` and its tests, and `fixtures/demo-draft.json` (regenerate with
> `pnpm fixture`) — together, in one commit.

## Two rules that shape everything

**1. The schema validates shape, not readiness.**

A half-finished draft must parse. The editor autosaves on every keystroke and
the store re-validates on every write, so a schema that rejected incomplete
drafts would make the app unusable. "Do the grade weights total 100?" and "is
the narrative written?" are finalize-time checklist questions (F7), not
schema questions. Only values that could never be correct at any stage are
rejected here — an attendance status of `maybe`, a start time of `25:99`, a
survey scale of 42.

**2. Computed values live in the draft.**

Every level carries a `computed` block that `recomputeDraft()` fills. The UI
renders those values; it never derives one. This is what guarantees a figure
on screen and the same figure in the Word file cannot disagree — they are
the same bytes. Every `computed` block has a schema default, so an object can
be built before it has been computed.

## Shape

```
Draft
├─ schemaVersion, id, createdAt, updatedAt
├─ course          Course      titles, client, trainer, venue, dates, passing rule
├─ sessions        Session[]   id, index, date, start/end, durationHours, topic
├─ gradeColumns    GradeColumn[]  id, label, maxScore, weight
├─ participants    Participant[]
│                    ├─ nameAr / nameEn, jobTitle, department
│                    ├─ attendance   Record<sessionId, AttendanceStatus>
│                    ├─ grades       Record<gradeColumnId, number | null>
│                    ├─ outcomeOverride + note
│                    └─ computed     counts, attendanceRate, totalScore, outcome
├─ survey          Survey      scaleMax, questions[] (tally + computed), computed
├─ narrative       Narrative   8 Arabic prose fields
├─ provenance      Provenance  where the attendance came from
└─ computed        DraftComputed  totals and roll-ups
```

Attendance and grades are keyed maps rather than parallel arrays, so
reordering or deleting a session cannot silently shift every participant's
record by one.

## The computation rules

These are the decisions that change the numbers. All of them live in
`src/lib/compute.ts` and nowhere else.

### Attendance

| Status | Counts as attended | In the denominator |
| --- | --- | --- |
| `present` | yes | yes |
| `late` | **yes** | yes |
| `absent` | no | yes |
| `excused` | no | **no** |
| *unrecorded* | no | **no** |

* **`late` counts as attended.** Someone late to every session was present at
  every session; they score 100% with a `lateCount` of 5. Lateness is
  reported through its own counter, not deducted from attendance.
* **`excused` leaves the denominator.** An excused absence is neither a miss
  nor a hit.
* **An unrecorded session is not an absence.** It leaves the denominator too,
  and `countedCount` reports how many sessions actually carry a mark — so a
  half-filled matrix shows an honest rate over the cells that exist, and the
  F7 checklist is what insists on a complete matrix before finalizing.
* `attendanceRate` is `null`, not `0`, when nothing counts.

### Score

`totalScore = Σ (clamp(score, 0, maxScore) / maxScore × weight)`, to one
decimal.

* Zero-weight columns are ignored entirely, marked or not.
* An out-of-range score is **clamped, not rejected** — a typo in the grades
  table must not be able to throw from inside an autosave.
* `totalScore` is `null` when any weighted column is unmarked. A partial
  total would read as a low score rather than as missing data, and it is that
  distinction that produces `incomplete` instead of `failed`.

### Outcome

`passed` requires **both** `totalScore >= minScore` **and**
`attendanceRate >= minAttendanceRate`. Thresholds are inclusive.

A missing score or attendance figure gives `incomplete` — never `failed`.
Saying `failed` there would be a claim about the participant when the truth
is a gap in the draft.

An override replaces the outcome but never erases it: `computedOutcome` and
`outcome` are both stored, alongside `outcomeIsOverridden`, so a reviewer can
always see what the rules said and what a human said instead. Roll-up counts
follow the **effective** outcome.

### Survey

* `tally[i]` is the number of respondents choosing rating `i+1`, normalised
  to `scaleMax` buckets — lowering the scale drops out-of-range buckets
  instead of skewing the mean.
* An all-zero tally gives `average: null`, **not 0**. Zero is not a rating
  this scale can express, so returning it would put a bottom score on the
  chart for a question nobody answered.
* `survey.computed.responseCount` is the **largest** per-question count, not
  the sum: respondents answer many questions, and summing would multiply the
  sample size by the questionnaire length.

### Normalisation performed by `recomputeDraft`

* Session `index` is reassigned to array position, guaranteeing the
  contiguous `1..n` ordering every renderer assumes for its columns.
* Attendance and grade keys pointing at deleted sessions or columns are
  pruned, so removing a session cannot leave orphans that never surface on
  screen but travel into `report-data.json`.

`recomputeDraft` is pure and deterministic: no clock, no filesystem. It
deliberately does **not** touch `updatedAt` — the store owns that timestamp.
That is what makes the whole module trivially testable.

## Assumptions to reconcile against PRD §9

| # | Assumption | Risk if §9 differs |
| --- | --- | --- |
| 1 | Field names: `nameAr`/`nameEn`, `jobTitle`, `department`, `titleAr`/`titleEn`, `clientNameAr`… | Mechanical rename across schema, compute, fixture |
| 2 | `AttendanceStatus` is `present\|late\|absent\|excused` | A fifth status, or no `excused`, changes the rate rules |
| 3 | `late` counts as attended | Directly changes every attendance figure |
| 4 | Unrecorded ≠ absent | Changes rates on partially filled drafts |
| 5 | `Outcome` is `passed\|failed\|incomplete` | Renderer labels and roll-up counts |
| 6 | Thresholds: score ≥ 60 **and** attendance ≥ 75, both inclusive | Changes who passes |
| 7 | Grade `weight` is a percentage of 100, `maxScore` is the raw ceiling | Changes every total score |
| 8 | Survey is a Likert tally (counts per rating), not per-respondent rows | Restructures the survey type |
| 9 | Narrative is 8 named prose fields | The Word renderer's 13 sections may imply a different split |
| 10 | `durationHours` is stored, not derived from start/end | Changes `totalHours` |
| 11 | `provenance` shape (source, profileId, confidence, humanConfirmed) | M6 writes this; adjust before M6 |
| 12 | Computed values are stored in-draft rather than derived on read | Structural; affects every consumer |

Assumptions 3, 4, 6 and 8 are the load-bearing ones — they change numbers in
a finished report rather than just names in the code. Check those first.

## Changing the model

When the `Draft` type changes, these move together in one commit:

1. `src/lib/schema.ts`
2. `src/lib/compute.ts` and `src/lib/compute.test.ts`
3. this document
4. `fixtures/demo-draft.json` — regenerate with `pnpm fixture`, never by hand

Bump `SCHEMA_VERSION` when the change would invalidate an already-stored
draft. `src/lib/fixture.test.ts` fails if the committed fixture drifts from
what `compute.ts` produces, which is the tripwire for step 4 being forgotten.
