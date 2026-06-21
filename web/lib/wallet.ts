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
  // The kit restores `activeAddress` and `selectedModuleId` from localStorage,
  // but the active *module* only resolves once `activeModules` is populated by
  // init(). Pass the persisted wallet id as `selectedWalletId` so a restored
  // session re-establishes its active module — otherwise getAddress() succeeds
  // (address is cached) while signTransaction() throws "Please set the wallet
  // first" because no module is active.
  let restoredId: string | undefined;
  try {
    restoredId =
      globalThis.localStorage?.getItem("@StellarWalletsKit/selectedModuleId") ??
      undefined;
  } catch {
    restoredId = undefined;
  }
  StellarWalletsKit.init({
    network: Networks.TESTNET,
    // Albedo first: it works on testnet without an extension (best for demos).
    modules: [new AlbedoModule(), new FreighterModule(), new xBullModule()],
    ...(restoredId ? { selectedWalletId: restoredId } : {}),
  });
  initialized = true;
}

export const PASSPHRASE = NETWORK_PASSPHRASE;

/**
 * True if a wallet *module* is actually active (not just a cached address).
 * Signing needs an active module; a bare restored address is not enough.
 */
export function hasActiveModule(): boolean {
  ensureInit();
  try {
    // Accessing selectedModule throws if no module is active.
    return !!StellarWalletsKit.selectedModule;
  } catch {
    return false;
  }
}

/** Open the wallet picker and resolve the connected public key. */
export async function connect(): Promise<string> {
  ensureInit();
  const { address } = await StellarWalletsKit.authModal();
  return address;
}

/**
 * Re-fetch the address only when a wallet module is genuinely active. Returns
 * null instead of throwing/returning a hollow address, so the UI does not show
 * "connected" for a session that can't actually sign.
 */
export async function getAddress(): Promise<string> {
  ensureInit();
  if (!hasActiveModule()) {
    throw { code: -1, message: "No wallet has been connected." };
  }
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
  if (!hasActiveModule()) {
    throw {
      code: -1,
      message:
        "Wallet not connected. Click Connect wallet and pick Albedo or Freighter, then try again.",
    };
  }
  const { signedTxXdr, signerAddress } = await StellarWalletsKit.signTransaction(
    xdr,
    {
      networkPassphrase: opts?.networkPassphrase ?? PASSPHRASE,
      address: opts?.address,
    },
  );
  return { signedTxXdr, signerAddress };
}
