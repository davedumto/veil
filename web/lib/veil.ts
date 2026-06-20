"use client";

// Typed client for the live Veil registry contract.
//
// Reads (leaderboard, commitments, config, outcome) need no wallet — they
// simulate against the RPC. Writes (commit, reveal) are built, signed by the
// connected wallet, and submitted. All against testnet.

import { Client, type Entry, type Commitment } from "./bindings";
import {
  VEIL_CONTRACT_ID,
  RPC_URL,
  NETWORK_PASSPHRASE,
} from "./config";

// NOTE: `./wallet` (Stellar Wallets Kit) is imported LAZILY inside writeClient()
// only. The kit reads `localStorage` at module-evaluation time, which throws
// during server-side rendering ("localstorage?.getItem is not a function"). The
// read functions below never touch the wallet, so importing it lazily keeps it
// out of the SSR module graph entirely — reads render server-side, writes pull
// the wallet in only in the browser.

export type { Entry, Commitment };

/** Read-only client (no signing) — for leaderboard / commitments / config. */
export function readClient(): Client {
  return new Client({
    contractId: VEIL_CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
  });
}

/** Signing client bound to the connected wallet — for commit / reveal. */
export async function writeClient(): Promise<{ client: Client; address: string }> {
  const { getAddress, signTransaction } = await import("./wallet");
  const address = await getAddress();
  const client = new Client({
    contractId: VEIL_CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: address,
    signTransaction: async (xdr) => signTransaction(xdr, { address }),
  });
  return { client, address };
}

const hexToBuf = (hex: string): Buffer =>
  Buffer.from(hex.replace(/^0x/, ""), "hex");

// ─── reads ───

export async function getLeaderboard(): Promise<Entry[]> {
  const tx = await readClient().leaderboard();
  return tx.result;
}

export async function getOutcome(): Promise<bigint | null> {
  const tx = await readClient().get_outcome();
  // Option<i128> → bigint | undefined
  return tx.result ?? null;
}

export async function getAllCommitments(): Promise<
  { predictor: string; commitment: Commitment }[]
> {
  const tx = await readClient().all_commitments();
  // Map<string, Commitment>. Keys decode as Address objects, not strings, so
  // derive the predictor from the struct field (memory.md SDK gotcha).
  const out: { predictor: string; commitment: Commitment }[] = [];
  for (const [, c] of tx.result.entries()) {
    out.push({ predictor: c.predictor, commitment: c });
  }
  return out;
}

export async function getMyCommitment(
  predictor: string,
): Promise<Commitment | null> {
  const tx = await readClient().get_commitment({ predictor });
  return tx.result ?? null;
}

export async function getMyEntry(predictor: string): Promise<Entry | null> {
  const tx = await readClient().get_entry({ predictor });
  return tx.result ?? null;
}

// ─── writes ───

/** Submit a commitment backed by the off-chain proof (FR-2..FR-4). */
export async function commit(args: {
  sealHex: string;
  xHashHex: string;
  commitmentCHex: string;
}): Promise<string> {
  const { client, address } = await writeClient();
  const tx = await client.commit({
    predictor: address,
    seal: hexToBuf(args.sealHex),
    x_hash: hexToBuf(args.xHashHex),
    commitment_c: hexToBuf(args.commitmentCHex),
  });
  const sent = await tx.signAndSend();
  return (
    sent.getTransactionResponse?.txHash ??
    sent.sendTransactionResponse?.hash ??
    ""
  );
}

/** Reveal (Y, salt) and be scored (FR-6, FR-7). Returns the score. */
export async function reveal(args: {
  y: number | bigint;
  saltHex: string;
}): Promise<{ txHash: string; score: bigint | null }> {
  const { client, address } = await writeClient();
  const tx = await client.reveal({
    predictor: address,
    y: BigInt(args.y),
    salt: hexToBuf(args.saltHex),
  });
  const sent = await tx.signAndSend();
  const txHash =
    sent.getTransactionResponse?.txHash ??
    sent.sendTransactionResponse?.hash ??
    "";
  let score: bigint | null = null;
  try {
    const r = sent.result;
    if (r && typeof r.isOk === "function" && r.isOk()) score = r.unwrap();
  } catch {
    score = null;
  }
  return { txHash, score };
}
