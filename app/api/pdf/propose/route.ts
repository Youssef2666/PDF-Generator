/**
 * The model fallback, behind two switches.
 *
 * GET  — reports whether the feature is available, and returns the exact
 *        payload that *would* be sent, so the UI can show it before anyone
 *        consents to anything.
 * POST — sends it, but only with explicit consent in the body.
 *
 * The route never returns extracted rows from a model. It returns a profile,
 * which it has already run locally through deterministic.ts so the operator
 * sees the resulting table alongside it.
 */

import { NextResponse } from "next/server";

import { applyProfile } from "@/lib/pdf/deterministic";
import { extractText } from "@/lib/pdf/extract-text";
import { readUpload } from "@/lib/pdf/ingest";
import {
  buildAnonymisedSample,
  proposalEnabled,
  ProposalDisabledError,
  proposeProfile,
} from "@/lib/pdf/propose-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Preview: what would be sent, without sending it. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("upload");
  if (!id) return NextResponse.json({ error: "Missing ?upload=" }, { status: 400 });

  const data = await readUpload(id);
  if (!data) return NextResponse.json({ error: "No such upload." }, { status: 404 });

  const sample = buildAnonymisedSample(await extractText(data));

  return NextResponse.json({
    enabled: proposalEnabled(),
    hasCredentials: Boolean(process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN),
    // The literal bytes that would leave the machine. Shown verbatim.
    payload: sample?.payload ?? null,
    redactedCellCount:
      sample?.rows.reduce((n, row) => n + row.cells.filter((c) => c.redacted).length, 0) ?? 0,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    upload?: string;
    consent?: boolean;
  };

  if (!body.upload) {
    return NextResponse.json({ error: "Missing upload id." }, { status: 400 });
  }

  const data = await readUpload(body.upload);
  if (!data) return NextResponse.json({ error: "No such upload." }, { status: 404 });

  const pages = await extractText(data);

  try {
    const proposal = await proposeProfile(pages, { consent: Boolean(body.consent) });
    // Run it locally straight away: a profile is only interesting if it
    // produces a table, and the operator should judge both together.
    const result = applyProfile(pages, proposal.profile);

    return NextResponse.json({
      profile: proposal.profile,
      reasoning: proposal.reasoning,
      payload: proposal.payload,
      confidence: result.confidence,
      sessions: result.sessions,
      participants: result.participants,
      warnings: result.warnings,
    });
  } catch (error) {
    if (error instanceof ProposalDisabledError) {
      return NextResponse.json({ error: error.message, sentNothing: true }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
