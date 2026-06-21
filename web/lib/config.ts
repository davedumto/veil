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

// Live veil registry. Defaults to the multi-predictor demo round (fresh round
// deployed from the rebuilt wasm): 3 differentiated predictors on the
// leaderboard, outcome $101.00, deadline year 2100 so commits stay open.
// Overridable via env. (Prior single-predictor round: CBGZ6UHA…)
export const VEIL_CONTRACT_ID =
  process.env.NEXT_PUBLIC_VEIL_CONTRACT_ID ??
  "CCV5IYIU4YLGLCLQHF2NQWLP57DIKSLOD2DQPYSVHM3PEJNGXQXTDR4F";

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
