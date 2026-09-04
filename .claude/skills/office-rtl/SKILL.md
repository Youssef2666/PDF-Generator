---
name: office-rtl
description: >-
  Produce Word, Excel and PowerPoint files that render correctly in Arabic,
  Hebrew, Persian and Urdu. Use when generating .docx/.xlsx/.pptx containing
  right-to-left text, when RTL output looks wrong (columns reversed, digits
  scrambled, alignment flipping between Windows and Mac), or when adding RTL
  support to a document generator.
---

# Right-to-left Office documents

## The problem in one paragraph

RTL bugs in generated Office files are invisible from the code. Your object
graph sets the flag. Your tests about the data pass. The file still opens with
the columns backwards — because the flag never reached the XML, or reached one
sheet and not the others, or reached the Latin font slot instead of the
complex-script one. **You cannot review your way to correct RTL output. You
have to open the produced bytes and assert what is really in them.**

Everything below is organised around that. Each rule states the symptom it
fixes, because a rule without a symptom gets "simplified" away by the next
person.

## The one idea

**Set direction. Never set the edge.**

"Right-aligned" and "right-to-left" are different claims. The first is
physical and breaks the moment a cell holds a Latin name or a number. The
second is logical and survives any content. Most rules here are that
distinction applied somewhere.

---

# Word (.docx)

Word RTL is **six independent layers**. Setting five of six produces a
document that looks almost right, which is worse than one that looks obviously
broken, because nobody catches it before the client does.

Ordered outermost to innermost:

| # | Where | What | Without it |
|---|---|---|---|
| 0.0 | `word/settings.xml` | `<w:themeFontLang w:bidi="ar-SA"/>` | **Word never enables its bidi pipeline.** Every other layer is decoration. |
| 0 | `styles.xml` docDefaults `rPr` | `<w:lang w:bidi="ar-SA"/>` | Tables survive; paragraphs and headings render LTR. |
| 0.5 | `styles.xml` docDefaults `pPr` | `<w:bidi/>` and `<w:jc w:val="start"/>` | Paragraphs *added later*, when someone edits your delivered file, inherit LTR. |
| 1 | `<w:sectPr>` | `<w:bidi/>`, **before `<w:docGrid>`** | Section reading direction is LTR. Wrong order → Word refuses to open the file. |
| 2 | `<w:tblPr>` | `<w:bidiVisual/>` | Column order is not flipped; the first column lands on the left. |
| 3 | `<w:pPr>` / `<w:rPr>` | `<w:bidi/>` / `<w:rtl/>` | Individual paragraphs and runs read LTR. |
| 5 | any `<w:jc>` | `start` / `end`, never `left` / `right` | Correct on Windows, **wrong on Word for Mac**. |

Layer 0.0 is the one people miss. **No document-generation library writes it**
— only a live Word session populates it, from the OS keyboard layout. So a
file that a human made in Word works, and your generated one does not, and the
XML looks identical everywhere you thought to check.

## Layer 5 in detail — the Word for Mac trap

Use `w:jc="start"` and `w:jc="end"`. Never `left` or `right`.

**Symptom:** the document is correct on Windows and wrong on macOS, or the
reverse. Word for Mac reinterprets physical alignment under RTL, so a
paragraph pinned `right` — which is the obvious fix when Arabic appears
left-aligned — resolves to the wrong side on one of the two platforms.

This is discoverable only by opening the file on both. It is the single most
likely rule to be "fixed" back into a bug by someone testing on one machine.

## Complex-script fonts

Word keeps **two** font slots and **two** size slots per run:

```
<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Dubai"/>
<w:sz w:val="22"/><w:szCs w:val="22"/>
```

- `w:cs` is the font Word actually uses for Arabic. Setting only
  `ascii`/`hAnsi` — which is what a plain `font: "Calibri"` does in most
  libraries — leaves Arabic to the reader's fallback.
- `w:szCs` is the *complex-script* size. A run with only `w:sz` renders its
  Arabic at the default size no matter what the Latin size says.

**Symptom:** the same file looks different on two machines, and neither person
can reproduce the other's complaint.

## Mixed content: the two traps worth a fixture

Put both of these in your test fixture on day one. They are the bugs that
reach clients.

**1. A Latin name in an RTL column.** A roster holds `عبدالله القحطاني` and
`Maria Santos` in the same column. Mark each run's direction from its
*content*, not from the column:

```ts
const isArabic = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(text);
```

**Symptom if you mark everything RTL:** the Latin name renders reversed
against its punctuation.

**2. A long digit string inside Arabic prose.** A contract number like
`20260208114500` in an Arabic paragraph. Split the paragraph into runs at
Latin/digit boundaries and mark each explicitly — `rightToLeft: false` on the
digits, `true` on the Arabic around them.

**Symptom if you leave it to Word's bidi algorithm:** the digits reorder. Word
handles mixed *words* fine; long digit sequences adjacent to Arabic
punctuation are where it visibly fails.

## Digit shape: leave it alone unless asked

You *can* convert Western digits (0–9) to Arabic-Indic (٠–٩). For a report
containing scores, percentages and dates, don't — it changes the data's
appearance and makes figures harder to check against a source spreadsheet.
If a client asks, make it a profile option, never a default, and exclude
IBANs, emails and reference codes.

## Library reality: what you will have to inject yourself

Checked against the npm `docx` package, v9.7.1:

| Layer | API? |
|---|---|
| 2 table `visuallyRightToLeft` | yes |
| 3 paragraph `bidirectional`, run `rightToLeft` | yes |
| 5 `AlignmentType.START` / `END` | yes |
| `w:cs` font, `sizeComplexScript` | yes (`font: { ascii, hAnsi, cs }`) |
| 0 docDefaults `<w:lang w:bidi>` | yes (`language.bidirectional`) |
| **0.5 docDefaults `<w:pPr><w:bidi/>`** | **no** — absent from `IParagraphStylePropertiesOptions` |
| **1 `<w:sectPr><w:bidi/>`** | **no** — absent from `ISectionPropertiesOptionsBase` |
| **0.0 `themeFontLang`** | **no** — nothing writes `settings.xml` |

Three of the eight have no API. Unzip the finished package, patch the XML,
re-zip. Two ordering constraints matter when you do:

- `<w:bidi/>` goes **before** `<w:docGrid>` inside `<w:sectPr>`.
- `<w:bidi/>` goes **before** `<w:jc>` inside `<w:pPr>`.

Get either wrong and Word reports the file as corrupt rather than
mis-rendering it — which is at least honest.

---

# Excel (.xlsx)

Far simpler: one flag, applied per sheet.

```ts
worksheet.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];
```

**There is no workbook-level setting.** `rightToLeft` is an attribute of
`<sheetView>`, and every worksheet has its own. Setting it while building
sheet 1 and forgetting sheet 4 gives you a file that looks fine until someone
clicks the fourth tab. Verify **per sheet**, and report failures by sheet name.

## Do not also reverse the column order

`rightToLeft` **is** the mirroring. Excel renders column A at the right edge
and runs leftwards, so write columns in ordinary logical order.

**Symptom if you reverse the arrays too:** the sheet is mirrored twice and
lands back at LTR. The natural next move is to add a third flip somewhere.
If columns look backwards, check whether something is already flipping them.

The same applies to Word's `<w:bidiVisual/>`.

## Cells: reading order, not alignment

```ts
cell.alignment = { readingOrder: "rtl", vertical: "middle" }; // no `horizontal`
```

Omitting `horizontal` leaves Excel on `general`, which resolves the edge from
the reading order and the content — Arabic right, Latin left, inside one
mirrored column. Numbers get `readingOrder: "ltr"` and centring, which is
direction-neutral.

---

# PowerPoint (.pptx)

## Text bodies

`rtlMode: true` (pptxgenjs) → `<a:pPr rtl="1">`. Route every text call through
one helper so a slide cannot quietly omit it.

## Charts invert the rule above

This is the trap, and it catches people who have just learned the Excel and
Word rules.

Excel's `rightToLeft` and Word's `<w:bidiVisual/>` mirror columns for you, and
reversing your arrays as well double-flips them. **Charts have no such flag.**
Nothing in `chartN.xml` reorders categories, so an Arabic bar chart puts its
first category on the left unless you reverse the data yourself.

```
Format offers a mirroring flag?  →  do NOT reverse (Excel sheets, Word tables)
No mirroring flag?               →  DO reverse    (charts)
```

Reverse **labels and values together**. Reversing one and not the other
mislabels every bar while leaving a chart that still looks plausible — the
worst possible failure mode.

## Chart text needs the attribute injected

pptxgenjs emits `<a:pPr>` inside a chart's `<c:txPr>` with no `rtl` attribute
and offers no option for one.

**Symptom:** slides are perfectly RTL; every axis label, legend entry and data
label still reads left-to-right. Patch the chart parts after packing.

## Keep charts native

Real `ppt/charts/chartN.xml` parts, not images. A chart rendered as a picture
cannot be selected, re-themed or corrected by the recipient, and its text is
invisible to every rule above. Assert that `ppt/media/` holds no chart images.

## Reproducibility has two extra traps here

- pptxgenjs numbers chart and embedded-workbook parts from a **module-level
  counter**, so the second deck rendered in one process gets `chart5.xml`
  where the first got `chart1.xml`. Part names end up depending on process
  history. Renumber from 1 and rewrite every reference in
  `[Content_Types].xml` and the `.rels`.
- Every native chart embeds a complete `.xlsx` (what "Edit Data" opens), each
  a nested zip with its own timestamps. Re-stamp and re-zip those too, or the
  deck is byte-stable everywhere except four nested packages.

---

# Verifying

Write a verifier before you write the second renderer. It reads the finished
bytes and asserts each layer independently, so a failure names the layer
rather than saying "the document is wrong".

Three properties that matter more than the checks themselves:

**1. Zero checks is a failure, not a pass.** If a verifier silently stops
finding worksheets, a naive `issues.length === 0` reports success on every
file — the worst possible outcome for a tool whose job is catching silence.

```ts
const passed = report.checks > 0 && report.issues.length === 0;
```

**2. Every check needs a negative control.** Take a real document, strip one
flag out of the XML, re-zip, and assert verification now fails — including
the case where only *one* sheet or *one* table loses it. A check nobody has
watched fail is not evidence.

**3. Check per unit, not per document.** Per sheet, per table, per paragraph,
per run. "The document has `bidiVisual` somewhere" is not the claim you want.

## Reproducible output

Generated Office files embed timestamps: `docProps/core.xml`
(`dcterms:created`/`modified`) and the zip entries' own mtimes. Set both from
your source data rather than the clock, and two renders of the same input are
byte-identical — which is what lets you diff two deliveries and assert
determinism in a test. Note the zip format only accepts 1980–2099, so the Unix
epoch is rejected.

---

## Credit

The Word layer model, and specifically the `themeFontLang` master switch and
the Word-for-Mac logical-alignment rule, are adapted from
**[muhmoosa/claude-arabic-docs](https://github.com/muhmoosa/claude-arabic-docs)**,
an Arabic RTL hardening skill for `python-docx`. The code does not transfer
across languages; the rule catalogue does, and it saved a lot of discovery.
