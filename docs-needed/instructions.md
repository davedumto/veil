# instructions.md, Veil

Read this file at the start of every session. It is the operating manual for building Veil. The product rationale lives in `PRD.md`, this file is how to build it and what not to do.

---

## Mission

Build Veil: a system where a predictor produces an AI forecast, proves it was genuinely computed by a real model without revealing the model weights, commits it on-chain before an event, and reveals it afterward. The zero-knowledge proof is verified inside a Soroban smart contract on Stellar testnet. This is a 14 day hackathon build, optimize for a working end-to-end demo, not production hardening.

---

## Operating principles

1. **Read Stellar context before writing Stellar code.** Load `skills.stellar.org`, the ZK Proofs skill at `skills.stellar.org/skills/zk-proofs/SKILL.md`, and `developers.stellar.org/llms.txt`. If a command or API in this file does not match the loaded skill or current docs, the live docs win, follow them and note the discrepancy.
2. **Spike before you build.** Do not write product code until the hardest integration, a RISC Zero proof verified inside a Soroban contract on testnet, works with a trivial example. See Phase 1.
3. **Keep the model trivially small.** A linear function or fixed-weight scoring function is the target. Sophistication is irrelevant and actively harmful to proof tractability.
4. **Do not scope-creep.** If a task is not in the phase plan below, do not build it. Surface it as a suggestion instead.
5. **Ask before adding dependencies or changing architecture.** Prefer forking proven code over writing new cryptography.
6. **Testnet only.** Never target mainnet. Never commit secret keys, seed phrases, or `.env` files. Use `.env.example` for shape.
7. **Be honest in the README.** Anything mocked or stubbed must be stated plainly.

---

## Environment setup, Phase 0

Confirm each tool against its current docs, versions move.

- **Rust** stable toolchain via rustup.
- **RISC Zero** zkVM toolchain, install per `dev.risczero.com` (the `rzup` installer). Verify with the RISC Zero starter template building and proving locally.
- **Stellar CLI** per `developers.stellar.org/docs/tools/cli`. The binary is `stellar`. Generate and fund a testnet identity with `stellar keys generate` and the Lab or friendbot.
- **Node** LTS plus your package manager of choice for the frontend.
- **Claude Code skills:** install the Stellar dev skill (`/plugin marketplace add stellar/stellar-dev-skill`, `/plugin install stellar-dev@stellar-dev`) and OpenZeppelin skills (`/plugin marketplace add OpenZeppelin/openzeppelin-skills`, `/plugin install openzeppelin-skills`).

Setup is done when: the RISC Zero starter proves and verifies locally, and `stellar` can deploy a hello-world contract to testnet from this machine.

---

## Repo structure

```
veil/
  zk/
    methods/        RISC Zero guest program, the model
    host/           proof generation host or CLI
  contracts/
    verifier/       forked Nethermind stellar-risc0-verifier, kept close to upstream
    veil/           commitment registry, reveal, scoring, calls verifier
  web/              Next.js, TypeScript, React frontend
  instructions.md   this file
  PRD.md
  README.md
  .env.example
```

Follow the RISC Zero cargo template conventions inside `zk/`. Do not invent a new layout there.

---

## Conventions

- **Contracts and ZK:** Rust. Idiomatic Soroban SDK, current version for Protocol 26 support. Write a unit test for every contract function before moving on.
- **Frontend:** Next.js, TypeScript, React. Wallet connection via Stellar Wallets Kit and Freighter. No `<form>` element submit handlers that reload, use event handlers.
- **Errors:** contracts return typed errors, never panic on user input paths.
- **Commits:** small and frequently, one logical change each, present-tense imperative messages.
- **Do not write your own Groth16 verifier.** Fork Nethermind's and adapt it.

---

## Build plan and acceptance criteria

Each phase is done only when its acceptance test passes. Do not start the next phase early.

### Phase 1, Days 2 to 4, spike the hard path
Deploy Nethermind's `stellar-risc0-verifier` to testnet unchanged. Write the minimal guest plus host that proves a trivial statement, for example "I know x such that x squared equals 25", produce a Groth16 proof, and verify it in the deployed contract via a CLI call.
**Done when:** a real RISC Zero Groth16 proof is verified on Stellar testnet and the contract returns success, and a tampered proof returns failure.

### Phase 2, Days 5 to 7, real guest plus commitment contract
Replace the trivial statement with the prediction model. Public input: market snapshot or its hash. Private input: weights W and a salt. Guest computes Y = f(X, W), then C = Hash(Y, salt). The proof journal exposes only X or its hash, C, and the image ID. Build the `veil` registry contract: it verifies the proof, enforces the commit timestamp is before the configured deadline, and stores `{ C, image_id, predictor, timestamp }`.
**Done when:** a commitment backed by a valid proof is accepted and stored, a commitment with an invalid proof is rejected, and a commitment after the deadline is rejected.

### Phase 3, Days 8 to 10, resolve and score
Owner sets the actual outcome after the event. Reveal flow: predictor submits Y and salt, contract checks `Hash(Y, salt)` equals stored C, computes accuracy as distance from the actual outcome, updates a leaderboard.
**Done when:** a correct reveal scores and ranks, a reveal whose hash does not match C is rejected, and the leaderboard reflects multiple predictors in correct order.

### Phase 4, Days 11 to 12, frontend
Connect wallet, submit a commitment, list open commitments, reveal, view leaderboard. Demo-able over pretty.
**Done when:** the full loop runs from the browser against testnet with no manual CLI steps.

### Phase 5, Days 13 to 14, ship
README with honest mock notes, a 2 to 3 minute demo video explaining what the ZK does, and buffer. Submit a day early.
**Done when:** repo is public, video is recorded, submission is filed before the deadline.

---

## Do not build, v1

- Model training. Weights are fixed inputs.
- A real price oracle. The owner sets the outcome. Reflector is a post-hackathon stretch.
- Accounts or auth beyond wallet connect.
- Multi-round tournaments or multiplayer infrastructure.
- Mainnet anything.
- Reward payouts or any movement of funds. No monetization or pricing.

---

## Known gotchas

- On-chain Groth16 verification is the spiky risk. If proof size or cost is a problem, simplify the guest before changing the verifier. This is why Phase 1 exists.
- The zero-knowledge property hides the weights W, not the input. Treat W as a private input from the start, even in the demo, so the privacy claim is real and defensible to judges.
- Keep the journal minimal. Only X or its hash, C, and the image ID should be public. Y and W must never appear in the journal.
- Deadline enforcement uses ledger timestamp. Confirm the timestamp source in the loaded Stellar skill.

---

## Reference resources

- Nethermind RISC Zero verifier: `github.com/NethermindEth/stellar-risc0-verifier`
- RISC Zero docs: `dev.risczero.com`
- RISC Zero on Stellar tutorial: `jamesbachini.com/stellar-risc-zero-games/`
- ZK Proofs on Stellar docs: `developers.stellar.org/docs/build/apps/zk`
- Soroban SDK BN254 and Poseidon migration docs, linked from the hackathon Resources tab.
