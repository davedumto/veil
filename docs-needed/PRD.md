# Veil, PRD

**Provably honest AI predictions, anchored on Stellar.**

Hackathon: Stellar Hacks, Real-World ZK · Single open track · $10,000 XLM
Submissions open June 15, 12:00AM PST · Deadline June 29, 12:00PM PST · Virtual

---

## 1. The problem

When someone claims "my AI predicted ETH would hit $4,815," there is no way to know they did not fabricate that claim after the event, and no way to know it came from an actual model rather than a lucky guess. Disclosing the model is not an option either, the weights are the predictor's edge.

## 2. What Veil is

Veil lets a predictor produce an AI forecast, prove it was genuinely computed by a real model, commit it on-chain before the event, and reveal it afterward, all without ever exposing the model itself. Stellar is where the commitment, the proof verification, and the settlement live.

The zero-knowledge part is load-bearing, not decorative. The proof attests "this committed prediction is the output of running model program P on public input X with some private weights W," so:

- The weights W stay secret (the predictor's IP is protected). This is the zero-knowledge property.
- The output is bound to a real, deterministic computation, so it cannot be hand-picked after the fact.
- A commitment plus on-chain timestamp proves it predates the event.

Remove the ZK and only a bare hash commitment remains, which is the weak version of the idea. The proof is what makes the prediction provably machine-generated and pre-committed.

## 3. How it works, end to end

**a. Predict (off-chain, inside the RISC Zero zkVM)**
A small deterministic model runs as a Rust guest program. Public input: a market data snapshot (or its hash). Private input: the model weights W and a random salt. The guest computes prediction Y = f(X, W), then a commitment C = Hash(Y, salt). The proof's public journal exposes only X (or its hash), C, and the program image ID. Y and W never leave the device.

**b. Commit (on-chain, before deadline)**
The predictor submits C, the image ID, and the Groth16 proof to a Soroban contract. The contract verifies the proof, confirms the timestamp is before the deadline, and stores the record. Garbage commitments are rejected at this stage because they will not carry a valid proof.

**c. Resolve (after the event)**
Once the real outcome is known, the predictor reveals Y and salt. The contract checks Hash(Y, salt) equals the stored C, computes accuracy as the distance between Y and the actual outcome, and updates the leaderboard.

## 4. Why this fits the hackathon

- **ZK is essential.** Deleting it collapses the core "provably from a real model, provably pre-committed" guarantee.
- **It touches Stellar at the load-bearing point.** The proof is verified inside a Soroban contract, which is exactly the capability Protocol 25 and 26 unlocked. Stellar is not a payout afterthought.
- **It is shippable.** "Verifiable off-chain computation with a RISC Zero circuit plus a Stellar verifier" is in the mild tier of the official ideas list. The model is kept trivially small on purpose, the architecture is the point.
- **Real-world framing.** Position it as verifiable, privacy-preserving AI inference for oracles and forecasting, not an AI-vs-AI game. Proprietary model integrity is a genuine real-world trust problem.

## 5. Tech stack

- **Proving:** RISC Zero zkVM. Guest program written in ordinary Rust, which is why it suits model inference far better than circuit DSLs.
- **On-chain verifier:** Soroban contract based on Nethermind's `stellar-risc0-verifier` (Groth16). Fork and adapt rather than build from scratch.
- **Contracts:** Rust / Soroban. A commitment registry contract (store C, image ID, deadline, status) wired to the verifier, plus reveal and scoring logic.
- **Frontend:** Next.js, TypeScript, React, your existing stack. Wallet connection via Stellar Wallets Kit and Freighter.
- **Host / proof generation:** Rust host program or CLI that runs the guest, produces the Groth16 proof, and hands it to the frontend or contract call.
- **Outcome source:** owner-submitted outcome for the demo. Reflector oracle integration is a stretch goal, not v1.

## 6. Scope discipline

Build:
- One prediction type (a single numeric forecast, for example a price target).
- One tiny model (a linear predictor or a small fixed-weight function). Sophistication is irrelevant to the demo.
- Commit, verify, reveal, score, leaderboard. One clean loop.

Mock or cut:
- No model training, the weights are fixed inputs.
- No real oracle in v1, the owner sets the outcome.
- No accounts or auth beyond wallet connect.
- No multi-round tournaments, no multiplayer infrastructure.

## 7. Two-week roadmap

Front-load the single riskiest thing: getting a real proof verified on Stellar testnet. If that round-trip works by day 4, the project works.

**Phase 0, Day 1 (setup)**
Repo, RISC Zero toolchain, Soroban CLI, funded testnet account via the Lab. Point Claude Code at the Stellar skills first (see section 9). Get Nethermind's verifier compiling and deployed to testnet untouched.

**Phase 1, Days 2 to 4 (spike the hard path)**
Prove a trivial computation in the zkVM, for example "I know x such that x times x equals 25," generate the Groth16 proof, and verify it in your deployed Soroban contract on testnet. This is make or break. Do not build product around it until this end-to-end round-trip succeeds.

**Phase 2, Days 5 to 7 (the real guest program)**
Replace the trivial computation with the prediction model: public input, private weights, output commitment in the journal. Build the commitment registry contract with deadline enforcement and proof verification at commit time.

**Phase 3, Days 8 to 10 (resolve and score)**
Reveal flow, commitment-match check on-chain, accuracy scoring, leaderboard state.

**Phase 4, Days 11 to 12 (frontend)**
Wallet connect, submit a commitment, view open commitments, reveal, leaderboard. Make it genuinely demo-able, not pretty.

**Phase 5, Days 13 to 14 (ship)**
README with honest notes on anything mocked, the 2 to 3 minute demo video, and buffer. Submit a day early, not in the final hour.

## 8. Submission checklist

- Public repo with full source and a clear README that states plainly what is real and what is mocked.
- 2 to 3 minute demo video showing the loop working and explaining what the ZK is doing. You do not need to appear in it.
- ZK is meaningful and load-bearing.
- Stellar is integrated at the verification layer (proof verified in a Soroban contract on testnet).

## 9. Claude Code bootstrap

Before generating any contract or guest code, prime the agent with Stellar context, it sharply improves what it writes:

- Install the Stellar dev skill: `/plugin marketplace add stellar/stellar-dev-skill` then `/plugin install stellar-dev@stellar-dev`
- Add the OpenZeppelin skills for secure Soroban patterns: `/plugin marketplace add OpenZeppelin/openzeppelin-skills` then `/plugin install openzeppelin-skills`
- Tell the agent to read `skills.stellar.org` before building, and specifically the ZK Proofs skill at `skills.stellar.org/skills/zk-proofs/SKILL.md`
- Feed it `developers.stellar.org/llms.txt` for a machine-readable docs digest.

Suggested first Claude Code task: clone and deploy Nethermind's `stellar-risc0-verifier` to testnet unchanged, then write the minimal host plus guest that produces a proof it can verify. Get section 7 Phase 1 green before anything else.

## 10. Reusability note

The Soroban proof-verification component you build here is precisely the RISC Zero layer Verix has only ever scoped as a future deliverable. Whatever you decide about keeping the projects separate, the verifier work is a clean, reusable asset you can lift into Verix later.
