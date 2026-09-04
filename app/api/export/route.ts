/**
 * Finalize: render the package, then clear the draft.
 *
 * Thin, like the other routes. The ordering guarantee that matters — render
 * everything before writing anything, delete the draft only after the
 * package is safely on disk — lives in export-package.ts, so a test can
 * exercise it without going through HTTP.
 */

import { NextResponse } from "next/server";

import { deleteDraft, readDraft } from "@/lib/draft-store";
import { ChecklistError, ExportError, exportPackage } from "@/lib/export-package";
import { DEFAULT_PROFILE } from "@/render/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const draft = await readDraft();
  if (!draft) {
    return NextResponse.json({ error: "There is no draft to finalize." }, { status: 404 });
  }

  let result;
  try {
    result = await exportPackage(draft, DEFAULT_PROFILE);
  } catch (error) {
    if (error instanceof ChecklistError) {
      return NextResponse.json(
        { error: "The checklist is not complete.", failing: error.failing },
        { status: 422 },
      );
    }
    if (error instanceof ExportError) {
      // Name the section that failed. Nothing was written, and the draft is
      // still there.
      return NextResponse.json(
        { error: error.message, section: error.section, draftPreserved: true },
        { status: 500 },
      );
    }
    throw error;
  }

  // Only now, with the package on disk, is the draft safe to remove.
  await deleteDraft();

  return NextResponse.json({
    ok: true,
    directory: result.name,
    files: result.files,
  });
}
