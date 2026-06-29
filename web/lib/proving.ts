// Per-user proving service (server-side only).
//
// The Groth16 wrap needs x86 + Docker, so we generate each user's proof in
// GitHub Actions: dispatch the `groth16-proof` workflow with the user's private
// weights + the round's public input X, poll until it finishes, then download
// the artifact (seal / image_id / journal_digest + the committed C / x_hash).
//
// The browser never proves and never sees a token — it talks only to /api/proof.
//
// Run identification: `gh workflow run` doesn't return a run id, so the workflow
// sets `run-name: proof:<label>` and we pass label = jobId, then find the run by
// that display name. Jobs are kept in an in-memory map (fine for a single-server
// demo; a real deployment would use a queue/DB).

import { execFile } from "node:child_process";
import {
  readFile,
  writeFile,
  mkdtemp,
  mkdir,
  rm,
} from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  PROOF_REPO,
  PROOF_WORKFLOW,
  PROOF_REF,
  PROOF_GH_TOKEN,
} from "./config";

const exec = promisify(execFile);

export type JobPhase = "queued" | "proving" | "ready" | "failed";

export interface ProofBundle {
  sealHex: string;
  imageIdHex: string;
  journalDigestHex: string;
  xHashHex: string;
  commitmentCHex: string;
  y: number; // the predictor's forecast (kept client-side until reveal)
  saltHex: string;
}

export interface Job {
  id: string;
  phase: JobPhase;
  createdAt: number;
  runId?: string;
  bundle?: ProofBundle;
  error?: string;
  // Echoed back so the client knows what to reveal later.
  forecast?: { x: number; w0: number; w1: number; y: number; saltHex: string };
}

// Disk-backed job store. The in-memory Map is a cache; jobs are persisted to a
// JSON file so they survive server restarts (dev hot-reloads, single-server
// redeploys). On a cold read, a job still mid-proof is re-attached to its CI run
// so polling resumes — no orphaned proofs.
const STORE_DIR = path.join(process.cwd(), ".veil-jobs");
const STORE_FILE = path.join(STORE_DIR, "jobs.json");

const jobs = new Map<string, Job>();
let loaded = false;

function loadStore(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (existsSync(STORE_FILE)) {
      const data = JSON.parse(readFileSync(STORE_FILE, "utf8")) as Job[];
      for (const j of data) jobs.set(j.id, j);
      // Re-attach any job that was still proving when the process died.
      for (const j of jobs.values()) {
        if ((j.phase === "proving" || j.phase === "queued") && j.runId) {
          void resume(j.id);
        }
      }
    }
  } catch {
    /* corrupt/missing store — start fresh */
  }
}

async function persist(): Promise<void> {
  try {
    if (!existsSync(STORE_DIR)) await mkdir(STORE_DIR, { recursive: true });
    await writeFile(STORE_FILE, JSON.stringify([...jobs.values()], null, 2));
  } catch {
    /* best-effort; in-memory still works */
  }
}

// Re-attach to a still-running CI run after a restart, then finish the pipeline.
async function resume(id: string): Promise<void> {
  const job = jobs.get(id);
  if (!job || !job.runId) return;
  try {
    const ok = await waitForRun(job.runId);
    if (!ok) {
      job.phase = "failed";
      job.error = "CI proof run did not succeed.";
      await persist();
      return;
    }
    job.bundle = await downloadBundle(job.runId, id, job.forecast!.saltHex);
    job.phase = "ready";
    await persist();
  } catch (e) {
    job.phase = "failed";
    job.error = e instanceof Error ? e.message : String(e);
    await persist();
  }
}

function ghEnv(): NodeJS.ProcessEnv {
  // Prefer an explicit token (hosted); otherwise inherit the logged-in gh CLI.
  return PROOF_GH_TOKEN
    ? { ...process.env, GH_TOKEN: PROOF_GH_TOKEN }
    : process.env;
}

async function gh(args: string[]): Promise<string> {
  const { stdout } = await exec("gh", args, {
    env: ghEnv(),
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

/** A short, URL/label-safe job id. Avoids Math.random for determinism concerns; uses time + counter. */
let counter = 0;
function newJobId(): string {
  counter = (counter + 1) % 1000;
  return `job-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/**
 * Start a proof job for a predictor's own model.
 * `x` is the round's public input; `w0,w1` are the user's PRIVATE weights;
 * `saltHex` is a 32-byte blinding salt (64 hex chars). Returns the job id.
 */
export function startProof(input: {
  x: number;
  w0: number;
  w1: number;
  saltHex: string;
}): Job {
  const id = newJobId();
  const y = input.w0 + input.w1 * input.x;
  const job: Job = {
    id,
    phase: "queued",
    createdAt: Date.now(),
    forecast: { x: input.x, w0: input.w0, w1: input.w1, y, saltHex: input.saltHex },
  };
  loadStore();
  jobs.set(id, job);
  void persist();
  // Fire-and-forget the async pipeline; status is polled via getJob.
  void runPipeline(id, input).catch(async (e) => {
    const j = jobs.get(id);
    if (j) {
      j.phase = "failed";
      j.error = e instanceof Error ? e.message : String(e);
      await persist();
    }
  });
  return job;
}

export function getJob(id: string): Job | undefined {
  loadStore();
  return jobs.get(id);
}

async function runPipeline(
  id: string,
  input: { x: number; w0: number; w1: number; saltHex: string },
): Promise<void> {
  const job = jobs.get(id);
  if (!job) return;

  // 1. Dispatch the workflow with label=jobId so we can find the run by name.
  await gh([
    "workflow", "run", PROOF_WORKFLOW,
    "--repo", PROOF_REPO,
    "--ref", PROOF_REF,
    "-f", `label=${id}`,
    "-f", `x=${input.x}`,
    "-f", `w0=${input.w0}`,
    "-f", `w1=${input.w1}`,
    "-f", `salt=${input.saltHex}`,
  ]);
  job.phase = "proving";
  await persist();

  // 2. Find the run by its run-name "proof:<id>" (poll briefly; dispatch lag).
  const runId = await findRunId(id);
  job.runId = runId;
  await persist(); // persist the runId so a restart can re-attach

  // 3. Wait for the run to complete.
  const ok = await waitForRun(runId);
  if (!ok) {
    job.phase = "failed";
    job.error = "CI proof run did not succeed.";
    await persist();
    return;
  }

  // 4. Download + parse the artifact.
  const bundle = await downloadBundle(runId, id, input.saltHex);
  job.bundle = bundle;
  job.phase = "ready";
  await persist();
}

async function findRunId(label: string): Promise<string> {
  const wanted = `proof:${label}`;
  // Poll up to ~60s for the dispatched run to appear.
  for (let i = 0; i < 20; i++) {
    const out = await gh([
      "run", "list",
      "--repo", PROOF_REPO,
      "--workflow", PROOF_WORKFLOW,
      "--limit", "30",
      "--json", "databaseId,displayTitle,status",
    ]);
    const runs: { databaseId: number; displayTitle: string }[] = JSON.parse(out);
    const match = runs.find((r) => r.displayTitle === wanted);
    if (match) return String(match.databaseId);
    await sleep(3000);
  }
  throw new Error(`Dispatched run not found for ${wanted}`);
}

async function waitForRun(runId: string): Promise<boolean> {
  // Poll up to ~15 min (proofs take ~10).
  for (let i = 0; i < 90; i++) {
    const out = await gh([
      "run", "view", runId,
      "--repo", PROOF_REPO,
      "--json", "status,conclusion",
    ]);
    const { status, conclusion } = JSON.parse(out) as {
      status: string;
      conclusion: string | null;
    };
    if (status === "completed") return conclusion === "success";
    await sleep(10000);
  }
  return false;
}

async function downloadBundle(
  runId: string,
  label: string,
  saltHex: string,
): Promise<ProofBundle> {
  const dir = await mkdtemp(path.join(tmpdir(), "veil-proof-"));
  try {
    await gh([
      "run", "download", runId,
      "--repo", PROOF_REPO,
      "--name", `groth16-proof-${label}`,
      "--dir", dir,
    ]);
    const proofTxt = await readFile(path.join(dir, "proof.txt"), "utf8");
    const commitTxt = await readFile(path.join(dir, "commit.txt"), "utf8");

    const [sealHex, imageIdHex, journalDigestHex] = proofTxt
      .trim()
      .split("\n")
      .map((l) => l.trim());

    const kv = Object.fromEntries(
      commitTxt
        .trim()
        .split("\n")
        .map((l) => l.split("=").map((s) => s.trim()))
        .map(([k, v]) => [k, v]),
    ) as Record<string, string>;

    if (!sealHex || !imageIdHex || !journalDigestHex || !kv.commitment_c) {
      throw new Error("proof artifact malformed");
    }

    return {
      sealHex,
      imageIdHex,
      journalDigestHex,
      xHashHex: kv.x_hash,
      commitmentCHex: kv.commitment_c,
      y: Number(kv.y),
      saltHex,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
