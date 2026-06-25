"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getAllCommitments,
  getOutcome,
  getLeaderboard,
  type Commitment,
} from "@/lib/veil";
import { explorerAccount } from "@/lib/config";
import { PageShell, PageHeader, Panel, Status } from "@/components/ui";
import {
  bufHex,
  truncate,
  shortAddr,
  formatCents,
  formatTimestamp,
  friendlyError,
} from "@/components/format";

interface Loaded {
  commitments: { predictor: string; commitment: Commitment }[];
  outcome: bigint | null;
  revealedSet: Set<string>;
}

export default function CommitmentsPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch in parallel; leaderboard tells us who has already revealed.
      const [commitments, outcome, leaderboard] = await Promise.all([
        getAllCommitments(),
        getOutcome(),
        getLeaderboard(),
      ]);
      // Coerce to string so the Set lookup below matches the commitment rows
      // regardless of whether the SDK hands back string or Address-like values.
      const revealedSet = new Set(leaderboard.map((e) => String(e.predictor)));
      setData({ commitments, outcome, revealedSet });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Defer to a macrotask so the effect never sets state synchronously
  // (react-hooks/set-state-in-effect).
  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  const commitments = data?.commitments ?? [];

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <PageHeader
          kicker="Commitments"
          title={<>Proofs on the record, before the event.</>}
          lede="Every row is a zero-knowledge proof committed on-chain ahead of the outcome. The forecast Y stays sealed inside the commitment C until its predictor reveals. Live testnet data."
        />
        <button className="btn" onClick={() => void load()} disabled={loading}>
          {loading ? "refreshing…" : "↻ refresh"}
        </button>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {/* Outcome banner */}
        {data ? (
          data.outcome !== null ? (
            <Status kind="ok">
              Outcome is set: <strong>{formatCents(data.outcome)}</strong>. Reveal
              is open — committers can now reveal to be scored.
            </Status>
          ) : (
            <Status kind="info">
              Outcome not set yet. Commitments stay sealed until the owner posts
              the real outcome.
            </Status>
          )
        ) : null}

        {error ? <Status kind="err">{error}</Status> : null}

        {/* Table */}
        {loading && !data ? (
          <Panel>
            <p
              className="text-[var(--muted)]"
              style={{ fontSize: "13px", padding: "20px 0", textAlign: "center" }}
            >
              loading commitments from testnet…
            </p>
          </Panel>
        ) : commitments.length === 0 && !error ? (
          <Panel>
            <div
              className="flex flex-col items-center gap-3 text-center"
              style={{ padding: "56px 16px" }}
            >
              <span className="receipt-label">no commitments yet</span>
              <p
                className="text-[var(--muted)]"
                style={{ fontSize: "13px", maxWidth: "42ch", lineHeight: 1.6 }}
              >
                No proofs have been committed to this round. Be the first —{" "}
                <a className="link" href="/predict">
                  make a prediction
                </a>
                .
              </p>
            </div>
          </Panel>
        ) : commitments.length > 0 ? (
          <Panel className="overflow-x-auto" >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    "predictor",
                    "commitment C",
                    "x_hash",
                    "image_id",
                    "committed",
                    "status",
                  ].map((h) => (
                    <th
                      key={h}
                      className="receipt-label"
                      style={{
                        textAlign: "left",
                        padding: "0 16px 14px 0",
                        borderBottom: "1px solid var(--line)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commitments.map(({ predictor, commitment }, i) => {
                  // predictor is typed string, but the SDK can hand back an
                  // Address-like object — coerce so display + lookups are stable.
                  const addr = String(predictor);
                  const revealed = data?.revealedSet.has(addr) ?? false;
                  // Composite key: unique even if an address ever repeats/decodes
                  // oddly (one commitment per predictor, but be defensive).
                  return (
                    <tr key={`${addr}-${bufHex(commitment.commitment_c)}-${i}`}>
                      <td style={cell}>
                        <a
                          className="link"
                          href={explorerAccount(addr)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {shortAddr(addr)} ↗
                        </a>
                      </td>
                      <td style={{ ...cell, color: "var(--muted)" }}>
                        {truncate(bufHex(commitment.commitment_c), 8, 6)}
                      </td>
                      <td style={{ ...cell, color: "var(--muted)" }}>
                        {truncate(bufHex(commitment.x_hash), 8, 6)}
                      </td>
                      <td style={{ ...cell, color: "var(--muted)" }}>
                        {truncate(bufHex(commitment.image_id), 8, 6)}
                      </td>
                      <td style={{ ...cell, color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {formatTimestamp(commitment.committed_at)}
                      </td>
                      <td style={cell}>
                        {revealed ? (
                          <span className="verified">revealed ✓</span>
                        ) : (
                          <span className="text-[var(--faint)]">sealed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        ) : null}
      </div>
    </PageShell>
  );
}

const cell: React.CSSProperties = {
  padding: "14px 16px 14px 0",
  borderBottom: "1px solid var(--line-2)",
  fontSize: "12.5px",
  fontFamily: "var(--font-mono)",
  verticalAlign: "top",
};
