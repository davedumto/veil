"use client";

import { useCallback, useEffect, useState } from "react";
import {
  reveal,
  getMyCommitment,
  getOutcome,
  getMyEntry,
  type Commitment,
  type Entry,
} from "@/lib/veil";
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
import {
  bufHex,
  truncate,
  formatCents,
  formatTimestamp,
  friendlyError,
} from "@/components/format";

type RevealState =
  | { phase: "idle" }
  | { phase: "revealing" }
  | { phase: "done"; txHash: string; score: bigint | null }
  | { phase: "error"; message: string };

export default function RevealPage() {
  const wallet = useWallet();

  // Prefilled from the user's OWN proof job (the forecast they generated on
  // /predict, persisted in localStorage), so reveal matches their commitment.
  // Empty if they're revealing on a different device — they re-enter their secrets.
  const [y, setY] = useState<string>("");
  const [saltHex, setSaltHex] = useState<string>("");
  const [prefilled, setPrefilled] = useState(false);

  const [commitment, setCommitment] = useState<Commitment | null>(null);
  const [existingEntry, setExistingEntry] = useState<Entry | null>(null);
  const [outcome, setOutcome] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [state, setState] = useState<RevealState>({ phase: "idle" });

  // Load this wallet's commitment + entry + the outcome whenever connected.
  const loadFor = useCallback(async (address: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [c, o, e] = await Promise.all([
        getMyCommitment(address),
        getOutcome(),
        getMyEntry(address),
      ]);
      setCommitment(c);
      setOutcome(o);
      setExistingEntry(e);
    } catch (err) {
      setLoadError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Defer to a macrotask so the effect never sets state synchronously
  // (react-hooks/set-state-in-effect — avoids cascading renders).
  useEffect(() => {
    const address = wallet.address;
    const id = setTimeout(() => {
      if (address) {
        void loadFor(address);
      } else {
        setCommitment(null);
        setExistingEntry(null);
        setOutcome(null);
      }
    }, 0);
    return () => clearTimeout(id);
  }, [wallet.address, loadFor]);

  // Prefill Y + salt from the user's own proof job (if generated on this device).
  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        const jobId = localStorage.getItem("veil:proofJob");
        if (!jobId) return;
        const res = await fetch(`/api/proof?jobId=${encodeURIComponent(jobId)}`);
        if (!res.ok) return;
        const s = await res.json();
        const f = s.forecast;
        const salt = s.bundle?.saltHex ?? f?.saltHex;
        if (f?.y != null && salt) {
          setY(String(f.y));
          setSaltHex(salt);
          setPrefilled(true);
        }
      } catch {
        /* no prefill — user enters manually */
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  async function doReveal() {
    setState({ phase: "revealing" });
    try {
      const parsedY = BigInt(y.trim());
      const { txHash, score } = await reveal({
        y: parsedY,
        saltHex: saltHex.trim(),
      });
      setState({ phase: "done", txHash, score });
      if (wallet.address) void loadFor(wallet.address);
    } catch (e) {
      if (e instanceof Error && /SyntaxError|Cannot convert/.test(String(e))) {
        setState({ phase: "error", message: "Y must be a whole number (cents)." });
        return;
      }
      setState({ phase: "error", message: friendlyError(e) });
    }
  }

  const yNum = Number(y);
  const yValid = y.trim() !== "" && Number.isInteger(yNum);
  const saltValid = /^[0-9a-fA-F]{64}$/.test(saltHex.trim());
  const alreadyRevealed = !!existingEntry;
  const canReveal =
    !!wallet.address &&
    !!commitment &&
    yValid &&
    saltValid &&
    !alreadyRevealed &&
    state.phase !== "revealing" &&
    state.phase !== "done";

  return (
    <PageShell>
      <PageHeader
        kicker="Reveal"
        title={<>Open your forecast. Get scored.</>}
        lede="After the event, reveal your forecast Y and salt. The contract recomputes sha256(Y ‖ salt) and proves it matches what you committed — you can't change your prediction after the fact. Your score is the distance from the real outcome; lower is better."
      />

      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_1fr]">
        {/* Left: wallet + your commitment + outcome */}
        <div className="flex flex-col gap-6">
          <WalletBar wallet={wallet} />

          {wallet.address ? (
            <Panel>
              <div
                className="flex items-center justify-between"
                style={{
                  marginBottom: "4px",
                  paddingBottom: "12px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <span className="receipt-label">your commitment</span>
                {loading ? (
                  <span className="text-[var(--faint)]" style={{ fontSize: "11px" }}>
                    loading…
                  </span>
                ) : null}
              </div>

              {loadError ? (
                <Status kind="err">{loadError}</Status>
              ) : commitment ? (
                <>
                  <ReceiptRow label="commitment C">
                    {truncate(bufHex(commitment.commitment_c), 12, 8)}
                  </ReceiptRow>
                  <ReceiptRow label="x_hash">
                    {truncate(bufHex(commitment.x_hash), 12, 8)}
                  </ReceiptRow>
                  <ReceiptRow label="committed">
                    {formatTimestamp(commitment.committed_at)}
                  </ReceiptRow>
                  <ReceiptRow label="outcome">
                    {outcome !== null ? (
                      <span className="verified">{formatCents(outcome)}</span>
                    ) : (
                      <span className="text-[var(--faint)]">not set yet</span>
                    )}
                  </ReceiptRow>
                  {alreadyRevealed && existingEntry ? (
                    <ReceiptRow label="already revealed">
                      <span className="verified">
                        Y {formatCents(existingEntry.y)} · score{" "}
                        {existingEntry.score.toString()}
                      </span>
                    </ReceiptRow>
                  ) : null}
                </>
              ) : !loading ? (
                <Status kind="info">
                  No commitment found for this wallet. Commit a proof on{" "}
                  <a className="link" href="/predict">
                    Predict
                  </a>{" "}
                  before you can reveal.
                </Status>
              ) : null}
            </Panel>
          ) : (
            <Panel className="flex items-center justify-center">
              <p
                className="text-[var(--muted)]"
                style={{ fontSize: "12.5px", padding: "40px 16px", textAlign: "center" }}
              >
                Connect a wallet to load your commitment and reveal.
              </p>
            </Panel>
          )}
        </div>

        {/* Right: reveal form */}
        <div className="flex flex-col gap-6">
          <Panel>
            <div className="flex flex-col gap-5">
              <span className="receipt-label">reveal Y &amp; salt</span>

              <label className="flex flex-col gap-2">
                <span className="receipt-label">forecast Y (cents)</span>
                <input
                  className="field"
                  inputMode="numeric"
                  value={y}
                  onChange={(e) => setY(e.target.value)}
                  placeholder="10500"
                  disabled={alreadyRevealed}
                />
                <span className="text-[var(--faint)]" style={{ fontSize: "11.5px" }}>
                  {yValid ? `= ${formatCents(yNum)}` : "enter a whole number of cents"}
                </span>
              </label>

              <label className="flex flex-col gap-2">
                <span className="receipt-label">salt (32-byte hex)</span>
                <input
                  className="field"
                  value={saltHex}
                  onChange={(e) => setSaltHex(e.target.value)}
                  placeholder="64 hex chars"
                  spellCheck={false}
                  disabled={alreadyRevealed}
                  style={{ fontSize: "11.5px" }}
                />
                <span className="text-[var(--faint)]" style={{ fontSize: "11.5px" }}>
                  {saltValid
                    ? "valid 32-byte salt"
                    : "must be exactly 64 hex characters"}
                </span>
              </label>

              <p
                className="text-[var(--faint)]"
                style={{ fontSize: "11px", lineHeight: 1.6 }}
              >
                {prefilled
                  ? "Loaded from the proof you generated on this device. Changing Y or salt will fail the on-chain sha256 check."
                  : "Enter the Y and salt from when you committed. They must match exactly — the contract recomputes sha256(Y ‖ salt) and rejects any mismatch."}
              </p>

              <button
                className="btn btn-primary"
                onClick={doReveal}
                disabled={!canReveal}
              >
                {state.phase === "revealing" ? "revealing…" : "Reveal & score"}
              </button>

              {!wallet.address ? (
                <p className="text-[var(--faint)]" style={{ fontSize: "11.5px" }}>
                  Connect a wallet to reveal.
                </p>
              ) : alreadyRevealed ? (
                <p className="text-[var(--faint)]" style={{ fontSize: "11.5px" }}>
                  You have already revealed this round.
                </p>
              ) : outcome === null ? (
                <p className="text-[var(--faint)]" style={{ fontSize: "11.5px" }}>
                  Reveal opens once the owner sets the outcome.
                </p>
              ) : null}
            </div>
          </Panel>

          {state.phase === "done" ? (
            <Status kind="ok">
              <div className="flex flex-col gap-2">
                <span style={{ fontSize: "14px" }}>revealed &amp; scored ✓</span>
                <span>
                  score{" "}
                  <strong style={{ fontSize: "16px" }}>
                    {state.score !== null ? state.score.toString() : "—"}
                  </strong>{" "}
                  <span style={{ opacity: 0.8 }}>
                    (distance from outcome — lower is better)
                  </span>
                </span>
                <ExplorerLink href={explorerTx(state.txHash)}>
                  tx {truncate(state.txHash, 8, 8)} ↗
                </ExplorerLink>
                <a className="link" href="/leaderboard" style={{ fontSize: "12px" }}>
                  see the leaderboard →
                </a>
              </div>
            </Status>
          ) : null}

          {state.phase === "error" ? (
            <Status kind="err">{state.message}</Status>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
