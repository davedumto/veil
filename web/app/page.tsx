import Link from "next/link";
import {
  DEMO_PROOF,
  DEMO_COMMITMENT,
  DEMO_PREDICTION,
} from "@/lib/proof";
import { truncate, formatCents } from "@/components/format";

const STEPS = [
  {
    n: "01",
    title: "Commit a proof",
    body: "Run your model off-chain, then generate a zero-knowledge proof that the forecast is the genuine output of a real model on public input X — with private weights W. W never leaves the prover. Only x_hash and the commitment C go on-chain, timestamped before the event.",
  },
  {
    n: "02",
    title: "Reveal after the event",
    body: "Once the outcome is known, reveal your forecast Y and salt. The contract recomputes sha256(Y ‖ salt) and checks it equals the C you committed. You cannot move the goalposts after the fact.",
  },
  {
    n: "03",
    title: "Climb the leaderboard",
    body: "You are scored by distance from the real outcome — lower is better. Every rank is backed by a proof that predates the event and a model attestation that survives scrutiny.",
  },
] as const;

export default function Home() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div className="mesh-glow" />
        <div
          className="relative mx-auto w-full"
          style={{
            maxWidth: "1480px",
            paddingLeft: "clamp(20px, 5vw, 80px)",
            paddingRight: "clamp(20px, 5vw, 80px)",
            paddingTop: "clamp(70px, 12vh, 150px)",
            paddingBottom: "clamp(70px, 12vh, 150px)",
            zIndex: 1,
          }}
        >
          <div className="grid items-center gap-16 lg:grid-cols-[1.15fr_0.85fr]">
            {/* Left: pitch */}
            <div className="flex flex-col gap-8 rise">
              <span className="kicker">Zero-knowledge · Soroban · Stellar testnet</span>
              <h1
                className="display display-tight"
                style={{ fontSize: "clamp(46px, 8vw, 104px)", maxWidth: "13ch" }}
              >
                Predictions
                <br />
                you can <span className="accent-grad">prove.</span>
              </h1>
              <p
                className="text-[var(--muted)]"
                style={{ maxWidth: "54ch", fontSize: "15px", lineHeight: 1.7 }}
              >
                You don&apos;t trust the prediction — you have proof it came from a
                real model and predates the event. Veil anchors a zero-knowledge
                proof of an AI forecast on-chain, verified inside a Soroban smart
                contract. The model weights W and the value Y stay secret until
                reveal.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link href="/predict" className="btn btn-primary">
                  Make a prediction →
                </Link>
                <Link href="/leaderboard" className="btn">
                  View leaderboard
                </Link>
              </div>
            </div>

            {/* Right: sample proof-receipt */}
            <div className="rise">
              <div className="panel" style={{ padding: "0" }}>
                <div
                  className="flex items-center justify-between"
                  style={{
                    padding: "16px 22px",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <span className="receipt-label">proof receipt · sample</span>
                  <span className="verified" style={{ fontSize: "11px" }}>
                    verified on Soroban testnet
                  </span>
                </div>
                <div style={{ padding: "8px 22px 18px" }}>
                  <div className="receipt-row">
                    <span className="receipt-label">public input X</span>
                    <span className="receipt-val">
                      {formatCents(DEMO_PREDICTION.x)}
                    </span>
                  </div>
                  <div className="receipt-row">
                    <span className="receipt-label">image_id</span>
                    <span className="receipt-val">
                      {truncate(DEMO_PROOF.imageIdHex, 10, 8)}
                    </span>
                  </div>
                  <div className="receipt-row">
                    <span className="receipt-label">x_hash</span>
                    <span className="receipt-val">
                      {truncate(DEMO_COMMITMENT.xHashHex, 10, 8)}
                    </span>
                  </div>
                  <div className="receipt-row">
                    <span className="receipt-label">commitment C</span>
                    <span className="receipt-val">
                      {truncate(DEMO_COMMITMENT.commitmentCHex, 10, 8)}
                    </span>
                  </div>
                  <div className="receipt-row">
                    <span className="receipt-label">forecast Y</span>
                    <span className="receipt-val text-[var(--faint)]">
                      sealed until reveal
                    </span>
                  </div>
                  <div className="receipt-row">
                    <span className="receipt-label">weights W</span>
                    <span className="receipt-val text-[var(--faint)]">
                      never revealed
                    </span>
                  </div>
                </div>
              </div>
              <p
                className="text-[var(--faint)]"
                style={{ fontSize: "11px", marginTop: "12px", lineHeight: 1.6 }}
              >
                The seal is a real RISC Zero Groth16 proof. The journal it attests
                to contains x_hash and C only — never the model weights.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────── */}
      <section
        style={{
          borderBottom: "1px solid var(--line)",
          paddingTop: "clamp(80px, 11vh, 140px)",
          paddingBottom: "clamp(80px, 11vh, 140px)",
          paddingLeft: "clamp(20px, 5vw, 80px)",
          paddingRight: "clamp(20px, 5vw, 80px)",
        }}
      >
        <div className="mx-auto w-full" style={{ maxWidth: "1480px" }}>
          <div className="flex flex-col gap-4">
            <span className="kicker">How it works</span>
            <h2
              className="display"
              style={{ fontSize: "clamp(28px, 4vw, 44px)", maxWidth: "20ch" }}
            >
              Commit → verify → reveal → score.
            </h2>
          </div>

          <div className="mt-14 grid gap-px md:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="flex flex-col gap-4"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  padding: "28px 26px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    letterSpacing: "0.2em",
                    color: "var(--accent-2)",
                  }}
                >
                  {s.n}
                </span>
                <h3
                  className="display"
                  style={{ fontSize: "20px", letterSpacing: "-0.02em" }}
                >
                  {s.title}
                </h3>
                <p
                  className="text-[var(--muted)]"
                  style={{ fontSize: "13px", lineHeight: 1.65 }}
                >
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ─────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          paddingTop: "clamp(90px, 13vh, 160px)",
          paddingBottom: "clamp(90px, 13vh, 160px)",
          paddingLeft: "clamp(20px, 5vw, 80px)",
          paddingRight: "clamp(20px, 5vw, 80px)",
        }}
      >
        <div className="mesh-glow" />
        <div
          className="relative mx-auto flex w-full flex-col items-center gap-8 text-center"
          style={{ maxWidth: "1480px", zIndex: 1 }}
        >
          <span className="kicker">No trust required</span>
          <h2
            className="display display-tight"
            style={{ fontSize: "clamp(34px, 6vw, 72px)", maxWidth: "18ch" }}
          >
            Put a proof on the record.
            <br />
            <span className="accent-grad">Then beat the outcome.</span>
          </h2>
          <Link href="/predict" className="btn btn-primary">
            Make a prediction →
          </Link>
        </div>
      </section>
    </>
  );
}
