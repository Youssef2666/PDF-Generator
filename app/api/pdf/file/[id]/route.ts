/**
 * Serves an uploaded PDF back for the review screen's side-by-side view.
 *
 * Read-only, by construction: `readUpload` accepts a generated UUID and
 * nothing else, so this cannot be talked into returning an arbitrary file.
 */

import { NextResponse } from "next/server";

import { readUpload } from "@/lib/pdf/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const data = await readUpload(id);

  if (!data) return NextResponse.json({ error: "No such upload." }, { status: 404 });

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "no-store",
    },
  });
}
