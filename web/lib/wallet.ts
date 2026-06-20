"use client";

// Wallet connection via Stellar Wallets Kit (v2.3 — static API).
//
// memory.md gotcha: LOBSTR's build is mainnet-only and cannot sign Veil's
// testnet txs. Albedo (web-based, testnet-capable) and Freighter both work, so
// we register those modules (plus xBull) and the auth modal lets the user pick.

import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { NETWORK_PASSPHRASE } from "./config";

let initialized = false;

function ensureInit(): void {
  if (initialized) return;
  StellarWalletsKit.init({
    network: Networks.TESTNET,
    // Albedo first: it works on testnet without an extension (best for demos).
    modules: [new AlbedoModule(), new FreighterModule(), new xBullModule()],
  });
  initialized = true;
}

export const PASSPHRASE = NETWORK_PASSPHRASE;

/** Open the wallet picker and resolve the connected public key. */
export async function connect(): Promise<string> {
  ensureInit();
  const { address } = await StellarWalletsKit.authModal();
  return address;
}

/** Re-fetch the address of the already-selected wallet (no modal). */
export async function getAddress(): Promise<string> {
  ensureInit();
  const { address } = await StellarWalletsKit.getAddress();
  return address;
}

/** Disconnect the active wallet. */
export async function disconnect(): Promise<void> {
  ensureInit();
  await StellarWalletsKit.disconnect();
}

/**
 * Sign an XDR with the connected wallet. Shaped to satisfy the
 * `signTransaction` callback the stellar-sdk contract client expects.
 */
export async function signTransaction(
  xdr: string,
  opts?: { networkPassphrase?: string; address?: string },
): Promise<{ signedTxXdr: string; signerAddress?: string }> {
  ensureInit();
  const { signedTxXdr, signerAddress } = await StellarWalletsKit.signTransaction(
    xdr,
    {
      networkPassphrase: opts?.networkPassphrase ?? PASSPHRASE,
      address: opts?.address,
    },
  );
  return { signedTxXdr, signerAddress };
}
