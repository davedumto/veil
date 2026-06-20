// Veil — prediction host (Sprint 2).
//
// Runs the prediction guest with a PUBLIC input X and PRIVATE weights W + salt,
// produces a proof, and emits the values needed to submit a commitment on-chain.
//
// Modes:
//   cargo run -p host                 # STARK proof, verify locally (fast iteration)
//   cargo run -p host -- groth16      # Groth16 proof (needs Docker / x86, RISC0_DEV_MODE=0)
//
// Inputs can be overridden by env vars (else demo defaults are used):
//   VEIL_X   public market input        (default 10000  = $100.00 in cents)
//   VEIL_W0  private weight / bias       (default 500)
//   VEIL_W1  private weight / slope*1000 (default 1100 -> see note)   [kept integer]
//   VEIL_SALT 64-hex-char salt           (default a fixed demo salt)
//
// Note on weights: to keep everything integer (NFR-9) the model is literally
// Y = w0 + w1 * X. Choose small w1 so Y stays sane; the demo uses w1 = 1 with a
// bias, giving Y = X + w0. Sophistication is irrelevant (NFR-7) — the point is a
// genuine, deterministic, provable computation.
//
// groth16 mode writes:
//   proof.txt   -> seal / image_id / journal_digest   (for the Nethermind verifier)
//   commit.txt  -> x_hash / commitment_c / y / salt    (for the veil registry + later reveal)
use methods::{METHOD_ELF, METHOD_ID};
use risc0_ethereum_contracts::encode_seal;
use risc0_zkvm::{compute_image_id, default_prover, ExecutorEnv, ProverOpts};
use sha2::{Digest, Sha256};

fn env_i128(key: &str, default: i128) -> i128 {
    std::env::var(key)
        .ok()
        .map(|v| v.parse().unwrap_or_else(|_| panic!("{key} must be an integer")))
        .unwrap_or(default)
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::filter::EnvFilter::from_default_env())
        .init();

    let groth16 = std::env::args().nth(1).as_deref() == Some("groth16");

    // Public input.
    let x: i128 = env_i128("VEIL_X", 10_000);
    // Private weights — the predictor's secret.
    let w0: i128 = env_i128("VEIL_W0", 500);
    let w1: i128 = env_i128("VEIL_W1", 1);
    // Private salt (32 bytes). Default is a fixed demo salt; real use is random.
    let salt: [u8; 32] = std::env::var("VEIL_SALT")
        .ok()
        .map(|h| {
            let b = hex::decode(h).expect("VEIL_SALT must be hex");
            assert_eq!(b.len(), 32, "VEIL_SALT must be 32 bytes (64 hex chars)");
            let mut a = [0u8; 32];
            a.copy_from_slice(&b);
            a
        })
        .unwrap_or([7u8; 32]);

    // Mirror the model + commitment here so we can record Y/salt for the reveal.
    // (Y is private — kept locally, never sent on-chain until reveal.)
    let y: i128 = w1.checked_mul(x).and_then(|wx| wx.checked_add(w0)).unwrap();
    let mut h = Sha256::new();
    h.update(y.to_le_bytes());
    h.update(salt);
    let commitment: [u8; 32] = h.finalize().into();
    let x_hash: [u8; 32] = Sha256::digest(x.to_le_bytes()).into();

    println!("Prediction: Y = w0 + w1*X = {w0} + {w1}*{x} = {y}  (Y kept private)");

    // Feed inputs in the exact order the guest reads them: X, w0, w1, salt.
    let env = ExecutorEnv::builder()
        .write(&x).unwrap()
        .write(&w0).unwrap()
        .write(&w1).unwrap()
        .write(&salt).unwrap()
        .build()
        .unwrap();

    let prover = default_prover();

    if groth16 {
        let opts = ProverOpts::groth16();
        let receipt = prover.prove_with_opts(env, METHOD_ELF, &opts).unwrap().receipt;

        // Sanity: journal must be x_hash || C and nothing else.
        let journal = &receipt.journal.bytes;
        assert_eq!(journal.len(), 64, "journal must be exactly 64 bytes (x_hash||C)");
        assert_eq!(&journal[..32], &x_hash, "journal x_hash mismatch");
        assert_eq!(&journal[32..], &commitment, "journal commitment mismatch");

        let seal = encode_seal(&receipt).unwrap();
        let image_id = compute_image_id(METHOD_ELF).unwrap();
        let journal_digest: [u8; 32] = Sha256::digest(journal).into();

        std::fs::write(
            "proof.txt",
            format!(
                "{}\n{}\n{}\n",
                hex::encode(&seal),
                hex::encode(image_id.as_bytes()),
                hex::encode(journal_digest),
            ),
        )
        .unwrap();

        // commit.txt: what the predictor submits now (x_hash, C) + what they keep
        // secret for the reveal (Y, salt).
        std::fs::write(
            "commit.txt",
            format!(
                "x_hash={}\ncommitment_c={}\ny={}\nsalt={}\n",
                hex::encode(x_hash),
                hex::encode(commitment),
                y,
                hex::encode(salt),
            ),
        )
        .unwrap();

        receipt.verify(METHOD_ID).unwrap();
        println!("✅ Groth16 receipt verified locally. Wrote proof.txt + commit.txt");
        println!("   x_hash        {}", hex::encode(x_hash));
        println!("   commitment C  {}", hex::encode(commitment));
        println!("   (private) Y={y}  salt={}", hex::encode(salt));
    } else {
        let receipt = prover.prove(env, METHOD_ELF).unwrap().receipt;
        let journal = &receipt.journal.bytes;
        assert_eq!(journal.len(), 64);
        assert_eq!(&journal[..32], &x_hash);
        assert_eq!(&journal[32..], &commitment);
        receipt.verify(METHOD_ID).unwrap();
        println!("✅ STARK receipt verified locally.");
        println!("   x_hash        {}", hex::encode(x_hash));
        println!("   commitment C  {}", hex::encode(commitment));
        println!("   journal is exactly x_hash||C (64 bytes) — no Y, no W. ✓");
    }
}
