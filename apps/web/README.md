# PERPLY

![PERPLY](./public/perply-hero.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Website](https://img.shields.io/badge/Website-perply.trade-111111?logo=globe&logoColor=white)](https://perply.trade)
[![X](https://img.shields.io/badge/X-@perplytrade-111111?logo=x&logoColor=white)](https://x.com/perplytrade)
[![Next.js](https://img.shields.io/badge/Next.js-15.x-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Solana](https://img.shields.io/badge/Solana-Enabled-14F195?logo=solana&logoColor=white)](https://solana.com)

**Perply is the go-to terminal + launch layer for permissionless perps on Solana — built on the Percolator design.**  
Trade on mainnet, launch Percolator markets on devnet, and **verify every action** via Proof Pages + receipts (CPI trace, program authority, oracle health, crank freshness, and pricing guardrails).

> **Goal:** become the #1 trading terminal for **Percolator perps** *and* “normal perps” (major venues),  
> while enabling permissionless perp launches and **adding third-party Percolator markets** for trading.

---

## What is Perply?

Perply productizes the Percolator design into a **dual-mode** platform:

### 1) Mainnet Trading Terminal (`/app/mainnet`)
A professional perps terminal for real trading:
- Real-time charts (multi-timeframe) + indicators (RSI, moving averages, etc.)
- Market & limit orders (long/short), leverage controls (up to 50x where supported)
- Fast position management (mark/entry/uPnL refresh, one-click close, close-all)
- Collateral flexibility (SOL / USDC depending on venue)
- Transaction history with explorer links
- **Receipts for key actions** (trades, deposits, withdrawals)
- **Receipt-backed actions (trades/deposits/withdrawals) with Explorer links**

### 2) Devnet Lab — Credibility Engine (`/app/devnet`)
A builder sandbox for Percolator markets — designed to survive scrutiny:
- Markets directory loaded from **on-chain registry** (no hardcoded lists)
- **Market Proof Page** (`/app/devnet/markets/[marketId]`) with on-chain truth:
  - Addresses Truth Table (slab, vaults, insurance, PDAs, oracle accounts)
  - Program Truth Panel (upgradeable vs immutable, **upgrade authority**, explorer links)
  - Oracle Health (mode, price, staleness/confidence, authority override)
  - Liveness / Crank Panel (fresh/stale, last crank slot/time, **Crank Now**)
  - Market State Panel (vaults, insurance, fees, OI, funding, full risk params)
  - **Pricing Engine panel** (spread breakdown, guard state, oracle divergence audit, utilization; vol regime shows "—" when no data)
  - **Adminless status** (burn admin key → Admin = 111111… with a receipt)
- **Full Trading Cycle Checklist** (acceptance test):
  **Init → Deposit → Crank → Trade → Close → Withdraw**
  with receipts at every step

### 3) Permissionless Market Launch (“Pump.fun for perps”) (`/app/devnet/launch`)
A guided flow for launching Percolator-style perp markets:
- Quick Launch tiers (Small/Medium/Large) with transparent costs
- Advanced wizard (oracle mode, slab size, matcher/vAMM params, risk/fees)
- **Thin Market Safe Mode preset** (safe defaults for thin markets)
- **Matcher modes:** Passive / vAMM / PropAMM (kind=2)
- **Atomic core deploy** (all-or-nothing to avoid stranded SOL)
- Live rent/cost computation from RPC (no made-up numbers)
- Exportable Market JSON for sharing/importing

---

## What makes Perply different

### Proof-native (not proof-added)
Every critical action produces a **verifiable receipt**, not a UI notification:
- tx signature(s) + explorer links
- invoked programs (including **inner CPI**)
- program metadata (upgradeable vs immutable, **upgrade authority**)
- oracle status (mode, staleness/health)
- crank freshness / liveness at execution time
- **pricing context / guard state at execution time** (where available)
- **pricing context** (spread, skew, vol regime, utilization, oracle divergence, guard state)
- exportable JSON (portable audit trail)


### Liveness is first-class UX
Percolator-style perps require fresh keeper cranks for risk-increasing actions.  
Perply surfaces this explicitly and enforces it.

### Pricing Engine with Thin-Market Protections
**PropAMM on-chain matcher (kind=2) deployed on devnet** — Program ID: `Hhrt49nF43ztHt4bLe1vH1Li5h4RAjpNCReuiaf2Feum` ([Explorer](https://explorer.solana.com/address/Hhrt49nF43ztHt4bLe1vH1Li5h4RAjpNCReuiaf2Feum?cluster=devnet)). Deploy tx: [67j7Nq…y5okH](https://explorer.solana.com/tx/67j7Nq6UvN5H41FgBpPssDRoPak9K1HDRa7cyMeGAN4LuJHCsEniVvbT9EuMexHx7SQLEgNqPVbeQ8Rmt5Ey5okH?cluster=devnet). Upgrade authority: [CVeyMA…UGUh](https://explorer.solana.com/address/CVeyMA8caamC6BMZFanMuTfuKQZvPtFhjmgp582oUGUh?cluster=devnet). Pricing guardrails with verifiable receipts (UI-enforced + on-chain where deployed).

Current guardrails (client-side + on-chain where deployed):
- **Inventory-aware skew**: Spread shifts based on LP inventory imbalance
- **Volatility-scaled spreads**: Spread widens as realized/estimated vol rises
- **Utilization-based widening**: If OI / margin utilization rises, widen
- **Oracle divergence guards**: If mark deviates from oracle/TWAP, widen or halt risk-increasing
- **Rate limits / throttles**: Caps on how fast someone can push inventory or extract edge

See [Pricing Tests](./docs/pricing-tests.md) for attacker-minded test suite.

---

## Built on the Percolator design

**Percolator is the engine. Perply is the product layer.**

Percolator defines the constraints that make permissionless perps real:
- margin + liquidation logic
- vault & insurance accounting
- funding mechanics
- oracle dependencies
- keeper crank / liveness gating
- optional matcher/vAMM execution

Perply makes those constraints **usable, visible, and verifiable** via Proof Pages + receipts.

---

## Quick demo (what “real” looks like)

### Devnet credibility loop (the acceptance test)
1. Open a devnet market Proof Page
2. **Init user**
3. **Deposit collateral**
4. **Crank Now** (freshen market)
5. **Open position**
6. **Close position**
7. **Withdraw**
8. Export receipts JSON

If you can run that loop with a fresh wallet and every step yields receipts + state changes,
you’ve proven the system end-to-end.

---

## Receipts (high-level format)

Perply receipts are designed to be inspectable and shareable:

- `tx`: signature(s)
- `marketId`: market identifier
- `action`: deposit/trade/crank/withdraw/deploy/…
- `programsInvoked`: top-level + inner CPI
- `programTruth`: upgradeability + upgrade authority per program
- `oracleStatus`: mode + health/staleness (where applicable)
- `crankFreshness`: fresh/stale + slots/time since last crank
- `export`: JSON serialization for audit and sharing

> Exact field names may differ by implementation — the invariant is that receipts capture
> **CPI + program truth + liveness + oracle health**.

### Verification
- [apps/web/docs/data-sources-audit.md](./docs/data-sources-audit.md) — offsets/parsers + how to verify
- [apps/web/docs/verification-artifacts.md](./docs/verification-artifacts.md) — program IDs, tx proofs, commands
- [apps/web/scripts/verify-pricing-engine.sh](./scripts/verify-pricing-engine.sh) / [.ps1](./scripts/verify-pricing-engine.ps1) — repro verification

---

## Roadmap (direction)

Perply is expanding into the default terminal for:
- **Percolator perps** (native + third-party Percolator markets)
- **Major perps venues** (“normal perps”) via adapters in the mainnet terminal
- A unified discovery layer (market directory, proof pages, receipts-first trading)

North star: **best execution UX + best verifiability UX**.

---

## Getting started

### Prerequisites
- Node.js 18+ (recommended: 20+)
- pnpm (recommended) or npm/yarn
- A Solana wallet (Phantom / Solflare)
- Devnet SOL for testing (Perply includes airdrop helpers)

### Install
```bash
git clone https://github.com/<YOUR_ORG>/<YOUR_REPO>.git
cd <YOUR_REPO>
pnpm install


Environment

Create .env.local (or copy from .env.example if present).
Typical variables:

NEXT_PUBLIC_MAINNET_RPC_URL

NEXT_PUBLIC_DEVNET_RPC_URL

Example:

NEXT_PUBLIC_MAINNET_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
NEXT_PUBLIC_DEVNET_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY

Use the exact variable names your repo expects (check .env.example).

Run
pnpm dev

Open http://localhost:3000

Build
pnpm build
pnpm start
Project structure (high level)

Typical Next.js App Router layout:

app/
  page.tsx                 # landing
  app/
    mainnet/               # mainnet terminal
    devnet/                # devnet lab
      launch/              # market launch wizard
      mint/                # token factory
      markets/[marketId]/  # proof page
components/
lib/
public/
Security notes

No private keys: signing happens via the user’s wallet

RPC keys: keep in .env.local, never commit

Receipts: stored per wallet + cluster; exportable for audit

Program truth inspection: surfaces upgradeability + upgrade authority explicitly

**Adminless option:** market creators can permanently burn the admin key. Proof Page shows Admin = 111111… and receipts include the burn transaction.

This repo is a developer preview. Treat it as experimental unless explicitly audited.

Contributing

PRs welcome. If you ship something that improves verifiability, liveness UX, receipts,
or Percolator market interoperability — that’s core to Perply.

Fork

Branch: git checkout -b feat/<name>

Test locally

PR with clear description + screenshots where relevant

License

MIT for this repository. Integrated protocols and vendor code retain their own licenses/terms.





