# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Veil** — *Provably honest AI predictions, anchored on Stellar.* A predictor produces an AI forecast, proves it was genuinely computed by a real model **without revealing the model weights**, commits it on-chain **before** the event, and reveals it afterward. The zero-knowledge proof is verified inside a Soroban smart contract on Stellar testnet.

Built for the **Stellar Hacks: Real-World ZK** hackathon (deadline June 29, 12:00PM PST). This is a 14-day build — **optimize for a working end-to-end demo, not production hardening.**

> **History:** This repo previously held *Verix*, a multi-agent AI work-orchestration app (Next.js + Prisma + LLM coordinator + Trustless Work escrow). Veil is a **greenfield pivot**, not a refactor — the old Verix `src/` app and Prisma stack are being retired. The Verix-era README is kept as `README.verix.md` for reference only. Do not build new work on the Verix code paths.

## Read first, every session

These planning docs are the source of truth. Read them before doing anything:

| Doc | Role |
|-----|------|
| `PRD.md` | The concept and why ZK is load-bearing |
| `instructions.md` | The operating manual — build rules and what NOT to do |
| `REQUIREMENTS_SPRINTS.md` | Functional/non-functional requirements + the 6-sprint plan |
| `memory.md` | **Live build state** — status tracker, locked decisions, verified facts. Read at session start, update at session end. |
| `ENV_ACCESS.md` | How each layer (host, guest, contracts, frontend) reads configuration |
| `README.md` | Public-facing Veil readme |
| `design.md` | Landing-page **design system** (reuse the visual/interaction craft; the product copy describes old Verix and must be rewritten for Veil) |

## Operating principles (from `instructions.md`)

1. **Read Stellar context before writing Stellar code.** Load `skills.stellar.org`, the ZK Proofs skill at `skills.stellar.org/skills/zk-proofs/SKILL.md`, and `developers.stellar.org/llms.txt`. If a command here disagrees with the live docs, the live docs win — follow them and note the discrepancy.
2. **Spike before you build.** Do not write product code until a RISC Zero proof verified inside a Soroban contract on testnet works with a trivial example (Sprint 1, the gate).
3. **Keep the model trivially small.** A linear / fixed-weight function. Sophistication is out of scope and harms proof tractability.
4. **Do not scope-creep.** If a task isn't in the sprint plan, surface it as a suggestion — don't build it.
5. **Ask before adding dependencies or changing architecture.** Prefer forking proven code over writing new cryptography.
6. **Testnet only. Never mainnet.** Never commit secret keys, seed phrases, or `.env` files. `.env.example` carries the shape only.
7. **Be honest in the README.** Anything mocked or stubbed must be stated plainly.

## Locked decisions (from `memory.md` — do not re-litigate without approval)

1. **Proving system: RISC Zero zkVM.** Guest in ordinary Rust. Not Noir, not Circom.
2. **Verifier: fork Nethermind's `stellar-risc0-verifier`** (Groth16). Do **not** write a Groth16 verifier from scratch. Keep the fork close to upstream.
3. **Privacy target: the model weights `W`.** `W` is a private guest input. The journal exposes only `X` (or its hash), the commitment `C`, and the image ID `I`. **`Y` and `W` never appear in the journal.**
4. **Commitment scheme:** `C = Hash(Y, salt)`. Reveal checks `Hash(Y, salt) == C`. Use **Poseidon** (native Soroban host fn since Protocol 25; ZK-friendly in the guest) so commit-side and reveal-side hashes provably match.
5. **Outcome source: owner-set for v1.** No real oracle. Reflector is a post-hackathon stretch.
6. **Model: trivially small** (linear / fixed-weight).
7. **Scope — one clean loop:** commit → verify → reveal → score → leaderboard. Single numeric prediction.
8. **Integers only.** Soroban has no floating point — encode `Y`, outcome, and score as integers (e.g. price in cents).

## Intended repo layout (per `instructions.md` — mostly NOT built yet)

```
zk/
  methods/        RISC Zero guest program (the model)
  host/           proof-generation host / CLI
contracts/
  verifier/       forked Nethermind stellar-risc0-verifier (kept close to upstream)
  veil/           commitment registry: commit, reveal, score, leaderboard; calls verifier
web/              Next.js + TypeScript + React frontend (+ server-side proving endpoint)
```

Follow the RISC Zero cargo-template conventions inside `zk/` — do not invent a new layout there. **Note:** as of now this layout does not exist; the repo still contains the old Verix `src/` app. Building this scaffold is early-sprint work.

## Commands

The toolchain spans Rust, Soroban, and Node. Confirm each against current docs (versions move).

```bash
# RISC Zero (zk/) — install via rzup per dev.risczero.com
cargo build                      # build guest + host
RISC0_DEV_MODE=0 cargo run -p host   # real proof (dev-mode proofs do NOT verify on-chain)

# Soroban contracts (contracts/)
stellar keys generate <alias> --network testnet   # + fund via Lab/friendbot
cargo build --target wasm32-unknown-unknown --release
stellar contract deploy --wasm target/.../verix_*.wasm --source <alias> --network testnet

# Frontend (web/)
npm run dev                      # Next.js dev server
npm run build
npm run lint
```

## Conventions

- **Contracts & ZK:** Rust, idiomatic Soroban SDK (current version, Protocol 26). **Write a unit test for every contract function** (success + rejection paths) before moving on — NFR-6.
- **Contracts return typed errors — never panic on user-input paths.**
- **Frontend:** Next.js / TypeScript / React. Wallet connect via **Stellar Wallets Kit + Freighter**. Use event handlers, not `<form>` submit handlers that reload.
- **Proving runs off-chain** in a host binary or proving service — **never in the browser** (NFR-4). The frontend orchestrates; it does not prove.
- **Do not write your own Groth16 verifier** — fork Nethermind's.
- **Commits:** small, frequent, one logical change, present-tense imperative.
- **Never add `Co-Authored-By: Claude` to commits.**

## Critical ZK gotchas (from `instructions.md` / `ENV_ACCESS.md`)

- **On-chain Groth16 verification is the spiky risk.** If proof size/cost exceeds Soroban limits, **simplify the guest before touching the verifier.** This is why Sprint 1 exists.
- **The journal must stay minimal:** only `X` (or its hash), `C`, and the image ID. `Y` and `W` must never appear.
- **`RISC0_DEV_MODE=1`** produces fast fake proofs for iteration but they **do not verify on-chain** — Sprint 1's on-chain test requires `RISC0_DEV_MODE=0`.
- **Soroban contracts cannot read env vars.** Everything a contract needs is a function argument set at `init` and stored on-chain. The deploy script injects values from `.env` via CLI flags.
- **Guest input is not env.** `env::read()` in the guest is the host input channel, not OS env. `W` and `salt` go in this way.
- **Deadline enforcement uses ledger timestamp** — confirm the timestamp source against the loaded Stellar skill.

## Env variables

See `.env.example` for the full shape. Key variables:

```
STELLAR_NETWORK=testnet
STELLAR_RPC_URL                   # soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE
STELLAR_ACCOUNT                   # deployer/owner public key (not secret)
STELLAR_SECRET_KEY                # SECRET — prefer the stellar CLI keychain instead
VERIFIER_CONTRACT_ID              # forked Nethermind risc0 verifier (fill after deploy)
VEIL_CONTRACT_ID                  # veil registry contract (fill after deploy)
GUEST_IMAGE_ID                    # hex image id printed when the guest builds
RISC0_DEV_MODE                    # 1 = fake/fast, 0 = real (required for on-chain)
BONSAI_API_KEY / BONSAI_API_URL   # SECRET — only if wrapping STARK→Groth16 via Bonsai
NEXT_PUBLIC_*                     # browser-safe values only — never a secret
```

## Reference resources

- Nethermind RISC Zero verifier: `github.com/NethermindEth/stellar-risc0-verifier`
- RISC Zero docs: `dev.risczero.com`
- ZK Proofs on Stellar: `developers.stellar.org/docs/build/apps/zk`
- RISC Zero on Stellar tutorial: `jamesbachini.com/stellar-risc-zero-games/`
