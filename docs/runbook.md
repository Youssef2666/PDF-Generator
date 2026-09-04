# Runbook

Four procedures, in the order you are likely to need them.

---

## Onboard a new client

The work is one extraction profile. Budget ten minutes for a layout you have
not seen before; a returning client costs nothing.

**1. Try what already exists first.** Upload their register at `/attendance`.
Every committed profile is tried and ranked; a layout close to one you have
already described may just work. If a match comes back at confidence 1.0 with
no warnings, you are done — confirm the table and carry on.

**2. Look at what the extractor sees.** Positions matter, appearance does
not:

```bash
pnpm exec tsx -e "
  import fs from 'node:fs/promises';
  import { extractText } from '@/lib/pdf/extract-text';
  const pages = await extractText(new Uint8Array(await fs.readFile('data/uploads/<id>.pdf')));
  for (const row of pages[0].rows) {
    console.log(Math.round(row.y), row.items.map(i => Math.round(i.x)).join(','), row.text);
  }
"
```

Read off the header row's y, the x band of the name column, the x band of the
session columns, and how the marks are spelled.

**3. Write the profile.** Copy `fixtures/attendance-sample.profile.json` into
`data/profiles/<client>.json` and adjust the bands. Three things people get
wrong:

- **Identify the header by content, not position.** A client who adds a logo
  shifts every y on the page. `header.contains` survives that; a hard-coded
  y does not.
- **Never put dates in a profile.** They change every course.
  `headerPattern` recognises a session column; the dates are read from the
  document. This is what makes one profile last for years.
- **`markTolerance` is never 0.** Marks sit centred under wider headings.
  Start at 30 points.

**4. Check it, then commit it.** Confidence 1.0 and no warnings means every
cell resolved. There is nothing sensitive in a profile — that is the point of
the design — so it goes in the repository like any other code.

If the layout defeats you, the manual table is always reachable and is often
the right answer for a one-off client with eight participants.

Full detail, including the failure-mode table:
[`.claude/skills/pdf-attendance/SKILL.md`](../.claude/skills/pdf-attendance/SKILL.md).

---

## Add a section to the report

**If it is prose**, it is a narrative field, and it touches five places that
must move together:

1. `src/lib/schema.ts` — add the field to `NarrativeSchema`
2. `src/lib/compute.ts` — add it to `NARRATIVE_LABELS` so the checklist
   requires it
3. `app/(studio)/narrative/page.tsx` — add it to `SECTIONS`
4. `src/render/docx.ts` — place it in `SECTION_TITLES_AR` and `buildChildren`
5. `fixtures/demo-draft.json` — `pnpm fixture` after adding the text

Then `docs/data-model.md`, in the same commit. `fixture.test.ts` fails if you
forget step 5, which is the tripwire.

**If it is a table or a figure**, it already exists in the draft — you are
adding a *view* of it. Add it to the renderer that needs it and nothing else.
Do not compute anything in the renderer: if the number you want is not in a
`computed` block, add it to `compute.ts` and let it flow.

**Either way, RTL is not optional.** New paragraphs go through `para()`, new
runs through `ar()` / `ltr()` / `auto()`, new tables through `dataTable()`.
Then extend `scripts/verify-rtl.ts` to cover the new surface — a verifier
that only checks the old surfaces keeps passing while the new one is wrong.

```bash
pnpm test && pnpm verify:rtl
```

---

## Debug a failed export

The failure message names the section: *"PowerPoint deck failed: …"*. Two
things are already true before you start reading it:

- **Nothing was written.** All three documents render into memory before any
  directory is created.
- **The draft is intact.** It is deleted only after the package lands.

So there is no cleanup to do and no data to recover. Work the failure.

**Reproduce it without the browser.** This is faster and gives a real stack:

```bash
pnpm exec tsx -e "
  import fs from 'node:fs/promises';
  import { DraftSchema } from '@/lib/schema';
  import { renderPptx } from '@/render/pptx';   // or renderDocx / renderXlsx
  const draft = DraftSchema.parse(JSON.parse(await fs.readFile('data/drafts/current.json','utf8')));
  await fs.writeFile('/tmp/out.pptx', await renderPptx(draft));
  console.log('ok');
"
```

If the fixture renders and the live draft does not, the difference is in the
data. Diff them: a null where the renderer expects a number, an empty
`sessions` array, a survey question with a tally longer than the scale.

### Failures seen before

| Symptom | Cause | Fix |
|---|---|---|
| 422, "checklist is not complete" | Not a failure. The gate did its job; the response lists the failing items | Fix them on the named screens |
| `Cannot find module '…/pdf.worker.mjs'` | pdfjs bundled instead of external — fails only inside the Next server, so tests pass while the route 422s | `serverExternalPackages: ["pdfjs-dist"]` in `next.config.ts` |
| `date not in range 1980-2099` | A zip mtime of 0. The zip format has no epoch before 1980 | Use the fixed `ZIP_EPOCH` constant |
| Renders differ between two runs | A timestamp taken from the clock, or pptx's process-global chart counter | Timestamps come from `draft.updatedAt`; `normalizeChartNumbering` handles the counter |
| Export succeeded, no confirmation on screen | Finalize deletes the draft, unmounting the review screen | `lastExport` lives on the provider so it outlives the draft |

### If the draft itself is the problem

`readDraft()` throws rather than returning null when the file exists but does
not parse — a corrupt draft must not look like an absent one, or the editor
would cheerfully start a new report over the top of it. The API returns 422
with the Zod summary; that summary names the exact path, e.g.
`participants.0.attendance.s2`.

The same check runs as a `PostToolUse` hook, so an agent editing the draft
file directly is told immediately. If it is silent, check that the dev server
is up — that hook is inert without it, which is why `SessionStart` reports
the server's state.

---

## Look at the produced documents

There is no in-app preview — the temporary one was removed when the export
route landed. To get all three documents from the committed fixture without
finalizing anything:

```bash
pnpm verify:rtl        # renders docx, xlsx and pptx, prints the directory
```

It writes them to a temp directory and reports the path, then asserts the RTL
flags in what it wrote. To render from the *current* draft instead, use the
snippet in "Debug a failed export" above.

This matters because the flags are asserted but the appearance is not: no
automated check in this project can tell you whether a document looks right
in Word on macOS.

---

## Routine checks

```bash
pnpm test          # unit and component
pnpm test:e2e      # full run in a browser
pnpm verify:rtl    # the produced documents, not the code that wrote them
pnpm typecheck && pnpm lint
```

`verify:rtl` is the one that catches the class of bug you cannot see by
reading a diff. Run it before shipping any renderer change.
