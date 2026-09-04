/**
 * The draft resource. Every read and write of the working draft goes through
 * here; the editor autosaves against PUT.
 *
 * The route is a thin shell over draft-store: it translates transport
 * concerns (JSON parsing, status codes) and nothing else. Validation,
 * recomputation and atomicity all belong to the store, so that a draft
 * written by a test, by a script or by the browser is subject to identical
 * rules.
 */

import { NextResponse } from "next/server";

import { deleteDraft, DraftValidationError, readDraft, writeDraft } from "@/lib/draft-store";

// The store touches the filesystem, so this cannot run on the edge, and it
// must never be prerendered or cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 200 with `{ draft }`, where draft is null when none exists.
 *
 * "No draft yet" is the normal opening state of the app rather than an
 * error, so it is not a 404. A draft that exists but fails to parse *is* an
 * error, and surfaces as 422 rather than being flattened to null.
 */
export async function GET() {
  try {
    return NextResponse.json({ draft: await readDraft() });
  } catch (error) {
    if (error instanceof DraftValidationError) {
      return NextResponse.json(
        { error: "The stored draft is not valid.", summary: error.summary },
        { status: 422 },
      );
    }
    throw error;
  }
}

/** Replace the draft. Returns it as stored, with computed fields filled in. */
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body is not valid JSON." }, { status: 400 });
  }

  try {
    return NextResponse.json({ draft: await writeDraft(body) });
  } catch (error) {
    if (error instanceof DraftValidationError) {
      return NextResponse.json(
        { error: "Draft failed validation; nothing was written.", summary: error.summary },
        { status: 422 },
      );
    }
    throw error;
  }
}

/** Discard the draft. Idempotent: deleting nothing is not an error. */
export async function DELETE() {
  return NextResponse.json({ deleted: await deleteDraft() });
}
