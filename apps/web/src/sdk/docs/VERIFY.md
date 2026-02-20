# Verification

## Build

```bash
pnpm install
pnpm build
```

## Run

```bash
cp .env.example .env.local
# Edit .env.local with MAINNET_RPC_URL, DEVNET_RPC_URL, JUPITER_API_KEY

pnpm dev
```

## Verify Receipts Pipeline

1. Open `/app` → Devnet Lab
2. Pick or import a market → Market Proof page
3. Connect wallet, Init User (or use existing)
4. Crank Now → Check receipt in dock (tx sig, programs, upgradeable/authority)

## Verify No Mock Data

- Markets: Only from directory (default slab + imported JSON) or chain
- Balances/PNL: From `parseAccount`, `parseEngine` (chain reads)
- No placeholder arrays, dummy signatures, or invented numbers
