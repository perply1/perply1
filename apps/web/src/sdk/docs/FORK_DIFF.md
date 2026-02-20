# Fork / Upstream Provenance

## Vendor (Read-Only)

- `vendor/percolator/percolator-sov` — Perply percolator-sov CLI/TS SDK
- `vendor/percolator/percolator-match` — Matcher program (Rust)
- `vendor/percolator/percolator-prog` — On-chain program (Rust)
- `vendor/percolator/percolator` — Root

## What Changed

- **SOV** is a new frontend + wrapper layer. No modifications to vendor.
- `packages/percolator-sdk` reuses vendor ABI, PDA, slab parsing via direct imports.
- `packages/proof` is net-new: TX parsing, program inspection, receipts.

## Upstream Links

- percolator-sov: https://github.com/perply1/percolator-sov
- percolator-match: https://github.com/perply1/percolator-match
- percolator-prog: https://github.com/perply1/percolator-prog
