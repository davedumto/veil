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

// Live veil registry (clean demo instance). Overridable via env for a fresh
// round, but defaults to the known-good deployed contract.
export const VEIL_CONTRACT_ID =
  process.env.NEXT_PUBLIC_VEIL_CONTRACT_ID ??
  "CBGZ6UHAUQ2XXJC4XOO3UKQV7TY4GRPU4FVJ24KS3WAPUUPNYP3LCRQP";

// Live forked Nethermind RISC Zero verifier router.
export const VERIFIER_CONTRACT_ID =
  process.env.NEXT_PUBLIC_VERIFIER_CONTRACT_ID ??
  "CAY5G7UCZF4BCX66NCKKMBKZMQCJUEYLGGE5WF25F25MHIVW52OB6WFZ";

export const EXPLORER_BASE = "https://stellar.expert/explorer/testnet";

export const explorerTx = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`;
export const explorerContract = (id: string) =>
  `${EXPLORER_BASE}/contract/${id}`;
export const explorerAccount = (addr: string) =>
  `${EXPLORER_BASE}/account/${addr}`;
