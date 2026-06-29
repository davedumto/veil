import { NextRequest, NextResponse } from "next/server";
import { startProof, getJob } from "@/lib/proving";

// The off-chain proving service (NFR-4). The browser NEVER proves.
//
//   POST /api/proof   { x, w0, w1, saltHex }  → { jobId }
//       Starts a real proof job: dispatches the groth16-proof CI workflow with
//       the user's PRIVATE weights and the round's public input X. The weights
//       go into the proof and never on-chain.
//
//   GET  /api/proof?jobId=...                 → { phase, bundle?, error? }
//       Polls job status. phase: queued | proving | ready | failed. When ready,
//       `bundle` carries seal/image_id/journal_digest + x_hash/C (+ the y/salt
//       the client keeps for reveal).
//
// Proofs take ~5-10 min (the Groth16 wrap runs on an x86 CI runner). The client
// shows a live "proving" state and can leave and come back to the same jobId.

export const dynamic = "force-dynamic";

const HEX64 = /^[0-9a-fA-F]{64}$/;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { x, w0, w1, saltHex } = (body ?? {}) as Record<string, unknown>;

  if (
    !Number.isFinite(Number(x)) ||
    !Number.isFinite(Number(w0)) ||
    !Number.isFinite(Number(w1))
  ) {
    return NextResponse.json(
      { error: "x, w0, w1 must be numbers" },
      { status: 400 },
    );
  }
  if (typeof saltHex !== "string" || !HEX64.test(saltHex)) {
    return NextResponse.json(
      { error: "saltHex must be 64 hex chars (32 bytes)" },
      { status: 400 },
    );
  }

  try {
    const job = startProof({
      x: Number(x),
      w0: Number(w0),
      w1: Number(w1),
      saltHex,
    });
    return NextResponse.json({ jobId: job.id, phase: job.phase });
  } catch (err) {
    return NextResponse.json(
      {
        error: "proof_dispatch_failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }
  return NextResponse.json({
    jobId: job.id,
    phase: job.phase,
    forecast: job.forecast,
    bundle: job.bundle ?? null,
    error: job.error ?? null,
    runId: job.runId ?? null,
  });
}
