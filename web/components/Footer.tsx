import {
  VEIL_CONTRACT_ID,
  VERIFIER_CONTRACT_ID,
  explorerContract,
} from "@/lib/config";
import { truncate } from "./format";

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--line)" }}>
      <div
        className="mx-auto flex w-full flex-col gap-8 md:flex-row md:items-start md:justify-between"
        style={{
          maxWidth: "1480px",
          paddingLeft: "clamp(20px, 5vw, 80px)",
          paddingRight: "clamp(20px, 5vw, 80px)",
          paddingTop: "44px",
          paddingBottom: "44px",
        }}
      >
        <div className="flex flex-col gap-2">
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "13px",
              letterSpacing: "0.32em",
              fontWeight: 600,
            }}
          >
            VEIL
          </span>
          <p
            className="text-[var(--faint)]"
            style={{ fontSize: "11.5px", maxWidth: "44ch", lineHeight: 1.6 }}
          >
            Provably honest AI predictions, anchored on Stellar. ZK proofs
            verified inside a Soroban contract on testnet. Demo submission.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <span className="receipt-label">on-chain</span>
          <a
            className="link"
            href={explorerContract(VEIL_CONTRACT_ID)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "12px" }}
          >
            Veil registry · {truncate(VEIL_CONTRACT_ID, 6, 6)}
          </a>
          <a
            className="link"
            href={explorerContract(VERIFIER_CONTRACT_ID)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "12px" }}
          >
            RISC Zero verifier · {truncate(VERIFIER_CONTRACT_ID, 6, 6)}
          </a>
        </div>
      </div>
    </footer>
  );
}
