# Veil, Sprint Requirements

Requirements and sprint plan for the Veil hackathon build. Companion to `PRD.md` (why), `instructions.md` (rules), and `memory.md` (state). This document is the contract for what gets built and in what order.

Hackathon deadline: June 29, 12:00PM PST. Submissions open June 15. Setup can begin June 14, it needs no submission window.

---

## 1. Scope

Veil lets a predictor produce an AI forecast, prove it was genuinely computed by a model while keeping the model weights private, commit it on-chain before an event, then reveal and be scored after. The zero-knowledge proof is verified inside a Soroban contract on Stellar testnet. One clean loop, one prediction type, a deliberately tiny model.

---

## 2. Functional requirements

| ID | Requirement |
|----|-------------|
| FR-1 | A predictor can generate a proof off-chain that a commitment C equals Hash(Y, salt), where Y = f(X, W) is computed by guest program with image ID I, with weights W kept private. |
| FR-2 | A predictor can submit (C, I, X or its hash, proof) to the registry contract, which verifies the proof on-chain and rejects any invalid proof. |
| FR-3 | The registry rejects any commitment whose ledger timestamp is at or after the configured prediction-round deadline, a contract parameter distinct from the hackathon deadline. |
| FR-4 | The registry stores a commitment record per predictor: { C, I, X-hash, timestamp }. |
| FR-5 | The contract owner can set the actual outcome value once, after the event. |
| FR-6 | After the outcome is set, a predictor can reveal (Y, salt). The contract recomputes Hash(Y, salt) and rejects it unless it equals the stored C. |
| FR-7 | On a valid reveal, the contract computes an accuracy score as the distance between Y and the actual outcome and records it against the predictor. |
| FR-8 | The contract exposes a leaderboard ranking revealed predictions by accuracy, best first. |
| FR-9 | A web frontend lets a user connect a wallet, submit a commitment, view open commitments, reveal, and view the leaderboard, all against testnet. |

---

## 3. Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Testnet only. No mainnet. No secret keys, seed phrases, or `.env` files committed. |
| NFR-2 | The ZK must be load-bearing. Y and W never appear in the proof journal or anywhere on-chain before the reveal. The journal carries only X or its hash and C. The image ID I is a property of the receipt that the on-chain verifier checks separately, it is not journal content. |
| NFR-3 | The proof must be a RISC Zero Groth16 receipt verifiable by the forked Nethermind verifier inside Soroban. |
| NFR-4 | Proof generation runs off-chain in a host binary or proving service, never in the browser. RISC Zero proving, and especially the Groth16 wrap, needs real compute. The frontend orchestrates, it does not prove. |
| NFR-5 | On-chain verification must fit Soroban resource and fee limits. If it does not, simplify the guest before touching the verifier. |
| NFR-6 | Every contract function has at least one unit test covering its success and rejection paths. |
| NFR-7 | The model is a small deterministic function. No training, no large models. |
| NFR-8 | The commitment hash must be identical in the guest and the contract, and ZK friendly. Use Poseidon, a native Soroban host function since Protocol 25 and cheap inside the guest, so the commit-side and reveal-side hashes provably match. |
| NFR-9 | All numeric values, Y, the actual outcome, and the score, are integer encoded, for example a price in cents. Soroban has no floating point. |

---

## 4. Out of scope, v1

Real price oracle, model training, accounts or auth beyond wallet connect, multi-round tournaments, an enforced registry of allowed model image IDs, mainnet, security audit, any reward payout or movement of funds, and any monetization or pricing. Reflector and an allowed-model registry are post-hackathon stretches only.

---

## 5. Sprints

Each sprint is done only when every acceptance criterion passes. Do not start a sprint before its dependencies are green.

### Sprint 0, Environment, June 14
**Goal:** a machine that can prove and deploy.
**Covers:** NFR-1.
**Work:** Rust, RISC Zero toolchain, Stellar CLI, Node. Funded testnet identity. Install the Stellar dev skill and OpenZeppelin skills into Claude Code. Stand up the RISC Zero starter and a hello-world Soroban contract.
**Acceptance:** the RISC Zero starter proves and verifies locally, and `stellar` deploys a hello-world contract to testnet from this machine.
**Depends on:** nothing.

### Sprint 1, ZK to Soroban spike, June 15 to 17  ← critical path
**Goal:** prove the single hardest integration before building anything real.
**Covers:** NFR-3, NFR-4, NFR-5 (first measurement).
**Work:** deploy Nethermind's `stellar-risc0-verifier` to testnet unchanged. Write a trivial guest, for example "I know x such that x squared equals 25". Produce a STARK receipt, then wrap it to a Groth16 receipt. Verify that Groth16 receipt in the deployed contract via a CLI call. Record the exact journal and proof encoding the verifier expects, and the on-chain verification cost, in `memory.md`.
**Acceptance:** a real Groth16 receipt verifies on testnet and the contract returns success, a tampered receipt returns failure, and the Groth16 wrap toolchain runs end to end on this setup.
**Depends on:** Sprint 0.

### Sprint 2, Prediction guest and commitment registry, June 18 to 20
**Goal:** the real off-chain computation and the on-chain commit path.
**Covers:** FR-1, FR-2, FR-3, FR-4, NFR-2, NFR-6, NFR-7, NFR-8, NFR-9.
**Work:** replace the trivial guest with the model. Public input X, private weights W and salt. Guest computes Y = f(X, W) then C = Hash(Y, salt). Journal exposes only X-hash, C, I. Build the `veil` registry contract: verify the proof, enforce deadline by ledger timestamp, store the record. Host or CLI that runs the guest and emits the Groth16 receipt for submission.
**Acceptance:** a commitment backed by a valid proof is accepted and stored, a commitment with an invalid proof is rejected, a commitment at or after the deadline is rejected, and the journal provably contains no Y or W.
**Depends on:** Sprint 1 (verifier deployed, proof format known).

### Sprint 3, Reveal, resolution, scoring, June 21 to 23
**Goal:** close the loop after the event.
**Covers:** FR-5, FR-6, FR-7, FR-8, NFR-6, NFR-8, NFR-9.
**Work:** owner sets the actual outcome. Reveal entry point checks Hash(Y, salt) equals stored C, then scores by distance and updates the leaderboard.
**Acceptance:** a correct reveal scores and ranks, a reveal whose hash does not match C is rejected, the leaderboard orders multiple predictors correctly, and the outcome cannot be set twice.
**Depends on:** Sprint 2 (commitments exist).

### Sprint 4, Frontend and proof orchestration, June 24 to 25
**Goal:** the whole loop runs from a browser.
**Covers:** FR-9, NFR-4.
**Work:** Next.js, TypeScript, React. Wallet connect via Stellar Wallets Kit and Freighter. A thin backend endpoint that triggers the host prover and returns the Groth16 receipt, the browser never proves. Screens: submit commitment, list open commitments, reveal, leaderboard.
**Acceptance:** a user completes commit, reveal, and sees the leaderboard from the browser against testnet, with proof generation handled by the backend and no manual CLI step.
**Depends on:** Sprints 2 and 3. The UI shell and wallet connect have no dependency on scoring and may be scaffolded earlier if a sprint stalls.

### Sprint 5, Polish, docs, demo, ship, June 26 to 28
**Goal:** a submittable package, filed early.
**Covers:** project definition of done.
**Work:** README stating plainly what is real and what is mocked, a 2 to 3 minute demo video explaining what the ZK does, final cleanup. File the submission.
**Acceptance:** repo public, video recorded, submission filed by end of June 28.
**Depends on:** Sprint 4.
**Buffer:** the morning of June 29 before the noon deadline is reserve only, not planned work.

---

## 6. Critical path and dependencies

```
Sprint 0  ->  Sprint 1  ->  Sprint 2  ->  Sprint 3  ->  Sprint 4  ->  Sprint 5
            (the gate)                                  ^
                                                        |
            UI shell + wallet connect may pull forward --
```

Sprint 1 is the gate. If its acceptance criteria are not met, nothing downstream is worth starting, and the response is to simplify the guest or the proof path, not to push ahead. Feature work, Sprints 1 through 4, is complete by June 25, which leaves three days for documentation, video, submission, and slack against a deadline that falls at noon, not end of day.

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| On-chain Groth16 verification too costly for Soroban limits | Medium | High | Measured in Sprint 1 before any product code. Simplify the guest if needed, NFR-5. |
| Groth16 wrap toolchain friction, Docker, x86, or a proving service | High | High | Exercised fully in the Sprint 1 spike, not deferred. Confirm current options at dev.risczero.com. |
| Verifier expects a journal or proof encoding we guessed wrong | Medium | Medium | Sprint 1 records the exact format in memory.md before Sprint 2 builds on it. |
| Assuming the browser can generate proofs | Low | High | Ruled out by NFR-4. Proving is a backend concern from the start. |
| Timeline slips past a sprint gate | Medium | Medium | The leaderboard and frontend polish are cut first. The core commit, verify, reveal loop and a valid submission are protected. |

---

## 8. Definition of done, project

Public repo with full source and an honest README. A 2 to 3 minute demo video. The ZK is load-bearing, Y and W stay private until reveal. A real Groth16 proof is verified inside a Soroban contract on testnet. The full commit, reveal, score loop runs from the browser. Submission filed before the deadline.
