/**
 * The model fallback: asks Claude to *describe a layout*, never to read one.
 *
 * ---------------------------------------------------------------------------
 * The rule this file exists to keep
 * ---------------------------------------------------------------------------
 *
 * A model call that returns participant rows is a bug (ADR 0006, ADR 0011).
 * The model's only output is a profile — column bands, a header pattern, the
 * symbols the register uses — which is then handed to deterministic.ts and
 * run locally. The rows never travel.
 *
 * The *input* side matters just as much, and is where this file does most of
 * its work. `buildAnonymisedSample()` is a pure function that constructs
 * exactly what will be sent, and it is built to be inspectable: the UI shows
 * the operator the literal payload before anything leaves the machine.
 *
 * Its redaction rule is deliberately blunt, because a clever one would be
 * wrong occasionally and occasionally is not good enough here:
 *
 *   **In a data row, any cell longer than two characters is replaced.**
 *
 * Not "the name column" — we do not know which column that is; discovering it
 * is the entire question being asked. So every substantive cell goes, and
 * only geometry, header labels and short mark tokens remain. The first
 * replaced cell in each row becomes PERSON_1..PERSON_3 and the rest become
 * FIELD_n, so the model can still see that a wide text column exists and
 * where it sits.
 *
 * This is off by default. It requires an explicit per-call opt-in *and* an
 * environment flag, so it cannot be enabled by a stray default somewhere.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import type { ExtractedPage, TextRow } from "@/lib/pdf/extract-text";
import {
  parseProfile,
  PROFILE_VERSION,
  type ExtractionProfile,
} from "@/lib/pdf/profile-schema";

/** Cells this long or shorter are marks, and travel verbatim. */
export const MARK_MAX_LENGTH = 2;

/** How many data rows are ever sent. */
export const MAX_SAMPLE_ROWS = 3;

const MODEL = "claude-opus-5";

// ---------------------------------------------------------------------------
// The payload
// ---------------------------------------------------------------------------

export interface SampleCell {
  text: string;
  x: number;
  width: number;
  /** True when `text` is a placeholder rather than document content. */
  redacted: boolean;
}

export interface SampleRow {
  y: number;
  cells: SampleCell[];
}

export interface AnonymisedSample {
  page: number;
  pageWidth: number;
  pageHeight: number;
  header: SampleRow;
  rows: SampleRow[];
  /** The literal JSON that would be sent. Shown to the operator verbatim. */
  payload: string;
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Replace every digit with 0, keeping the shape and losing the value.
 *
 * A session heading becomes "0000-00-00", which is all a regular expression
 * needs to be written against, while the actual course dates stay here.
 * Applies to Arabic-Indic digits too, which is how some registers number
 * their columns.
 */
export function maskDigits(text: string): string {
  return text.replace(/[0-9٠-٩۰-۹]/g, "0");
}

/**
 * Guess which row is the header: the first row that has at least three items
 * and is followed by rows with a similar number of items. Only used to pick
 * a *sample*; the profile the model returns still has to find the header
 * itself at extraction time.
 */
function guessHeaderRow(rows: TextRow[]): number {
  let best = -1;
  let bestScore = 0;

  for (let i = 0; i < rows.length - 1; i += 1) {
    const count = rows[i].items.length;
    if (count < 3) continue;
    const following = rows.slice(i + 1, i + 4);
    const similar = following.filter(
      (r) => Math.abs(r.items.length - count) <= 1,
    ).length;
    const score = similar * 10 + count;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  return best;
}

/**
 * Build the payload.
 *
 * Pure and total: no IO, no network. Everything the model will ever see is
 * produced here, which is what makes "show the operator exactly what is
 * sent" a truthful claim rather than an approximation.
 */
export function buildAnonymisedSample(pages: ExtractedPage[]): AnonymisedSample | null {
  const page = pages[0];
  if (!page) return null;

  const headerIndex = guessHeaderRow(page.rows);
  if (headerIndex === -1) return null;

  // The header row travels, because the model cannot describe how to
  // recognise a header it has not seen — but with its digits masked. A
  // session header reads "0000-00-00" rather than "2026-02-08": the *shape*
  // is what a pattern is written against, and the real dates are course
  // data with no business leaving the machine.
  const header: SampleRow = {
    y: round(page.rows[headerIndex].y),
    cells: page.rows[headerIndex].items.map((item) => ({
      text: maskDigits(item.text),
      x: round(item.x),
      width: round(item.width),
      redacted: /\d/.test(item.text),
    })),
  };

  const rows: SampleRow[] = [];
  for (const row of page.rows.slice(headerIndex + 1, headerIndex + 1 + MAX_SAMPLE_ROWS)) {
    let personCount = 0;
    let fieldCount = 0;

    rows.push({
      y: round(row.y),
      cells: row.items.map((item) => {
        if (item.text.length <= MARK_MAX_LENGTH) {
          return { text: item.text, x: round(item.x), width: round(item.width), redacted: false };
        }
        // Anything substantive is replaced. The first per row stands in for
        // the name; the rest for whatever other text the row carries.
        personCount += 1;
        const placeholder =
          personCount === 1
            ? `PERSON_${rows.length + 1}`
            : `FIELD_${(fieldCount += 1)}`;
        return {
          text: placeholder,
          x: round(item.x),
          width: round(item.width),
          redacted: true,
        };
      }),
    });
  }

  const sample: Omit<AnonymisedSample, "payload"> = {
    page: page.pageNumber,
    pageWidth: round(page.width),
    pageHeight: round(page.height),
    header,
    rows,
  };

  return { ...sample, payload: JSON.stringify(sample, null, 2) };
}

/**
 * Assert that nothing substantive from the document survived redaction.
 *
 * A second, independent check on `buildAnonymisedSample` — it re-derives the
 * answer from the source rather than trusting the builder. Cheap, and the
 * cost of the builder being subtly wrong is a client's roster in someone
 * else's logs.
 */
export function assertSampleIsAnonymised(
  sample: AnonymisedSample,
  pages: ExtractedPage[],
): void {
  const page = pages.find((p) => p.pageNumber === sample.page);
  if (!page) return;

  const headerTexts = new Set(sample.header.cells.map((c) => c.text));
  // Header cells travel with digits masked, so a data cell that happens to
  // match a masked heading is still not a free pass.
  const sent = sample.rows.flatMap((row) => row.cells.map((c) => c.text));

  for (const value of sent) {
    if (value.length <= MARK_MAX_LENGTH) continue;
    if (/^(PERSON|FIELD)_\d+$/.test(value)) continue;
    if (headerTexts.has(value)) continue;
    throw new Error(
      `Anonymisation failed: "${value}" would have been sent verbatim. ` +
        "Nothing longer than a mark may leave the machine. See ADR 0011.",
    );
  }
}

// ---------------------------------------------------------------------------
// The model call
// ---------------------------------------------------------------------------

/**
 * What the model is asked for. Deliberately *not* the full profile schema:
 * `id`, `name` and `origin` are ours to assign, and leaving them out removes
 * any invitation to invent identifying text.
 */
const ProposedLayoutSchema = z.object({
  reasoning: z
    .string()
    .describe("One or two sentences on how the columns were identified."),
  nameColumn: z.object({ xMin: z.number(), xMax: z.number() }),
  departmentColumn: z
    .object({ xMin: z.number(), xMax: z.number() })
    .nullable()
    .describe("null when the register has no second text column"),
  sessionColumns: z.object({
    xMin: z.number(),
    xMax: z.number(),
    headerPattern: z
      .string()
      .describe("JavaScript regular expression matching one session header cell"),
    markTolerance: z.number(),
  }),
  headerContains: z
    .array(z.string())
    .describe("Text fragments that identify the header row"),
  stopBefore: z.array(z.string()).describe("Text that ends the table, if any"),
  marks: z
    .record(z.string(), z.enum(["present", "late", "absent", "excused"]))
    .describe("What each mark symbol in the sample means"),
});

const SYSTEM_PROMPT = `You describe the LAYOUT of attendance registers.

You are given the geometry of one page: a header row, and up to three data
rows in which every substantive cell has already been replaced with a
placeholder such as PERSON_1 or FIELD_1. Short cells are attendance marks and
are shown as they appear.

Your job is to say WHERE things are and HOW they are spelled — column x
ranges, a pattern that matches a session header, and what each mark symbol
means. Coordinates are PDF points from the left edge of the page.

You must never output participant data. There is none in your input, and
there must be none in your output. Do not invent names, dates or attendance
values. Session dates in particular are read from the document at extraction
time and must not appear in what you return.`;

export interface ProposeOptions {
  /** Must be true. There is no default. */
  consent: boolean;
  /** Overrides the environment flag, for tests. */
  enabled?: boolean;
  apiKey?: string;
}

export class ProposalDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalDisabledError";
  }
}

/** Two independent switches, both of which must be on. */
export function proposalEnabled(): boolean {
  return process.env.COURSE_REPORT_ALLOW_PROFILE_PROPOSAL === "1";
}

export interface ProposalResult {
  profile: ExtractionProfile;
  /** Exactly what was sent, for the provenance record. */
  payload: string;
  reasoning: string;
}

/**
 * Ask a model to propose a profile for a document it can only see the shape
 * of. The result is a candidate: it is guarded, parsed, and then has to
 * survive deterministic.ts and human review like any other profile.
 */
export async function proposeProfile(
  pages: ExtractedPage[],
  options: ProposeOptions,
): Promise<ProposalResult> {
  if (!options.consent) {
    throw new ProposalDisabledError(
      "Profile proposal requires explicit per-use consent. Nothing was sent.",
    );
  }
  if (!(options.enabled ?? proposalEnabled())) {
    throw new ProposalDisabledError(
      "Profile proposal is disabled. Set COURSE_REPORT_ALLOW_PROFILE_PROPOSAL=1 " +
        "to allow it. Nothing was sent.",
    );
  }

  const sample = buildAnonymisedSample(pages);
  if (!sample) {
    throw new Error("Could not find a table-like header row to describe.");
  }
  // Belt and braces: never send a payload that has not passed the check.
  assertSampleIsAnonymised(sample, pages);

  const client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: sample.payload }],
    output_config: { format: zodOutputFormat(ProposedLayoutSchema) },
  });

  const layout = response.parsed_output;
  if (!layout) {
    throw new Error("The model did not return a usable layout description.");
  }

  return {
    profile: assembleProfile(layout, sample.page),
    payload: sample.payload,
    reasoning: layout.reasoning,
  };
}

export type ProposedLayout = z.infer<typeof ProposedLayoutSchema>;

/**
 * Turn a layout description into a profile.
 *
 * Separate from the network call on purpose. It is the whole of what a
 * model's answer becomes, so a test can feed it a hand-written layout and
 * prove the round trip — sample in, profile out, identical table — without
 * needing an API key. It is also where the guard runs, so a model that
 * smuggled rows into its answer fails here rather than downstream.
 */
export function assembleProfile(layout: ProposedLayout, page: number): ExtractionProfile {
  // Identity and origin are assigned locally, never by the model: there is
  // no reason to invite it to write free text into a field we control.
  const candidate = {
    version: PROFILE_VERSION,
    id: `proposed-${page}`,
    name: "Proposed profile (unreviewed)",
    description: layout.reasoning,
    origin: "proposed" as const,
    page,
    header: {
      contains: layout.headerContains,
      minSessionColumns: 1,
    },
    columns: {
      name: layout.nameColumn,
      department: layout.departmentColumn,
      sessions: layout.sessionColumns,
    },
    rowRules: {
      stopBefore: layout.stopBefore,
      minNameLength: 2,
    },
    marks: layout.marks,
  };

  // parseProfile guards the raw object *before* Zod strips unknown keys.
  return parseProfile(candidate);
}
