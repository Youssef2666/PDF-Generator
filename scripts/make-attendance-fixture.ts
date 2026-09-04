/**
 * Generates fixtures/attendance-sample.pdf.
 *
 * A stand-in for the kind of attendance sheet a client sends: a title, some
 * course metadata, and a table of participants with one column per session.
 * Every name is invented; nothing here came from a real course.
 *
 * On the Arabic. pdf-lib does not shape Arabic — it draws the codepoints it
 * is given, so the glyphs appear unjoined and in logical order rather than
 * looking like real Arabic typesetting. That is fine for what this fixture
 * is *for*: it exercises the extraction pipeline, which cares about the text
 * content and the x/y positions of each item, not about how the glyphs join.
 *
 * Real client PDFs vary in the other direction — many extract as Arabic
 * *presentation forms* rather than base letters, which is why
 * extract-text.ts normalises those. See `fixtures/attendance-sample.md`.
 *
 * Regenerate with `pnpm fixture:pdf`.
 */

import fs from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const OUT = path.join(process.cwd(), "fixtures", "attendance-sample.pdf");
const FONT = path.join(process.cwd(), "fixtures", "fonts", "Amiri-Regular.ttf");

/** Single-letter marks, as a paper register would use. */
const MARK = {
  present: "ح", // حاضر
  absent: "غ", // غائب
  late: "م", // متأخر
  excused: "ع", // بعذر
} as const;

const SESSIONS = ["2026-02-08", "2026-02-09", "2026-02-10", "2026-02-11", "2026-02-12"];

interface Row {
  name: string;
  department: string;
  marks: Array<keyof typeof MARK>;
}

/**
 * Deliberately mirrors fixtures/demo-draft.json, so an extraction can be
 * compared against a known-good expected table.
 */
const ROWS: Row[] = [
  {
    name: "عبدالله بن ناصر القحطاني",
    department: "العمليات",
    marks: ["present", "present", "present", "present", "present"],
  },
  {
    name: "نورة عبدالعزيز الدوسري",
    department: "الموارد البشرية",
    marks: ["present", "late", "present", "present", "present"],
  },
  {
    // Latin-script name on an Arabic register — the bidi case, and also the
    // case where a naive column split on script would go wrong.
    name: "Maria Santos",
    department: "الجودة",
    marks: ["present", "present", "late", "present", "present"],
  },
  {
    name: "فهد سعد العتيبي",
    department: "الإنتاج",
    marks: ["late", "late", "late", "late", "late"],
  },
  {
    name: "هند محمد الشمري",
    department: "المالية",
    marks: ["present", "present", "excused", "present", "present"],
  },
  {
    name: "خالد إبراهيم الزهراني",
    department: "الصيانة",
    marks: ["present", "absent", "absent", "present", "absent"],
  },
  {
    name: "ريم فيصل المطيري",
    department: "إدارة المشاريع",
    marks: ["present", "present", "present", "late", "present"],
  },
  {
    name: "ماجد عبدالرحمن الحربي",
    department: "المشتريات",
    marks: ["present", "present", "present", "absent", "absent"],
  },
];

const PAGE = { width: 842, height: 595 }; // A4 landscape, points
const NAME_X = 60;
const DEPT_X = 250;
const FIRST_SESSION_X = 400;
const SESSION_GAP = 78;
const HEADER_Y = 470;
const ROW_HEIGHT = 34;

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = rgb(0.1, 0.1, 0.1),
): void {
  page.drawText(text, { x, y, size, font, color });
}

async function main(): Promise<void> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const font = await pdf.embedFont(await fs.readFile(FONT), { subset: true });
  const page = pdf.addPage([PAGE.width, PAGE.height]);

  // Metadata is fixed so the file is byte-reproducible.
  pdf.setTitle("كشف الحضور");
  pdf.setAuthor("Course Report Studio fixture");
  pdf.setSubject("Anonymised attendance register");
  pdf.setProducer("make-attendance-fixture.ts");
  pdf.setCreator("make-attendance-fixture.ts");
  pdf.setCreationDate(new Date("2026-02-13T00:00:00.000Z"));
  pdf.setModificationDate(new Date("2026-02-13T00:00:00.000Z"));

  // --- heading -------------------------------------------------------------
  drawText(page, "كشف الحضور والانصراف", NAME_X, 545, font, 18, rgb(0.12, 0.22, 0.39));
  drawText(page, "مهارات القيادة الإدارية الحديثة", NAME_X, 520, font, 12);
  drawText(page, "شركة الأفق للصناعات", NAME_X, 500, font, 11);
  drawText(page, "LDR-204", 700, 545, font, 11);

  // --- header row ----------------------------------------------------------
  drawText(page, "الاسم", NAME_X, HEADER_Y, font, 11, rgb(0.12, 0.22, 0.39));
  drawText(page, "الإدارة", DEPT_X, HEADER_Y, font, 11, rgb(0.12, 0.22, 0.39));
  SESSIONS.forEach((date, i) => {
    drawText(page, date, FIRST_SESSION_X + i * SESSION_GAP, HEADER_Y, font, 9, rgb(0.12, 0.22, 0.39));
  });

  page.drawLine({
    start: { x: NAME_X - 5, y: HEADER_Y - 8 },
    end: { x: FIRST_SESSION_X + SESSIONS.length * SESSION_GAP, y: HEADER_Y - 8 },
    thickness: 1,
    color: rgb(0.12, 0.22, 0.39),
  });

  // --- data rows -----------------------------------------------------------
  ROWS.forEach((row, r) => {
    const y = HEADER_Y - 26 - r * ROW_HEIGHT;
    drawText(page, row.name, NAME_X, y, font, 11);
    drawText(page, row.department, DEPT_X, y, font, 10);
    row.marks.forEach((mark, i) => {
      drawText(page, MARK[mark], FIRST_SESSION_X + i * SESSION_GAP + 18, y, font, 11);
    });
  });

  // --- footer --------------------------------------------------------------
  drawText(page, "إجمالي عدد المشاركين: 8", NAME_X, 70, font, 10, rgb(0.35, 0.35, 0.35));

  const bytes = await pdf.save({ useObjectStreams: false });
  await fs.writeFile(OUT, bytes);

  console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${bytes.length} bytes)`);
  console.log(`  ${ROWS.length} participants x ${SESSIONS.length} sessions`);
}

void main();
