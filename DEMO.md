# Veil — Demo Script

A 2–3 minute walkthrough for the submission video. Shows the loop working and
explains what the ZK is doing. You don't need to appear on camera.

## Setup (before recording)

```bash
cd web && npm run dev      # http://localhost:3000
```

Have a testnet wallet ready: **Albedo** (web-based, no install) or **Freighter**.
*(LOBSTR won't work — its build is mainnet-only.)* Fund it at
<https://friendbot.stellar.org> if new.

## The script (~2:30)

**0:00 — The problem (15s)**
> "Anyone can claim their AI predicted a price. But you can't tell if they
> faked it after the fact, or just got lucky — and they can't prove it by
> showing the model, because the weights are their edge. Veil fixes this with
> a zero-knowledge proof."

**0:15 — Landing page (15s)**
Show `/`. Read the one-liner: *predictions you can prove.* Point at the proof
receipt panel: image_id, commitment `C`, "verified on Soroban testnet."

**0:30 — Generate a proof (30s)** → `/predict`
- Connect wallet (Albedo/Freighter).
- Click **Generate proof**. The receipt panel fills in: public input `X`,
  image_id, `x_hash`, commitment `C`.
- **Say the key line:** "The forecast Y and the model weights W are *sealed* —
  they're not in this proof and never go on-chain. Only the commitment and a
  hash of the input do."

**1:00 — Commit on-chain (20s)**
- Click **Commit on-chain**, approve in the wallet.
- "This submits the Groth16 proof to a Soroban contract, which **verifies the
  proof on-chain** before storing the commitment. A fake prediction can't pass —
  it wouldn't carry a valid proof."
- Show the tx hash → open it on stellar.expert.

**1:20 — Reveal & score (30s)** → `/reveal`
- "After the event, the predictor reveals their forecast and salt."
- Show Y and salt prefilled. Click **Reveal & score**, approve.
- "The contract recomputes the hash and proves it matches what was committed —
  so the prediction can't be changed after the fact. Then it scores by distance
  from the real outcome." Show the score.

**1:50 — Leaderboard (25s)** → `/leaderboard`
- Show the multiple ranked predictors. "Each entry is a separate predictor with
  their own private model and their own proof — ranked by accuracy, all verified
  on-chain. Many predictors, one round, one competition."

**2:15 — Close (15s)**
> "Veil proves a prediction came from a real model and predates the event —
> without ever revealing the model. The zero-knowledge proof is verified inside
> a Stellar smart contract, which is exactly what Protocols 25 and 26 unlocked.
> You don't trust the prediction. You have proof."

## What to emphasize for judges

- The **ZK is load-bearing** — strip it and you have a bare hash that proves
  nothing about a real model.
- The proof is **verified on-chain in Soroban** (not off-chain, not faked) —
  ~0.022 XLM per verification.
- **Y and W stay private** the whole time; only `x_hash` and `C` are public.
- Be honest about the mocks (tiny model, owner-set outcome, CI-pregenerated
  proof) — they're listed in the README and don't weaken the core claim.

## Live artifacts to show

- veil round: `CCV5IYIU4YLGLCLQHF2NQWLP57DIKSLOD2DQPYSVHM3PEJNGXQXTDR4F`
- verifier router: `CAY5G7UCZF4BCX66NCKKMBKZMQCJUEYLGGE5WF25F25MHIVW52OB6WFZ`
- explorer: <https://stellar.expert/explorer/testnet/contract/CCV5IYIU4YLGLCLQHF2NQWLP57DIKSLOD2DQPYSVHM3PEJNGXQXTDR4F>
