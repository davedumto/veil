#![no_std]
//! Veil commitment registry.
//!
//! Stores predictor commitments backed by a verified RISC Zero Groth16 proof,
//! then resolves them after the event: the owner sets the actual outcome, each
//! predictor reveals `(Y, salt)`, the contract recomputes the commitment to
//! prove the reveal matches what was committed, scores by distance, and ranks a
//! leaderboard.
//!
//! ## Commit (Sprint 2 — FR-1..FR-4)
//! A commitment is accepted only if:
//!   1. the predictor authorizes the call,
//!   2. the current ledger time is strictly before the round deadline (FR-3),
//!   3. the proof verifies on-chain via the RISC Zero verifier router (FR-2),
//!   4. the proof's journal digest matches `sha256(x_hash || commitment_c)`,
//!      binding the proof to exactly these public values (the journal is
//!      `x_hash || C` — see the guest), and
//!   5. the image ID matches the configured Veil guest (so only the real model
//!      program can produce accepted commitments).
//!
//! The journal carries only `x_hash` and `C` — never `Y` or `W` (NFR-2).
//!
//! ## Resolve (Sprint 3 — FR-5..FR-8)
//!   - The owner sets the actual outcome once (FR-5, set-once).
//!   - A predictor reveals `(Y, salt)`. The contract recomputes
//!     `sha256(Y_le_bytes || salt)` — the EXACT preimage the guest hashed — and
//!     rejects the reveal unless it equals the stored `C` (FR-6).
//!   - On a valid reveal the score is `|Y - outcome|`, lower is better (FR-7).
//!   - `leaderboard` returns revealed entries ranked best (lowest score) first
//!     (FR-8).

use risc0_interface::RiscZeroVerifierRouterClient;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Bytes, BytesN,
    Env, Map, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    DeadlinePassed = 3,
    AlreadyCommitted = 4,
    JournalMismatch = 5,
    ImageIdMismatch = 6,
    OutcomeAlreadySet = 7,
    OutcomeNotSet = 8,
    NoCommitment = 9,
    RevealMismatch = 10,
    AlreadyRevealed = 11,
}

#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub owner: Address,
    pub router: Address,
    pub image_id: BytesN<32>,
    /// Round deadline as a ledger unix timestamp (seconds). Commits at or after
    /// this instant are rejected. Distinct from the hackathon deadline (FR-3).
    pub deadline: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct Commitment {
    pub predictor: Address,
    pub commitment_c: BytesN<32>,
    pub x_hash: BytesN<32>,
    pub image_id: BytesN<32>,
    pub committed_at: u64,
}

/// A revealed, scored prediction. The leaderboard is a `Vec<Entry>` ranked by
/// `score` ascending (closest prediction first).
#[contracttype]
#[derive(Clone)]
pub struct Entry {
    pub predictor: Address,
    pub revealed_at: u64,
    /// Accuracy = `|Y - outcome|`. Lower is better.
    pub score: i128,
    pub y: i128,
}

/// Emitted when a commitment is accepted.
#[contractevent]
#[derive(Clone)]
pub struct Committed {
    #[topic]
    pub predictor: Address,
    pub commitment_c: BytesN<32>,
    pub committed_at: u64,
}

/// Emitted when a reveal is accepted and scored.
#[contractevent]
#[derive(Clone)]
pub struct Revealed {
    #[topic]
    pub predictor: Address,
    pub y: i128,
    pub score: i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Config,
    /// predictor -> Commitment
    Commit(Address),
    /// ordered list of predictors who have committed (for enumeration)
    Predictors,
    /// the actual outcome value, set once by the owner after the event
    Outcome,
    /// predictor -> Entry (revealed + scored)
    Entry(Address),
    /// ordered list of predictors who have revealed (for the leaderboard)
    Revealed,
}

#[contract]
pub struct VeilRegistry;

#[contractimpl]
impl VeilRegistry {
    /// One-time configuration. `router` is the deployed RISC Zero verifier
    /// router; `image_id` is the Veil guest's program ID; `deadline` is the
    /// round cutoff (unix seconds).
    pub fn init(
        env: Env,
        owner: Address,
        router: Address,
        image_id: BytesN<32>,
        deadline: u64,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(Error::AlreadyInitialized);
        }
        owner.require_auth();
        env.storage().instance().set(
            &DataKey::Config,
            &Config { owner, router, image_id, deadline },
        );
        env.storage()
            .instance()
            .set(&DataKey::Predictors, &Vec::<Address>::new(&env));
        env.storage()
            .instance()
            .set(&DataKey::Revealed, &Vec::<Address>::new(&env));
        Ok(())
    }

    /// Submit a commitment backed by a valid proof (FR-1..FR-4).
    ///
    /// - `predictor`: the committing account (must authorize).
    /// - `seal`: the Groth16 seal from the host (`encode_seal`).
    /// - `x_hash`, `commitment_c`: the journal's two halves; the contract
    ///    recomputes the journal digest from them and checks the proof against it.
    pub fn commit(
        env: Env,
        predictor: Address,
        seal: Bytes,
        x_hash: BytesN<32>,
        commitment_c: BytesN<32>,
    ) -> Result<(), Error> {
        predictor.require_auth();
        let cfg = Self::config(&env)?;

        // FR-3: reject at or after the deadline.
        let now = env.ledger().timestamp();
        if now >= cfg.deadline {
            return Err(Error::DeadlinePassed);
        }

        // One commitment per predictor per round.
        if env.storage().persistent().has(&DataKey::Commit(predictor.clone())) {
            return Err(Error::AlreadyCommitted);
        }

        // Reconstruct the journal exactly as the guest committed it: x_hash || C.
        let mut journal_bytes = Bytes::new(&env);
        journal_bytes.append(&Bytes::from_array(&env, &x_hash.to_array()));
        journal_bytes.append(&Bytes::from_array(&env, &commitment_c.to_array()));
        let journal_digest = env.crypto().sha256(&journal_bytes);

        // FR-2: verify the proof on-chain. The router client traps on an invalid
        // proof, which reverts this whole call — exactly the rejection we want.
        let router = RiscZeroVerifierRouterClient::new(&env, &cfg.router);
        router.verify(&seal, &cfg.image_id, &journal_digest.into());

        // Store the record (FR-4).
        let record = Commitment {
            predictor: predictor.clone(),
            commitment_c,
            x_hash,
            image_id: cfg.image_id.clone(),
            committed_at: now,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Commit(predictor.clone()), &record);

        let mut predictors: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Predictors)
            .unwrap_or_else(|| Vec::new(&env));
        predictors.push_back(predictor);
        env.storage().instance().set(&DataKey::Predictors, &predictors);

        Committed {
            predictor: record.predictor.clone(),
            commitment_c: record.commitment_c.clone(),
            committed_at: record.committed_at,
        }
        .publish(&env);
        Ok(())
    }

    /// Owner sets the actual outcome once, after the event (FR-5).
    ///
    /// Set-once: a second call is rejected with `OutcomeAlreadySet`, so the owner
    /// cannot move the target after predictors begin revealing.
    pub fn set_outcome(env: Env, outcome: i128) -> Result<(), Error> {
        let cfg = Self::config(&env)?;
        cfg.owner.require_auth();
        if env.storage().instance().has(&DataKey::Outcome) {
            return Err(Error::OutcomeAlreadySet);
        }
        env.storage().instance().set(&DataKey::Outcome, &outcome);
        Ok(())
    }

    /// Reveal `(Y, salt)` and be scored (FR-6, FR-7).
    ///
    /// Requires the outcome to be set. Recomputes `sha256(Y_le_bytes || salt)` —
    /// the identical preimage the guest hashed (Y as i128 little-endian, then the
    /// 32-byte salt) — and rejects unless it equals the stored commitment `C`.
    /// On success the score is `|Y - outcome|` and an `Entry` is recorded.
    /// Returns the score.
    pub fn reveal(
        env: Env,
        predictor: Address,
        y: i128,
        salt: BytesN<32>,
    ) -> Result<i128, Error> {
        predictor.require_auth();
        let _cfg = Self::config(&env)?;

        // Outcome must be set before anyone can be scored.
        let outcome: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Outcome)
            .ok_or(Error::OutcomeNotSet)?;

        // Must have an outstanding commitment.
        let commitment: Commitment = env
            .storage()
            .persistent()
            .get(&DataKey::Commit(predictor.clone()))
            .ok_or(Error::NoCommitment)?;

        // One reveal per predictor.
        if env.storage().persistent().has(&DataKey::Entry(predictor.clone())) {
            return Err(Error::AlreadyRevealed);
        }

        // Recompute C exactly as the guest did: sha256( Y_le(16) || salt(32) ).
        let mut preimage = Bytes::new(&env);
        preimage.append(&Bytes::from_array(&env, &y.to_le_bytes()));
        preimage.append(&Bytes::from_array(&env, &salt.to_array()));
        let recomputed: BytesN<32> = env.crypto().sha256(&preimage).into();
        if recomputed != commitment.commitment_c {
            return Err(Error::RevealMismatch);
        }

        // Score = |Y - outcome|, lower is better (FR-7).
        let score = (y - outcome).abs();
        let now = env.ledger().timestamp();
        let entry = Entry {
            predictor: predictor.clone(),
            revealed_at: now,
            score,
            y,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Entry(predictor.clone()), &entry);

        let mut revealed: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Revealed)
            .unwrap_or_else(|| Vec::new(&env));
        revealed.push_back(predictor.clone());
        env.storage().instance().set(&DataKey::Revealed, &revealed);

        Revealed { predictor, y, score }.publish(&env);
        Ok(score)
    }

    /// Leaderboard: revealed entries ranked best (lowest score) first (FR-8).
    pub fn leaderboard(env: Env) -> Vec<Entry> {
        let revealed: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Revealed)
            .unwrap_or_else(|| Vec::new(&env));

        // Collect entries.
        let mut entries: Vec<Entry> = Vec::new(&env);
        for p in revealed.iter() {
            if let Some(e) = env.storage().persistent().get(&DataKey::Entry(p)) {
                entries.push_back(e);
            }
        }

        // Insertion sort by score ascending. The set is tiny (one round of
        // predictors), so O(n^2) is fine and keeps the contract simple.
        let n = entries.len();
        let mut i = 1u32;
        while i < n {
            let cur: Entry = entries.get(i).unwrap();
            let mut j = i;
            while j > 0 {
                let prev: Entry = entries.get(j - 1).unwrap();
                if prev.score <= cur.score {
                    break;
                }
                entries.set(j, prev);
                j -= 1;
            }
            entries.set(j, cur);
            i += 1;
        }
        entries
    }

    // ─── owner-only admin setters ───

    /// Update the round deadline (owner only). Useful for demo resets.
    pub fn set_deadline(env: Env, deadline: u64) -> Result<(), Error> {
        let mut cfg = Self::config(&env)?;
        cfg.owner.require_auth();
        cfg.deadline = deadline;
        env.storage().instance().set(&DataKey::Config, &cfg);
        Ok(())
    }

    /// Update the accepted guest image ID (owner only). Needed because the CI
    /// build's image ID is canonical and may change if the CI runner changes
    /// (see memory.md: image ID differs by build environment).
    pub fn set_image_id(env: Env, image_id: BytesN<32>) -> Result<(), Error> {
        let mut cfg = Self::config(&env)?;
        cfg.owner.require_auth();
        cfg.image_id = image_id;
        env.storage().instance().set(&DataKey::Config, &cfg);
        Ok(())
    }

    // ─── read-only getters ───

    /// Fetch a predictor's commitment, if any.
    pub fn get_commitment(env: Env, predictor: Address) -> Option<Commitment> {
        env.storage()
            .persistent()
            .get(&DataKey::Commit(predictor))
    }

    /// All commitments (for listing open commitments in the UI).
    pub fn all_commitments(env: Env) -> Map<Address, Commitment> {
        let mut out = Map::new(&env);
        let predictors: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Predictors)
            .unwrap_or_else(|| Vec::new(&env));
        for p in predictors.iter() {
            if let Some(c) = env.storage().persistent().get(&DataKey::Commit(p.clone())) {
                out.set(p, c);
            }
        }
        out
    }

    /// Fetch a predictor's revealed+scored entry, if any.
    pub fn get_entry(env: Env, predictor: Address) -> Option<Entry> {
        env.storage().persistent().get(&DataKey::Entry(predictor))
    }

    /// The actual outcome, if the owner has set it.
    pub fn get_outcome(env: Env) -> Option<i128> {
        env.storage().instance().get(&DataKey::Outcome)
    }

    pub fn get_config(env: Env) -> Result<Config, Error> {
        Self::config(&env)
    }

    fn config(env: &Env) -> Result<Config, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)
    }
}

mod test;
