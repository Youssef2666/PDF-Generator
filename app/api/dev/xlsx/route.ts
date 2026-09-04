/**
 * TEMPORARY — development-only Excel preview.
 *
 * This is not the export route. The real one (M5) renders all three
 * documents, writes them to output/<date>-<client>-<course>/ alongside
 * report-data.json, and deletes the draft. This endpoint renders one
 * workbook and hands it straight back, so the Excel renderer can be looked
 * at in a real copy of Excel while it is being built.
 *
 * It returns 404 in production, and it is expected to be deleted when
 * app/api/export/route.ts lands.
 */

import { NextResponse } from "next/server";

import { readDraft } from "@/lib/draft-store";
import { renderXlsx } from "@/render/xlsx";
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

  const buffer = await renderXlsx(draft, DEFAULT_PROFILE);
  const slug = (draft.course.code ?? "report").replace(/[^A-Za-z0-9_-]+/g, "-");

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${slug}-preview.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
