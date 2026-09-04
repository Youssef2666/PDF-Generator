/**
 * PostToolUse hook target.
 *
 * Claude Code POSTs the hook event JSON here after any Edit or Write. If the
 * edited file was the working draft and it no longer parses, this route says
 * so, and Claude Code feeds the reason back into the session — the editing
 * agent learns immediately that it wrote something the schema rejects,
 * instead of discovering it at export time.
 *
 * The two contracts that govern this file:
 *
 *   1. HTTP hooks cannot block with a status code. A non-2xx response is
 *      treated as a *non-blocking error* and the decision is discarded. The
 *      decision must therefore travel in a 2xx JSON body. Every path in this
 *      route returns 200, including the failure paths.
 *
 *   2. PostToolUse runs after the tool has already executed, so it has no
 *      `permissionDecision` — that belongs to PreToolUse. Its blocking shape
 *      is `{"decision":"block","reason":"..."}`.
 *
 * The route also stays quiet about files that are not the draft: a hook that
 * fires on every Edit must have no opinion about almost all of them.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getDraftPath } from "@/lib/draft-store";
import { DraftSchema, summariseZodError } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** No opinion. An empty 200 body lets the tool call stand. */
const ALLOW = new Response(null, { status: 200 });

/** Feed a reason back into the session. Must be 200 to be honoured. */
function block(reason: string) {
  return NextResponse.json({ decision: "block", reason }, { status: 200 });
}

interface HookEvent {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { file_path?: string };
  cwd?: string;
}

/**
 * True when the edited path is the draft file. Paths are resolved before
 * comparison because a hook may report either a relative or an absolute
 * path, and on Windows the two spellings differ in separator and case.
 */
function isDraftFile(filePath: string, cwd: string | undefined): boolean {
  const resolved = path.resolve(cwd ?? process.cwd(), filePath);
  const target = path.resolve(getDraftPath());
  return process.platform === "win32"
    ? resolved.toLowerCase() === target.toLowerCase()
    : resolved === target;
}

export async function POST(request: Request) {
  try {
    const event = (await request.json()) as HookEvent;
    const filePath = event.tool_input?.file_path;

    // Not a file-editing event, or not our file: say nothing.
    if (!filePath || !isDraftFile(filePath, event.cwd)) return ALLOW;

    let raw: string;
    try {
      // Read the draft by its own resolved path, never the one supplied in
      // the request. The check above already established the two are the
      // same file, so this loses nothing — and it keeps the endpoint from
      // being a "read any file the caller names" primitive, which is a bad
      // shape for an HTTP handler even on localhost.
      raw = await fs.readFile(getDraftPath(), "utf8");
    } catch (error) {
      // The draft having been deleted is a legitimate action, not a
      // violation — the finalize step ends by removing it.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return ALLOW;
      throw error;
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (error) {
      return block(
        `data/drafts/current.json is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const parsed = DraftSchema.safeParse(json);
    if (parsed.success) return ALLOW;

    return block(
      `data/drafts/current.json does not satisfy DraftSchema — ${summariseZodError(parsed.error)}`,
    );
  } catch (error) {
    // The validator itself failed. Fail open: a broken hook must not wedge
    // the session, and a non-2xx here would be discarded as a non-blocking
    // error anyway.
    console.error("[validate-draft] hook failed open:", error);
    return ALLOW;
  }
}
