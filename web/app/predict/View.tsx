"use client";

import { useState } from "react";
import { commit } from "@/lib/veil";
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

/** Shape returned by GET /api/proof. */
interface ProofBundle {
  sealHex: string;
  imageIdHex: string;
  journalDigestHex: string;
  xHashHex: string;
  commitmentCHex: string;
  prediction: { x: number; y: number };
  meta: { source: string; note: string };
}

interface ProofError {
  error: string;
  detail?: string;
}

type CommitState =
  | { phase: "idle" }
  | { phase: "committing" }
  | { phase: "done"; txHash: string }
  | { phase: "already" }
  | { phase: "error"; message: string };

export default function PredictPage() {
  const wallet = useWallet();
  const [bundle, setBundle] = useState<ProofBundle | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [commitState, setCommitState] = useState<CommitState>({ phase: "idle" });

  async function generateProof() {
    setGenLoading(true);
    setGenError(null);
    setCommitState({ phase: "idle" });
    try {
      const res = await fetch("/api/proof");
      const data = (await res.json()) as ProofBundle | ProofError;
      if (!res.ok || "error" in data) {
        const e = data as ProofError;
        throw new Error(e.detail ?? e.error ?? "Proof service unavailable");
      }
      setBundle(data as ProofBundle);
    } catch (e) {
      setGenError(friendlyError(e));
    } finally {
      setGenLoading(false);
    }
  }

  async function commitOnChain() {
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
      const msg = friendlyError(e);
      // AlreadyCommitted is an expected, non-error state for the demo.
      if (e instanceof Error && /AlreadyCommitted/.test(e.message)) {
        setCommitState({ phase: "already" });
      } else {
        setCommitState({ phase: "error", message: msg });
      }
    }
  }

  const canCommit =
    !!bundle &&
    !!wallet.address &&
    commitState.phase !== "committing" &&
    commitState.phase !== "done";

  return (
    <PageShell>
      <PageHeader
        kicker="Predict"
        title={<>Generate a proof, then commit before the deadline.</>}
        lede="Generate a zero-knowledge proof of your forecast off-chain, then commit it on-chain before the event. The forecast Y and the model weights W never appear in what goes on-chain — only x_hash and the commitment C, timestamped now."
      />

      <div className="mt-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        {/* Left: wallet + actions */}
        <div className="flex flex-col gap-6">
          <WalletBar wallet={wallet} />

          <Panel>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="receipt-label">step 1 — off-chain proof</span>
                <p
                  className="text-[var(--muted)]"
                  style={{ fontSize: "12.5px", lineHeight: 1.6 }}
                >
                  Asks the proving service (/api/proof) for a real RISC Zero
                  Groth16 proof. No wallet needed for this step.
                </p>
              </div>
              <button
                className="btn"
                onClick={generateProof}
                disabled={genLoading}
              >
                {genLoading ? "generating proof…" : "Generate proof"}
              </button>
              {genError ? <Status kind="err">{genError}</Status> : null}
            </div>
          </Panel>

          <Panel>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="receipt-label">step 2 — commit on-chain</span>
                <p
                  className="text-[var(--muted)]"
                  style={{ fontSize: "12.5px", lineHeight: 1.6 }}
                >
                  Submits seal + x_hash + C to the Veil contract. Requires a
                  connected wallet and a generated proof.
                </p>
              </div>
              <button
                className="btn btn-primary"
                onClick={commitOnChain}
                disabled={!canCommit}
              >
                {commitState.phase === "committing"
                  ? "committing…"
                  : "Commit on-chain"}
              </button>

              {!wallet.address ? (
                <p className="text-[var(--faint)]" style={{ fontSize: "11.5px" }}>
                  Connect a wallet to enable committing.
                </p>
              ) : !bundle ? (
                <p className="text-[var(--faint)]" style={{ fontSize: "11.5px" }}>
                  Generate a proof first.
                </p>
              ) : null}

              {commitState.phase === "done" ? (
                <Status kind="ok">
                  <div className="flex flex-col gap-1">
                    <span>committed ✓</span>
                    <ExplorerLink href={explorerTx(commitState.txHash)}>
                      tx {truncate(commitState.txHash, 8, 8)} ↗
                    </ExplorerLink>
                  </div>
                </Status>
              ) : null}

              {commitState.phase === "already" ? (
                <Status kind="info">
                  This wallet has already committed for this round — a proof is
                  already on-chain. Head to{" "}
                  <a className="link" href="/reveal">
                    Reveal
                  </a>{" "}
                  after the event.
                </Status>
              ) : null}

              {commitState.phase === "error" ? (
                <Status kind="err">{commitState.message}</Status>
              ) : null}
            </div>
          </Panel>
        </div>

        {/* Right: proof receipt */}
        <div className="flex flex-col gap-4">
          {bundle ? (
            <Panel className="rise">
              <div
                className="flex items-center justify-between"
                style={{
                  marginBottom: "6px",
                  paddingBottom: "14px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <span className="receipt-label">proof receipt</span>
                <span className="verified" style={{ fontSize: "11px" }}>
                  proof ready ✓
                </span>
              </div>

              <ReceiptRow label="public input X">
                {formatCents(bundle.prediction.x)}
              </ReceiptRow>
              <ReceiptRow label="image_id">
                {truncate(bundle.imageIdHex, 12, 10)}
              </ReceiptRow>
              <ReceiptRow label="x_hash">
                {truncate(bundle.xHashHex, 12, 10)}
              </ReceiptRow>
              <ReceiptRow label="commitment C">
                {truncate(bundle.commitmentCHex, 12, 10)}
              </ReceiptRow>
              <ReceiptRow label="seal">
                {truncate(bundle.sealHex, 10, 8)} ·{" "}
                {Math.ceil(bundle.sealHex.length / 2)} bytes
              </ReceiptRow>
              <ReceiptRow label="forecast Y">
                <span className="text-[var(--faint)]">sealed — not on-chain</span>
              </ReceiptRow>
              <ReceiptRow label="weights W">
                <span className="text-[var(--faint)]">never revealed</span>
              </ReceiptRow>

              <p
                className="text-[var(--faint)]"
                style={{
                  fontSize: "11px",
                  lineHeight: 1.6,
                  marginTop: "16px",
                }}
              >
                {bundle.meta.note} Source: {bundle.meta.source}.
              </p>
            </Panel>
          ) : (
            <Panel className="flex items-center justify-center" >
              <div
                className="flex flex-col items-center gap-3 text-center"
                style={{ padding: "48px 16px" }}
              >
                <span className="receipt-label">no proof yet</span>
                <p
                  className="text-[var(--muted)]"
                  style={{ fontSize: "12.5px", maxWidth: "38ch", lineHeight: 1.6 }}
                >
                  Generate a proof to see the bundle — image_id, x_hash and the
                  commitment C. Your forecast and weights stay off the record.
                </p>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
