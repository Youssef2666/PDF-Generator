/**
 * The extraction profile: a description of a document's *layout*, and
 * nothing else.
 *
 * This is the file that makes the privacy boundary real (ADR 0006, ADR
 * 0011). A profile says where the name column sits and how a tick is
 * spelled. It never says who attended. That is what allows a profile to be
 * committed to the repository, reviewed in a pull request, shown in a demo,
 * and handed to a model — while the roster it applies to never leaves the
 * machine.
 *
 * Two rules follow from that, and both are load-bearing:
 *
 *   1. **No participant data.** No names, no marks-as-values, no counts.
 *   2. **No course data either.** Session *dates* change with every course,
 *      so a profile that listed them would be single-use. Instead it
 *      describes how to *recognise* a session column, and the dates are read
 *      from the header at extraction time. That is what lets one committed
 *      profile serve a client for years.
 */

import { z } from "zod";

import { AttendanceStatusSchema } from "@/lib/schema";

export const PROFILE_VERSION = 1;

/** A horizontal band, in PDF points from the left edge of the page. */
export const ColumnBandSchema = z.object({
  xMin: z.number(),
  xMax: z.number(),
});
export type ColumnBand = z.infer<typeof ColumnBandSchema>;

/**
 * A regular expression, carried as a string so the profile stays plain JSON.
 * Validated on parse so a broken pattern fails loudly at load rather than
 * silently matching nothing during extraction.
 */
const RegexString = z.string().min(1).refine(
  (value) => {
    try {
      new RegExp(value, "u");
      return true;
    } catch {
      return false;
    }
  },
  { error: "not a valid regular expression" },
);

export const ExtractionProfileSchema = z.object({
  version: z.literal(PROFILE_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),

  /** Where this profile came from, for provenance. */
  origin: z.enum(["committed", "proposed"]).default("committed"),

  /** 1-based page holding the register. */
  page: z.number().int().positive().default(1),

  header: z.object({
    /**
     * Text fragments that must all appear in the header row. Matched after
     * NFKC normalisation, so a document storing Arabic presentation forms
     * still matches a profile written with base letters.
     */
    contains: z.array(z.string().min(1)).min(1),
    /** A header row must expose at least this many session columns. */
    minSessionColumns: z.number().int().positive().default(1),
  }),

  columns: z.object({
    name: ColumnBandSchema,
    department: ColumnBandSchema.nullable().default(null),
    sessions: z.object({
      /** The band inside which session columns are found. */
      xMin: z.number(),
      xMax: z.number(),
      /**
       * Recognises a session column's header cell — typically a date. The
       * value it matches is read from the document, never stored here.
       */
      headerPattern: RegexString,
      /**
       * How far a mark may sit from its column's header x and still belong
       * to it. Marks are usually centred under a wider header, so this is
       * never zero.
       */
      markTolerance: z.number().positive().default(40),
    }),
  }),

  /**
   * Named `rowRules`, not `rows`, on purpose: `rows` is exactly the key a
   * leaked roster would arrive under, and the guard below refuses it. A
   * schema field that shadowed it would have made the guard unusable.
   */
  rowRules: z.object({
    /**
     * Text that ends the table — a totals line, a signature block. A row
     * containing any of these, and everything after it, is not data.
     */
    stopBefore: z.array(z.string().min(1)).default([]),
    /** Rows whose name cell is shorter than this are not participants. */
    minNameLength: z.number().int().positive().default(2),
  }),

  /**
   * How this client's register spells each attendance state. Keys are the
   * literal cell text; values are the canonical status.
   *
   * This is layout vocabulary, not data: "ح means present" is a property of
   * the form, the same way the column positions are.
   */
  marks: z.record(z.string().min(1), AttendanceStatusSchema),

  /**
   * Times a register does not record. An attendance sheet says who came, not
   * for how long, so these come from the client's usual schedule and are
   * editable in the review step.
   */
  defaultSession: z
    .object({
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      durationHours: z.number().nonnegative().max(24),
    })
    .prefault({ startTime: "09:00", endTime: "12:00", durationHours: 3 }),
});

export type ExtractionProfile = z.infer<typeof ExtractionProfileSchema>;
export type ExtractionProfileInput = z.input<typeof ExtractionProfileSchema>;

/**
 * Keys that would only ever appear if extracted data had leaked into a
 * profile. None is a field of the schema above — which is exactly why
 * `rows` was renamed to `rowRules`.
 */
const DATA_SHAPED_KEYS = [
  "participants",
  "rows",
  "names",
  "roster",
  "attendees",
  "attendance",
  "records",
  "people",
];

/**
 * Refuse a profile that carries anything resembling extracted data.
 *
 * Run against the **raw input, before parsing**, and that ordering is the
 * whole point. Zod strips unknown keys, so a model returning
 * `{ ...layout, participants: [...] }` would otherwise have the roster
 * silently dropped and the call recorded as a clean success — the boundary
 * would have been crossed and nobody would ever see it. Checking first turns
 * that into a loud error.
 *
 * See ADR 0011.
 */
export function assertNoParticipantData(input: unknown): void {
  const raw = JSON.stringify(input) ?? "";

  for (const key of DATA_SHAPED_KEYS) {
    if (new RegExp(`"${key}"\\s*:`).test(raw)) {
      throw new Error(
        `Extraction profile contains a "${key}" field. A profile describes ` +
          "layout only; it must never carry extracted rows. See ADR 0011.",
      );
    }
  }

  // Mark keys are single tokens like "ح" or "P". Anything long enough to be
  // a person's name is not a mark.
  const marks = (input as { marks?: unknown } | null)?.marks;
  if (marks && typeof marks === "object") {
    for (const token of Object.keys(marks)) {
      if (token.length > 8) {
        throw new Error(
          `Mark token "${token}" is too long to be a tick. Marks are the ` +
            "symbols a register uses, not values read from it.",
        );
      }
    }
  }
}

/** Guard, then parse. Use this everywhere a profile is loaded. */
export function parseProfile(input: unknown): ExtractionProfile {
  assertNoParticipantData(input);
  return ExtractionProfileSchema.parse(input);
}
