const fs = require("fs");
const path = require("path");
const dts = `import type { Connection, PublicKey, TransactionInstruction, Transaction, Keypair } from "@solana/web3.js";

/* ------------------------------------------------------------------ */
/*  Core types                                                         */
/* ------------------------------------------------------------------ */

export interface PercolatorParams {
  programId: PublicKey;
  slab: PublicKey;
  oracle: PublicKey;
  matcherProgramId?: PublicKey;
}

export interface DevnetMarketInfo {
  network: "devnet";
  slab: string;
  programId: string;
  matcherProgramId: string;
  mint: string;
  vault: string;
  vaultPda?: string;
  oracle: string;
  oracleType: "pyth" | "chainlink" | "authority";
  inverted?: boolean;
  lp?: {
    index: number;
    pda: string;
    matcherContext: string;
    collateral: number;
  };
  admin?: string;
  adminAta?: string;
  insuranceFund?: number;
  createdAt?: string;
}

/* ------------------------------------------------------------------ */
/*  Slab account types                                                 */
/* ------------------------------------------------------------------ */

export interface SlabHeader {
  magic: bigint;
  version: number;
  bump: number;
  flags: number;
  resolved: boolean;
  admin: PublicKey;
  nonce: bigint;
  lastThrUpdateSlot: bigint;
}

export interface MarketConfig {
  collateralMint: PublicKey;
  vaultPubkey: PublicKey;
  indexFeedId: PublicKey;
  maxStalenessSlots: bigint;
  confFilterBps: number;
  vaultAuthorityBump: number;
  invert: number;
  unitScale: number;
  fundingHorizonSlots: bigint;
  fundingKBps: bigint;
  fundingInvScaleNotionalE6: bigint;
  fundingMaxPremiumBps: bigint;
  fundingMaxBpsPerSlot: bigint;
  threshFloor: bigint;
  threshRiskBps: bigint;
  threshUpdateIntervalSlots: bigint;
  threshStepBps: bigint;
  threshAlphaBps: bigint;
  threshMin: bigint;
  threshMax: bigint;
  threshMinStep: bigint;
  oracleAuthority: PublicKey;
  authorityPriceE6: bigint;
  authorityTimestamp: bigint;
  oraclePriceCapE2bps: bigint;
  lastEffectivePriceE6: bigint;
}

export interface InsuranceFund {
  balance: bigint;
  feeRevenue: bigint;
}

export interface EngineState {
  vault: bigint;
  insuranceFund: InsuranceFund;
  currentSlot: bigint;
  fundingIndexQpbE6: bigint;
  lastFundingSlot: bigint;
  fundingRateBpsPerSlotLast: bigint;
  lastCrankSlot: bigint;
  maxCrankStalenessSlots: bigint;
  totalOpenInterest: bigint;
  cTot: bigint;
  pnlPosTot: bigint;
  liqCursor: number;
  gcCursor: number;
  lastSweepStartSlot: bigint;
  lastSweepCompleteSlot: bigint;
  crankCursor: number;
  sweepStartIdx: number;
  lifetimeLiquidations: bigint;
  lifetimeForceCloses: bigint;
  netLpPos: bigint;
  lpSumAbs: bigint;
  lpMaxAbs: bigint;
  lpMaxAbsSweep: bigint;
  numUsedAccounts: number;
  nextAccountId: bigint;
}

export interface RiskParams {
  warmupPeriodSlots: bigint;
  maintenanceMarginBps: bigint;
  initialMarginBps: bigint;
  tradingFeeBps: bigint;
  maxAccounts: bigint;
  newAccountFee: bigint;
  riskReductionThreshold: bigint;
  maintenanceFeePerSlot: bigint;
  maxCrankStalenessSlots: bigint;
  liquidationFeeBps: bigint;
  liquidationFeeCap: bigint;
  liquidationBufferBps: bigint;
  minLiquidationAbs: bigint;
}

export declare enum AccountKind {
  User = 0,
  LP = 1,
}

export interface Account {
  kind: AccountKind;
  accountId: bigint;
  capital: bigint;
  pnl: bigint;
  reservedPnl: bigint;
  warmupStartedAtSlot: bigint;
  warmupSlopePerStep: bigint;
  positionSize: bigint;
  entryPrice: bigint;
  fundingIndex: bigint;
  matcherProgram: PublicKey;
  matcherContext: PublicKey;
  owner: PublicKey;
  feeCredits: bigint;
  lastFeeSlot: bigint;
}

/* ------------------------------------------------------------------ */
/*  Slab parsers                                                       */
/* ------------------------------------------------------------------ */

export declare function fetchSlab(connection: Connection, slabPubkey: PublicKey): Promise<Buffer>;
export declare function parseHeader(data: Buffer): SlabHeader;
export declare function parseConfig(data: Buffer): MarketConfig;
export declare function parseEngine(data: Buffer): EngineState;
export declare function parseParams(data: Buffer): RiskParams;
export declare function parseAccount(data: Buffer, idx: number): Account;
export declare function parseUsedIndices(data: Buffer): number[];
export declare function parseAllAccounts(data: Buffer): { idx: number; account: Account }[];
export declare function isAccountUsed(data: Buffer, idx: number): boolean;
export declare function maxAccountIndex(dataLen: number): number;
export declare function readNonce(data: Buffer): bigint;

/* ------------------------------------------------------------------ */
/*  PDA helpers                                                        */
/* ------------------------------------------------------------------ */

export declare function deriveVaultAuthority(programId: PublicKey, slab: PublicKey): [PublicKey, number];
export declare function deriveLpPda(programId: PublicKey, slab: PublicKey, lpIdx: number): [PublicKey, number];

/* ------------------------------------------------------------------ */
/*  Existing instruction builders                                      */
/* ------------------------------------------------------------------ */

export declare function buildInitUserIx(
  connection: Connection,
  params: PercolatorParams,
  payer: PublicKey,
  feePayment: bigint | string
): Promise<TransactionInstruction>;

export declare function buildDepositIx(
  connection: Connection,
  params: PercolatorParams,
  payer: PublicKey,
  userIdx: number,
  amount: bigint | string
): Promise<TransactionInstruction>;

export declare function buildKeeperCrankIx(
  params: PercolatorParams,
  payer: PublicKey,
  allowPanic?: boolean
): TransactionInstruction;

export declare function buildTradeCpiIx(
  connection: Connection,
  params: PercolatorParams & { matcherProgramId: PublicKey; matcherContext: PublicKey },
  payer: PublicKey,
  lpIdx: number,
  userIdx: number,
  size: bigint | string
): Promise<TransactionInstruction>;

export declare function buildTradeCpiIxDirect(
  params: PercolatorParams & { matcherProgramId: PublicKey; matcherContext: PublicKey },
  payer: PublicKey,
  lpIdx: number,
  lpOwner: PublicKey,
  oracleAccount: PublicKey,
  userIdx: number,
  size: bigint | string
): TransactionInstruction;

export declare function addComputeBudget(tx: Transaction, units?: number): void;

/* ------------------------------------------------------------------ */
/*  New instruction builders                                           */
/* ------------------------------------------------------------------ */

export interface InitMarketArgs {
  admin: PublicKey | string;
  collateralMint: PublicKey | string;
  indexFeedId: string;
  maxStalenessSecs: bigint | string;
  confFilterBps: number;
  invert: number;
  unitScale: number;
  initialMarkPriceE6: bigint | string;
  warmupPeriodSlots: bigint | string;
  maintenanceMarginBps: bigint | string;
  initialMarginBps: bigint | string;
  tradingFeeBps: bigint | string;
  maxAccounts: bigint | string;
  newAccountFee: bigint | string;
  riskReductionThreshold: bigint | string;
  maintenanceFeePerSlot: bigint | string;
  maxCrankStalenessSlots: bigint | string;
  liquidationFeeBps: bigint | string;
  liquidationFeeCap: bigint | string;
  liquidationBufferBps: bigint | string;
  minLiquidationAbs: bigint | string;
}

export interface SlabTier {
  label: string;
  maxAccounts: number;
  bytes: number;
  programId?: string;
}

export declare const PRODUCTION_SLAB_SIZE: number;
export declare const SLAB_FIXED_OVERHEAD: number;
export declare const ACCOUNT_SLOT_SIZE: number;
export declare const SLAB_TIERS: SlabTier[];

export declare function computeSlabSize(maxAccounts: number): number;

export declare function buildCreateSlabIx(
  connection: Connection,
  payer: PublicKey,
  programId: PublicKey,
  slabBytes: number,
): Promise<{ instruction: TransactionInstruction; slabKeypair: Keypair }>;

export declare function buildInitMarketIx(
  params: {
    programId: PublicKey;
    slab: PublicKey;
    mint: PublicKey;
    vault: PublicKey;
    admin: PublicKey;
  },
  args: InitMarketArgs,
): TransactionInstruction;

export declare function buildCreateVaultIx(
  connection: Connection,
  payer: PublicKey,
  programId: PublicKey,
  slab: PublicKey,
  mint: PublicKey,
): Promise<{ instruction: TransactionInstruction; vaultKeypair: Keypair }>;

export declare function buildInitLPIx(
  connection: Connection,
  params: PercolatorParams & { matcherProgramId: PublicKey; matcherContext: PublicKey },
  payer: PublicKey,
  feePayment: bigint | string,
): Promise<TransactionInstruction>;

export declare function buildWithdrawIx(
  connection: Connection,
  params: PercolatorParams,
  payer: PublicKey,
  userIdx: number,
  amount: bigint | string,
): Promise<TransactionInstruction>;

export declare function buildTopUpInsuranceIx(
  connection: Connection,
  params: PercolatorParams,
  payer: PublicKey,
  amount: bigint | string,
): Promise<TransactionInstruction>;

export declare function buildSetOracleAuthorityIx(
  params: { programId: PublicKey; slab: PublicKey },
  admin: PublicKey,
  newAuthority: PublicKey,
): TransactionInstruction;

export declare function buildPushOraclePriceIx(
  params: { programId: PublicKey; slab: PublicKey },
  authority: PublicKey,
  priceE6: bigint | string,
  timestamp: bigint | string,
): TransactionInstruction;
`;
const out = path.join(__dirname, "..", "dist", "index.d.ts");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, dts);
