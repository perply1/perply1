# SOV Architecture

## Overview

SOV is a proof-first perpetuals UI with two venues:

- **Mainnet**: Jupiter Perps
- **Devnet**: Percolator (from vendor)

## Modes

- **MAINNET**: Uses Solana mainnet. Loads real Jupiter Perps markets and user state.
- **DEVNET**: Uses Solana devnet. Percolator markets, full init/wrap/deposit/crank/trade flow.

Mode is stored in React context and drives:
- RPC endpoint (via `ConnectionProvider` key)
- Cluster badge
- Which venue SDK is active

## Proof / Receipts Dock

Every user action that produces a transaction creates a receipt:

- Timestamp, mode, venue, action, marketId
- Tx signature(s) + explorer links
- Invoked programs (including CPI)
- Per program: upgradeable/immutable, upgrade authority, verification status

Receipts persist in localStorage per `wallet+cluster` and are exportable as JSON.

## Proof Engine (`@sov/proof`)

- `parseTxAndBuildReceipt`: Fetches tx via RPC, extracts program IDs from outer + inner instructions, inspects each program for upgradeability/authority, returns `Receipt`
- `inspectProgram`: Uses `getAccountInfo` + BPFLoaderUpgradeable layout to detect upgradeable programs and read upgrade authority

## Config

All addresses live under `config/`:

- `mainnet.ts`: Jupiter Perps program ID, JLP pool
- `devnet.ts`: Percolator program ID, matcher, oracle, default slab
- `percolator.ts`: Launch defaults (risk/fee params)

No hardcoded addresses in React components or SDKs.

## Packages

- `@sov/proof`: TX parsing, program inspection, explorer helpers
- `@sov/percolator-sdk`: Wraps vendor/percolator-sov for instructions + slab parsing
- `@sov/jupiter-perps-sdk`: Mainnet Jupiter Perps wrapper (stub)
- `@sov/config`: Shared config
