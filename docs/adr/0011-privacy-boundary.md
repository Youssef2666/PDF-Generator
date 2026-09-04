---
status: accepted
date: 2026-09-04
deciders: project owner
---

# 0011 — The privacy boundary: what may leave the machine

## Context and Problem Statement

The tool handles rosters. A course register is a list of named individuals,
their employer, their department, and a record of their attendance — personal
data belonging to a client, held by us only because they asked for a report.

[0006](0006-model-writes-the-extraction-profile-not-the-data.md) established
*that* the model writes the extraction profile rather than the data. This ADR
draws the line precisely, and records how it is enforced rather than merely
intended. A boundary that exists only as a convention in someone's head is
one refactor away from not existing.

## Decision Drivers

* Personal data belongs to the client, not to us and not to a vendor.
* A rule that cannot be tested is a rule that will be broken quietly.
* The operator should be able to *see* what leaves, not be told about it.
* The tool must work with the boundary intact — a privacy control that makes
  the product unusable gets switched off.

## Considered Options

1. **No egress at all.** Never call a model; ship only deterministic parsing.
2. **Egress of anonymised structure only** — geometry, header labels, mark
   symbols — with the model returning layout.
3. **Egress of a sample of real rows**, on the grounds that three rows is not
   the whole roster.
4. **Egress of the document**, with a contractual assurance from the vendor.

## Decision Outcome

**Option 2**, with the boundary drawn as follows.

**Never leaves the machine:**
participant names · departments and job titles · attendance marks as values ·
session dates · client and trainer names · the source PDF · any part of the
draft · any rendered report.

**May leave, only after explicit per-use consent:**
page dimensions · the x/width geometry of cells · the *header row's* text
(column labels), **with every digit masked to `0`** · attendance mark
*symbols* (`ح`, `✓`) as vocabulary · placeholders (`PERSON_1`, `FIELD_1`)
standing in for redacted cells.

The digit masking is what keeps "session dates never leave" literally true.
The header row has to travel — a model cannot describe how to recognise a
header it has not seen — but a session heading is sent as `0000-00-00`
rather than `2026-02-08`. The *shape* is everything a regular expression is
written against; the dates themselves are course data with no reason to go
anywhere. Arabic-Indic digits are masked identically, since some registers
number their columns that way.

This was caught by looking at the payload preview rather than by reasoning
about the code, which is an argument for the preview existing.

### How it is enforced

Four mechanisms, deliberately overlapping, because each covers a different
failure:

1. **Redaction by rule, not by guess.** `buildAnonymisedSample()` replaces
   *every* data-row cell longer than two characters. Not "the name column" —
   which column holds the name is precisely the unknown the model is being
   asked about, so a redaction keyed to it would be circular and would fail
   on exactly the unfamiliar layouts the fallback exists for. The rule is
   blunt on purpose.

2. **An independent second check.** `assertSampleIsAnonymised()` re-derives
   the answer from the source and refuses to send a payload containing
   anything substantive. It exists because the builder could be subtly
   wrong, and the cost of that is a client's roster in a third party's logs.

3. **A guard on the way back.** `parseProfile()` refuses any object carrying
   a data-shaped key — `participants`, `rows`, `names`, `roster`, and so on.
   It runs on the **raw** input, before Zod parses, because Zod strips
   unknown keys: a model returning `{...layout, participants: [...]}` would
   otherwise have the roster silently dropped and the call recorded as a
   clean success. The breach would have happened and nobody would see it.
   The schema's own row-detection field is named `rowRules` for this reason —
   so that `rows` stays available as a forbidden key.

4. **Two switches and a preview.** The feature requires the environment flag
   `COURSE_REPORT_ALLOW_PROFILE_PROPOSAL=1` *and* explicit per-call consent.
   The UI shows the literal payload — the exact bytes — before the operator
   consents to anything.

The tests assert this against the real fixture: every one of the eight
participant names in `attendance-sample.pdf` is checked, individually, for
absence from the payload, and a deliberately sabotaged sample is asserted to
fail the check.

### Consequences

* A new client layout costs a profile before it parses. Manual entry is
  always reachable, so the tool never becomes unusable while that happens.
* The committed profile can be reviewed in a pull request and shown in a
  demo, because there is nothing in it to protect.
* A profile is reusable across courses: session dates are read from the
  document at extraction time, never stored in the profile. A profile written
  once serves a client for years.
* The provenance of every report records which of the three routes produced
  its attendance table, and that a human confirmed it.
* The cost, stated plainly: the model is working with less information than a
  human would have, so a proposed profile may be wrong. That is why it is
  run locally and reviewed rather than trusted.

## Pros and Cons of the Options

### 1. No egress at all

* Good, because the boundary is trivially provable: there is no egress path.
* Good, because it removes a dependency and a per-run cost.
* Bad, because every new client layout becomes an engineering task, and the
  people using the tool cannot unblock themselves.
* Retained as the default: the feature is off unless deliberately enabled,
  so an installation that never sets the flag *is* this option.

### 2. Anonymised structure only (chosen)

* Good, because the sensitive data never enters the egress path at all —
  there is nothing to leak, rather than a promise not to leak it.
* Good, because what is sent is small enough to be shown to the operator in
  full and read in a few seconds.
* Good, because the returned artefact is inspectable before it is trusted,
  and is applied by deterministic code either way.
* Bad, because the redaction rule is conservative and occasionally discards
  context that would have helped the model.
* Bad, because it is more machinery than the alternatives, and the machinery
  has to be maintained and tested to keep meaning anything.

### 3. A sample of real rows

* Good, because the model would see real content and likely propose better
  profiles.
* Bad, because "only three people's personal data" is still three people's
  personal data, disclosed without their knowledge by a supplier of their
  employer. The number is not the point.
* Bad, because the boundary becomes a judgement call about volume rather
  than a property that can be tested. There is no assertion to write.
* Rejected.

### 4. Send the document, rely on contract

* Good, because it is the simplest to build and would give the best
  extraction accuracy.
* Bad, because a vendor's retention policy is not something we can show a
  client, and the obligation to protect their roster is ours regardless of
  what we have contracted with someone else.
* Bad, because it fails the test that matters here: could we describe this
  behaviour to the client whose roster it is, in one sentence, and have them
  be content? "We upload your staff list to a third party" fails.
* Rejected.

## More Information

Implementation: `src/lib/pdf/propose-profile.ts` (redaction and the switches),
`src/lib/pdf/profile-schema.ts` (the guard). Workflow documentation:
`.claude/skills/pdf-attendance/SKILL.md`. Related:
[0006](0006-model-writes-the-extraction-profile-not-the-data.md).
