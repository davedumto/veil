"use client";

import { useCallback, useEffect, useState } from "react";
import { getLeaderboard, getOutcome, type Entry } from "@/lib/veil";
import { explorerAccount } from "@/lib/config";
import { PageShell, PageHeader, Panel, Status } from "@/components/ui";
import {
  shortAddr,
  formatCents,
  formatTimestamp,
  friendlyError,
} from "@/components/format";

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [outcome, setOutcome] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [board, o] = await Promise.all([getLeaderboard(), getOutcome()]);
      setEntries(board);
      setOutcome(o);
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

  const rows = entries ?? [];

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <PageHeader
          kicker="Leaderboard"
          title={<>Ranked by distance from the outcome.</>}
          lede="Best-first — the lowest score wins. Every entry is a forecast that was proven by a real model and committed before the event, then revealed and scored on-chain. Live testnet data."
        />
        <button className="btn" onClick={() => void load()} disabled={loading}>
          {loading ? "refreshing…" : "↻ refresh"}
        </button>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {/* Outcome */}
        {outcome !== null ? (
          <div
            className="panel flex flex-wrap items-baseline gap-4"
            style={{ padding: "18px 22px" }}
          >
            <span className="receipt-label">actual outcome</span>
            <span
              className="display"
              style={{ fontSize: "28px", letterSpacing: "-0.02em" }}
            >
              {formatCents(outcome)}
            </span>
          </div>
        ) : entries !== null ? (
          <Status kind="info">
            Outcome not set yet — scores will populate once the owner posts the
            real outcome and predictors reveal.
          </Status>
        ) : null}

        {error ? <Status kind="err">{error}</Status> : null}

        {/* Table */}
        {loading && entries === null ? (
          <Panel>
            <p
              className="text-[var(--muted)]"
              style={{ fontSize: "13px", padding: "20px 0", textAlign: "center" }}
            >
              loading leaderboard from testnet…
            </p>
          </Panel>
        ) : rows.length === 0 && !error ? (
          <Panel>
            <div
              className="flex flex-col items-center gap-3 text-center"
              style={{ padding: "56px 16px" }}
            >
              <span className="receipt-label">no reveals yet</span>
              <p
                className="text-[var(--muted)]"
                style={{ fontSize: "13px", maxWidth: "42ch", lineHeight: 1.6 }}
              >
                No predictions have been revealed and scored. Once the event
                resolves, revealed forecasts rank here.
              </p>
            </div>
          </Panel>
        ) : rows.length > 0 ? (
          <Panel className="overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["#", "predictor", "forecast Y", "score · distance", "revealed"].map(
                    (h) => (
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
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => {
                  const first = i === 0;
                  return (
                    <tr key={e.predictor}>
                      <td
                        style={{
                          ...cell,
                          fontWeight: 600,
                          color: first ? "var(--m-teal)" : "var(--text)",
                        }}
                      >
                        {first ? "01 ★" : String(i + 1).padStart(2, "0")}
                      </td>
                      <td style={cell}>
                        <a
                          className="link"
                          href={explorerAccount(e.predictor)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={first ? { color: "var(--m-teal)" } : undefined}
                        >
                          {shortAddr(e.predictor)} ↗
                        </a>
                      </td>
                      <td style={cell}>{formatCents(e.y)}</td>
                      <td
                        style={{
                          ...cell,
                          color: first ? "var(--m-teal)" : "var(--text)",
                          fontWeight: first ? 600 : 400,
                        }}
                      >
                        {e.score.toString()}
                      </td>
                      <td style={{ ...cell, color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {formatTimestamp(e.revealed_at)}
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
  padding: "15px 16px 15px 0",
  borderBottom: "1px solid var(--line-2)",
  fontSize: "13px",
  fontFamily: "var(--font-mono)",
  verticalAlign: "middle",
};
