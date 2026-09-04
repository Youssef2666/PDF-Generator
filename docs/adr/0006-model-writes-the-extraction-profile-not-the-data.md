---
status: accepted
date: 2026-09-04
deciders: project owner
---

# 0006 — The model writes the extraction profile, never the extracted data

## Context and Problem Statement

Attendance arrives as a PDF whose layout differs from client to client:
different column orders, different header wording, sometimes a signature
column between the name and the first session. Something has to turn that
into rows of participants and per-session attendance.

A language model is very good at reading an unfamiliar table. It is also the
component we least want holding a roster of named individuals, and the
component whose output we can least easily reproduce or audit. So the
question is not *whether* to use a model, but **what artefact the model is
allowed to produce**.

## Decision Drivers

* Participant names are personal data belonging to a client, not to us.
* A report must be reproducible: running the same input twice must give the
  same table, and a wrong number must be traceable to a rule.
* Client layouts recur. The second course for the same client should be
  cheaper to process than the first.
* The tool must still work when the model is unavailable or switched off.

## Considered Options

1. **The model extracts the rows directly.** Send the PDF text; get
   participants and attendance back.
2. **The model writes a reusable extraction profile; deterministic code
   applies it.** The profile describes *where* the data is — column indices,
   header patterns, how a mark is spelled — and never contains data.
3. **Pure heuristics, no model.** Hand-written parsing rules only.
4. **A commercial table-extraction / OCR API.**

## Decision Outcome

**Option 2.** The model's only output is a profile: a JSON description of the
document's layout, validated by `profile-schema.ts`. `deterministic.ts`
applies that profile to the extracted text and produces the participants and
sessions, along with a confidence score. A model call that returns
participant rows is a bug, not a fallback.

The profile-writing path is off by default and requires explicit per-use
opt-in, with a plain-language statement of what is sent. What is sent is the
header row plus at most three data rows with names replaced by `PERSON_1`
through `PERSON_3`.

### Consequences

* Names never leave the machine. The privacy boundary is a property of the
  architecture rather than a promise in a README, which is what makes it
  reviewable.
* Extraction is deterministic and re-runnable. The same PDF and profile give
  the same table every time, and a wrong cell points at a specific rule in a
  committed file.
* Profiles are committed and reused, so a returning client costs one
  deterministic run and no model call at all.
* Every layout is one profile away from working without a code change.
* The cost: a novel layout needs a profile before it parses, so the first
  run for a new client is slower than "paste the PDF at a model". The manual
  participant table is always reachable as the floor.

## Pros and Cons of the Options

### 1. The model extracts the rows directly

* Good, because it handles any layout immediately with no setup.
* Bad, because every run sends a full roster of named individuals to a third
  party. This alone is disqualifying.
* Bad, because output is non-deterministic: two runs can differ, and there is
  no rule to point at when a cell is wrong.
* Bad, because nothing is learned. The hundredth course for the same client
  costs exactly as much as the first.
* Bad, because a silent misread looks identical to a correct read.

### 2. The model writes the profile (chosen)

* Good, because the data stays local and the model sees only anonymised
  structure.
* Good, because the artefact is inspectable before it is trusted — a human
  reviews a profile once, and it is then applied mechanically forever.
* Good, because it degrades to a committed profile, and below that to manual
  entry.
* Bad, because it is more machinery than calling a model on the document.
* Bad, because a profile can be subtly wrong in a way that only shows up on
  rows the sample did not cover, which is why the review UI shows the parsed
  table beside the rendered page and requires confirmation.

### 3. Pure heuristics, no model

* Good, because it is fully deterministic and sends nothing anywhere.
* Good, because it has no per-run cost.
* Bad, because every new client layout becomes an engineering task. The
  profile approach keeps the same determinism at apply time while moving
  layout discovery out of the codebase.
* Rejected as the *only* mechanism, but retained as the apply step: option 2
  is this option, with the rules written per document instead of per release.

### 4. A commercial table-extraction API

* Good, because accuracy on messy scans is likely better than ours.
* Bad, because it sends the entire document — names included — off the
  machine, which fails the same test as option 1.
* Bad, because it adds a paid dependency and a network requirement to a tool
  that otherwise runs offline.
* Bad, because its output is still per-run rather than reusable.

## More Information

The privacy boundary this ADR establishes is restated and enforced in
[0011](0011-privacy-boundary.md). The workflow is documented for operators in
`.claude/skills/pdf-attendance/SKILL.md`.
