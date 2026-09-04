/**
 * Upload an attendance PDF and try the committed profiles against it.
 *
 * Returns a proposed table for review. It does **not** touch the draft —
 * nothing enters the draft until a human confirms it on the review screen,
 * which is a separate PUT to /api/draft.
 */

import { NextResponse } from "next/server";

import { extractWithCommittedProfiles, storeUpload } from "@/lib/pdf/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generous for a scanned register, small enough to refuse a mistake. */
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected a PDF in the 'file' field." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 25 MB.` },
      { status: 413 },
    );
  }

  const data = new Uint8Array(await file.arrayBuffer());
  if (data[0] !== 0x25 || data[1] !== 0x50) {
    return NextResponse.json({ error: "That file is not a PDF." }, { status: 415 });
  }

  const upload = await storeUpload(data, file.name);

  try {
    const { pages, best, tried } = await extractWithCommittedProfiles(data);

    return NextResponse.json({
      upload,
      pageCount: pages.length,
      profilesTried: tried,
      // null when no committed profile fits — the UI then offers the manual
      // table, and the proposal path if it has been enabled.
      match: best
        ? {
            profileId: best.profile.id,
            profileName: best.profile.name,
            origin: best.profile.origin,
            confidence: best.result.confidence,
            sessions: best.result.sessions,
            participants: best.result.participants,
            warnings: best.result.warnings,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        upload,
        error: `Could not read that PDF: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 422 },
    );
  }
}
