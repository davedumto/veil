"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/predict", label: "Predict" },
  { href: "/commitments", label: "Commitments" },
  { href: "/reveal", label: "Reveal" },
  { href: "/leaderboard", label: "Leaderboard" },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-0 z-50"
      style={{
        background: "color-mix(in srgb, var(--bg) 82%, transparent)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div
        className="mx-auto flex w-full items-center justify-between gap-6"
        style={{
          maxWidth: "1480px",
          paddingLeft: "clamp(20px, 5vw, 80px)",
          paddingRight: "clamp(20px, 5vw, 80px)",
          height: "62px",
        }}
      >
        <Link
          href="/"
          className="flex items-center gap-3"
          style={{ textDecoration: "none" }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "15px",
              letterSpacing: "0.32em",
              color: "var(--text)",
              fontWeight: 600,
            }}
          >
            VEIL
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9.5px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--m-teal)",
              border: "1px solid color-mix(in srgb, var(--m-teal) 35%, transparent)",
              borderRadius: "2px",
              padding: "2px 7px",
            }}
          >
            testnet
          </span>
        </Link>

        <div className="flex items-center" style={{ gap: "clamp(14px, 2vw, 30px)" }}>
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12.5px",
                  letterSpacing: "0.02em",
                  textDecoration: "none",
                  color: active ? "var(--text)" : "var(--muted)",
                  borderBottom: active
                    ? "1px solid var(--accent-2)"
                    : "1px solid transparent",
                  paddingBottom: "3px",
                  transition: "color 0.2s var(--ease)",
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
