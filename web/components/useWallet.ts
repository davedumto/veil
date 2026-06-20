"use client";

import { useCallback, useEffect, useState } from "react";
import { friendlyError } from "./format";

// `@/lib/wallet` (Stellar Wallets Kit) is imported LAZILY inside the browser-only
// callbacks below. The kit reads localStorage at module load, which throws during
// SSR — a static import would pull it into the server render of these pages. The
// hook's effect/handlers only ever run client-side, so a dynamic import is safe
// and keeps the kit out of the server module graph.

/**
 * Shared wallet connection state for the write pages (predict / reveal).
 *
 * Kept deliberately small: the kit holds the real session, so on mount we try a
 * silent getAddress() to restore an already-selected wallet, and expose
 * connect/disconnect. Disconnect is local-only (clears our address) — there is
 * no kit teardown API, so reconnect just re-opens the picker.
 */
export interface WalletState {
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attempt a silent restore of an already-selected wallet on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getAddress } = await import("@/lib/wallet");
        const a = await getAddress();
        if (!cancelled && a) setAddress(a);
      } catch {
        // No wallet selected yet — expected on first load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const { connect: walletConnect } = await import("@/lib/wallet");
      const a = await walletConnect();
      setAddress(a);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
  }, []);

  return { address, connecting, error, connect, disconnect };
}
