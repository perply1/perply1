# Adminless Markets — On-Chain Authority Burn

This document describes how Perply enables market creators to make their markets **adminless** (burn admin key) with verifiable on-chain proof.

## Overview

**Adminless markets** are markets where the admin/authority key has been permanently burned (set to `PublicKey.default()` = all zeros). After burning, no one can:
- Update market parameters (`UpdateConfig`, `SetRiskThreshold`, `SetMaintenanceFee`)
- Change oracle authority (`SetOracleAuthority`)
- Pause or resolve the market (`ResolveMarket`)
- Perform admin-only operations

This provides **credible commitment** that the market parameters cannot be changed after launch.

## On-Chain Implementation

### Authority Field Location

The market admin is stored in the **SlabHeader** account at offset **16-48** (32 bytes):

```rust
// percolator-prog/src/percolator.rs
pub struct SlabHeader {
    pub magic: u64,
    pub version: u32,
    pub bump: u8,
    pub _padding: [u8; 3],
    pub admin: [u8; 32],  // ← Market admin (offset 16-48)
    // ...
}
```

### UpdateAdmin Instruction

**Instruction Tag**: `12` (`UpdateAdmin`)

**Instruction Data**: 33 bytes
- `[0]`: Tag `12`
- `[1..33]`: New admin pubkey (32 bytes)

**Accounts** (2):
1. `admin` (signer, writable: false) — Current admin (must match `header.admin`)
2. `slab` (signer: false, writable: true) — Market slab account

**Program Logic** (`percolator-prog/src/percolator.rs:3858`):
```rust
Instruction::UpdateAdmin { new_admin } => {
    // ... account validation ...
    let mut header = state::read_header(&data);
    require_admin(header.admin, a_admin.key)?;  // Must be current admin
    header.admin = new_admin.to_bytes();        // Update to new admin
    state::write_header(&mut data, &header);
}
```

### Burned State

**Burned admin** = `PublicKey.default()` = `[0u8; 32]` (all zeros)

After burning, the `require_admin()` check in the program will **always fail** because:
- No signer can match `[0u8; 32]`
- Even the original admin cannot perform admin operations

**Proof**: See `percolator-prog/tests/unit.rs:test_after_burn_admin_ops_disabled`:
```rust
// After burn to zero:
let zero_admin = Pubkey::default();
// ... burn admin ...

// Attempt UpdateAdmin signed by anyone → must fail
assert_eq!(res, Err(PercolatorError::EngineUnauthorized.into()));
```

## Perply Implementation

### Launch Wizard

**Step 5 (Risk / Fees)** includes an **Admin Mode** selector:

- **Upgradeable (default)**: Admin key remains active, can update params later
- **Adminless (burn admin key)**: Admin key is burned after launch (IRREVERSIBLE)

**Safety Rules**:
1. **Cannot burn admin if oracle mode is Authority**: Authority oracle requires admin to set oracle authority. If adminless, oracle authority cannot be changed.
2. **Confirmation required**: User must type `"BURN"` to enable adminless mode
3. **Validation**: UI blocks adminless selection if oracle mode is Authority

### Burn Step (Phase 4)

After market launch completes (Phase 1-3), if `adminMode === "adminless"`:

1. **Read current admin** from slab header
2. **Build `UpdateAdmin` instruction** with `newAdmin = PublicKey.default()`
3. **Send transaction** signed by current admin
4. **Verify burn**: Re-read slab header, confirm `admin === [0u8; 32]`
5. **Create receipt** with before/after admin addresses

**Transaction Signature**: Included in receipt for verification

### Proof Page Display

The **Market Proof Page** shows:

- **Admin Status Badge**:
  - `BURNED ✅` (green) if `admin === PublicKey.default()`
  - `ACTIVE` (amber) if admin is set
- **Admin Address**: Full pubkey (clickable to explorer)
- **Oracle Authority**: If oracle authority is set (separate from market admin)
- **Warning**: "Market is adminless. Admin operations are permanently disabled."

### Disabled Admin Controls

When admin is burned, the UI disables:
- **Push Oracle Price** (requires oracle authority, but adminless markets should use Pyth/Chainlink)
- Any admin-only parameter updates
- Market resolution controls

**On-chain enforcement**: Even if UI is bypassed, the program will reject admin instructions with `EngineUnauthorized` error.

## Receipts

Burn admin step produces a receipt with:
- **Action**: `"Burn Admin Key (Adminless) - Before: <pubkey>..., After: 11111111111111111111111111111111"`
- **Transaction Signature**: On-chain proof
- **Market ID**: Slab pubkey
- **Program Truth**: CPI trace showing `UpdateAdmin` instruction

## Verification

### Check Admin Status

```bash
# Read slab account
solana account <SLAB_PUBKEY> --output json | jq '.account.data[0]'

# Parse header (offset 16-48 = admin field)
# If all zeros → adminless
# If non-zero → admin is active
```

### Verify Burn Transaction

```bash
# Get transaction signature from receipt
solana confirm <TX_SIGNATURE> --output json | jq '.transaction.message.instructions[] | select(.programId == "<PERCOLATOR_PROGRAM_ID>")'
```

### Test Admin Operations After Burn

```typescript
// Attempt UpdateAdmin after burn → should fail
const burnAdminIx = buildUpdateAdminIx(
  { programId, slab },
  anySigner,  // Even original admin
  newAdminPubkey,
);
// Transaction will fail with EngineUnauthorized
```

## Examples

### Launch Adminless Market

1. **Launch Wizard** → Step 5 (Risk / Fees)
2. Select **Admin Mode**: `Adminless (burn admin key)`
3. Type `"BURN"` in confirmation field
4. Ensure **Oracle Mode** is NOT "Authority" (use Pyth/Chainlink)
5. Complete launch → Admin key is burned automatically

### Verify Adminless Status

1. Navigate to **Market Proof Page**
2. Check **Admin Status**: Should show `BURNED ✅`
3. Verify admin address is `11111111111111111111111111111111`
4. Confirm admin controls are disabled

## Security Considerations

1. **Irreversible**: Once burned, admin cannot be recovered. Ensure all parameters are correct before launch.
2. **Oracle Mode**: Adminless markets should use Pyth/Chainlink (not Authority oracle) since oracle authority changes require admin.
3. **Upgrade Path**: If market needs parameter updates later, adminless markets cannot be updated. Consider starting as "Upgradeable" and burning later if desired.
4. **Program Upgrade Authority**: This is separate from market admin. Program upgrade authority controls program code upgrades, not market parameters.

## References

- **Program Source**: `apps/web/src/sdk/vendor/percolator/percolator-prog/src/percolator.rs`
- **SDK Function**: `buildUpdateAdminIx()` in `apps/web/src/sdk/packages/percolator-sdk/src/instructions.ts`
- **Tests**: `percolator-prog/tests/unit.rs:test_burn_admin_to_zero`, `test_after_burn_admin_ops_disabled`
- **Explorer**: Check market slab account to verify admin field
