---
status: accepted
date: 2026-09-04
deciders: project owner
---

# 0010 — Verify RTL in the produced bytes, with negative controls

## Context and Problem Statement

RTL correctness in Office documents cannot be reviewed by reading the code
that produces it. A renderer can set every flag on its objects, pass every
test about its data, and still emit a file that opens with the columns
backwards — because the flag never reached the XML, or reached one worksheet
and not the others, or landed in the Latin font slot instead of the
complex-script one.

Word RTL is six independent layers. Three of them have no API in the `docx`
package at all and are injected by post-processing. Excel's flag is per
worksheet with no workbook-level setting. PowerPoint charts carry no
direction flag whatsoever.

So: how do we know a delivered document is right, given that nobody on the
project can open Word on macOS on demand?

## Decision Drivers

* The failure is silent, and its cost is a client opening the document.
* "Looks fine on my machine" is not evidence — the Word-for-Mac alignment
  rule is correct on one platform and wrong on the other.
* The rules will be edited by people who did not discover them.

## Considered Options

1. **Unit-test the renderer's inputs** — assert the options passed to the
   library.
2. **Open the produced file and assert its XML.**
3. **Snapshot-test the whole produced file.**
4. **Manual QA** — a person opens each document before delivery.

## Decision Outcome

**Option 2.** `scripts/verify-rtl.ts` unzips a finished document and asserts
each layer independently: 10 checks for xlsx, 10 for docx, 14 for pptx. It
runs as `pnpm verify:rtl`, exits non-zero on a missing flag, and names the
rule and the sheet, table or paragraph that failed.

Three properties matter as much as the checks themselves:

**A report with zero checks is a failure, not a pass.** `reportPassed()`
requires `checks > 0`. A verifier that silently stopped finding worksheets
would otherwise report success on every file — the worst possible outcome for
a tool whose entire job is catching silence.

**Every check has a negative control.** The tests take a real document, strip
one flag out of the XML, re-zip, and assert verification then fails —
including the cases where only *one* sheet or *one* table loses it. A check
nobody has watched fail is not evidence that anything works.

**Checks are per unit, not per document.** Per sheet, per table, per
paragraph, per Arabic run. "The document has `bidiVisual` somewhere" is not
the claim worth making.

### Consequences

* A renderer change that drops a flag fails the build, naming the layer.
* The verifier is the executable half of `docs/rtl.md`: the prose says why a
  rule exists, the check says whether it still holds.
* It caught real regressions during development, including a `w:bidi`
  ordering constraint that makes Word declare the file corrupt.
* The costs, stated plainly: **the verifier only knows the rules it was
  taught.** A new surface — a new sheet, a new slide type — passes silently
  until someone extends it, which is why "did you extend verify-rtl?" is in
  the `rtl-reviewer` checklist. And **XML flags are not pixels**: a document
  can carry every correct flag and still look wrong for reasons no assertion
  covers. This narrows what a human has to check; it does not remove them.
* Asserting on XML couples the tests to library output. A library upgrade
  that changes attribute spelling breaks them — loudly, which is the right
  direction to fail.

## Pros and Cons of the Options

### 1. Assert the renderer's inputs

* Good, because it is fast and needs no unzipping.
* Bad, because it tests our belief about the library rather than what the
  library did. Exactly the bugs that matter — a flag with no API, an option
  silently ignored, a post-processing step that did not run — are invisible
  to it.
* This is what "looks correct in review" already does, and it is what
  produced the bugs in the first place.

### 2. Assert the produced XML (chosen)

* Good, because it inspects the artefact that is actually delivered.
* Good, because a failure names a layer, so it points at a fix.
* Good, because it survives library upgrades meaningfully: if the output
  changes, the check fails rather than quietly passing.
* Bad, because it must be extended for every new surface.
* Bad, because it is regex over XML rather than a real parse — adequate for
  attribute presence, and it would not survive being asked much more.

### 3. Snapshot the whole file

* Good, because it catches every change, including ones nobody thought of.
* Bad, because it catches every change, including the thousand irrelevant
  ones. A snapshot diff on a 15 KB zip tells you something moved, not what
  broke.
* Bad, because the accepted fix for a noisy snapshot is to re-bless it,
  which trains people to accept diffs they have not read.
* Rejected. Determinism is still asserted — two renders are byte-identical —
  but that is one assertion, not a review surface.

### 4. Manual QA before delivery

* Good, because a person opening the file is the only check that covers
  appearance rather than structure.
* Bad, because it does not scale to every commit, and the failure it is
  guarding against is precisely the one a tired reviewer misses.
* **Not rejected — kept, and narrowed.** The automated checks cover what can
  be asserted so that human attention goes to what cannot. The README states
  plainly that the documents have not yet been opened on macOS.

## More Information

Rules and symptoms: [docs/rtl.md](../rtl.md) and
[`.claude/skills/office-rtl/SKILL.md`](../../.claude/skills/office-rtl/SKILL.md).
Implementation: `scripts/verify-rtl.ts`.
