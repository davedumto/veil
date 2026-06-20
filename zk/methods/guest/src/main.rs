// Veil — prediction guest (Sprint 2).
//
// Computes a private AI forecast and commits to it, proving the computation was
// genuine WITHOUT revealing the model or the prediction.
//
//   Public input:   X  (an integer market snapshot, e.g. a price in cents)
//   Private inputs: W = (w0, w1)  the model weights   ← the predictor's secret IP
//                   salt          a random blinding value
//
//   Model:      Y = w0 + w1 * X          (one-feature linear predictor, NFR-7/NFR-9)
//   Commitment: C = sha256( Y_le_bytes || salt )
//
// JOURNAL (public output) — NFR-2: carries ONLY x_hash and C.
//   Y and W NEVER touch the journal. The image ID is checked by the on-chain
//   verifier separately (it is a property of the receipt, not journal content).
//
//   journal = x_hash[32] || C[32]   (64 bytes, fixed layout)
//
// The commitment layout (Y as i128 little-endian, then the 32-byte salt) is the
// load-bearing contract: the guest computes it here, the Soroban contract
// recomputes the identical sha256 at reveal time. They MUST match byte-for-byte.
use risc0_zkvm::guest::env;
use sha2::{Digest, Sha256};

fn main() {
    // --- read inputs (host writes these over the executor channel) ---
    // Order is part of the host/guest contract: X, w0, w1, salt.
    let x: i128 = env::read(); // PUBLIC market input
    let w0: i128 = env::read(); // PRIVATE weight (bias)
    let w1: i128 = env::read(); // PRIVATE weight (slope)
    let salt: [u8; 32] = env::read(); // PRIVATE blinding value

    // --- model: Y = w0 + w1 * X (checked integer arithmetic, no floats) ---
    let y: i128 = w1
        .checked_mul(x)
        .and_then(|wx| wx.checked_add(w0))
        .expect("prediction overflowed i128");

    // --- commitment: C = sha256(Y_le || salt) ---
    // Y is serialized as 16-byte little-endian i128 — the exact byte layout the
    // contract reconstructs from the revealed Y before hashing.
    let mut hasher = Sha256::new();
    hasher.update(y.to_le_bytes()); // 16 bytes
    hasher.update(salt); // 32 bytes
    let commitment: [u8; 32] = hasher.finalize().into();

    // --- x_hash: sha256 of the public input X (also 16-byte LE) ---
    // Binding X into the journal lets the verifier/contract tie the proof to a
    // specific market snapshot without the journal carrying raw X semantics.
    let x_hash: [u8; 32] = Sha256::digest(x.to_le_bytes()).into();

    // --- journal: x_hash || C, and nothing else ---
    let mut journal = [0u8; 64];
    journal[..32].copy_from_slice(&x_hash);
    journal[32..].copy_from_slice(&commitment);
    env::commit_slice(&journal);
}
