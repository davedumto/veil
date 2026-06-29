// Veil frontend configuration — all testnet, all browser-safe.
//
// These point at the LIVE deployed contracts on Stellar testnet. The veil
// registry is the "clean" demo instance (empty leaderboard, far-future
// deadline). See docs-needed/memory.md → Deployed artifacts.

export const NETWORK = "testnet" as const;

export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ??
  "Test SDF Network ; September 2015";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org";

// Live veil registry. Defaults to the evolved "real round" contract: carries
// round metadata (question / public input X / asset) and a real ~7-day
// deadline, so the UI presents an actual prediction event and users prove their
// own forecast. Overridable via env.
// (Prior multi-predictor demo round: CCV5IYIU…; original: CBGZ6UHA…)
export const VEIL_CONTRACT_ID =
  process.env.NEXT_PUBLIC_VEIL_CONTRACT_ID ??
  "CCPEIU4WEQI2TYD4QCAH3GICM5EDE2IQFBB5EZZQUPSVBUEISSL7EIQI";

// Live forked Nethermind RISC Zero verifier router.
export const VERIFIER_CONTRACT_ID =
  process.env.NEXT_PUBLIC_VERIFIER_CONTRACT_ID ??
  "CAY5G7UCZF4BCX66NCKKMBKZMQCJUEYLGGE5WF25F25MHIVW52OB6WFZ";

// ─── Proving service (server-side only) ───
// The Groth16 wrap runs in GitHub Actions (x86 + Docker). The backend dispatches
// the `groth16-proof` workflow per prediction and polls for the artifact.
// These are read server-side only; never expose a token to the browser.
export const PROOF_REPO = process.env.PROOF_REPO ?? "davedumto/ASN-Verix";
export const PROOF_WORKFLOW = process.env.PROOF_WORKFLOW ?? "groth16-proof.yml";
export const PROOF_REF = process.env.PROOF_REF ?? "veil/demo-rebuild";
// Optional: a GH token with `workflow` scope for hosted deploys. Locally, the
// backend falls back to the logged-in `gh` CLI auth if this is unset.
export const PROOF_GH_TOKEN = process.env.GH_TOKEN ?? process.env.PROOF_GH_TOKEN;

export const EXPLORER_BASE = "https://stellar.expert/explorer/testnet";

export const explorerTx = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`;
export const explorerContract = (id: string) =>
  `${EXPLORER_BASE}/contract/${id}`;
export const explorerAccount = (addr: string) =>
  `${EXPLORER_BASE}/account/${addr}`;
