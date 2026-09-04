# Right-to-left output

Every rule in this document was added because something rendered wrong.
None of them are precautionary. Each is written as: the rule, the symptom it
fixes, and why the obvious alternative fails.

The thing that makes RTL bugs expensive is that they are **invisible from the
code**. A renderer can set every flag on its objects, pass every test about
its data, and still produce a file that opens with the columns backwards —
because the flag never reached the XML, or reached one sheet and not the
others. So the rules below are paired with `scripts/verify-rtl.ts`, which
opens the finished bytes and asserts the flags are really there.

Run it with `pnpm verify:rtl`. It exits non-zero on a missing flag.

## The one idea behind all of it

**Set direction, then let the renderer decide the edge. Never set the edge
yourself.**

"Right-aligned" and "right-to-left" are different claims. The first is
physical and is wrong the moment a cell holds a Latin name or a number. The
second is logical and stays correct for any content. Nearly every rule below
is an instance of that distinction.

---

## Excel (`src/render/xlsx.ts`)

### X1 — `rightToLeft: true` on every sheet's view

```ts
sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 1, rightToLeft: true }];
```

**Symptom without it:** the sheet opens with column A at the left edge.
Arabic headers read outward from the wrong side, and the participant name
column — which should anchor the table on the right — sits on the left with
the session columns running away from it in the wrong direction.

**Why every sheet, not the workbook:** there is no workbook-level setting.
`rightToLeft` is an attribute of `<sheetView>`, and each worksheet has its
own. Setting it while building sheet 1 and forgetting sheet 4 produces a file
that looks fine until someone clicks the fourth tab. This is the single most
likely RTL regression in this codebase, which is why the verifier checks
every sheet independently and reports them by name.

### X2 — Do **not** also reverse the column order

This is the rule most likely to be "fixed" into a bug.

`rightToLeft` **is** the mirroring. Excel renders column A at the right edge
and runs leftwards. So columns are written in ordinary logical order — name
first, then session 1, session 2, and so on — and they display right-to-left
correctly.

**Symptom if you reverse the array as well:** the sheet is mirrored twice
and lands back where it started. The name column ends up on the left, the
sessions ascend leftwards, and the natural next move is to add a third flip
somewhere. If the columns look backwards, check that something is not
already flipping them.

### X3 — Reading order on cells, not physical alignment

```ts
cell.alignment = { readingOrder: "rtl", vertical: "middle" }; // no `horizontal`
```

**Symptom without it:** with `horizontal: "right"` hard-coded, an Arabic
column looks correct — until the row holding `Maria Santos` renders its
Latin name jammed against the right edge with its trailing punctuation
misplaced, because the physical setting is fighting the content.

Leaving `horizontal` unset means Excel uses `general` alignment, which
resolves the edge from the cell's reading order and the text itself. Arabic
goes right, Latin goes left, both inside the same mirrored column. This is
the spreadsheet form of the "logical start/end, not left/right" rule that
Word needs (see R-series, M4).

### X4 — Numbers are always `readingOrder: "ltr"`

```ts
cell.alignment = { horizontal: "center", readingOrder: "ltr" };
```

**Symptom without it:** digit strings adjacent to Arabic text can reorder.
Numerals read left-to-right even inside Arabic documents; a percentage is
not prose and should never inherit the paragraph direction. Centring is
direction-neutral and safe, so numeric columns are centred explicitly.

### X5 — An unanswered question is text, not zero

A survey question nobody answered has an average of `null`, and the workbook
writes the words "لا توجد ردود" into that cell rather than a `0`.

**Symptom without it:** zero is a rating the scale cannot express. Writing it
into a numeric column drags every chart and every average built on that sheet
toward the floor, and reports a bottom score for a question that was simply
never asked. This is not strictly an RTL rule — it is here because it is the
same class of mistake: a value that is technically renderable but semantically
false.

### X6 — Fonts are set explicitly, per run

Arabic cells get `profile.fonts.arabic`; numeric cells get
`profile.fonts.latin`. Neither is left to the default.

**Symptom without it:** the file renders in whatever font the reader's copy
of Excel falls back to for Arabic, which differs between Windows and macOS
and between Office versions. Two people open the same file and see different
documents, and neither can reproduce the other's complaint.

Excel has one font slot per run, so this is simply "choose the right font per
cell". Word is harder — it has a separate *complex script* slot, and setting
only the Latin one is the classic silent failure. That rule arrives in M4.

### X7 — Frozen headers

Not an RTL rule, but the verifier checks it (`X2 frozen header row` in the
output) for the same reason: it is invisible from the code and only
observable in the produced file. `xSplit: 1` pins the name column, which on a
mirrored sheet is the rightmost one — another place where the logical index
and the physical position deliberately differ.

---

## Word (`src/render/docx.ts`)

Arrives in M4. The rule catalogue from
[muhmoosa/claude-arabic-docs](https://github.com/muhmoosa/claude-arabic-docs)
is the reference to work from — that project hardens `python-docx` for
Arabic, so the code does not transfer to the `docx` npm package, but the
rules do. Credit belongs there.

## PowerPoint (`src/render/pptx.ts`)

Arrives in M5.

---

## Verifying

`scripts/verify-rtl.ts` reads a finished document and asserts its flags.

```bash
pnpm verify:rtl                 # renders the committed fixture and checks it
pnpm verify:rtl path/to/file.xlsx
```

Two design points worth keeping as it grows:

**A report with zero checks is a failure, not a pass.** `reportPassed()`
requires `checks > 0`. Otherwise a verifier that silently stopped finding
worksheets would report success on every file, which is the worst possible
failure for a tool whose entire job is catching silence.

**The checks have negative controls.** `src/render/xlsx.test.ts` takes a
real workbook, strips `rightToLeft` out of the XML, re-zips it, and asserts
that verification then fails — including the case where only *one* sheet
loses the flag. A check that has never been observed to fail is not evidence.
