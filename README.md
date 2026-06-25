# Veil

**Provably honest AI predictions, anchored on Stellar.**

A predictor produces an AI forecast, proves it was genuinely computed by a real
model **without revealing the model's weights**, commits it on-chain **before**
the event, and reveals it afterward. The zero-knowledge proof is verified
**inside a Soroban smart contract** on Stellar testnet.

Built for **Stellar Hacks: Real-World ZK**.

> **Testnet only.** This is a hackathon build optimized for a working
> end-to-end demo. See [What's real / what's mocked](#whats-real--whats-mocked)
> for an honest account of every shortcut.

---

## The problem

Anyone can claim *"my AI model predicted ETH would hit $4,815."* But there's no
way to know they didn't:

- **fabricate it after the event** (hindsight dressed up as foresight), or
- **make a lucky guess** and pretend a model produced it.

And you can't just ask them to publish the model — **the weights are their
edge.** Disclosing them destroys the very thing that makes the prediction
valuable. So you're stuck: either trust an unverifiable claim, or demand IP
nobody will hand over.

## What Veil does

Veil breaks that trade-off with a zero-knowledge proof. The proof attests:

> *"This committed prediction is the output of running model program `P` on
> public input `X` with some private weights `W`."*

So:

- **The weights `W` stay secret** — the predictor's IP is protected. *(the
  zero-knowledge property)*
- **The output is bound to a real, deterministic computation** — it can't be
  hand-picked after the fact.
- **A commitment + on-chain timestamp proves it predates the event.**

Remove the ZK and only a bare hash commitment remains — the weak version that
proves nothing about a real model. **The proof is what's load-bearing.**

---

## How it works — one clean loop

```
   ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
   │  PREDICT │ ──▶ │  COMMIT  │ ──▶ │  RESOLVE │ ──▶ │  REVEAL  │
   │ off-chain│     │ on-chain │     │  (owner) │     │ on-chain │
   │  (zkVM)  │     │ +verify  │     │ set Y*   │     │ +score   │
   └──────────┘     └──────────┘     └──────────┘     └──────────┘
                                                            │
                                                            ▼
                                                      LEADERBOARD
                                                   (ranked by accuracy)
```

**1. Predict** *(off-chain, inside the RISC Zero zkVM)*
A small deterministic model runs as a Rust guest program. Public input: a market
snapshot `X`. Private inputs: the model weights `W` and a random salt. The guest
computes `Y = f(X, W)`, then a commitment `C = sha256(Y ‖ salt)`. The proof's
public journal exposes **only** `x_hash` and `C` — **`Y` and `W` never leave the
device.**

**2. Commit** *(on-chain, before the deadline)*
The predictor submits `C`, the image ID, and the Groth16 proof to the `veil`
Soroban contract. The contract **verifies the proof on-chain** (via a forked
RISC Zero verifier), confirms the ledger timestamp is before the round deadline,
and stores the record. Garbage commitments are rejected here — they can't carry
a valid proof.

**3. Resolve** *(after the event)*
Once the real outcome is known, the contract owner sets it once.

**4. Reveal** *(on-chain)*
The predictor reveals `(Y, salt)`. The contract recomputes `sha256(Y ‖ salt)`
and rejects the reveal unless it equals the stored `C` — you can't change your
prediction after the fact. It scores `|Y − outcome|` (lower is better) and
updates the leaderboard, ranked best-first.

### Many predictors, one round

One deployed `veil` contract = **one prediction round** (one event everyone
forecasts). Any number of wallets each commit their own sealed, proven forecast
before the deadline; after the event everyone reveals and is scored into a
shared, on-chain leaderboard. **Many wallets → one round → one competition.**

---

## Live on Stellar testnet

A real multi-predictor round is live and verifiable right now:

| Item | Value |
|------|-------|
| `veil` registry (demo round) | [`CCV5IYIU…DR4F`](https://stellar.expert/explorer/testnet/contract/CCV5IYIU4YLGLCLQHF2NQWLP57DIKSLOD2DQPYSVHM3PEJNGXQXTDR4F) |
| RISC Zero verifier router | [`CAY5G7UC…6WFZ`](https://stellar.expert/explorer/testnet/contract/CAY5G7UCZF4BCX66NCKKMBKZMQCJUEYLGGE5WF25F25MHIVW52OB6WFZ) |
| Guest image ID | `bec2f7035708f6ad9345b052b9066ea4cc3095eeace1e4e150bdb2aaaddcf043` |

**Current leaderboard** (outcome = $101.00; closest forecast wins):

| Rank | Forecast | Score (distance) |
|------|----------|------------------|
| 🥇 1 | $102.00 | 100 |
| 🥈 2 | $98.00 | 300 |
| 🥉 3 | $105.00 | 400 |

Each entry is backed by its **own distinct Groth16 proof**, generated from
different private weights and verified on-chain.

---

## Architecture

```
zk/
  methods/guest/   RISC Zero guest — the model: Y = w0 + w1·X, C = sha256(Y‖salt)
  host/            proof-generation host/CLI (STARK + Groth16 modes)
contracts/
  verifier/        forked Nethermind stellar-risc0-verifier (Groth16, on-chain)
  veil/            commitment registry: commit · verify · reveal · score · leaderboard
web/               Next.js + TypeScript + React frontend
  app/api/proof/   off-chain proving service (NFR-4: the browser never proves)
.github/workflows/ groth16-proof.yml — generates real proofs on an x86 CI runner
```

### The commitment, exactly

The byte layout is the load-bearing contract between guest and contract — they
must hash identically:

```
C = sha256( Y as i128 little-endian (16 bytes) ‖ salt (32 bytes) )   // 48-byte preimage
journal = x_hash (32 bytes) ‖ C (32 bytes)                           // 64 bytes, all that's public
```

The guest computes `C`; the Soroban contract recomputes the *same* `sha256` at
reveal time. Both use SHA-256 (native on both sides — see
[design notes](#design-notes)).

### The model

Deliberately tiny: a one-feature linear predictor `Y = w0 + w1·X`, with `X` a
public integer (price in cents) and `W = (w0, w1)` the private weights.
**Sophistication is irrelevant — the architecture is the point.** All values are
integers (Soroban has no floats).

---

## What's real / what's mocked

In the spirit of the hackathon rules, here is an honest account.

**Real:**
- ✅ A **real RISC Zero Groth16 proof is verified inside a real Soroban
  contract** on Stellar testnet. This is the core claim and it is genuine.
- ✅ The **zero-knowledge property is real**: `Y` and `W` never appear in the
  journal or on-chain before reveal. The journal carries only `x_hash` and `C`.
- ✅ The **commit → reveal → score → leaderboard** loop runs fully on-chain, and
  end-to-end from the browser against testnet.
- ✅ The **multi-predictor leaderboard is real** — distinct proofs, distinct
  forecasts, ranked by on-chain scoring.
- ✅ The contract has **23 unit tests** (success + rejection paths per function).

**Mocked / simplified for the demo:**
- ⚠️ **The model is trivially small** (a linear function). By design.
- ⚠️ **The outcome is owner-set**, not from a live oracle. Reflector integration
  is a documented post-hackathon stretch.
- ⚠️ **Proofs are pregenerated in CI.** The STARK→Groth16 wrap needs an x86 +
  Docker host (it OOMs on an 8 GB Apple Silicon Mac), so the proving "service"
  (`/api/proof`) serves a real, CI-generated proof rather than spinning up a
  fresh prover per request. The architecture (frontend → proving backend →
  proof) is already that shape; only the per-request live proving is deferred.
- ⚠️ **No funds move.** No payouts, no monetization — out of scope by design.

---

## Run it locally

The toolchain spans Rust, Soroban, and Node. Versions that work on this build:
`stellar` 26.1.0, `cargo-risczero` / `r0vm` 3.0.5, Node 25.

### Frontend (reads live testnet; no proving needed)

```bash
cd web
npm install
npm run dev            # http://localhost:3000
```

The frontend reads the live `veil` round and lets you connect a wallet
(**Albedo or Freighter** — LOBSTR is mainnet-only and can't sign testnet txs),
commit, reveal, and view the leaderboard.

### Contracts

```bash
cd contracts/veil
cargo test                    # 23 unit tests
stellar contract build        # → target/wasm32v1-none/release/veil.wasm
```

### ZK guest + host

```bash
cd zk
RISC0_DEV_MODE=0 cargo run -p host            # real STARK proof, verifies locally
RISC0_DEV_MODE=0 cargo run -p host -- groth16 # Groth16 wrap (needs x86 + Docker)
```

> Real proofs must use `RISC0_DEV_MODE=0`. Dev-mode proofs are fast but do **not**
> verify on-chain. For non-x86 machines, generate proofs via the
> `groth16-proof` GitHub Actions workflow (see `.github/workflows/`).

See `.env.example` for configuration shape. **Never commit secrets** — testnet
identities live in the Stellar CLI keychain, not in the repo.

---

## Design notes

- **Verifier:** a fork of [Nethermind's
  `stellar-risc0-verifier`](https://github.com/NethermindEth/stellar-risc0-verifier)
  (Groth16). We do not write a Groth16 verifier from scratch. You call `verify`
  on the router, which dispatches by a 4-byte selector in the seal.
- **SHA-256, not Poseidon:** the load-bearing requirement is an *identical hash
  in guest and contract*. The Soroban SDK does not expose Poseidon, but SHA-256
  is native on both sides, so `sha256(Y‖salt)` matches provably. The model is
  tiny, so guest hashing cost is negligible.
- **Why Stellar:** Protocols 25/26 added the on-chain cryptographic host
  functions that make verifying a Groth16 proof *inside* a Soroban contract
  practical (~0.022 XLM per verification). Veil verifies at the contract layer —
  Stellar is the verification layer, not a payment afterthought.

---

*Veil — you don't trust the prediction. You have proof.*
