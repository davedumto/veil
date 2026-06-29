"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { commit, getConfig, type Config } from "@/lib/veil";
import { explorerTx } from "@/lib/config";
import { useWallet } from "@/components/useWallet";
import {
  PageShell,
  PageHeader,
  Panel,
  ReceiptRow,
  Status,
  WalletBar,
  ExplorerLink,
} from "@/components/ui";
import { truncate, formatCents, friendlyError } from "@/components/format";

// ── proof job types (mirror /api/proof) ──
type JobPhase = "queued" | "proving" | "ready" | "failed";
interface ProofBundle {
  sealHex: string;
  imageIdHex: string;
  journalDigestHex: string;
  xHashHex: string;
  commitmentCHex: string;
  y: number;
  saltHex: string;
}
interface JobStatus {
  jobId: string;
  phase: JobPhase;
  bundle: ProofBundle | null;
  error: string | null;
  runId: string | null;
}

type CommitState =
  | { phase: "idle" }
  | { phase: "committing" }
  | { phase: "done"; txHash: string }
  | { phase: "already" }
  | { phase: "error"; message: string };

const LS_JOB = "veil:proofJob"; // persist jobId so a user can leave and return

// Random 32-byte salt as 64 hex chars (browser crypto).
function randomSalt(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

const PHASE_LABEL: Record<JobPhase, string> = {
  queued: "Queued — dispatching prover…",
  proving: "Proving — running your model in the zkVM + Groth16 wrap (~5–10 min)…",
  ready: "Proof ready ✓",
  failed: "Proof failed",
};

export default function PredictPage() {
  const wallet = useWallet();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);

  // The user's PRIVATE model: Y = w0 + w1·X. Defaults give a sane forecast.
  const [w0, setW0] = useState("200000");
  const [w1, setW1] = useState("1");

  const [job, setJob] = useState<JobStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [commitState, setCommitState] = useState<CommitState>({ phase: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load round metadata.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const c = await getConfig();
        if (!cancelled) setCfg(c);
      } catch (e) {
        if (!cancelled) setCfgError(friendlyError(e));
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  const x = cfg ? Number(cfg.x) : 0;
  const forecastY =
    Number.isFinite(Number(w0)) && Number.isFinite(Number(w1))
      ? Number(w0) + Number(w1) * x
      : NaN;

  // Poll a job until ready/failed.
  const poll = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const res = await fetch(`/api/proof?jobId=${encodeURIComponent(jobId)}`);
        if (res.status === 404) {
          // Server restarted / job gone — clear it.
          localStorage.removeItem(LS_JOB);
          setJob(null);
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
        const s = (await res.json()) as JobStatus;
        setJob(s);
        if (s.phase === "ready" || s.phase === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        /* transient; keep polling */
      }
    };
    void tick();
    pollRef.current = setInterval(tick, 8000);
  }, []);

  // Resume a persisted job on mount.
  useEffect(() => {
    const saved = localStorage.getItem(LS_JOB);
    if (saved) poll(saved);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [poll]);

  async function startProof() {
    if (!cfg) return;
    setStarting(true);
    setStartError(null);
    setCommitState({ phase: "idle" });
    try {
      const saltHex = randomSalt();
      const res = await fetch("/api/proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x: Number(cfg.x),
          w0: Number(w0),
          w1: Number(w1),
          saltHex,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? "Failed to start proof");
      localStorage.setItem(LS_JOB, data.jobId);
      poll(data.jobId);
    } catch (e) {
      setStartError(friendlyError(e));
    } finally {
      setStarting(false);
    }
  }

  function reset() {
    localStorage.removeItem(LS_JOB);
    if (pollRef.current) clearInterval(pollRef.current);
    setJob(null);
    setCommitState({ phase: "idle" });
  }

  async function commitOnChain() {
    const bundle = job?.bundle;
    if (!bundle) return;
    setCommitState({ phase: "committing" });
    try {
      const txHash = await commit({
        sealHex: bundle.sealHex,
        xHashHex: bundle.xHashHex,
        commitmentCHex: bundle.commitmentCHex,
      });
      setCommitState({ phase: "done", txHash });
    } catch (e) {
      const raw = JSON.stringify(e) + String(e);
      if (/AlreadyCommitted/.test(raw) || /Error\s*\(\s*Contract\s*,\s*#?4\s*\)/i.test(raw)) {
        setCommitState({ phase: "already" });
      } else {
        setCommitState({ phase: "error", message: friendlyError(e) });
      }
    }
  }

  const bundle = job?.bundle ?? null;
  const proving = job?.phase === "queued" || job?.phase === "proving";
  const canCommit =
    !!bundle &&
    !!wallet.address &&
    commitState.phase !== "committing" &&
    commitState.phase !== "done";

  return (
    <PageShell>
      <PageHeader
        kicker="Predict"
        title={<>Prove your forecast. Commit it before the event.</>}
        lede="Enter your private model. We generate a real zero-knowledge proof that your forecast came from it — without ever revealing the weights — then you commit it on-chain. Your forecast Y and weights W never go on-chain until you choose to reveal."
      />

      {/* Round banner */}
      {cfg ? (
        <Panel className="mt-8">
          <div className="flex flex-col gap-2">
            <span className="receipt-label">current round</span>
            <p style={{ fontSize: "18px", lineHeight: 1.4 }}>{cfg.question}</p>
            <div className="flex flex-wrap gap-x-8 gap-y-1" style={{ marginTop: "6px" }}>
              <ReceiptRow label="public input X">
                {formatCents(Number(cfg.x))} <span className="text-[var(--faint)]">({cfg.asset})</span>
              </ReceiptRow>
              <ReceiptRow label="commit deadline">
                {new Date(Number(cfg.deadline) * 1000).toLocaleString()}
              </ReceiptRow>
            </div>
          </div>
        </Panel>
      ) : cfgError ? (
        <Status kind="err">Couldn&apos;t load the round: {cfgError}</Status>
      ) : (
        <p className="text-[var(--faint)] mt-8" style={{ fontSize: "12.5px" }}>
          Loading round…
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        {/* Left: model input + actions */}
        <div className="flex flex-col gap-6">
          <WalletBar wallet={wallet} />

          {/* Step 1 — your private model */}
          <Panel>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="receipt-label">step 1 — your private model</span>
                <p className="text-[var(--muted)]" style={{ fontSize: "12.5px", lineHeight: 1.6 }}>
                  Your &quot;model&quot; is two private weights. The forecast is
                  <span className="text-[var(--text)]"> Y = w0 + w1 · X</span>. These
                  weights are your secret — they go into the proof and are never revealed.
                </p>
              </div>

              <div className="flex gap-4">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="receipt-label">w0 (bias)</span>
                  <input
                    className="field"
                    inputMode="numeric"
                    value={w0}
                    onChange={(e) => setW0(e.target.value)}
                    disabled={proving || !!bundle}
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="receipt-label">w1 (slope)</span>
                  <input
                    className="field"
                    inputMode="numeric"
                    value={w1}
                    onChange={(e) => setW1(e.target.value)}
                    disabled={proving || !!bundle}
                  />
                </label>
              </div>

              <ReceiptRow label="your forecast Y">
                {Number.isFinite(forecastY) ? (
                  <span className="verified">{formatCents(forecastY)}</span>
                ) : (
                  <span className="text-[var(--faint)]">enter weights</span>
                )}
                <span className="text-[var(--faint)]"> — stays private until reveal</span>
              </ReceiptRow>

              {!job ? (
                <button
                  className="btn"
                  onClick={startProof}
                  disabled={!cfg || starting || !Number.isFinite(forecastY)}
                >
                  {starting ? "starting…" : "Generate zero-knowledge proof"}
                </button>
              ) : (
                <button className="btn" onClick={reset} disabled={proving}>
                  {proving ? "proving — please wait" : "Start over"}
                </button>
              )}
              {startError ? <Status kind="err">{startError}</Status> : null}
            </div>
          </Panel>

          {/* Step 2 — proving status */}
          {job ? (
            <Panel>
              <div className="flex flex-col gap-3">
                <span className="receipt-label">step 2 — proving</span>
                <Status kind={job.phase === "failed" ? "err" : job.phase === "ready" ? "ok" : "info"}>
                  {PHASE_LABEL[job.phase]}
                </Status>
                {proving ? (
                  <p className="text-[var(--faint)]" style={{ fontSize: "11.5px", lineHeight: 1.6 }}>
                    The Groth16 wrap runs on an x86 prover — this takes a few
                    minutes. You can leave this page and come back; the job
                    resumes automatically.
                    {job.runId ? (
                      <>
                        {" "}
                        <a
                          className="link"
                          href={`https://github.com/davedumto/ASN-Verix/actions/runs/${job.runId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          watch the prover ↗
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : null}
                {job.phase === "failed" && job.error ? (
                  <p className="text-[var(--faint)]" style={{ fontSize: "11.5px" }}>{job.error}</p>
                ) : null}
              </div>
            </Panel>
          ) : null}

          {/* Step 3 — commit */}
          {bundle ? (
            <Panel>
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <span className="receipt-label">step 3 — commit on-chain</span>
                  <p className="text-[var(--muted)]" style={{ fontSize: "12.5px", lineHeight: 1.6 }}>
                    Submits the proof + commitment to the Veil contract, which
                    verifies the proof on-chain before storing it.
                  </p>
                </div>
                <button className="btn btn-primary" onClick={commitOnChain} disabled={!canCommit}>
                  {commitState.phase === "committing" ? "committing…" : "Commit on-chain"}
                </button>
                {!wallet.address ? (
                  <p className="text-[var(--faint)]" style={{ fontSize: "11.5px" }}>
                    Connect a wallet to commit.
                  </p>
                ) : null}
                {commitState.phase === "done" ? (
                  <Status kind="ok">
                    <div className="flex flex-col gap-1">
                      <span>committed ✓ — your forecast is sealed on-chain.</span>
                      <ExplorerLink href={explorerTx(commitState.txHash)}>
                        tx {truncate(commitState.txHash, 8, 8)} ↗
                      </ExplorerLink>
                      <span className="text-[var(--faint)]" style={{ fontSize: "11px" }}>
                        Keep your Y ({formatCents(bundle.y)}) and salt to reveal after the event.
                      </span>
                    </div>
                  </Status>
                ) : null}
                {commitState.phase === "already" ? (
                  <Status kind="info">
                    This wallet already committed for this round. Head to{" "}
                    <a className="link" href="/reveal">Reveal</a> after the event.
                  </Status>
                ) : null}
                {commitState.phase === "error" ? (
                  <Status kind="err">{commitState.message}</Status>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </div>

        {/* Right: proof receipt */}
        <div className="flex flex-col gap-4">
          {bundle ? (
            <Panel className="rise">
              <div
                className="flex items-center justify-between"
                style={{ marginBottom: "6px", paddingBottom: "14px", borderBottom: "1px solid var(--line)" }}
              >
                <span className="receipt-label">proof receipt</span>
                <span className="verified" style={{ fontSize: "11px" }}>proof ready ✓</span>
              </div>
              <ReceiptRow label="public input X">{formatCents(x)}</ReceiptRow>
              <ReceiptRow label="image_id">{truncate(bundle.imageIdHex, 12, 10)}</ReceiptRow>
              <ReceiptRow label="x_hash">{truncate(bundle.xHashHex, 12, 10)}</ReceiptRow>
              <ReceiptRow label="commitment C">{truncate(bundle.commitmentCHex, 12, 10)}</ReceiptRow>
              <ReceiptRow label="seal">
                {truncate(bundle.sealHex, 10, 8)} · {Math.ceil(bundle.sealHex.length / 2)} bytes
              </ReceiptRow>
              <ReceiptRow label="forecast Y">
                <span className="text-[var(--faint)]">sealed — not on-chain</span>
              </ReceiptRow>
              <ReceiptRow label="weights W">
                <span className="text-[var(--faint)]">never revealed</span>
              </ReceiptRow>
              <p className="text-[var(--faint)]" style={{ fontSize: "11px", lineHeight: 1.6, marginTop: "16px" }}>
                Real RISC Zero Groth16 proof generated from your private weights.
                W never appears in the journal.
              </p>
            </Panel>
          ) : (
            <Panel className="flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center" style={{ padding: "48px 16px" }}>
                <span className="receipt-label">no proof yet</span>
                <p className="text-[var(--muted)]" style={{ fontSize: "12.5px", maxWidth: "40ch", lineHeight: 1.6 }}>
                  Enter your private model and generate a proof. The receipt — image_id,
                  x_hash, commitment C — appears here. Your forecast and weights stay
                  off the record.
                </p>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
