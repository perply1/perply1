/**
 * Build Percolator instructions for wallet signing.
 * Uses vendor ABI; caller sends via Connection + wallet adapter.
 */

import {
  type Connection,
  PublicKey,
  TransactionInstruction,
  ComputeBudgetProgram,
  type Transaction,
  SystemProgram,
  Keypair,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  createInitializeAccountInstruction,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  encodeInitUser,
  encodeInitMarket,
  encodeInitLP,
  encodeDepositCollateral,
  encodeWithdrawCollateral,
  encodeKeeperCrank,
  encodeTradeCpi,
  encodeTopUpInsurance,
  encodeSetOracleAuthority,
  encodePushOraclePrice,
  encodeUpdateAdmin,
  type InitMarketArgs,
} from "./vendor/abi/instructions";
import {
  ACCOUNTS_INIT_USER,
  ACCOUNTS_INIT_MARKET,
  ACCOUNTS_INIT_LP,
  ACCOUNTS_DEPOSIT_COLLATERAL,
  ACCOUNTS_WITHDRAW_COLLATERAL,
  ACCOUNTS_KEEPER_CRANK,
  ACCOUNTS_TRADE_CPI,
  ACCOUNTS_TOPUP_INSURANCE,
  ACCOUNTS_SET_ORACLE_AUTHORITY,
  ACCOUNTS_PUSH_ORACLE_PRICE,
  ACCOUNTS_UPDATE_ADMIN,
  buildAccountMetas,
  WELL_KNOWN,
} from "./vendor/abi/accounts";
import { buildIx } from "./vendor/runtime/tx";
import { deriveLpPda, deriveVaultAuthority } from "./pda";
import { fetchSlab, parseConfig, parseAccount } from "./slab";

export interface PercolatorParams {
  programId: PublicKey;
  slab: PublicKey;
  oracle: PublicKey;
  matcherProgramId?: PublicKey;
}

/**
 * Get user ATA for collateral mint
 */
function getUserAta(user: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, user);
}

/**
 * Build InitUser instruction
 */
export async function buildInitUserIx(
  connection: Connection,
  params: PercolatorParams,
  payer: PublicKey,
  feePayment: bigint | string
): Promise<TransactionInstruction> {
  const data = await fetchSlab(connection, params.slab);
  const config = parseConfig(data);
  const userAta = getUserAta(payer, config.collateralMint);

  const ixData = encodeInitUser({ feePayment: String(feePayment) });
  const keys = buildAccountMetas(ACCOUNTS_INIT_USER, [
    payer,
    params.slab,
    userAta,
    config.vaultPubkey,
    WELL_KNOWN.tokenProgram,
  ]);

  return buildIx({
    programId: params.programId,
    keys,
    data: ixData,
  });
}

/**
 * Build DepositCollateral instruction
 */
export async function buildDepositIx(
  connection: Connection,
  params: PercolatorParams,
  payer: PublicKey,
  userIdx: number,
  amount: bigint | string
): Promise<TransactionInstruction> {
  const data = await fetchSlab(connection, params.slab);
  const config = parseConfig(data);
  const userAta = getUserAta(payer, config.collateralMint);

  const ixData = encodeDepositCollateral({ userIdx, amount: String(amount) });
  const keys = buildAccountMetas(ACCOUNTS_DEPOSIT_COLLATERAL, [
    payer,
    params.slab,
    userAta,
    config.vaultPubkey,
    WELL_KNOWN.tokenProgram,
    WELL_KNOWN.clock,
  ]);

  return buildIx({
    programId: params.programId,
    keys,
    data: ixData,
  });
}

/**
 * Build KeeperCrank instruction
 */
export function buildKeeperCrankIx(
  params: PercolatorParams,
  payer: PublicKey,
  allowPanic = false
): TransactionInstruction {
  const ixData = encodeKeeperCrank({
    callerIdx: 65535, // permissionless
    allowPanic,
  });
  const keys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
    payer,
    params.slab,
    WELL_KNOWN.clock,
    params.oracle,
  ]);

  return buildIx({
    programId: params.programId,
    keys,
    data: ixData,
  });
}

/**
 * Build TradeCpi instruction
 */
export async function buildTradeCpiIx(
  connection: Connection,
  params: PercolatorParams & { matcherProgramId: PublicKey; matcherContext: PublicKey },
  payer: PublicKey,
  lpIdx: number,
  userIdx: number,
  size: bigint | string
): Promise<TransactionInstruction> {
  const data = await fetchSlab(connection, params.slab);
  const config = parseConfig(data);
  const lpAccount = parseAccount(data, lpIdx);
  const [lpPda] = deriveLpPda(params.programId, params.slab, lpIdx);

  const ixData = encodeTradeCpi({
    lpIdx,
    userIdx,
    size: String(size),
  });
  const keys = buildAccountMetas(ACCOUNTS_TRADE_CPI, [
    payer,
    lpAccount.owner,
    params.slab,
    WELL_KNOWN.clock,
    config.indexFeedId, // oracle - for Chainlink this is the feed account
    params.matcherProgramId,
    params.matcherContext,
    lpPda,
  ]);

  return buildIx({
    programId: params.programId,
    keys,
    data: ixData,
  });
}

/**
 * Build TradeCpi instruction with pre-parsed data (tier-aware).
 * Use this when the slab is Small/Medium tier and the vendor parser would fail.
 */
export function buildTradeCpiIxDirect(
  params: PercolatorParams & { matcherProgramId: PublicKey; matcherContext: PublicKey },
  payer: PublicKey,
  lpIdx: number,
  lpOwner: PublicKey,
  oracleAccount: PublicKey,
  userIdx: number,
  size: bigint | string
): TransactionInstruction {
  const [lpPda] = deriveLpPda(params.programId, params.slab, lpIdx);

  const ixData = encodeTradeCpi({
    lpIdx,
    userIdx,
    size: String(size),
  });
  const keys = buildAccountMetas(ACCOUNTS_TRADE_CPI, [
    payer,
    lpOwner,
    params.slab,
    WELL_KNOWN.clock,
    oracleAccount,
    params.matcherProgramId,
    params.matcherContext,
    lpPda,
  ]);

  return buildIx({
    programId: params.programId,
    keys,
    data: ixData,
  });
}

/**
 * Add compute budget to transaction
 */
export function addComputeBudget(tx: Transaction, units = 400_000): void {
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units }));
}

/* ------------------------------------------------------------------ */
/*  InitMarket                                                         */
/* ------------------------------------------------------------------ */

/**
 * Slab size constant.
 * The on-chain program expects a FIXED slab size (SLAB_LEN = 0xfa528 = 992560 bytes).
 * This is compiled into the BPF binary with MAX_ACCOUNTS = 4096.
 * The slab_guard check rejects any other size.
 *
 * Reference: vendor/percolator/percolator-sov/tests/harness.ts (calculateSlabSize)
 * Reference: vendor/percolator/percolator-sov/src/commands/list-markets.ts (SLAB_SIZE)
 */
export const PRODUCTION_SLAB_SIZE = 992560;

/** @deprecated Use PRODUCTION_SLAB_SIZE — the program only accepts one fixed size */
export const SLAB_FIXED_OVERHEAD = 9528;
/** @deprecated Use PRODUCTION_SLAB_SIZE */
export const ACCOUNT_SLOT_SIZE = 240;

/** @deprecated Use PRODUCTION_SLAB_SIZE — the program only accepts one fixed size */
export function computeSlabSize(_maxAccounts: number): number {
  return PRODUCTION_SLAB_SIZE;
}

export interface SlabTier {
  label: string;
  maxAccounts: number;
  bytes: number;
  /** Program ID for this tier (different compiled binaries) */
  programId?: string;
}

/**
 * Slab tiers with REAL byte sizes from different program compilations.
 * Each tier is a separate Percolator program built with different MAX_ACCOUNTS.
 * Source: https://github.com/dcccrypto/percolator-launch (devnet deployments).
 *
 * Small  (256 accts):  62,808 bytes → ~0.5 SOL rent
 * Medium (1024 accts): 249,480 bytes → ~1.8 SOL rent
 * Large  (4096 accts): 992,560 bytes → ~6.9 SOL rent
 */
export const SLAB_TIERS: SlabTier[] = [
  { label: "Small", maxAccounts: 256, bytes: 62_808, programId: "FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD" },
  { label: "Medium", maxAccounts: 1024, bytes: 249_480, programId: "FwfBKZXbYr4vTK23bMFkbgKq3npJ3MSDxEaKmq9Aj4Qn" },
  { label: "Large", maxAccounts: 4096, bytes: 992_560, programId: "g9msRSV3sJmmE3r5Twn9HuBsxzuuRGTjKCVTKudm9in" },
];

/**
 * Build the system program instruction to create the slab account.
 * Returns both the instruction and the slab keypair (must co-sign).
 */
export async function buildCreateSlabIx(
  connection: Connection,
  payer: PublicKey,
  programId: PublicKey,
  slabBytes: number,
): Promise<{ instruction: TransactionInstruction; slabKeypair: Keypair }> {
  const lamports = await connection.getMinimumBalanceForRentExemption(slabBytes);
  const slabKeypair = Keypair.generate();
  const instruction = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: slabKeypair.publicKey,
    lamports,
    space: slabBytes,
    programId,
  });
  return { instruction, slabKeypair };
}

/**
 * Build InitMarket instruction.
 * Caller is responsible for creating the slab account first.
 */
export function buildInitMarketIx(
  params: {
    programId: PublicKey;
    slab: PublicKey;
    mint: PublicKey;
    vault: PublicKey;
    admin: PublicKey;
  },
  args: InitMarketArgs,
): TransactionInstruction {
  const ixData = encodeInitMarket(args);

  // dummy ATA — the program requires it in the accounts list but doesn't use it
  const dummyAta = getAssociatedTokenAddressSync(params.mint, params.admin);

  const keys = buildAccountMetas(ACCOUNTS_INIT_MARKET, [
    params.admin,
    params.slab,
    params.mint,
    params.vault,
    WELL_KNOWN.tokenProgram,
    WELL_KNOWN.clock,
    WELL_KNOWN.rent,
    dummyAta,
    WELL_KNOWN.systemProgram,
  ]);

  return buildIx({ programId: params.programId, keys, data: ixData });
}

/**
 * Build instruction to create a vault (SPL token account) for the market.
 * The vault authority is a PDA: ["vault", slab_key].
 */
export async function buildCreateVaultIx(
  connection: Connection,
  payer: PublicKey,
  programId: PublicKey,
  slab: PublicKey,
  mint: PublicKey,
): Promise<{ instruction: TransactionInstruction; vaultKeypair: Keypair }> {
  const space = 165; // SPL Token Account size
  const lamports = await connection.getMinimumBalanceForRentExemption(space);
  const vaultKeypair = Keypair.generate();

  const [vaultAuthority] = deriveVaultAuthority(programId, slab);

  const createIx = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: vaultKeypair.publicKey,
    lamports,
    space,
    programId: TOKEN_PROGRAM_ID,
  });

  const initIx = createInitializeAccountInstruction(
    vaultKeypair.publicKey,
    mint,
    vaultAuthority,
  );

  // We return a composite instruction by creating two — caller adds both
  // Actually let's return both separately
  return { instruction: createIx, vaultKeypair };
}

/* ------------------------------------------------------------------ */
/*  InitLP                                                             */
/* ------------------------------------------------------------------ */

/**
 * Build InitLP instruction.
 */
export async function buildInitLPIx(
  connection: Connection,
  params: PercolatorParams & { matcherProgramId: PublicKey; matcherContext: PublicKey },
  payer: PublicKey,
  feePayment: bigint | string,
): Promise<TransactionInstruction> {
  const data = await fetchSlab(connection, params.slab);
  const config = parseConfig(data);
  const userAta = getUserAta(payer, config.collateralMint);

  const ixData = encodeInitLP({
    matcherProgram: params.matcherProgramId,
    matcherContext: params.matcherContext,
    feePayment: String(feePayment),
  });
  const keys = buildAccountMetas(ACCOUNTS_INIT_LP, [
    payer,
    params.slab,
    userAta,
    config.vaultPubkey,
    WELL_KNOWN.tokenProgram,
  ]);

  return buildIx({ programId: params.programId, keys, data: ixData });
}

/* ------------------------------------------------------------------ */
/*  WithdrawCollateral                                                 */
/* ------------------------------------------------------------------ */

/**
 * Build WithdrawCollateral instruction.
 */
export async function buildWithdrawIx(
  connection: Connection,
  params: PercolatorParams,
  payer: PublicKey,
  userIdx: number,
  amount: bigint | string,
): Promise<TransactionInstruction> {
  const data = await fetchSlab(connection, params.slab);
  const config = parseConfig(data);
  const userAta = getUserAta(payer, config.collateralMint);
  const [vaultPda] = deriveVaultAuthority(params.programId, params.slab);

  const ixData = encodeWithdrawCollateral({ userIdx, amount: String(amount) });
  const keys = buildAccountMetas(ACCOUNTS_WITHDRAW_COLLATERAL, [
    payer,
    params.slab,
    config.vaultPubkey,
    userAta,
    vaultPda,
    WELL_KNOWN.tokenProgram,
    WELL_KNOWN.clock,
    params.oracle,
  ]);

  return buildIx({ programId: params.programId, keys, data: ixData });
}

/* ------------------------------------------------------------------ */
/*  TopUpInsurance                                                     */
/* ------------------------------------------------------------------ */

/**
 * Build TopUpInsurance instruction.
 */
export async function buildTopUpInsuranceIx(
  connection: Connection,
  params: PercolatorParams,
  payer: PublicKey,
  amount: bigint | string,
): Promise<TransactionInstruction> {
  const data = await fetchSlab(connection, params.slab);
  const config = parseConfig(data);
  const userAta = getUserAta(payer, config.collateralMint);

  const ixData = encodeTopUpInsurance({ amount: String(amount) });
  const keys = buildAccountMetas(ACCOUNTS_TOPUP_INSURANCE, [
    payer,
    params.slab,
    userAta,
    config.vaultPubkey,
    WELL_KNOWN.tokenProgram,
  ]);

  return buildIx({ programId: params.programId, keys, data: ixData });
}

/* ------------------------------------------------------------------ */
/*  Oracle Authority                                                   */
/* ------------------------------------------------------------------ */

/**
 * Build SetOracleAuthority instruction.
 */
export function buildSetOracleAuthorityIx(
  params: { programId: PublicKey; slab: PublicKey },
  admin: PublicKey,
  newAuthority: PublicKey,
): TransactionInstruction {
  const ixData = encodeSetOracleAuthority({ newAuthority });
  const keys = buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [admin, params.slab]);
  return buildIx({ programId: params.programId, keys, data: ixData });
}

/**
 * Build PushOraclePrice instruction.
 */
export function buildPushOraclePriceIx(
  params: { programId: PublicKey; slab: PublicKey },
  authority: PublicKey,
  priceE6: bigint | string,
  timestamp: bigint | string,
): TransactionInstruction {
  const ixData = encodePushOraclePrice({ priceE6, timestamp });
  const keys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [authority, params.slab]);
  return buildIx({ programId: params.programId, keys, data: ixData });
}

/**
 * Build UpdateAdmin instruction (admin only).
 * Set newAdmin to PublicKey.default() to burn admin key (make market adminless).
 */
export function buildUpdateAdminIx(
  params: { programId: PublicKey; slab: PublicKey },
  admin: PublicKey,
  newAdmin: PublicKey,
): TransactionInstruction {
  const ixData = encodeUpdateAdmin({ newAdmin });
  const keys = buildAccountMetas(ACCOUNTS_UPDATE_ADMIN, [admin, params.slab]);
  return buildIx({ programId: params.programId, keys, data: ixData });
}

/* ------------------------------------------------------------------ */
/*  Re-exports for convenience                                         */
/* ------------------------------------------------------------------ */

export type { InitMarketArgs } from "./vendor/abi/instructions";
