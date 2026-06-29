#![cfg(test)]
//! Unit tests for the Veil registry (NFR-6: success + rejection paths per fn).
//!
//! The real on-chain proof verification is exercised end-to-end against the
//! deployed Nethermind verifier in the integration script. Here we swap in a
//! mock router so we can test Veil's own logic (deadline, dedup, journal
//! reconstruction, auth, storage) deterministically without running Groth16.

use super::*;
use soroban_sdk::{
    contract as sdk_contract, contractimpl as sdk_contractimpl,
    testutils::{Address as _, Ledger},
    Address, Bytes, BytesN, Env, String,
};

/// Recompute the commitment exactly as the guest/contract do:
/// `sha256( Y as i128 little-endian (16 bytes) || salt (32 bytes) )`.
/// Used by the reveal tests so a real hash-match path is exercised, not a stub.
fn commitment_for(env: &Env, y: i128, salt: &BytesN<32>) -> BytesN<32> {
    let mut preimage = Bytes::new(env);
    preimage.append(&Bytes::from_array(env, &y.to_le_bytes()));
    preimage.append(&Bytes::from_array(env, &salt.to_array()));
    env.crypto().sha256(&preimage).into()
}

/// Mock RISC Zero router. `verify` succeeds unless the seal's first byte is
/// 0xFF, in which case it panics — mimicking an invalid proof being rejected.
#[sdk_contract]
struct MockRouter;

#[sdk_contractimpl]
impl MockRouter {
    pub fn verify(_env: Env, seal: Bytes, _image_id: BytesN<32>, _journal: BytesN<32>) {
        if !seal.is_empty() && seal.get(0) == Some(0xFF) {
            panic!("mock: invalid proof");
        }
    }
}

struct Ctx {
    env: Env,
    veil: VeilRegistryClient<'static>,
    owner: Address,
    predictor: Address,
    image_id: BytesN<32>,
    deadline: u64,
}

fn setup(deadline: u64, now: u64) -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(now);

    let router = env.register(MockRouter, ());
    let veil_id = env.register(VeilRegistry, ());
    let veil = VeilRegistryClient::new(&env, &veil_id);

    let owner = Address::generate(&env);
    let predictor = Address::generate(&env);
    let image_id = BytesN::from_array(&env, &[9u8; 32]);

    let question = String::from_str(&env, "Test round?");
    let asset = String::from_str(&env, "TEST (cents)");
    veil.init(&owner, &router, &image_id, &deadline, &question, &10_000, &asset);

    Ctx { env, veil, owner, predictor, image_id, deadline }
}

fn good_seal(env: &Env) -> Bytes {
    Bytes::from_array(env, &[0x01, 0x02, 0x03])
}
fn bad_seal(env: &Env) -> Bytes {
    Bytes::from_array(env, &[0xFF, 0x02, 0x03])
}
fn h(env: &Env, b: u8) -> BytesN<32> {
    BytesN::from_array(env, &[b; 32])
}

#[test]
fn commit_with_valid_proof_is_stored() {
    let c = setup(1_000, 100);
    let x_hash = h(&c.env, 0xAA);
    let commitment_c = h(&c.env, 0xBB);

    c.veil
        .commit(&c.predictor, &good_seal(&c.env), &x_hash, &commitment_c);

    let stored = c.veil.get_commitment(&c.predictor).unwrap();
    assert_eq!(stored.predictor, c.predictor);
    assert_eq!(stored.commitment_c, commitment_c);
    assert_eq!(stored.x_hash, x_hash);
    assert_eq!(stored.image_id, c.image_id);
    assert_eq!(stored.committed_at, 100);

    // all_commitments lists it
    let all = c.veil.all_commitments();
    assert_eq!(all.len(), 1);
}

#[test]
#[should_panic] // mock router traps on an invalid proof -> whole call reverts (FR-2)
fn commit_with_invalid_proof_is_rejected() {
    let c = setup(1_000, 100);
    c.veil
        .commit(&c.predictor, &bad_seal(&c.env), &h(&c.env, 1), &h(&c.env, 2));
}

#[test]
fn commit_at_or_after_deadline_is_rejected() {
    // now == deadline -> rejected (FR-3: "at or after")
    let c = setup(500, 500);
    let res = c
        .veil
        .try_commit(&c.predictor, &good_seal(&c.env), &h(&c.env, 1), &h(&c.env, 2));
    assert_eq!(res, Err(Ok(Error::DeadlinePassed)));
}

#[test]
fn commit_after_deadline_is_rejected() {
    let c = setup(500, 600);
    let res = c
        .veil
        .try_commit(&c.predictor, &good_seal(&c.env), &h(&c.env, 1), &h(&c.env, 2));
    assert_eq!(res, Err(Ok(Error::DeadlinePassed)));
}

#[test]
fn double_commit_is_rejected() {
    let c = setup(1_000, 100);
    c.veil
        .commit(&c.predictor, &good_seal(&c.env), &h(&c.env, 1), &h(&c.env, 2));
    let res = c
        .veil
        .try_commit(&c.predictor, &good_seal(&c.env), &h(&c.env, 3), &h(&c.env, 4));
    assert_eq!(res, Err(Ok(Error::AlreadyCommitted)));
}

#[test]
fn init_twice_is_rejected() {
    let c = setup(1_000, 100);
    let router2 = c.env.register(MockRouter, ());
    let q = String::from_str(&c.env, "Test round?");
    let a = String::from_str(&c.env, "TEST (cents)");
    let res = c
        .veil
        .try_init(&c.owner, &router2, &c.image_id, &c.deadline, &q, &10_000, &a);
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn get_commitment_none_when_absent() {
    let c = setup(1_000, 100);
    assert!(c.veil.get_commitment(&c.predictor).is_none());
}

#[test]
fn get_config_returns_stored_config() {
    let c = setup(1_234, 100);
    let cfg = c.veil.get_config();
    assert_eq!(cfg.deadline, 1_234);
    assert_eq!(cfg.image_id, c.image_id);
    // Round metadata round-trips.
    assert_eq!(cfg.question, String::from_str(&c.env, "Test round?"));
    assert_eq!(cfg.x, 10_000);
    assert_eq!(cfg.asset, String::from_str(&c.env, "TEST (cents)"));
}

#[test]
fn two_predictors_both_listed() {
    let c = setup(1_000, 100);
    let p2 = Address::generate(&c.env);
    c.veil
        .commit(&c.predictor, &good_seal(&c.env), &h(&c.env, 1), &h(&c.env, 2));
    c.veil
        .commit(&p2, &good_seal(&c.env), &h(&c.env, 3), &h(&c.env, 4));
    assert_eq!(c.veil.all_commitments().len(), 2);
}

// ─── Sprint 3: outcome, reveal, scoring, leaderboard (FR-5..FR-8) ───

/// Helper: commit a real commitment for `(y, salt)` so the reveal can match it.
fn commit_real(c: &Ctx, predictor: &Address, y: i128, salt: &BytesN<32>) {
    let cmt = commitment_for(&c.env, y, salt);
    c.veil
        .commit(predictor, &good_seal(&c.env), &h(&c.env, 0xAB), &cmt);
}

#[test]
fn set_outcome_then_get_outcome() {
    let c = setup(1_000, 100);
    assert!(c.veil.get_outcome().is_none());
    c.veil.set_outcome(&10_000);
    assert_eq!(c.veil.get_outcome(), Some(10_000));
}

#[test]
fn set_outcome_twice_is_rejected() {
    let c = setup(1_000, 100);
    c.veil.set_outcome(&10_000);
    let res = c.veil.try_set_outcome(&12_000);
    assert_eq!(res, Err(Ok(Error::OutcomeAlreadySet)));
    // unchanged
    assert_eq!(c.veil.get_outcome(), Some(10_000));
}

#[test]
fn reveal_scores_and_records_entry() {
    let c = setup(1_000, 100);
    let salt = h(&c.env, 0x07);
    let y: i128 = 10_500;
    commit_real(&c, &c.predictor, y, &salt);

    c.veil.set_outcome(&10_000);
    c.env.ledger().set_timestamp(200);
    let score = c.veil.reveal(&c.predictor, &y, &salt);

    // |10500 - 10000| = 500
    assert_eq!(score, 500);
    let entry = c.veil.get_entry(&c.predictor).unwrap();
    assert_eq!(entry.predictor, c.predictor);
    assert_eq!(entry.y, y);
    assert_eq!(entry.score, 500);
    assert_eq!(entry.revealed_at, 200);
}

#[test]
fn reveal_score_is_absolute_distance_when_under() {
    // Y below the outcome still scores by absolute distance.
    let c = setup(1_000, 100);
    let salt = h(&c.env, 0x07);
    let y: i128 = 9_300;
    commit_real(&c, &c.predictor, y, &salt);

    c.veil.set_outcome(&10_000);
    let score = c.veil.reveal(&c.predictor, &y, &salt);
    assert_eq!(score, 700); // |9300 - 10000|
}

#[test]
fn reveal_with_wrong_y_is_rejected() {
    // Commit to y=10500/salt, then try to reveal a different y → hash mismatch.
    let c = setup(1_000, 100);
    let salt = h(&c.env, 0x07);
    commit_real(&c, &c.predictor, 10_500, &salt);

    c.veil.set_outcome(&10_000);
    let res = c.veil.try_reveal(&c.predictor, &9_999, &salt);
    assert_eq!(res, Err(Ok(Error::RevealMismatch)));
    assert!(c.veil.get_entry(&c.predictor).is_none());
}

#[test]
fn reveal_with_wrong_salt_is_rejected() {
    let c = setup(1_000, 100);
    let salt = h(&c.env, 0x07);
    commit_real(&c, &c.predictor, 10_500, &salt);

    c.veil.set_outcome(&10_000);
    let wrong_salt = h(&c.env, 0x08);
    let res = c.veil.try_reveal(&c.predictor, &10_500, &wrong_salt);
    assert_eq!(res, Err(Ok(Error::RevealMismatch)));
}

#[test]
fn reveal_before_outcome_set_is_rejected() {
    let c = setup(1_000, 100);
    let salt = h(&c.env, 0x07);
    commit_real(&c, &c.predictor, 10_500, &salt);

    let res = c.veil.try_reveal(&c.predictor, &10_500, &salt);
    assert_eq!(res, Err(Ok(Error::OutcomeNotSet)));
}

#[test]
fn reveal_without_commitment_is_rejected() {
    let c = setup(1_000, 100);
    c.veil.set_outcome(&10_000);
    // predictor never committed
    let salt = h(&c.env, 0x07);
    let res = c.veil.try_reveal(&c.predictor, &10_500, &salt);
    assert_eq!(res, Err(Ok(Error::NoCommitment)));
}

#[test]
fn double_reveal_is_rejected() {
    let c = setup(1_000, 100);
    let salt = h(&c.env, 0x07);
    commit_real(&c, &c.predictor, 10_500, &salt);
    c.veil.set_outcome(&10_000);
    c.veil.reveal(&c.predictor, &10_500, &salt);

    let res = c.veil.try_reveal(&c.predictor, &10_500, &salt);
    assert_eq!(res, Err(Ok(Error::AlreadyRevealed)));
}

#[test]
fn leaderboard_ranks_best_first() {
    let c = setup(1_000, 100);
    let outcome: i128 = 10_000;

    // Three predictors with different accuracies.
    let p_far = c.predictor.clone(); // y=11000 -> score 1000
    let p_mid = Address::generate(&c.env); // y=10400 -> score 400
    let p_best = Address::generate(&c.env); // y=10050 -> score 50

    let salt = h(&c.env, 0x07);
    commit_real(&c, &p_far, 11_000, &salt);
    commit_real(&c, &p_mid, 10_400, &salt);
    commit_real(&c, &p_best, 10_050, &salt);

    c.veil.set_outcome(&outcome);

    // Reveal out of order to prove the leaderboard sorts, not just appends.
    c.veil.reveal(&p_far, &11_000, &salt);
    c.veil.reveal(&p_best, &10_050, &salt);
    c.veil.reveal(&p_mid, &10_400, &salt);

    let board = c.veil.leaderboard();
    assert_eq!(board.len(), 3);
    assert_eq!(board.get(0).unwrap().score, 50);
    assert_eq!(board.get(0).unwrap().predictor, p_best);
    assert_eq!(board.get(1).unwrap().score, 400);
    assert_eq!(board.get(1).unwrap().predictor, p_mid);
    assert_eq!(board.get(2).unwrap().score, 1_000);
    assert_eq!(board.get(2).unwrap().predictor, p_far);
}

#[test]
fn leaderboard_empty_when_no_reveals() {
    let c = setup(1_000, 100);
    assert_eq!(c.veil.leaderboard().len(), 0);
}

#[test]
fn set_deadline_updates_config() {
    let c = setup(1_000, 100);
    c.veil.set_deadline(&5_000);
    assert_eq!(c.veil.get_config().deadline, 5_000);
}

#[test]
fn set_image_id_updates_config() {
    let c = setup(1_000, 100);
    let new_id = h(&c.env, 0xCD);
    c.veil.set_image_id(&new_id);
    assert_eq!(c.veil.get_config().image_id, new_id);
}

#[test]
fn set_deadline_extends_a_passed_round() {
    // A round whose deadline has passed can be reopened by the owner, after
    // which a commit succeeds — proves set_deadline actually takes effect.
    let c = setup(500, 600); // now(600) >= deadline(500): closed
    let res = c
        .veil
        .try_commit(&c.predictor, &good_seal(&c.env), &h(&c.env, 1), &h(&c.env, 2));
    assert_eq!(res, Err(Ok(Error::DeadlinePassed)));

    c.veil.set_deadline(&10_000); // reopen
    c.veil
        .commit(&c.predictor, &good_seal(&c.env), &h(&c.env, 1), &h(&c.env, 2));
    assert!(c.veil.get_commitment(&c.predictor).is_some());
}
