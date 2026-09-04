/**
 * TEMPORARY — development-only Word preview.
 *
 * Sibling of ../xlsx/route.ts, and deleted alongside it when
 * app/api/export/route.ts lands in M5. This exists because the only real
 * test of the Word renderer is opening the file in Word, on both macOS and
 * Windows — no amount of XML assertion substitutes for that.
 */

import { NextResponse } from "next/server";

import { readDraft } from "@/lib/draft-store";
import { renderDocx } from "@/render/docx";
import { DEFAULT_PROFILE } from "@/render/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const draft = await readDraft();
  if (!draft) {
    return NextResponse.json({ error: "No draft to render." }, { status: 404 });
  }

  const buffer = await renderDocx(draft, DEFAULT_PROFILE);
  const slug = (draft.course.code ?? "report").replace(/[^A-Za-z0-9_-]+/g, "-");

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${slug}-preview.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
