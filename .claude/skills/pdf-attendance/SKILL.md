---
name: pdf-attendance
description: >-
  Import an attendance register from a client PDF into a report draft, or add
  support for a new client's register layout. Use when a PDF attendance sheet
  needs extracting, when extraction produces a wrong or empty table, when
  writing or debugging an extraction profile, or when deciding whether the
  model fallback may be used.
---

# Importing an attendance register

## The rule that shapes everything

**The model writes the extraction profile. It never writes the data.**

A model call that returns participant rows is a bug, not a shortcut. Rows are
produced by `src/lib/pdf/deterministic.ts`, locally, from a profile — so
extraction is reproducible, a wrong cell has a specific rule behind it, and
the roster never leaves the machine.

If you are tempted to "just ask the model to read the table", read
`docs/adr/0011-privacy-boundary.md` first. The temptation is the thing the
design exists to resist.

## Three routes in, in order of preference

| | Route | Model? | When |
|---|---|---|---|
| 1 | A committed profile matches | no | The usual case. Instant, deterministic, free. |
| 2 | The model proposes a profile | yes, once | A layout nothing has seen before. Off by default. |
| 3 | The manual table | no | Always available. The floor, never removed. |

Route 3 is not a failure state. For a one-off client with eight participants,
typing the table is faster than writing a profile, and the UI keeps that
option visible at all times rather than hiding it behind the other two.

---

## Adding support for a new client layout

This is the common task. It takes about ten minutes.

**1. Look at what the extractor actually sees.** Positions matter more than
appearance:

```ts
const pages = await extractText(new Uint8Array(await fs.readFile(pdf)));
for (const row of pages[0].rows) {
  console.log(Math.round(row.y), row.items.map(i => Math.round(i.x)).join(","), row.text);
}
```

Read off: which y is the header, the x band of the name column, the x band of
the session columns, and what the marks look like.

**2. Write the profile.** Copy `fixtures/attendance-sample.profile.json` and
adjust the bands. Fields worth understanding:

- `header.contains` — text that identifies the header row. **Identify the
  header by content, not by coordinate.** A client who adds a logo shifts
  every y on the page; a profile pinned to y=125 breaks on a document that is
  otherwise identical.
- `columns.sessions.headerPattern` — a regex matching *one* session header
  cell, usually a date. The session dates themselves are read from the
  document. **Never put dates in a profile** — they change every course, and
  a profile that lists them is single-use.
- `columns.sessions.markTolerance` — how far a mark may sit from its header's
  centre. Marks are centred under wider headings, so this is never 0. Start
  at 30 points and widen if marks go missing.
- `marks` — the literal cell text for each status. This is the form's
  vocabulary, not data read from it.
- `rowRules.stopBefore` — text that ends the table: a totals line, a
  signature block. Without it, the footer becomes a participant.

**3. Check it.** Confidence 1.0 and no warnings means every cell resolved:

```ts
const result = applyProfile(pages, parseProfile(profileJson));
console.log(result.confidence, result.warnings);
```

**4. Commit it** to `data/profiles/`. There is nothing sensitive in it — that
is the point of the design — so it can be reviewed in a pull request like any
other code.

## Reading the failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `no-header` | `header.contains` does not match, or too few session columns found | Check the extracted header text; Arabic may need NFKC folding (already applied) |
| Zero participants, header found | `rowRules.minNameLength` too high, or the name band misses the column | Widen `columns.name` |
| `unknown-mark` | The register uses a symbol the profile has not been told about | Add it to `marks` |
| `missing-mark` on every row | `markTolerance` too tight | Widen it |
| The footer appears as a participant | `rowRules.stopBefore` is empty | Add the totals text |
| Names look like `ﻣﺤﻤﺪ` not `محمد` | Presentation forms | Already handled — `normalizeText` applies NFKC |

## The Arabic wrinkle worth knowing

Many real Arabic PDFs store text as **presentation forms** (U+FE70–U+FEFF) —
the joined, context-specific glyph shapes — rather than base letters, because
that is what the typesetter embedded. Compared naively, `ﻣﺤﻤﺪ` and `محمد` are
different strings, so a profile written against one silently fails on the
other. `normalizeText()` folds them with NFKC, which also splits the لا
ligature into its two letters. Write profiles with base letters.

---

## The model fallback

Off by default. Requires **both**:

- `COURSE_REPORT_ALLOW_PROFILE_PROPOSAL=1` in the environment, and
- explicit per-use consent in the UI, after the operator has seen the payload.

### What is sent

Page dimensions, cell x/width geometry, the header row's text, and mark
symbols. Every data-row cell longer than two characters is replaced with
`PERSON_1` or `FIELD_1`.

The redaction rule is **"every substantive cell"**, not "the name column" —
which column holds the name is exactly the unknown being asked about, so a
rule keyed to it would be circular and would fail on precisely the unfamiliar
layouts this path exists for.

### What comes back

A layout description, which is assembled locally into a profile, guarded, and
run through `deterministic.ts` like any other. The operator sees the table it
produces and confirms it row by row. A proposed profile is marked
`origin: "proposed"` until someone reviews and commits it.

### If you are extending this

Do not add fields to the model's output schema that could carry document
content. The guard in `parseProfile()` refuses data-shaped keys, but it is
the last line, not the first. The first is not asking for them.

---

## Provenance

Every confirmed table records how it got there, in `draft.provenance`:

```json
{
  "attendanceSource": "pdf-committed-profile",
  "profileId": "al-ufuq-register-v1",
  "confidence": 1,
  "sourceFilename": "register.pdf",
  "extractedAt": "2026-03-02T00:00:00.000Z",
  "humanConfirmed": true
}
```

This travels into `report-data.json` in the delivered package, so a finished
report can always account for where its numbers came from. `humanConfirmed`
is only ever set by the confirm action — nothing else sets it true.

## Never

- Write to `data/uploads/`. Source documents are read-only and
  irreplaceable; `.claude/hooks/protect-uploads.mjs` enforces it for agents.
- Commit anything under `data/`.
- Put names, dates or attendance values in a profile.
- Let extracted rows into the draft without a human pressing confirm.
