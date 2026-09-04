/**
 * Turns a PDF into positioned text.
 *
 * This is the only part of the extraction pipeline that touches pdfjs. It
 * produces text items with coordinates and groups them into rows; deciding
 * what those rows *mean* is deterministic.ts's job, driven by a profile.
 *
 * Nothing here interprets content. It does not know what a participant is.
 */

import type { TextItem as PdfTextItem } from "pdfjs-dist/types/src/display/api";

/** One run of text, with where it sits on the page. */
export interface TextItem {
  text: string;
  /** Distance from the left edge, in PDF points. */
  x: number;
  /** Distance from the *top* edge, in points. Flipped from PDF's origin so
   *  that "smaller y is higher up" matches how a table is read. */
  y: number;
  width: number;
  height: number;
}

/** Items sharing a baseline, left to right. */
export interface TextRow {
  y: number;
  items: TextItem[];
  /** The row's text, items joined by single spaces in x order. */
  text: string;
}

export interface ExtractedPage {
  pageNumber: number;
  width: number;
  height: number;
  items: TextItem[];
  rows: TextRow[];
}

/**
 * Two items belong to the same row if their baselines are within this many
 * points. Large enough to absorb the sub-point jitter of a generated table,
 * small enough not to merge adjacent rows in a dense register.
 */
const ROW_TOLERANCE = 4;

/**
 * Normalise extracted text.
 *
 * The important part is NFKC. Many real Arabic PDFs store text as
 * *presentation forms* (U+FE70..U+FEFF) — the joined, context-specific
 * glyph shapes — rather than base letters, because that is what the
 * typesetter embedded. Compared naively, "ﻣﺤﻤﺪ" and "محمد" are different
 * strings, so a profile written against one silently fails on the other.
 * NFKC folds the presentation forms back to base letters, and splits
 * ligatures such as لا into their two letters.
 *
 * Also strips the bidi control characters that PDF producers sprinkle
 * through RTL text, and collapses whitespace.
 */
export function normalizeText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[‎‏‪-‮⁦-⁩؜]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Group items into rows by baseline, then order each row left to right. */
export function groupIntoRows(items: TextItem[], tolerance = ROW_TOLERANCE): TextRow[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: TextRow[] = [];

  for (const item of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(item.y - row.y) <= tolerance) {
      row.items.push(item);
    } else {
      rows.push({ y: item.y, items: [item], text: "" });
    }
  }

  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    row.text = row.items.map((i) => i.text).join(" ");
    // The row's y is the mean of its items, so a slightly raised superscript
    // does not drag the whole row.
    row.y = row.items.reduce((sum, i) => sum + i.y, 0) / row.items.length;
  }

  return rows;
}

/**
 * Read a PDF into positioned, normalised text.
 *
 * pdfjs is imported dynamically and by its legacy build: the default entry
 * expects a browser worker, and importing it eagerly would drag that into
 * every module that merely mentions extraction.
 */
export async function extractText(data: Uint8Array): Promise<ExtractedPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({
    // A copy: pdfjs transfers ownership of the buffer it is handed, which
    // leaves the caller's array detached and unusable afterwards.
    data: new Uint8Array(data),
    useSystemFonts: false,
  });

  const document = await loadingTask.promise;
  const pages: ExtractedPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      const items: TextItem[] = [];
      for (const raw of content.items) {
        if (!("str" in raw)) continue;
        const item = raw as PdfTextItem;
        const text = normalizeText(item.str);
        if (text === "") continue;

        // transform is [a, b, c, d, e, f]; e and f are the translation.
        const [, , , , x, yFromBottom] = item.transform as number[];
        items.push({
          text,
          x,
          // Flip to a top-down axis so rows sort in reading order.
          y: viewport.height - yFromBottom,
          width: item.width,
          height: item.height,
        });
      }

      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        items,
        rows: groupIntoRows(items),
      });

      page.cleanup();
    }
  } finally {
    // The loading task owns the worker; the document proxy has no destroy().
    await loadingTask.destroy();
  }

  return pages;
}
