"use client";

import type { ReactNode } from "react";
import { shortAddr } from "./format";
import type { WalletState } from "./useWallet";

/* ── Section shell ─────────────────────────────────────────── */

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main
      className="relative w-full"
      style={{
        paddingLeft: "clamp(20px, 5vw, 80px)",
        paddingRight: "clamp(20px, 5vw, 80px)",
        paddingTop: "clamp(56px, 9vh, 110px)",
        paddingBottom: "clamp(90px, 12vh, 160px)",
      }}
    >
      <div className="mx-auto w-full" style={{ maxWidth: "1480px" }}>
        {children}
      </div>
    </main>
  );
}

/** Kicker eyebrow + headline + optional lede. */
export function PageHeader({
  kicker,
  title,
  lede,
}: {
  kicker: string;
  title: ReactNode;
  lede?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5">
      <span className="kicker">{kicker}</span>
      <h1
        className="display"
        style={{ fontSize: "clamp(34px, 5vw, 58px)", maxWidth: "16ch" }}
      >
        {title}
      </h1>
      {lede ? (
        <p
          className="text-[var(--muted)] leading-relaxed"
          style={{ maxWidth: "62ch", fontSize: "14.5px" }}
        >
          {lede}
        </p>
      ) : null}
    </header>
  );
}

/* ── Receipt panel ─────────────────────────────────────────── */

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`panel ${className}`} style={{ padding: "22px 24px" }}>
      {children}
    </div>
  );
}

export function ReceiptRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="receipt-row">
      <span className="receipt-label">{label}</span>
      <span className="receipt-val">{children}</span>
    </div>
  );
}

/* ── Status banners ────────────────────────────────────────── */

export function Status({
  kind,
  children,
}: {
  kind: "ok" | "err" | "info";
  children: ReactNode;
}) {
  return <div className={`status status-${kind}`}>{children}</div>;
}

/* ── Wallet connect bar (shared across write pages) ────────── */

export function WalletBar({ wallet }: { wallet: WalletState }) {
  const { address, connecting, error, connect, disconnect } = wallet;

  return (
    <div className="flex flex-col gap-3">
      <div
        className="panel flex flex-wrap items-center justify-between gap-4"
        style={{ padding: "16px 20px" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="inline-block rounded-full"
            style={{
              width: 8,
              height: 8,
              background: address ? "var(--m-teal)" : "var(--faint)",
            }}
            aria-hidden
          />
          <div className="flex flex-col">
            <span className="receipt-label">wallet</span>
            <span style={{ fontSize: "13px" }}>
              {address ? (
                <span className="verified">{shortAddr(address)}</span>
              ) : (
                <span className="text-[var(--muted)]">not connected</span>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {address ? (
            <>
              <button className="btn" onClick={connect} disabled={connecting}>
                {connecting ? "opening…" : "switch wallet"}
              </button>
              <button className="btn" onClick={disconnect}>
                disconnect
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              onClick={connect}
              disabled={connecting}
            >
              {connecting ? "opening wallet…" : "connect wallet"}
            </button>
          )}
        </div>
      </div>

      {!address ? (
        <p className="text-[var(--faint)]" style={{ fontSize: "11.5px" }}>
          Testnet only. Use Albedo or Freighter — LOBSTR is mainnet-only and
          cannot sign here.
        </p>
      ) : null}

      {error ? <Status kind="err">{error}</Status> : null}
    </div>
  );
}

/* ── Misc inline atoms ─────────────────────────────────────── */

export function Mono({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontFamily: "var(--font-mono)" }}>{children}</span>
  );
}

export function ExplorerLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
