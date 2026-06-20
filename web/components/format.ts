// Display helpers for Veil UI. Type-defensive: contract values come back as a
// mix of bigint (scores, timestamps, y) and Buffer (commitment_c, x_hash,
// image_id). These convert them into the strings the receipt panels render.

/** Convert a Buffer-like value to a lowercase hex string. */
export function bufHex(buf: Buffer | Uint8Array | undefined | null): string {
  if (!buf) return "";
  return Buffer.from(buf).toString("hex");
}

/**
 * Truncate a hex string or Stellar address as `ABCD…WXYZ`.
 * Addresses get a slightly longer head so the `G` prefix reads.
 */
export function truncate(value: string, head = 6, tail = 6): string {
  if (!value) return "";
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Short form for a Stellar public key, e.g. `GABC…WXYZ`. */
export function shortAddr(addr: string): string {
  return truncate(addr, 4, 4);
}

/** Format an integer number of cents (number | bigint) as `$X.XX`. */
export function formatCents(cents: number | bigint): string {
  const n = typeof cents === "bigint" ? Number(cents) : cents;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}$${dollars.toLocaleString("en-US")}.${rem
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Format a unix-seconds timestamp (bigint | number) as a readable UTC date.
 * The contract stores ledger timestamps in seconds; Date wants ms.
 */
export function formatTimestamp(seconds: bigint | number): string {
  const s = typeof seconds === "bigint" ? Number(seconds) : seconds;
  if (!s || Number.isNaN(s)) return "—";
  const d = new Date(s * 1000);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

/** Normalize any thrown contract/wallet error into a friendly message. */
export function friendlyError(err: unknown, map?: Record<string, string>): string {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);

  // Map known contract error names (from bindings Errors) when present.
  const known: Record<string, string> = {
    AlreadyInitialized: "This round is already initialized.",
    NotInitialized: "The contract round is not initialized yet.",
    DeadlinePassed: "The commit deadline has already passed for this round.",
    AlreadyCommitted: "You have already committed for this round.",
    JournalMismatch: "Proof journal did not match the commitment.",
    ImageIdMismatch: "The proof's image id does not match this contract.",
    OutcomeAlreadySet: "The outcome has already been set.",
    OutcomeNotSet: "The outcome has not been set yet — reveal opens once it is.",
    NoCommitment: "No commitment found for this wallet. Commit a proof first.",
    RevealMismatch:
      "Reveal failed: the Y / salt you entered do not match your committed value.",
    AlreadyRevealed: "You have already revealed for this round.",
    ...map,
  };

  for (const [name, message] of Object.entries(known)) {
    if (raw.includes(name)) return message;
  }

  // Common wallet rejections.
  if (/reject|denied|cancel|declin/i.test(raw)) {
    return "Wallet request was rejected.";
  }

  return raw;
}
