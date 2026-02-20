"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  buildInitUserIx,
  buildDepositIx,
  buildWithdrawIx,
  buildKeeperCrankIx,
  buildTradeCpiIx,
  buildTradeCpiIxDirect,
  buildTopUpInsuranceIx,
  buildSetOracleAuthorityIx,
  buildPushOraclePriceIx,
  addComputeBudget,
  fetchSlab,
  parseEngine,
  parseConfig,
  parseHeader,
  parseParams,
  parseUsedIndices,
  parseAccount,
  parseAllAccounts,
  AccountKind,
  deriveLpPda,
  type PercolatorParams,
  type EngineState,
  type MarketConfig,
  type SlabHeader,
  type RiskParams,
  type Account as SlabAccount,
} from "@sov/percolator-sdk";
import { DEVNET } from "@sov/config";
import { useReceipts } from "./receipts-provider";
import { useCluster } from "./cluster-provider";
import { parseTxAndBuildReceipt, inspectProgram, explorerAccountUrl, explorerTxUrl } from "@sov/proof";
import type { ProgramInfo, Receipt } from "@sov/proof";
import { fetchMatcherContext, type MatcherContext } from "@/lib/matcher-context";
import { computePricing, calculateSkew, calculateUtilization, calculateOracleDivergence, checkCrankFreshness, checkOracleFreshness, classifyVolRegime, type PricingResult } from "@/lib/pricing-engine";

/* ------------------------------------------------------------------ */
/*  Constants from config                                              */
/* ------------------------------------------------------------------ */

const FALLBACK_PROGRAM_ID = new PublicKey(DEVNET.percolatorProgramId);
const MATCHER_PROGRAM_ID = new PublicKey(DEVNET.matcherProgramId);
const PYTH_RECEIVER = DEVNET.pythReceiverProgramId;
const CHAINLINK_OCR2 = DEVNET.chainlinkOcr2ProgramId;

/** Base URL for verification docs (GitHub perply1/perply1 main) */
const VERIFY_DOC_BASE_URL = "https://github.com/perply1/perply1/blob/main";
/** Anchor in verification-artifacts.md for matcher program section */
const VERIFY_ANCHOR_MATCHER = "matcher-program";
/** Anchor for percolator / generic program inspection */
const VERIFY_ANCHOR_PERCOLATOR = "program-inspection";

function getVerifyDocUrl(programId: string): string {
  const anchor = programId === DEVNET.matcherProgramId ? VERIFY_ANCHOR_MATCHER : VERIFY_ANCHOR_PERCOLATOR;
  return `${VERIFY_DOC_BASE_URL}/apps/web/docs/verification-artifacts.md#${anchor}`;
}

/** In-app verify page URL (Phase 2): shows program info + copyable verify commands */
function getVerifyPageUrl(programId: string, cluster: string): string {
  return `/app/verify?program=${encodeURIComponent(programId)}&cluster=${encodeURIComponent(cluster || "devnet")}`;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function short(s: string, len = 6) {
  if (s.length <= len * 2 + 3) return s;
  return `${s.slice(0, len)}…${s.slice(-len)}`;
}

function bigToNum(b: bigint): number {
  return Number(b);
}

function lamportsToSol(lamports: bigint): string {
  return (Number(lamports) / LAMPORTS_PER_SOL).toFixed(4);
}

/** Map Percolator custom program error codes to human-readable names */
const PERCOLATOR_ERRORS: Record<number, string> = {
  0x0: "InvalidMagic",
  0x1: "InvalidVersion",
  0x2: "AlreadyInitialized",
  0x3: "NotInitialized",
  0x4: "InvalidSlabLen",
  0x5: "InvalidOracleKey",
  0x6: "OracleStale",
  0x7: "OracleConfTooWide",
  0x8: "InvalidVaultAta",
  0x9: "InvalidMint",
  0xa: "ExpectedSigner",
  0xb: "ExpectedWritable",
  0xc: "OracleInvalid",
  0xd: "InsufficientBalance",
  0xe: "Undercollateralized — LP or user lacks margin for this trade size. Try a smaller size.",
  0xf: "Unauthorized — crank may be stale, or sweep not recent enough",
  0x10: "InvalidMatchingEngine",
  0x11: "PnlNotWarmedUp",
  0x12: "Overflow",
  0x13: "AccountNotFound",
  0x14: "NotAnLPAccount",
  0x15: "PositionSizeMismatch",
  0x16: "RiskReductionOnlyMode",
  0x17: "InvalidTokenAccount",
  0x18: "InvalidTokenProgram",
  0x19: "InvalidConfigParam",
  0x1a: "TradeNoCpiDisabled",
};

function humanizeSimError(detail: string): string {
  // Match "custom program error: 0xHH"
  const m = detail.match(/custom program error:\s*0x([0-9a-fA-F]+)/);
  if (m) {
    const code = parseInt(m[1], 16);
    const name = PERCOLATOR_ERRORS[code];
    if (name) return `${detail} (${name})`;
  }
  // Match "instruction requires an uninitialized account" — means already initialized
  if (detail.includes("instruction requires an uninitialized account")) {
    return `${detail} — The account is already initialized. This is OK.`;
  }
  return detail;
}

/** Format raw token amount using actual decimals (not hardcoded 9) */
function formatTokenAmount(raw: bigint, decimals: number): string {
  const divisor = 10 ** decimals;
  return (Number(raw) / divisor).toFixed(Math.min(decimals, 6));
}

/** Parse user input amount to raw token units using actual decimals */
function parseTokenInput(input: string, decimals: number): bigint {
  const parsed = parseFloat(input);
  if (isNaN(parsed) || parsed <= 0) return 0n;
  return BigInt(Math.floor(parsed * 10 ** decimals));
}

function detectOracleType(ownerStr: string): "pyth" | "chainlink" | "authority" | "unknown" {
  if (ownerStr === "authority") return "authority";
  if (ownerStr === PYTH_RECEIVER) return "pyth";
  if (ownerStr === CHAINLINK_OCR2) return "chainlink";
  return "unknown";
}

/* ------------------------------------------------------------------ */
/*  Tier-aware slab parsing helpers                                     */
/*  The vendor parser hardcodes offsets for 4096-account (Large) slabs. */
/*  For Small (256) and Medium (1024) tiers, the bitmap, numUsed,       */
/*  next_free, and accounts arrays are at different offsets because      */
/*  they scale with MAX_ACCOUNTS.                                       */
/* ------------------------------------------------------------------ */

const ENGINE_OFF = 392;       // Fixed: header (72) + config (320)
const ENGINE_BITMAP_OFF = 408; // Fixed within engine: offset of bitmap start
const ACCOUNT_SIZE = 240;

function tierAwareNumUsed(data: Buffer, maxAccounts: number): number {
  const bitmapWords = maxAccounts / 64;
  const bitmapBytes = bitmapWords * 8;
  const numUsedOff = ENGINE_OFF + ENGINE_BITMAP_OFF + bitmapBytes;
  if (data.length < numUsedOff + 2) return -1;
  return data.readUInt16LE(numUsedOff);
}

function tierAwareAccountsOffset(maxAccounts: number): number {
  const bitmapBytes = (maxAccounts / 64) * 8;
  // After bitmap: num_used(2) + padding(6) + next_account_id(8) + free_head(2) + padding(6) + next_free(maxAccounts*2)
  const afterBitmap = 2 + 6 + 8 + 2 + 6 + maxAccounts * 2;
  const rawOff = ENGINE_OFF + ENGINE_BITMAP_OFF + bitmapBytes + afterBitmap;
  // SBF uses 8-byte alignment (not 16) for Account structs with u128 fields
  return Math.ceil(rawOff / 8) * 8;
}

function tierAwareBitmapScan(data: Buffer, maxAccounts: number): number[] {
  const bitmapWords = maxAccounts / 64;
  const base = ENGINE_OFF + ENGINE_BITMAP_OFF;
  if (data.length < base + bitmapWords * 8) return [];
  const used: number[] = [];
  for (let word = 0; word < bitmapWords; word++) {
    const bits = data.readBigUInt64LE(base + word * 8);
    if (bits === 0n) continue;
    for (let bit = 0; bit < 64; bit++) {
      if ((bits >> BigInt(bit)) & 1n) {
        used.push(word * 64 + bit);
      }
    }
  }
  return used;
}

function tierAwareParseAccount(data: Buffer, idx: number, maxAccounts: number): SlabAccount | null {
  const acctOff = tierAwareAccountsOffset(maxAccounts);
  const base = acctOff + idx * ACCOUNT_SIZE;
  if (data.length < base + ACCOUNT_SIZE) return null;
  try {
    // Account layout (from vendor slab.ts):
    // 0: accountId (u64, 8)
    // 8: capital (U128, 16) 
    // 24: kind (u8, 1 + 7 padding)
    // 32: pnl (I128, 16)
    // 80: position_size (I128, 16)
    // 96: entry_price (u64, 8)
    // 152: matcher_context (Pubkey, 32)
    // 184: owner (Pubkey, 32)
    const kind = data[base + 24]; // kind at offset 24
    // kind 0 = User, kind 1 = LP. Check if account is actually populated via accountId
    const accountId = data.readBigUInt64LE(base);
    if (accountId === 0n && kind === 0) {
      // Could be uninitialized — check owner for all-zero
      const ownerBytes = data.subarray(base + 184, base + 216);
      if (ownerBytes.every(b => b === 0)) return null; // Truly empty slot
    }
    const owner = new PublicKey(data.subarray(base + 184, base + 216));
    const capital = data.readBigUInt64LE(base + 8); // low 8 bytes of U128
    const pnl = data.readBigInt64LE(base + 32); // low 8 bytes of I128
    const positionSize = data.readBigInt64LE(base + 80); // low 8 bytes of I128
    const entryPrice = data.readBigUInt64LE(base + 96);
    const matcherContext = new PublicKey(data.subarray(base + 152, base + 184));
    return {
      kind: kind as number,
      owner,
      capital: BigInt(capital),
      pnl: BigInt(pnl),
      positionSize: BigInt(positionSize),
      entryPrice: BigInt(entryPrice),
      matcherContext,
    } as unknown as SlabAccount;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function DevnetMarketProofPage({ marketId }: { marketId: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { addReceipt, receipts } = useReceipts();
  const { cluster } = useCluster();

  // ---- State ----
  const [slabData, setSlabData] = useState<Buffer | null>(null);
  const [slabOwner, setSlabOwner] = useState<PublicKey>(FALLBACK_PROGRAM_ID);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // User / LP discovery
  const [userIdx, setUserIdx] = useState<number | null>(null);
  const [lpIdx, setLpIdx] = useState<number | null>(null);
  const [lpOwner, setLpOwner] = useState<PublicKey | null>(null);
  const [matcherCtx, setMatcherCtx] = useState<string | null>(null);
  const [matcherInitialized, setMatcherInitialized] = useState<boolean | null>(null);
  const [matcherCheckSeq, setMatcherCheckSeq] = useState(0); // bump to re-check matcher
  const [allAccounts, setAllAccounts] = useState<{ idx: number; account: SlabAccount }[]>([]);

  // Program truth
  const [programTruth, setProgramTruth] = useState<ProgramInfo[]>([]);

  // Oracle
  const [oracleOwner, setOracleOwner] = useState<string | null>(null);
  const [oracleLastSlot, setOracleLastSlot] = useState<number | null>(null);
  /** Oracle freshness in seconds (from Chainlink updatedAt or Pyth publish_time); null if unknown */
  const [oracleFreshnessSecs, setOracleFreshnessSecs] = useState<number | null>(null);

  // Matcher context and pricing
  const [matcherContextData, setMatcherContextData] = useState<MatcherContext | null>(null);
  const [pricingResult, setPricingResult] = useState<PricingResult | null>(null);
  const [currentSlot, setCurrentSlot] = useState<number | null>(null);

  // Vault balances
  const [vaultBalance, setVaultBalance] = useState<bigint | null>(null);

  // User's collateral token balance (ATA)
  const [userTokenBalance, setUserTokenBalance] = useState<bigint | null>(null);

  // Collateral token decimals (fetched from mint)
  const [collateralDecimals, setCollateralDecimals] = useState<number>(9);

  // Trade form
  const [tradeSize, setTradeSize] = useState("");
  const [tradeLpIdx, setTradeLpIdx] = useState("");

  // Deposit / Withdraw form
  const [depositAmt, setDepositAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");

  // Push oracle form
  const [pushPriceInput, setPushPriceInput] = useState("");

  const slabPk = new PublicKey(marketId);

  /* ------------------------------------------------------------------ */
  /*  Load slab data                                                     */
  /* ------------------------------------------------------------------ */

  const loadSlab = useCallback(async () => {
    try {
      setError(null);
      // Fetch raw account info to get both data AND owner (program ID)
      const info = await connection.getAccountInfo(slabPk);
      if (!info) {
        setError("Market not found on devnet");
        return null;
      }
      const data = Buffer.from(info.data);
      setSlabData(data);
      setSlabOwner(info.owner);

      // Parse all accounts (try vendor parser first, fall back to tier-aware)
      try {
        const accts = parseAllAccounts(data);
        setAllAccounts(accts);
      } catch {
        // Vendor parser failed (likely Small/Medium tier) — don't set allAccounts
        setAllAccounts([]);
      }

      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load slab");
      return null;
    }
  }, [connection, marketId]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadSlab().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [loadSlab]);

  // Discover user/LP accounts when slab data or wallet changes
  // Uses tier-aware parsing for Small/Medium tiers where vendor parser fails
  useEffect(() => {
    if (!slabData || !wallet.publicKey) {
      setUserIdx(null);
      setLpIdx(null);
      setLpOwner(null);
      setMatcherCtx(null);
      return;
    }

    const ma = riskParams ? Number(riskParams.maxAccounts) : 4096;
    const largeTier = ma >= 4096;

    let foundUser: number | null = null;
    let foundLp: number | null = null;
    let foundLpOwner: PublicKey | null = null;
    let foundCtx: string | null = null;

    if (largeTier) {
      // Use vendor parser (correct offsets for Large tier)
      try {
        const indices = parseUsedIndices(slabData);
        for (const idx of indices) {
          try {
            const acc = parseAccount(slabData, idx);
            if (acc.kind === AccountKind.User && acc.owner.equals(wallet.publicKey)) {
              foundUser = idx;
            }
            if (acc.kind === AccountKind.LP && foundLp === null) {
              foundLp = idx;
              foundLpOwner = acc.owner;
              foundCtx = acc.matcherContext.toBase58();
            }
          } catch {}
        }
      } catch {}
    } else {
      // Tier-aware scanning for Small/Medium tiers
      try {
        const indices = tierAwareBitmapScan(slabData, ma);
        for (const idx of indices) {
          const acc = tierAwareParseAccount(slabData, idx, ma);
          if (!acc) continue;
          if (acc.kind === AccountKind.User && acc.owner.equals(wallet.publicKey)) {
            foundUser = idx;
          }
          if (acc.kind === AccountKind.LP && foundLp === null) {
            foundLp = idx;
            foundLpOwner = acc.owner;
            foundCtx = acc.matcherContext.toBase58();
          }
        }
        // Fallback: if bitmap scan found no user but numUsed > 0, brute-force scan
        if (foundUser === null) {
          const numUsed = tierAwareNumUsed(slabData, ma);
          if (numUsed > 0) {
            for (let i = 0; i < ma && i < numUsed + 10; i++) {
              if (indices.includes(i)) continue; // already checked
              const acc = tierAwareParseAccount(slabData, i, ma);
              if (!acc) continue;
              if (acc.kind === AccountKind.User && acc.owner.equals(wallet.publicKey)) {
                foundUser = i;
              }
              if (acc.kind === AccountKind.LP && foundLp === null) {
                foundLp = i;
                foundLpOwner = acc.owner;
                foundCtx = acc.matcherContext.toBase58();
              }
            }
          }
        }
      } catch {}
    }

    setUserIdx(foundUser);
    setLpIdx(foundLp);
    setLpOwner(foundLpOwner);
    setMatcherCtx(foundCtx);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- riskParams derived from slabData
  }, [slabData, wallet.publicKey]);

  // Check if matcher context is initialized (has PERCMATC magic at offset 64)
  // Re-checks whenever matcherCheckSeq bumps (after Init Matcher or other txs)
  useEffect(() => {
    if (!matcherCtx) { setMatcherInitialized(null); return; }
    connection.getAccountInfo(new PublicKey(matcherCtx)).then((info) => {
      if (!info || info.data.length < 72) { setMatcherInitialized(false); return; }
      // Check for PERCMATC magic (0x5045_5243_4d41_5443) at offset 64
      const magic = info.data.readBigUInt64LE(64);
      setMatcherInitialized(magic === BigInt("0x504552434d415443"));
    }).catch(() => setMatcherInitialized(null));
  }, [connection, matcherCtx, matcherCheckSeq]);

  // Load oracle info
  useEffect(() => {
    if (!slabData) return;
    let cancelled = false;
    try {
      const config = parseConfig(slabData);
      // Detect oracle mode from config
      const hasAuthority = !config.oracleAuthority.equals(PublicKey.default);
      const feedIdAllZeros = config.indexFeedId.equals(PublicKey.default);

      if (hasAuthority && feedIdAllZeros) {
        // Oracle Authority mode — no external oracle account
        if (!cancelled) setOracleOwner("authority");
      } else if (feedIdAllZeros && !hasAuthority) {
        // Chainlink mode: indexFeedId all zeros + no oracle authority = Chainlink (Hyperp mode).
        // Don't rely on the aggregator account's owner — it may be a different program (e.g. Store).
        // Set Chainlink so the UI shows CHAINLINK and the aggregator address.
        if (!cancelled) setOracleOwner(CHAINLINK_OCR2);
      } else {
        // Pyth mode: indexFeedId is non-zero (Pyth feed ID)
        // Try to read the oracle account (Pyth)
        connection.getAccountInfo(config.indexFeedId).then((info) => {
          if (cancelled || !info) return;
          setOracleOwner(info.owner.toBase58());
        }).catch(() => {});
      }

      // Read vault balance
      connection.getTokenAccountBalance(config.vaultPubkey).then((bal) => {
        if (!cancelled) {
          setVaultBalance(BigInt(bal.value.amount));
          // Use the vault's decimals to set collateral decimals
          if (bal.value.decimals !== undefined) setCollateralDecimals(bal.value.decimals);
        }
      }).catch(() => {});

      // Read user's collateral token balance
      if (wallet.publicKey) {
        try {
          const userAta = getAssociatedTokenAddressSync(config.collateralMint, wallet.publicKey);
          connection.getTokenAccountBalance(userAta).then((bal) => {
            if (!cancelled) {
              setUserTokenBalance(BigInt(bal.value.amount));
              if (bal.value.decimals !== undefined) setCollateralDecimals(bal.value.decimals);
            }
          }).catch(() => {
            if (!cancelled) setUserTokenBalance(0n);
          });
        } catch {
          if (!cancelled) setUserTokenBalance(0n);
        }
      }
    } catch {}
    return () => { cancelled = true; };
  }, [slabData, connection, wallet.publicKey]);

  // Load program truth (uses the actual slab owner as the percolator program)
  useEffect(() => {
    let cancelled = false;
    const ownerStr = slabOwner.toBase58();
    const programIds = new Set([ownerStr, DEVNET.matcherProgramId]);
    Promise.all(
      Array.from(programIds).map((pid) => inspectProgram(connection, pid, cluster))
    ).then((infos) => {
      if (!cancelled) setProgramTruth(infos);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [connection, cluster, slabOwner]);

  // Fetch current slot
  useEffect(() => {
    let cancelled = false;
    connection.getSlot().then((slot) => {
      if (!cancelled) setCurrentSlot(slot);
    }).catch(() => {});
    const interval = setInterval(() => {
      connection.getSlot().then((slot) => {
        if (!cancelled) setCurrentSlot(slot);
      }).catch(() => {});
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connection]);

  /* ------------------------------------------------------------------ */
  /*  Parsed state (computed from slabData)                              */
  /* ------------------------------------------------------------------ */

  const header = slabData ? (() => { try { return parseHeader(slabData); } catch { return null; } })() : null;
  const config = slabData ? (() => { try { return parseConfig(slabData); } catch { return null; } })() : null;
  const engine = slabData ? (() => { try { return parseEngine(slabData); } catch { return null; } })() : null;
  const riskParams = slabData ? (() => { try { return parseParams(slabData); } catch { return null; } })() : null;

  // Derived values from engine (needed for useEffect dependencies)
  const lastCrankSlot = engine ? bigToNum(engine.lastCrankSlot) : 0;
  const oracleType = oracleOwner ? detectOracleType(oracleOwner) : "unknown";

  // Oracle freshness in seconds (Chainlink: from aggregator updatedAt; Pyth: from publish_time)
  useEffect(() => {
    if (oracleType === "chainlink") {
      let cancelled = false;
      const chainlinkAddr = DEVNET.chainlinkSolUsd;
      connection.getAccountInfo(new PublicKey(chainlinkAddr)).then((info) => {
        if (cancelled || !info || info.data.length < 216) return;
        // Chainlink layout: timestamp at offset 208 (u64 LE) - unix seconds
        const timestamp = info.data.readBigUInt64LE(208);
        const nowSec = Math.floor(Date.now() / 1000);
        const ageSec = Math.max(0, nowSec - Number(timestamp));
        if (!cancelled) setOracleFreshnessSecs(ageSec);
      }).catch(() => {
        if (!cancelled) setOracleFreshnessSecs(null);
      });
      return () => { cancelled = true; };
    }
    if (oracleType === "pyth" && config && !config.indexFeedId.equals(PublicKey.default)) {
      let cancelled = false;
      connection.getAccountInfo(config.indexFeedId).then((info) => {
        if (cancelled || !info || info.data.length < 110) return;
        // Pyth PriceUpdateV2: publish_time at offset 94 (i64 LE) - unix seconds
        const publishTime = info.data.readBigInt64LE(94);
        const nowSec = Math.floor(Date.now() / 1000);
        const ageSec = Math.max(0, nowSec - Number(publishTime));
        if (!cancelled) setOracleFreshnessSecs(ageSec);
      }).catch(() => {
        if (!cancelled) setOracleFreshnessSecs(null);
      });
      return () => { cancelled = true; };
    }
    setOracleFreshnessSecs(null);
  }, [oracleType, connection, config]);

  // Fetch matcher context and compute pricing
  useEffect(() => {
    if (!matcherCtx || !slabData || !engine || !config || currentSlot === null) {
      setMatcherContextData(null);
      setPricingResult(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const ctx = await fetchMatcherContext(connection, new PublicKey(matcherCtx));
        if (cancelled) return;
        setMatcherContextData(ctx);

        if (!ctx) {
          setPricingResult(null);
          return;
        }

        // Compute pricing — no fake data: when no oracle price, use 0n so UI shows "—" and we don't use oracle for guards
        const hasOraclePrice = config.lastEffectivePriceE6 > 0n || ctx.lastOraclePriceE6 > 0n;
        const oraclePriceE6 = config.lastEffectivePriceE6 > 0n
          ? config.lastEffectivePriceE6
          : (ctx.lastOraclePriceE6 > 0n ? ctx.lastOraclePriceE6 : 0n);
        const markPriceE6 = ctx.lastExecPriceE6 > 0n ? ctx.lastExecPriceE6 : (oraclePriceE6 > 0n ? oraclePriceE6 : 0n);
        
        const openInterestE6 = engine.totalOpenInterest > 0n
          ? engine.totalOpenInterest * oraclePriceE6 / BigInt(1_000_000)
          : 0n;
        const maxOICapacityE6 = engine.vault > 0n
          ? engine.vault * oraclePriceE6 / BigInt(1_000_000) * BigInt(10) // Assume 10x leverage capacity
          : BigInt(1_000_000_000_000); // Fallback

        const crankFreshness = checkCrankFreshness(
          lastCrankSlot,
          currentSlot,
          config.maxStalenessSlots
        );
        const oracleFreshness = checkOracleFreshness(
          oracleLastSlot || currentSlot,
          currentSlot
        );

        const hasRealOracle = oracleType !== "unknown" && hasOraclePrice;
        const result = computePricing(
          {
            baseSpreadBps: ctx.baseSpreadBps,
            tradingFeeBps: ctx.tradingFeeBps,
            maxTotalBps: ctx.maxTotalBps,
            impactKBps: ctx.impactKBps,
            liquidityNotionalE6: ctx.liquidityNotionalE6,
          },
          {
            inventoryBase: ctx.inventoryBase,
            maxInventoryAbs: ctx.maxInventoryAbs,
            openInterestE6,
            maxOICapacityE6,
            oraclePriceE6,
            markPriceE6,
            oracleLastSlot: oracleLastSlot || currentSlot,
            currentSlot,
            crankLastSlot: lastCrankSlot,
            maxCrankStalenessSlots: engine ? bigToNum(engine.maxCrankStalenessSlots) : 200,
            // Spot reference (v1: minimal - can be enhanced with actual spot market integration)
            spotPriceE6: undefined, // TODO: Integrate with spot DEX oracles
            spotLiquidityE6: undefined, // TODO: Fetch from spot market
            hasRealOracle,
          },
          0n, // Sample trade size 0 for display
          true, // Sample buy
          { regime: classifyVolRegime() } // Returns null if no vol data (shows "—")
        );

        if (!cancelled) setPricingResult(result);
      } catch {
        if (!cancelled) {
          setMatcherContextData(null);
          setPricingResult(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [matcherCtx, slabData, engine, config, currentSlot, connection, lastCrankSlot, oracleLastSlot, oracleType]);

  // Use currentSlot from connection (state) or fallback to engine's currentSlot
  const effectiveCurrentSlot = currentSlot ?? (engine ? bigToNum(engine.currentSlot) : 0);
  const maxStaleness = engine ? bigToNum(engine.maxCrankStalenessSlots) : 200;
  const lastSweepStart = engine ? bigToNum(engine.lastSweepStartSlot) : 0;
  const lastSweepComplete = engine ? bigToNum(engine.lastSweepCompleteSlot) : 0;
  const crankAge = effectiveCurrentSlot - lastCrankSlot;
  const crankStale = crankAge > maxStaleness;

  const hasOracleAuthority = config ? !config.oracleAuthority.equals(PublicKey.default) : false;
  const authorityPriceE6 = config ? bigToNum(config.authorityPriceE6) : 0;

  // User account data — tier-aware
  const maxAccts = riskParams ? Number(riskParams.maxAccounts) : 4096;
  const isLargeTier = maxAccts >= 4096;
  const userAccount = useMemo(() => {
    if (!slabData || userIdx === null) return null;
    if (isLargeTier) {
      try { return parseAccount(slabData, userIdx); } catch { return null; }
    }
    return tierAwareParseAccount(slabData, userIdx, maxAccts);
  }, [slabData, userIdx, maxAccts, isLargeTier]);

  // LP account data — tier-aware (for displaying LP capital, funding, etc.)
  const lpAccount = useMemo(() => {
    if (!slabData || lpIdx === null) return null;
    if (isLargeTier) {
      try { return parseAccount(slabData, lpIdx); } catch { return null; }
    }
    return tierAwareParseAccount(slabData, lpIdx, maxAccts);
  }, [slabData, lpIdx, maxAccts, isLargeTier]);

  // LP deposit form
  const [lpDepositAmt, setLpDepositAmt] = useState("");

  // Use the ACTUAL owner of the slab account as programId (supports all tiers)
  const programId = slabOwner;

  // For Oracle Authority mode, the oracle account doesn't matter much for crank
  // (the program uses the authority price). Use the config's indexFeedId if non-zero,
  // otherwise use the connected wallet or a known account as placeholder.
  const oracleForParams = (() => {
    if (config && !config.indexFeedId.equals(PublicKey.default)) {
      return config.indexFeedId;
    }
    // For authority mode: use the slab itself as oracle placeholder (just needs to be a valid account)
    return slabPk;
  })();

  const params: PercolatorParams = {
    programId,
    slab: slabPk,
    oracle: oracleForParams,
  };

  /* ------------------------------------------------------------------ */
  /*  Action handlers                                                    */
  /* ------------------------------------------------------------------ */

  const refreshSlab = async () => {
    setRefreshing(true);
    await loadSlab();
    setRefreshing(false);
  };

  const sendAndReceipt = async (
    label: string,
    buildTx: () => Promise<Transaction>,
    cuLimit = 400_000,
  ) => {
    if (!wallet.publicKey || !wallet.sendTransaction) {
      setActionError("Connect wallet first");
      return null;
    }
    setStatus(label + "…");
    setActionError(null);
    setActionSuccess(null);
    try {
      const tx = await buildTx();
      addComputeBudget(tx, cuLimit);
      // Simulate first to capture program logs on failure
      try {
        tx.feePayer = wallet.publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const sim = await connection.simulateTransaction(tx);
        if (sim.value.err) {
          const logs = sim.value.logs ?? [];
          const errLines = logs.filter(l => l.includes("Error") || l.includes("failed") || l.includes("custom program error"));
          const rawDetail = errLines.length > 0 ? errLines.join("; ") : JSON.stringify(sim.value.err);
          const detail = humanizeSimError(rawDetail);
          setStatus("");
          setActionError(`Simulation failed: ${detail}`);
          console.error("[Simulation]", sim.value.err, logs);
          // If Init Matcher fails with "already initialized", mark matcher as initialized
          if (label.includes("Init Matcher") && rawDetail.includes("uninitialized account")) {
            setMatcherInitialized(true);
          }
          return null;
        }
      } catch (simErr) {
        // Simulation itself errored (e.g. accounts not found) — log but try sending anyway
        console.warn("[Simulation error]", simErr);
      }
      const sig = await wallet.sendTransaction(tx, connection, { skipPreflight: true });
      await connection.confirmTransaction(sig);
      // Compute pricing context for trades
      let pricingCtx: Receipt["pricingContext"] | undefined;
      if (label.includes("Trade") && pricingResult && matcherContextData && engine && config) {
        // Use pricing result that was computed before trade (captures execution-time state)
        pricingCtx = pricingResult.pricingContext;
      }

      const { receipt } = await parseTxAndBuildReceipt({
        connection,
        signature: sig,
        cluster,
        mode: "devnet",
        venue: "percolator",
        action: label,
        marketId,
        wallet: wallet.publicKey.toBase58(),
        pricingContext: pricingCtx,
      });
      addReceipt(receipt);
      setStatus("");
      setActionSuccess(`${label} confirmed — ${sig.slice(0, 16)}…`);
      setTimeout(() => setActionSuccess(null), 6000);
      // Wait briefly for RPC to reflect the new state, then refresh
      await new Promise((r) => setTimeout(r, 2000));
      await refreshSlab();
      // Re-check matcher initialized state after any transaction
      setMatcherCheckSeq((s) => s + 1);
      // If user account not found after Init User, retry once more after a delay
      if (label === "Init User") {
        setTimeout(async () => {
          await refreshSlab();
        }, 3000);
      }
      return sig;
    } catch (e) {
      setStatus("");
      let msg = e instanceof Error ? e.message : "Transaction failed";
      // Extract program logs from SendTransactionError
      const anyErr = e as Record<string, unknown>;
      if (anyErr?.logs && Array.isArray(anyErr.logs)) {
        const programErrors = (anyErr.logs as string[]).filter(
          (l: string) => l.includes("Error") || l.includes("failed") || l.includes("custom program error")
        );
        if (programErrors.length > 0) {
          msg += " — " + programErrors.join("; ");
        }
      }
      setActionError(humanizeSimError(msg));
      return null;
    }
  };

  const handleInitUser = () =>
    sendAndReceipt("Init User", async () => {
      const fee = riskParams?.newAccountFee ?? BigInt(2000000);
      const ix = await buildInitUserIx(connection, params, wallet.publicKey!, fee);
      return new Transaction().add(ix);
    }, 200_000);

  const handleCrank = () =>
    sendAndReceipt("Crank Now", async () => {
      const ix = buildKeeperCrankIx(params, wallet.publicKey!);
      return new Transaction().add(ix);
    }, 400_000);

  const handleDeposit = () => {
    if (!depositAmt) return;
    const raw = parseTokenInput(depositAmt, collateralDecimals);
    if (raw === 0n) { setActionError("Invalid deposit amount"); return; }
    return sendAndReceipt("Deposit", async () => {
      if (userIdx === null) throw new Error("Init user first");
      const ix = await buildDepositIx(connection, params, wallet.publicKey!, userIdx, raw);
      return new Transaction().add(ix);
    }, 200_000);
  };

  const handleWithdraw = () => {
    if (!withdrawAmt) return;
    const raw = parseTokenInput(withdrawAmt, collateralDecimals);
    if (raw === 0n) { setActionError("Invalid withdraw amount"); return; }
    return sendAndReceipt("Withdraw", async () => {
      if (userIdx === null) throw new Error("Init user first");
      const ix = await buildWithdrawIx(connection, params, wallet.publicKey!, userIdx, raw);
      return new Transaction().add(ix);
    }, 200_000);
  };

  // Fund LP — deposit collateral to the LP account (needed if LP has zero capital)
  const handleFundLP = () => {
    if (!lpDepositAmt || lpIdx === null) return;
    const raw = parseTokenInput(lpDepositAmt, collateralDecimals);
    if (raw === 0n) { setActionError("Invalid amount"); return; }
    return sendAndReceipt("Fund LP", async () => {
      // DepositCollateral works on any account (user or LP) as long as the signer is the owner
      const ix = await buildDepositIx(connection, params, wallet.publicKey!, lpIdx, raw);
      return new Transaction().add(ix);
    }, 200_000);
  };

  const handleTrade = (direction: "long" | "short") => {
    if (!tradeSize) return;
    let size: bigint;
    try { size = BigInt(tradeSize); } catch { setActionError("Invalid trade size — enter a whole number"); return; }
    if (size === 0n) { setActionError("Trade size must be non-zero"); return; }
    const signedSize = direction === "long" ? size : -size;
    const lpI = tradeLpIdx ? parseInt(tradeLpIdx) : lpIdx;

    if (lpI === null || !matcherCtx) {
      setActionError("No LP available to trade against");
      return;
    }
    if (!lpOwner) {
      setActionError("LP owner not resolved — refresh the page");
      return;
    }
    if (crankStale) {
      setActionError("Crank is stale — crank first before trading");
      return;
    }
    
    // Pricing guard enforcement
    if (pricingResult && pricingResult.guardState === "halted") {
      const reason = crankStale
        ? `Trading halted: Crank stale (${crankAge} slots > max ${maxStaleness}). Run Crank Now to resume.`
        : (pricingResult.pricingContext.oracleDivergenceBps != null && pricingResult.pricingContext.oracleDivergenceBps > 100)
          ? `Trading halted: Oracle divergence ${pricingResult.pricingContext.oracleDivergenceBps.toFixed(1)} bps exceeds threshold`
          : "Trading halted: Guard state triggered";
      setActionError(reason);
      return;
    }
    
    if (matcherInitialized !== true) {
      setActionError("Matcher context not initialized — click 'Init Matcher' first");
      return;
    }

    // Determine oracle account for the instruction
    const oracleAcct = config && !config.indexFeedId.equals(PublicKey.default)
      ? config.indexFeedId
      : slabPk; // authority mode: use slab as placeholder

    // Log trade diagnostics (helps debug EngineUndercollateralized / margin issues)
    console.log("[Trade diagnostics]", {
      direction, size: String(signedSize),
      userIdx, lpIdx: lpI, lpOwner: lpOwner.toBase58(),
      oracleAcct: oracleAcct.toBase58(),
      matcherCtx,
      programId: programId.toBase58(),
      userCapital: userAccount ? String(userAccount.capital) : "unknown",
      userPosition: userAccount ? String(userAccount.positionSize) : "unknown",
    });

    return sendAndReceipt(`Trade ${direction}`, async () => {
      const fullParams = {
        ...params,
        matcherProgramId: MATCHER_PROGRAM_ID,
        matcherContext: new PublicKey(matcherCtx),
      };
      // Use Direct variant to avoid vendor parser (which fails for Small/Medium tiers)
      const ix = buildTradeCpiIxDirect(fullParams, wallet.publicKey!, lpI, lpOwner, oracleAcct, userIdx!, signedSize);
      return new Transaction().add(ix);
    }, 400_000);
  };

  const handlePushPrice = () => {
    if (!pushPriceInput) return;
    const priceE6 = BigInt(Math.floor(parseFloat(pushPriceInput) * 1_000_000));
    const ts = BigInt(Math.floor(Date.now() / 1000));
    return sendAndReceipt("Push Oracle Price", async () => {
      const ix = buildPushOraclePriceIx(
        { programId, slab: slabPk },
        wallet.publicKey!,
        priceE6,
        ts,
      );
      return new Transaction().add(ix);
    }, 200_000);
  };

  // Initialize matcher context (for markets launched before matcher init was added)
  const handleInitMatcher = () => {
    if (lpIdx === null || !matcherCtx) {
      setActionError("No LP found — cannot initialize matcher");
      return;
    }
    const matcherProgId = MATCHER_PROGRAM_ID;
    const matcherCtxPk = new PublicKey(matcherCtx);
    const [lpPda] = deriveLpPda(programId, slabPk, lpIdx);

    return sendAndReceipt("Init Matcher Context", async () => {
      // Tag 2 = InitVamm — the only init instruction the matcher program accepts
      // Layout: [tag(1) | mode(1) | trading_fee_bps(4) | base_spread_bps(4) | max_total_bps(4) |
      //          impact_k_bps(4) | liquidity_notional_e6(16) | max_fill_abs(16) | max_inventory_abs(16)]
      const initVammData = Buffer.alloc(66);
      initVammData[0] = 2; // Tag 2 = InitVamm
      initVammData[1] = 0; // Passive mode
      initVammData.writeUInt32LE(50, 2);  // trading_fee_bps (0.5%)
      initVammData.writeUInt32LE(50, 6);  // base_spread_bps (0.5%)
      initVammData.writeUInt32LE(500, 10); // max_total_bps (5%)
      // impact_k_bps = 0 (offset 14), liquidity_notional_e6 = 0 (offset 18) for Passive
      // max_fill_abs (offset 34) - set to large number
      {
        const maxFill = BigInt("1000000000000");
        const buf = Buffer.alloc(16);
        buf.writeBigUInt64LE(maxFill & BigInt("0xFFFFFFFFFFFFFFFF"), 0);
        buf.writeBigUInt64LE(maxFill >> 64n, 8);
        initVammData.set(buf, 34);
      }
      // max_inventory_abs = 0 (offset 50, no limit) — already zero

      const initVammIx = {
        programId: matcherProgId,
        keys: [
          { pubkey: lpPda, isSigner: false, isWritable: false },
          { pubkey: matcherCtxPk, isSigner: false, isWritable: true },
        ],
        data: initVammData,
      };

      return new Transaction().add(initVammIx);
    }, 100_000);
  };

  // Market-scoped receipts
  const marketReceipts = receipts.filter((r) => r.marketId === marketId);

  /** Build Proof Pack JSON (all from real reads; null when unknown) */
  const buildProofPack = useCallback(() => {
    const ts = new Date().toISOString();
    const oracleAddr =
      oracleType === "authority" && config
        ? config.oracleAuthority.toBase58()
        : oracleType === "chainlink"
          ? DEVNET.chainlinkSolUsd
          : config
            ? config.indexFeedId.toBase58()
            : null;
    const burnReceipt = marketReceipts.find((r) => r.action.toLowerCase().includes("burn") && r.action.toLowerCase().includes("admin"));
    const createReceipt = marketReceipts.find((r) => r.action.toLowerCase().includes("create") && r.action.toLowerCase().includes("market"));
    const lastTradeReceipt = marketReceipts.filter((r) => r.action.startsWith("Trade")).pop();

    const pack = {
      meta: {
        app: "Perply",
        cluster: cluster || "devnet",
        generatedAt: ts,
        marketId,
        note: "oracleLiveness.guardState is current; receipt pricingContext / guardAtFill is guard at fill (execution-time).",
      },
      addresses: {
        marketSlab: marketId,
        percolatorProgramId: slabOwner?.toBase58() ?? null,
        matcherProgramId: DEVNET.matcherProgramId,
        oracleAccount: oracleAddr,
        oracleTypeLabel: oracleType.toUpperCase(),
        collateralMint: config?.collateralMint.toBase58() ?? null,
        vault: config?.vaultPubkey.toBase58() ?? null,
        matcherContext: matcherCtx ?? null,
      },
      adminAuthority: {
        adminStatus: header?.admin.equals(PublicKey.default) ? "BURNED" : "SET",
        adminAddress: header?.admin.toBase58() ?? null,
        burnTxSignature: burnReceipt?.txSignatures?.[0] ?? null,
        note: "Market-level admin, not program upgrade authority.",
      },
      programTruth: programTruth.map((p) => ({
        programId: p.programId,
        upgradeable: p.upgradeable,
        upgradeAuthority: p.upgradeAuthority ?? null,
        verificationStatus: p.verificationStatus,
        explorerUrl: p.explorerLink,
      })),
      oracleLiveness: {
        oracleFreshnessSecs: oracleFreshnessSecs ?? null,
        oracleFreshnessSlots: pricingResult?.pricingContext?.oracleFreshnessSlots ?? null,
        oracleDivergenceBps: pricingResult?.pricingContext?.oracleDivergenceBps ?? null,
        markPriceE6: pricingResult?.pricingContext?.markPriceE6 != null ? String(pricingResult.pricingContext.markPriceE6) : null,
        markPriceSource: matcherContextData?.lastExecPriceE6 && matcherContextData.lastExecPriceE6 > 0n ? "last trade" : "engine",
        oraclePriceE6: pricingResult?.pricingContext?.oraclePriceE6 != null ? String(pricingResult.pricingContext.oraclePriceE6) : null,
        oraclePriceSource: "oracle account",
        divergenceFormula: "|mark − oracle| / oracle × 10⁴ (bps)",
        crankFreshnessSlots: pricingResult?.pricingContext?.crankFreshnessSlots ?? (engine ? crankAge : null),
        crankStatus: crankStale ? "STALE" : "FRESH",
        maxStalenessSlots: maxStaleness,
        guardState: pricingResult?.guardState ?? null,
        guardReason: pricingResult?.pricingContext?.guardReason ?? null,
      },
      pricingEngine: matcherContextData && pricingResult
        ? {
          currentSpreadBps: pricingResult.spreadBps,
          spreadBreakdown: {
            baseSpreadBps: matcherContextData.baseSpreadBps,
            tradingFeeBps: matcherContextData.tradingFeeBps,
            skewAdjBps: pricingResult.skewAdjustmentBps,
            volAdjBps: pricingResult.volAdjustmentBps,
            utilAdjBps: pricingResult.utilizationAdjustmentBps,
          },
          skewBefore: pricingResult.pricingContext.skewBefore,
          utilization: pricingResult.pricingContext.utilization,
          volRegime: pricingResult.pricingContext.volRegime,
          divergenceThresholdBps: pricingResult.pricingContext.divergenceThresholdBps ?? null,
          divergenceHaltBps: pricingResult.pricingContext.divergenceHaltBps ?? null,
          matcherKind: matcherContextData.kind === 0 ? "passive" : matcherContextData.kind === 1 ? "vamm" : "propamm",
        }
        : null,
      marketState: engine
        ? {
          vaultBalanceToken: vaultBalance != null ? formatTokenAmount(vaultBalance, collateralDecimals) : null,
          engineTrackedVault: formatTokenAmount(engine.vault, collateralDecimals),
          insuranceBalance: formatTokenAmount(engine.insuranceFund.balance, collateralDecimals),
          accruedFeeRevenue: formatTokenAmount(engine.insuranceFund.feeRevenue, collateralDecimals),
          totalOI: String(engine.totalOpenInterest),
          usedAccounts: riskParams && slabData ? `${tierAwareNumUsed(slabData, Number(riskParams.maxAccounts))} / ${riskParams.maxAccounts}` : null,
          fundingRateLastBpsPerSlot: engine.fundingRateBpsPerSlotLast,
          riskParams: riskParams
            ? {
              initialMarginBps: bigToNum(riskParams.initialMarginBps),
              maintenanceMarginBps: bigToNum(riskParams.maintenanceMarginBps),
              tradingFeeBps: bigToNum(riskParams.tradingFeeBps),
              liquidationFeeBps: bigToNum(riskParams.liquidationFeeBps),
              maxAccounts: Number(riskParams.maxAccounts),
              warmupSlots: bigToNum(riskParams.warmupPeriodSlots),
              newAccountFee: String(riskParams.newAccountFee),
              liquidationBufferBps: bigToNum(riskParams.liquidationBufferBps),
            }
            : null,
        }
        : null,
      receipts: marketReceipts.map((r) => ({
        action: r.action,
        timestamp: r.timestamp,
        txSignature: r.txSignatures[0] ?? null,
        explorerUrl: r.explorerLinks[0] ?? null,
        invokedPrograms: r.invokedPrograms.map((p) => ({
          programId: p.programId,
          upgradeable: p.upgradeable,
          upgradeAuthority: p.upgradeAuthority ?? null,
          verificationStatus: p.verificationStatus,
          explorerLink: p.explorerLink,
        })),
        guardAtFill: r.pricingContext?.guardState ?? null,
        guardAtFillReason: r.pricingContext?.guardReason ?? null,
        pricingContext: r.pricingContext ?? undefined,
      })),
    };
    return pack;
  }, [
    cluster,
    marketId,
    slabOwner,
    config,
    oracleType,
    header,
    programTruth,
    matcherCtx,
    oracleFreshnessSecs,
    pricingResult,
    matcherContextData,
    engine,
    crankStale,
    crankAge,
    maxStaleness,
    marketReceipts,
    vaultBalance,
    collateralDecimals,
    riskParams,
    slabData,
  ]);

  const handleGenerateProofPack = () => {
    const pack = buildProofPack();
    const json = JSON.stringify(pack, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `perply-proof-pack-${cluster || "devnet"}-${marketId.slice(0, 8)}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyProofSummary = () => {
    const p = buildProofPack();
    const matcherKindLabel =
      matcherContextData?.kind === 0 ? "Passive" : matcherContextData?.kind === 1 ? "vAMM" : "PropAMM";
    const createSig = marketReceipts.find((r) => r.action.toLowerCase().includes("create") && r.action.toLowerCase().includes("market"))?.txSignatures[0] ?? "—";
    const burnSig = marketReceipts.find((r) => r.action.toLowerCase().includes("burn") && r.action.toLowerCase().includes("admin"))?.txSignatures[0] ?? "—";
    const tradeSig = marketReceipts.filter((r) => r.action.startsWith("Trade")).pop()?.txSignatures[0] ?? "—";
    const oraclePubkey =
      oracleType === "chainlink" ? DEVNET.chainlinkSolUsd : config?.indexFeedId.toBase58() ?? "—";
    const lines = [
      "Perply Devnet Proof Pack",
      `Market: ${marketId}`,
      `Matcher: ${matcherKindLabel} (kind=${matcherContextData?.kind ?? "?"}) — ${DEVNET.matcherProgramId}`,
      `Oracle: ${oracleType.toUpperCase()} — ${oraclePubkey}`,
      `Admin: ${header?.admin.equals(PublicKey.default) ? "BURNED ✅" : "SET"}`,
      `Guard: ${pricingResult?.guardState ?? "—"} (${pricingResult?.pricingContext?.guardReason ?? "—"}) | Crank: ${crankAge} slots | Oracle: ${oracleFreshnessSecs != null ? `${oracleFreshnessSecs} s` : "—"} | Divergence: ${pricingResult?.pricingContext?.oracleDivergenceBps != null ? `${pricingResult.pricingContext.oracleDivergenceBps.toFixed(1)} bps` : "—"}`,
      `Key txs: create=${createSig.slice(0, 16)}… burn=${burnSig !== "—" ? burnSig.slice(0, 16) + "…" : "—"} trade=${tradeSig !== "—" ? tradeSig.slice(0, 16) + "…" : "—"}`,
    ];
    const text = lines.join("\n");
    navigator.clipboard.writeText(text);
  };

  const slotsUntilStale = engine ? Math.max(0, maxStaleness - crankAge) : null;
  const [copySummaryFeedback, setCopySummaryFeedback] = useState(false);
  const handleCopyProofSummaryClick = () => {
    handleCopyProofSummary();
    setCopySummaryFeedback(true);
    setTimeout(() => setCopySummaryFeedback(false), 2000);
  };

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  // Determine if this is "not found" vs actual RPC error
  const isNotFound = error && (error.includes("not found") || error.includes("null"));
  const isRpcError = error && !isNotFound;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[11px] text-zinc-600">Loading market data from RPC…</p>
        </div>
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-4 lg:p-6">
          {/* Still show the scaffold — not a blank void */}
          <section className="flex items-start gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-[16px] font-bold text-white tracking-tight">Market Proof</h2>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/20">DEVNET</span>
              </div>
              <div className="font-mono text-[11px] text-zinc-400">{short(marketId, 12)}</div>
            </div>
          </section>

          {/* Top cards — all show "Unknown / Not found" */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatusCard label="Market" value="Not found" color="text-amber-400" />
            <StatusCard label="Oracle" value="Unknown" color="text-zinc-600" />
            <StatusCard label="Crank" value="Unknown" color="text-zinc-600" />
            <StatusCard label="Vault" value="Unknown" color="text-zinc-600" />
          </div>

          {/* Not found message */}
          <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-[14px] font-bold text-amber-400 mb-1">Market not found on devnet</p>
            <p className="text-[11px] text-zinc-500 font-mono mb-2">{marketId}</p>
            <p className="text-[11px] text-zinc-600 mb-4 max-w-md mx-auto">
              This address may be on a different cluster or not created yet. Verify the address is correct and that it exists on Solana devnet.
            </p>
            <div className="flex items-center gap-2 justify-center flex-wrap">
              <a
                href={explorerAccountUrl(marketId, "devnet")}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.08] rounded text-[11px] text-zinc-300 transition"
              >
                Open in Explorer (devnet)
              </a>
              <Link href="/app/devnet" className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.08] rounded text-[11px] text-zinc-300 transition">
                Back to Directory
              </Link>
              <Link href="/app/devnet/launch" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-[11px] font-semibold text-white transition">
                Launch a New Market
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isRpcError) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-4 lg:p-6">
          <section className="flex items-start gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-[16px] font-bold text-white tracking-tight">Market Proof</h2>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/20">DEVNET</span>
              </div>
              <div className="font-mono text-[11px] text-zinc-400">{short(marketId, 12)}</div>
            </div>
          </section>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatusCard label="RPC" value="Error" color="text-red-400" />
            <StatusCard label="Oracle" value="Unknown" color="text-zinc-600" />
            <StatusCard label="Crank" value="Unknown" color="text-zinc-600" />
            <StatusCard label="Vault" value="Unknown" color="text-zinc-600" />
          </div>
          <div className="rounded-lg border border-red-500/15 bg-red-500/[0.03] p-4 text-center">
            <p className="text-[13px] font-semibold text-red-400 mb-1">RPC Connection Error</p>
            <p className="text-[11px] text-zinc-500 mb-3">{error}</p>
            <button onClick={refreshSlab} className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.08] rounded text-[11px] text-zinc-300 transition">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const copy = (s: string) => { navigator.clipboard.writeText(s); };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-4">
        {/* ============ 1) Identity Header ============ */}
        <section className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-[16px] font-bold text-white tracking-tight">Market Proof</h2>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  DEVNET
                </span>
                {header?.resolved && (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/20">
                    RESOLVED
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-zinc-400">{short(marketId, 12)}</span>
                <CopyBtn onClick={() => copy(marketId)} />
              </div>
              {config && (
                <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-600">
                  <span>Collateral: {short(config.collateralMint.toBase58(), 6)}</span>
                  <span>Invert: {config.invert ? "Yes" : "No"}</span>
                  <span>Unit Scale: {config.unitScale}</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={refreshSlab}
            disabled={refreshing}
            className="px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.07] rounded-lg text-[11px] text-zinc-400 transition flex items-center gap-1.5 shrink-0 border border-white/[0.06]"
          >
            {refreshing ? (
              <div className="w-3 h-3 border border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Refresh
          </button>
        </section>

        {/* ============ Top status cards ============ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatusCard label="Market" value="Found" color="text-emerald-400" />
          <StatusCard label="Oracle" value={oracleType.toUpperCase()} color={oracleType !== "unknown" ? "text-emerald-400" : "text-zinc-600"} />
          <StatusCard label="Crank" value={crankStale ? `Stale (${crankAge})` : `Fresh (${crankAge})`} color={crankStale ? "text-amber-400" : "text-emerald-400"} />
          <StatusCard label="Vault" value={vaultBalance !== null ? formatTokenAmount(vaultBalance, collateralDecimals) : "Unknown"} color={vaultBalance !== null ? "text-zinc-300" : "text-zinc-600"} />
        </div>

        {/* ============ Proof Pack toolbar ============ */}
        <div className="flex flex-wrap items-center gap-2 py-2 border-y border-white/[0.04]">
          <button
            onClick={handleGenerateProofPack}
            className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
          >
            Generate Proof Pack
          </button>
          <button
            onClick={handleCopyProofSummaryClick}
            className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 transition border border-white/[0.06]"
          >
            {copySummaryFeedback ? "Copied!" : "Copy Proof Summary"}
          </button>
          {slotsUntilStale != null && (
            <span className={`text-[9px] font-mono px-2 py-1 rounded ${crankStale ? "bg-amber-500/10 text-amber-400" : "text-zinc-500"}`} title="Slots until crank is stale">
              {crankStale ? `Stale (${crankAge} > ${maxStaleness})` : `${slotsUntilStale} slots until stale`}
            </span>
          )}
          {crankStale && (
            <span className="text-[9px] text-amber-400">
              Run <strong>Crank Now</strong> below to resume opening positions.
            </span>
          )}
        </div>

        {/* ============ 2) Addresses Truth Table ============ */}
        <Section title="Addresses">
          <div className="space-y-0.5">
            <AddrRow label="Slab / Market" value={marketId} cluster={cluster} onCopy={() => copy(marketId)} />
            <AddrRow label="Percolator Program" value={slabOwner.toBase58()} cluster={cluster} onCopy={() => copy(slabOwner.toBase58())} />
            <AddrRow label="Matcher Program" value={DEVNET.matcherProgramId} cluster={cluster} onCopy={() => copy(DEVNET.matcherProgramId)} />
            {oracleType === "authority" && config
              ? <AddrRow label="Oracle" value={config.oracleAuthority.toBase58()} cluster={cluster} badge="AUTHORITY" onCopy={() => copy(config.oracleAuthority.toBase58())} />
              : oracleType === "chainlink" && config && config.indexFeedId.equals(PublicKey.default)
              ? <AddrRow label="Oracle" value={DEVNET.chainlinkSolUsd} cluster={cluster} badge="CHAINLINK" onCopy={() => copy(DEVNET.chainlinkSolUsd)} />
              : <AddrRow label="Oracle" value={config?.indexFeedId.toBase58() || "N/A"} cluster={cluster} badge={oracleType.toUpperCase()} onCopy={() => config && copy(config.indexFeedId.toBase58())} />
            }
            {config && <AddrRow label="Collateral Mint" value={config.collateralMint.toBase58()} cluster={cluster} onCopy={() => copy(config.collateralMint.toBase58())} />}
            {config && <AddrRow label="Vault" value={config.vaultPubkey.toBase58()} cluster={cluster} onCopy={() => copy(config.vaultPubkey.toBase58())} />}
            {hasOracleAuthority && config && (
              <AddrRow label="Oracle Authority" value={config.oracleAuthority.toBase58()} cluster={cluster} onCopy={() => copy(config.oracleAuthority.toBase58())} />
            )}
            {header && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Admin</span>
                  {header.admin.equals(PublicKey.default) ? (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      BURNED ✅
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      ACTIVE
                    </span>
                  )}
                </div>
                <AddrRow label="Admin Address" value={header.admin.toBase58()} cluster={cluster} onCopy={() => copy(header.admin.toBase58())} />
                {config && !config.oracleAuthority.equals(PublicKey.default) && (
                  <AddrRow label="Oracle Authority" value={config.oracleAuthority.toBase58()} cluster={cluster} onCopy={() => copy(config.oracleAuthority.toBase58())} />
                )}
                {header.admin.equals(PublicKey.default) && (
                  <p className="text-[9px] text-emerald-400 mt-1">
                    ✓ Market is adminless. Admin operations (param updates, pause, oracle authority changes) are permanently disabled.
                  </p>
                )}
              </>
            )}
            {matcherCtx && <AddrRow label="Matcher Context" value={matcherCtx} cluster={cluster} onCopy={() => copy(matcherCtx)} />}
          </div>
        </Section>

        {/* ============ 3) Program Truth Panel ============ */}
        <Section title="Program Truth" subtitle="don't trust, verify">
          {programTruth.length === 0 ? (
            <p className="text-[10px] text-zinc-700">Loading program inspection…</p>
          ) : (
            <div className="space-y-2">
              {programTruth.map((p) => (
                <div key={p.programId} className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.015] border border-white/[0.04]">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[10px] text-zinc-300 truncate">{p.programId}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        p.upgradeable
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-emerald-500/10 text-emerald-400"
                      }`}>
                        {p.upgradeable ? "Upgradeable" : "Immutable"}
                      </span>
                      {p.upgradeAuthority && (
                        <span className="text-[9px] text-zinc-600 font-mono">
                          Authority: {short(p.upgradeAuthority)}
                        </span>
                      )}
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        p.verificationStatus === "verified"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-zinc-500/10 text-zinc-600"
                      }`}>
                        {p.verificationStatus === "verified" ? "Verified" : "Not verified"}
                      </span>
                      <a
                        href={getVerifyPageUrl(p.programId, cluster)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] text-emerald-500 hover:text-emerald-400 transition shrink-0"
                      >
                        How to verify this build
                      </a>
                    </div>
                  </div>
                  <a
                    href={p.explorerLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] text-emerald-500 hover:text-emerald-400 transition shrink-0"
                  >
                    Explorer
                  </a>
                </div>
              ))}
            </div>
          )}
          {/* Matcher Program sub-panel — same row layout as Addresses (full value, Explorer + Copy) */}
          <div className="mt-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-2">Matcher Program</p>
            <div className="space-y-0.5">
              <AddrRow label="PropAMM Matcher Program" value={DEVNET.matcherProgramId} cluster={(cluster as string) || "devnet"} onCopy={() => copy(DEVNET.matcherProgramId)} />
              <AddrRow label="Deployment tx" value={DEVNET.matcherDeployTx} cluster={(cluster as string) || "devnet"} onCopy={() => copy(DEVNET.matcherDeployTx)} explorerKind="tx" />
              <AddrRow label="Upgrade authority" value={DEVNET.matcherUpgradeAuthority} cluster={(cluster as string) || "devnet"} onCopy={() => copy(DEVNET.matcherUpgradeAuthority)} />
              <div className="flex items-center gap-2 pt-1.5">
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-500/15 text-zinc-400 border border-zinc-500/20">DEVNET</span>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">PropAMM live</span>
              </div>
            </div>
          </div>
        </Section>

        {/* ============ 4) Oracle Health Panel ============ */}
        <Section title="Oracle Health">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Oracle Type" value={oracleType.toUpperCase()} />
            <StatCard label="Oracle Authority" value={hasOracleAuthority ? "Active" : "Disabled"} color={hasOracleAuthority ? "text-amber-400" : "text-zinc-600"} />
            {hasOracleAuthority && authorityPriceE6 > 0 && (
              <>
                <StatCard label="Mark Price (Authority)" value={`$${(authorityPriceE6 / 1_000_000).toFixed(2)}`} />
                <StatCard label="Funding Rate" value={config ? `${bigToNum(config.authorityTimestamp)} bps/slot` : "—"} />
              </>
            )}
            {config && (
              <>
                <StatCard label="Max Staleness" value={`${bigToNum(config.maxStalenessSlots)}s`} />
                <StatCard label="Conf Filter" value={`${config.confFilterBps} bps`} />
                <StatCard label="Last Effective Price" value={oracleType !== "unknown" && config.lastEffectivePriceE6 > 0n ? `$${(bigToNum(config.lastEffectivePriceE6) / 1_000_000).toFixed(2)}` : "—"} />
              </>
            )}
          </div>
          {/* Push Oracle Price (if authority) - disabled if admin is burned */}
          {hasOracleAuthority && wallet.publicKey && config && wallet.publicKey.equals(config.oracleAuthority) && header && !header.admin.equals(PublicKey.default) && (
            <div className="mt-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-widest font-semibold">Push Price (Authority)</p>
              {status && status.includes("Push") && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                  <span className="text-[10px] text-zinc-400">{status}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Target price (USD)"
                  value={pushPriceInput}
                  onChange={(e) => setPushPriceInput(e.target.value)}
                  className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1.5 text-[11px] text-zinc-300 font-mono"
                />
                <button
                  onClick={handlePushPrice}
                  disabled={!pushPriceInput || !!status}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-[11px] font-medium text-white transition"
                >
                  Push
                </button>
              </div>
              <p className="text-[9px] text-zinc-600 mt-1.5">
                Circuit breaker: price moves gradually toward target (rate-limited per crank). Push + Crank repeatedly to reach large price changes.
              </p>
            </div>
          )}
        </Section>

        {/* ============ 4.5) Pricing Truth Panel ============ */}
        <Section title="Pricing Engine" subtitle="thin-market protections — verifiable safety posture">
          {matcherContextData && pricingResult ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <StatCard 
                  label="Current Spread" 
                  value={`${pricingResult.spreadBps.toFixed(1)} bps`}
                  color={pricingResult.guardState === "halted" ? "text-red-400" : pricingResult.guardState === "widened" ? "text-amber-400" : "text-emerald-400"}
                />
                <StatCard 
                  label="Current Guard State (live)" 
                  value={`${pricingResult.guardState.toUpperCase()} (${pricingResult.pricingContext.guardReason})`}
                  color={
                    pricingResult.guardState === "halted" ? "text-red-400" :
                    pricingResult.guardState === "throttled" ? "text-amber-400" :
                    pricingResult.guardState === "widened" ? "text-yellow-400" :
                    "text-emerald-400"
                  }
                />
                <StatCard 
                  label="Skew" 
                  value={pricingResult.pricingContext.skewBefore >= 0 ? `+${(pricingResult.pricingContext.skewBefore * 100).toFixed(1)}%` : `${(pricingResult.pricingContext.skewBefore * 100).toFixed(1)}%`}
                  color={Math.abs(pricingResult.pricingContext.skewBefore) > 0.5 ? "text-amber-400" : "text-zinc-300"}
                />
                <StatCard 
                  label="Vol Regime" 
                  value={pricingResult.pricingContext.volRegime ? pricingResult.pricingContext.volRegime.toUpperCase() : "—"}
                  color={
                    pricingResult.pricingContext.volRegime === "high" ? "text-red-400" :
                    pricingResult.pricingContext.volRegime === "med" ? "text-amber-400" :
                    pricingResult.pricingContext.volRegime === "low" ? "text-emerald-400" :
                    "text-zinc-500"
                  }
                />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <StatCard 
                  label="Utilization" 
                  value={`${(pricingResult.pricingContext.utilization * 100).toFixed(1)}%`}
                  color={pricingResult.pricingContext.utilization > 0.8 ? "text-red-400" : pricingResult.pricingContext.utilization > 0.5 ? "text-amber-400" : "text-zinc-300"}
                />
                <StatCard 
                  label="Oracle Divergence" 
                  value={pricingResult.pricingContext.oracleDivergenceBps != null ? `${pricingResult.pricingContext.oracleDivergenceBps.toFixed(1)} bps` : "—"}
                  color={pricingResult.pricingContext.oracleDivergenceBps != null && pricingResult.pricingContext.oracleDivergenceBps > 100 ? "text-red-400" : pricingResult.pricingContext.oracleDivergenceBps != null && pricingResult.pricingContext.oracleDivergenceBps > 50 ? "text-amber-400" : "text-zinc-300"}
                />
                {/* Spot Reference - not yet implemented (spotPriceE6 is undefined) */}
                <StatCard 
                  label="Oracle Freshness" 
                  value={
                    oracleFreshnessSecs != null
                      ? `${oracleFreshnessSecs} s${pricingResult.pricingContext.oracleFreshnessSlots != null ? ` (${pricingResult.pricingContext.oracleFreshnessSlots} slots)` : ""}`
                      : pricingResult.pricingContext.oracleFreshnessSlots != null
                        ? `${pricingResult.pricingContext.oracleFreshnessSlots} slots`
                        : "—"
                  }
                  color={
                    (oracleFreshnessSecs != null && config && oracleFreshnessSecs > Number(config.maxStalenessSlots)) ||
                    (pricingResult.pricingContext.oracleFreshnessSlots != null && pricingResult.pricingContext.oracleFreshnessSlots > 150)
                      ? "text-amber-400" : "text-zinc-300"
                  }
                />
                <StatCard 
                  label="Crank Freshness" 
                  value={`${pricingResult.pricingContext.crankFreshnessSlots} slots`}
                  color={pricingResult.pricingContext.crankFreshnessSlots > config?.maxStalenessSlots ? "text-amber-400" : "text-zinc-300"}
                />
              </div>
              {/* Price audit: sources + divergence formula + threshold */}
              {pricingResult.pricingContext.oracleDivergenceBps != null && Number(pricingResult.pricingContext.oraclePriceE6) > 0 && (
                <div className="p-3 rounded-lg bg-white/[0.015] border border-white/[0.04] mb-3">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold mb-2">Price Audit</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <span className="text-zinc-600">Mark Price</span>
                      {Number(pricingResult.pricingContext.markPriceE6) > 0 ? (
                        <span className="font-mono text-zinc-300 ml-1">${(Number(pricingResult.pricingContext.markPriceE6) / 1_000_000).toFixed(2)}</span>
                      ) : (
                        <span className="font-mono text-zinc-500 ml-1">—</span>
                      )}
                      <span className="text-zinc-500 ml-1">(source: {matcherContextData.lastExecPriceE6 > 0n ? "last trade" : "engine"})</span>
                    </div>
                    <div>
                      <span className="text-zinc-600">Oracle Price</span>
                      <span className="font-mono text-zinc-300 ml-1">${(Number(pricingResult.pricingContext.oraclePriceE6) / 1_000_000).toFixed(2)}</span>
                      <span className="text-zinc-500 ml-1">(source: oracle account)</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-zinc-600">Divergence</span>
                      <span className="font-mono text-zinc-300 ml-1">{pricingResult.pricingContext.oracleDivergenceBps.toFixed(1)} bps</span>
                      <span className="text-zinc-500 ml-1">(|mark − oracle| / oracle × 10⁴)</span>
                    </div>
                    <div>
                      <span className="text-zinc-600">Threshold</span>
                      <span className="font-mono text-zinc-400 ml-1">widen &gt; {pricingResult.pricingContext.divergenceThresholdBps} bps, halt &gt; {pricingResult.pricingContext.divergenceHaltBps} bps</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="p-3 rounded-lg bg-white/[0.015] border border-white/[0.04] mb-3">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold mb-2">Spread Breakdown</p>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Base Spread</span>
                    <span className="font-mono text-zinc-400">{matcherContextData.baseSpreadBps} bps</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Trading Fee</span>
                    <span className="font-mono text-zinc-400">{matcherContextData.tradingFeeBps} bps</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Skew Adj</span>
                    <span className={`font-mono ${pricingResult.skewAdjustmentBps > 0 ? "text-amber-400" : "text-zinc-400"}`}>
                      {pricingResult.skewAdjustmentBps > 0 ? `+${pricingResult.skewAdjustmentBps.toFixed(1)}` : "0"} bps
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Vol Adj</span>
                    <span className={`font-mono ${pricingResult.volAdjustmentBps > 0 ? "text-amber-400" : "text-zinc-400"}`}>
                      {pricingResult.volAdjustmentBps > 0 ? `+${pricingResult.volAdjustmentBps.toFixed(1)}` : "0"} bps
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Util Adj</span>
                    <span className={`font-mono ${pricingResult.utilizationAdjustmentBps > 0 ? "text-amber-400" : "text-zinc-400"}`}>
                      {pricingResult.utilizationAdjustmentBps > 0 ? `+${pricingResult.utilizationAdjustmentBps.toFixed(1)}` : "0"} bps
                    </span>
                  </div>
                </div>
              </div>
              {(matcherContextData.kind === 1 || matcherContextData.kind === 2) && (
                <div className="p-3 rounded-lg bg-white/[0.015] border border-white/[0.04]">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold mb-2">
                    {matcherContextData.kind === 2 ? "PropAMM Parameters" : "vAMM Parameters"}
                  </p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-zinc-600">Impact K</span>
                      <span className="font-mono text-zinc-400">{matcherContextData.impactKBps} bps</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600">Liquidity Depth</span>
                      <span className="font-mono text-zinc-400">${(Number(matcherContextData.liquidityNotionalE6) / 1_000_000).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600">Max Fill</span>
                      <span className="font-mono text-zinc-400">{matcherContextData.maxFillAbs.toString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600">Max Inventory</span>
                      <span className="font-mono text-zinc-400">{matcherContextData.maxInventoryAbs.toString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : matcherCtx ? (
            <p className="text-[10px] text-zinc-700">Loading matcher context…</p>
          ) : (
            <p className="text-[10px] text-zinc-700">No matcher context found (LP not initialized)</p>
          )}
        </Section>

        {/* ============ 5) Liveness / Crank Panel ============ */}
        <Section title="Liveness / Crank">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <StatCard
              label="Crank Status"
              value={crankStale ? "STALE" : "FRESH"}
              color={crankStale ? "text-amber-400" : "text-emerald-400"}
            />
            <StatCard label="Slots Since Crank" value={String(crankAge)} color={crankStale ? "text-amber-400" : "text-zinc-300"} />
            <StatCard label="Max Staleness" value={`${maxStaleness} slots`} />
            <StatCard label="Last Crank Slot" value={String(lastCrankSlot)} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <StatCard label="Sweep Start" value={String(lastSweepStart)} />
            <StatCard label="Sweep Complete" value={String(lastSweepComplete)} />
            <StatCard label="Crank Cursor" value={engine ? String(engine.crankCursor) : "—"} />
            <StatCard label="Liq Cursor" value={engine ? String(engine.liqCursor) : "—"} />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCrank}
              disabled={!wallet.publicKey || !wallet.sendTransaction || !!status}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-[11px] font-semibold text-white transition"
            >
              {status === "Crank Now…" ? "Cranking…" : "Crank Now"}
            </button>
            {actionSuccess && actionSuccess.includes("Crank") && (
              <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Confirmed
              </span>
            )}
          </div>
          {slotsUntilStale != null && (
            <div className={`mt-3 px-3 py-2 rounded-lg text-[10px] font-mono ${crankStale ? "bg-amber-500/10 border border-amber-500/20 text-amber-400" : "bg-white/[0.02] border border-white/[0.04] text-zinc-500"}`}>
              <span className="font-semibold uppercase tracking-wider">Highlight when stale:</span>{" "}
              {crankStale
                ? `Crank is STALE (${crankAge} > ${maxStaleness}) — Current Guard State = HALTED (CRANK_STALE). Run Crank Now above to flip back to NORMAL.`
                : `${slotsUntilStale} slots until crank exceeds max staleness (${maxStaleness} slots).`}
              {" "}Current Guard State updates automatically when slot poll refreshes.
            </div>
          )}
        </Section>

        {/* ============ 6) Market State Panel ============ */}
        <Section title="Market State" subtitle="real on-chain balances">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Token Account Balance" value={vaultBalance !== null ? formatTokenAmount(vaultBalance, collateralDecimals) : "—"} />
            <StatCard label="Engine Tracked Vault" value={engine ? formatTokenAmount(engine.vault, collateralDecimals) : "—"} />
            <StatCard label="Insurance Balance" value={engine ? formatTokenAmount(engine.insuranceFund.balance, collateralDecimals) : "—"} />
            <StatCard label="Accrued Fee Revenue" value={engine ? formatTokenAmount(engine.insuranceFund.feeRevenue, collateralDecimals) : "—"} />
            <StatCard label="Total OI" value={engine ? String(engine.totalOpenInterest) : "—"} />
            <StatCard
              label="Used Accounts"
              value={(() => {
                if (!slabData || !riskParams) return "—";
                const maxAccts = Number(riskParams.maxAccounts);
                const numUsed = tierAwareNumUsed(slabData, maxAccts);
                return numUsed >= 0 ? `${numUsed} / ${maxAccts}` : "—";
              })()}
            />
            <StatCard label="Lifetime Liquidations" value={engine ? String(engine.lifetimeLiquidations) : "—"} />
            <StatCard label="Funding Rate (last)" value={engine ? `${engine.fundingRateBpsPerSlotLast} bps/slot` : "—"} />
          </div>
          {riskParams && (
            <div className="mt-3">
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold mb-2">Risk Parameters</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[10px]">
                <ParamRow label="Init Margin" value={`${bigToNum(riskParams.initialMarginBps)} bps`} />
                <ParamRow label="Maint Margin" value={`${bigToNum(riskParams.maintenanceMarginBps)} bps`} />
                <ParamRow label="Trading Fee" value={`${bigToNum(riskParams.tradingFeeBps)} bps`} />
                <ParamRow label="Liq Fee" value={`${bigToNum(riskParams.liquidationFeeBps)} bps`} />
                <ParamRow label="Max Accounts" value={String(riskParams.maxAccounts)} />
                <ParamRow label="Warmup Slots" value={String(riskParams.warmupPeriodSlots)} />
                <ParamRow label="New Acct Fee" value={String(riskParams.newAccountFee)} />
                <ParamRow label="Liq Buffer" value={`${bigToNum(riskParams.liquidationBufferBps)} bps`} />
              </div>
            </div>
          )}
        </Section>

        {/* ============ 7) Full Cycle Checklist ============ */}
        <Section title="Full Trading Cycle" subtitle="acceptance test — every action real, every step verified">
          {/* Global status / success / error */}
          {status && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <div className="w-3 h-3 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
              <span className="text-[11px] text-zinc-400">{status}</span>
            </div>
          )}
          {actionSuccess && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20 flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[11px] text-emerald-400 font-medium">{actionSuccess}</p>
            </div>
          )}
          {actionError && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/[0.05] border border-red-500/20">
              <p className="text-[11px] text-red-400 whitespace-pre-wrap">{actionError}</p>
            </div>
          )}

          {/* Your Account summary */}
          <div className="mb-4 p-3 rounded-lg bg-white/[0.015] border border-white/[0.04]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Your Account</span>
              {userIdx !== null ? (
                <span className="text-[10px] text-emerald-400 font-mono">Account #{userIdx}</span>
              ) : (
                <span className="text-[10px] text-zinc-600">Not initialized</span>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[10px]">
              <div className="flex justify-between"><span className="text-zinc-600">Collateral Balance</span><span className="font-mono text-zinc-400">{userTokenBalance !== null ? `${formatTokenAmount(userTokenBalance, collateralDecimals)} tokens` : "—"}</span></div>
              {userAccount && (
                <>
                  <div className="flex justify-between"><span className="text-zinc-600">Capital</span><span className="font-mono text-zinc-400">{formatTokenAmount(userAccount.capital, collateralDecimals)}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-600">PnL</span><span className={`font-mono ${Number(userAccount.pnl) > 0 ? "text-emerald-400" : Number(userAccount.pnl) < 0 ? "text-red-400" : "text-zinc-400"}`}>{String(userAccount.pnl)}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-600">Position</span><span className={`font-mono ${Number(userAccount.positionSize) !== 0 ? "text-amber-400" : "text-zinc-400"}`}>{String(userAccount.positionSize)}</span></div>
                </>
              )}
            </div>
          </div>

          {/* LP Account summary */}
          {lpIdx !== null && (() => {
            const [lpPda] = deriveLpPda(slabOwner, slabPk, lpIdx);
            return (
            <div className="mb-4 p-3 rounded-lg bg-white/[0.015] border border-white/[0.04]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">LP Account</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-emerald-400 font-mono">Account #{lpIdx}</span>
                  <a
                    href={explorerAccountUrl(lpPda.toBase58(), cluster as "devnet")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[8px] text-emerald-600 hover:text-emerald-400 transition px-1.5 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20"
                    title="View LP PDA on Explorer"
                  >
                    🔗
                  </a>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[10px]">
                {lpAccount ? (
                  <>
                    <div className="flex justify-between"><span className="text-zinc-600">LP Capital</span><span className="font-mono text-zinc-400">{formatTokenAmount(lpAccount.capital, collateralDecimals)}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-600">LP Position</span><span className={`font-mono ${Number(lpAccount.positionSize) !== 0 ? "text-amber-400" : "text-zinc-400"}`}>{String(lpAccount.positionSize)}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-600">LP PnL</span><span className={`font-mono ${Number(lpAccount.pnl) > 0 ? "text-emerald-400" : Number(lpAccount.pnl) < 0 ? "text-red-400" : "text-zinc-400"}`}>{String(lpAccount.pnl)}</span></div>
                  </>
                ) : (
                  <div className="text-zinc-600">Loading…</div>
                )}
              </div>
              {lpAccount && lpAccount.capital === 0n && (
                <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded">
                  <p className="text-[9px] text-amber-400 mb-1.5">
                    LP has zero capital — all trades will fail with &quot;Undercollateralized&quot;.
                    Deposit tokens to the LP to enable trading.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Amount (tokens)"
                      value={lpDepositAmt}
                      onChange={(e) => setLpDepositAmt(e.target.value)}
                      className="w-32 bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-[10px] text-zinc-300 font-mono"
                    />
                    <button
                      onClick={handleFundLP}
                      disabled={!lpDepositAmt || !!status}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-[10px] font-medium text-white transition"
                    >
                      Fund LP
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
          })()}

          {/* ---- 6-Step Checklist ---- */}
          <div className="space-y-2">
            {/* Step 1: Init User */}
            <CycleStep
              step={1}
              label="Init User Account"
              desc="Creates your trading account on-chain. Pays a small fee in collateral tokens."
              done={userIdx !== null}
              active={userIdx === null}
              disabled={!wallet.publicKey || !!status || userIdx !== null}
              receipt={marketReceipts.find(r => r.action === "Init User")}
            >
              {userIdx === null && (
                <div className="mt-2">
                  {userTokenBalance !== null && userTokenBalance === 0n && (
                    <p className="text-[9px] text-amber-400 mb-1.5">You need collateral tokens in your wallet. Mint them in the Token Factory first.</p>
                  )}
                  <button
                    onClick={handleInitUser}
                    disabled={!wallet.publicKey || !!status}
                    className="px-4 py-1.5 bg-white/[0.06] hover:bg-white/[0.09] disabled:opacity-50 rounded text-[11px] font-semibold text-zinc-200 transition"
                  >
                    Init User
                  </button>
                </div>
              )}
            </CycleStep>

            {/* Step 2: Deposit */}
            <CycleStep
              step={2}
              label="Deposit Collateral"
              desc="Transfer collateral tokens from your wallet into the market vault."
              done={userAccount !== null && Number(userAccount.capital) > 0}
              active={userIdx !== null && (userAccount === null || Number(userAccount.capital) === 0)}
              disabled={userIdx === null || !!status}
              receipt={marketReceipts.find(r => r.action === "Deposit")}
            >
              {userIdx !== null && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    placeholder="Amount (token units)"
                    value={depositAmt}
                    onChange={(e) => setDepositAmt(e.target.value)}
                    className="w-40 bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1.5 text-[11px] text-zinc-300 font-mono"
                  />
                  <button
                    onClick={handleDeposit}
                    disabled={!depositAmt || !!status}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-[11px] font-medium text-white transition"
                  >
                    Deposit
                  </button>
                </div>
              )}
            </CycleStep>

            {/* Step 3: Crank */}
            <CycleStep
              step={3}
              label="Crank Now"
              desc="Update the market engine. Required before risk-increasing trades."
              done={!crankStale && marketReceipts.some(r => r.action === "Crank Now")}
              active={userAccount !== null && Number(userAccount.capital) > 0}
              disabled={!wallet.publicKey || !!status}
              receipt={marketReceipts.filter(r => r.action === "Crank Now").pop()}
            >
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={handleCrank}
                  disabled={!wallet.publicKey || !!status}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-[11px] font-medium text-white transition"
                >
                  Crank
                </button>
                <span className={`text-[9px] ${crankStale ? "text-amber-400" : "text-emerald-400"}`}>
                  {crankStale ? `Stale (${crankAge} slots)` : `Fresh (${crankAge} slots)`}
                </span>
              </div>
            </CycleStep>

            {/* Step 4: Open Trade */}
            <CycleStep
              step={4}
              label="Open Position"
              desc="Execute a trade. Long or Short with a specified size."
              done={userAccount !== null && Number(userAccount.positionSize) !== 0}
              active={userAccount !== null && Number(userAccount.capital) > 0 && !crankStale && lpIdx !== null}
              disabled={userIdx === null || !!status || crankStale || lpIdx === null || (userAccount !== null && Number(userAccount.capital) === 0) || pricingResult?.guardState === "halted"}
              receipt={marketReceipts.find(r => r.action.startsWith("Trade"))}
            >
              {userIdx !== null && (
                <div className="space-y-2 mt-2">
                  <input
                    type="text"
                    placeholder="Size (raw units, e.g. 1000000)"
                    value={tradeSize}
                    onChange={(e) => setTradeSize(e.target.value)}
                    className="w-56 bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1.5 text-[11px] text-zinc-300 font-mono"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTrade("long")}
                      disabled={!tradeSize || !!status || crankStale || lpIdx === null || matcherInitialized !== true || (pricingResult?.guardState === "halted")}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-[11px] font-medium text-white transition"
                    >
                      Long
                    </button>
                    <button
                      onClick={() => handleTrade("short")}
                      disabled={!tradeSize || !!status || crankStale || lpIdx === null || matcherInitialized !== true || (pricingResult?.guardState === "halted")}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded text-[11px] font-medium text-white transition"
                    >
                      Short
                    </button>
                  </div>
                  {lpIdx === null && <p className="text-[9px] text-zinc-600">No LP found — cannot trade</p>}
                  {crankStale && <p className="text-[9px] text-amber-400">Crank stale — run Crank Now</p>}
                  {pricingResult?.guardState === "halted" && (
                    <p className="text-[9px] text-red-400">
                      {crankStale
                        ? `Trading halted: Crank stale (${crankAge} slots > max ${maxStaleness}). Run Crank Now to resume.`
                        : (pricingResult.pricingContext.oracleDivergenceBps != null && pricingResult.pricingContext.oracleDivergenceBps > 100)
                          ? `Trading halted: Oracle divergence ${pricingResult.pricingContext.oracleDivergenceBps.toFixed(1)} bps exceeds threshold`
                          : "Trading halted: Guard state triggered"}
                    </p>
                  )}
                  {pricingResult?.guardState === "throttled" && (
                    <p className="text-[9px] text-amber-400">
                      Trading throttled: Crank stale ({pricingResult.pricingContext.crankFreshnessSlots} slots)
                    </p>
                  )}
                  {pricingResult?.guardState === "widened" && (
                    <p className="text-[9px] text-yellow-400">
                      Spread widened: Guardrails active (spread: {pricingResult.spreadBps.toFixed(1)} bps)
                    </p>
                  )}
                  {matcherInitialized !== true && matcherCtx && (
                    <div className="mt-1.5 p-2 bg-amber-500/10 border border-amber-500/20 rounded">
                      <p className="text-[9px] text-amber-400 mb-1.5">
                        {matcherInitialized === null ? "Checking matcher context…" : "Matcher context not initialized — required before trading"}
                      </p>
                      {matcherInitialized === false && (
                        <button
                          onClick={handleInitMatcher}
                          disabled={!!status}
                          className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-[10px] font-medium text-white transition"
                        >
                          Init Matcher
                        </button>
                      )}
                    </div>
                  )}
                  {matcherInitialized === true && (
                    <p className="text-[9px] text-emerald-500 mt-1">Matcher initialized</p>
                  )}
                </div>
              )}
            </CycleStep>

            {/* Step 5: Close Position */}
            <CycleStep
              step={5}
              label="Close Position"
              desc="Flatten your position by trading the opposite direction."
              done={userAccount !== null && Number(userAccount.positionSize) === 0 && marketReceipts.filter(r => r.action.startsWith("Trade")).length >= 2}
              active={userAccount !== null && Number(userAccount.positionSize) !== 0}
              disabled={userIdx === null || !!status || lpIdx === null || !userAccount || Number(userAccount.positionSize) === 0}
              receipt={marketReceipts.filter(r => r.action.startsWith("Trade")).length >= 2 ? marketReceipts.filter(r => r.action.startsWith("Trade")).pop() : undefined}
            >
              {userAccount && Number(userAccount.positionSize) !== 0 && (
                <div className="mt-2">
                  <p className="text-[9px] text-zinc-500 mb-1.5">
                    Current position: <span className="font-mono text-amber-400">{String(userAccount.positionSize)}</span>
                    {" — "}will trade <span className="font-mono">{Number(userAccount.positionSize) > 0 ? "short" : "long"} {String(Number(userAccount.positionSize) > 0 ? userAccount.positionSize : -BigInt(String(userAccount.positionSize)))}</span> to close
                  </p>
                  <button
                    onClick={() => {
                      const pos = BigInt(String(userAccount.positionSize));
                      const closeSize = -pos; // negate current position to flatten
                      const dir = pos > 0n ? "short" : "long";
                      const lpI = tradeLpIdx ? parseInt(tradeLpIdx) : lpIdx;
                      if (lpI === null || !matcherCtx) { setActionError("No LP available"); return; }
                      if (!lpOwner) { setActionError("LP owner not resolved — refresh page"); return; }
                      const oracleAcct = config && !config.indexFeedId.equals(PublicKey.default) ? config.indexFeedId : slabPk;
                      sendAndReceipt(`Trade ${dir} (close)`, async () => {
                        const fullParams = { ...params, matcherProgramId: MATCHER_PROGRAM_ID, matcherContext: new PublicKey(matcherCtx) };
                        const ix = buildTradeCpiIxDirect(fullParams, wallet.publicKey!, lpI, lpOwner, oracleAcct, userIdx!, closeSize);
                        return new Transaction().add(ix);
                      }, 400_000);
                    }}
                    disabled={!!status || lpIdx === null || matcherInitialized !== true}
                    className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-[11px] font-medium text-white transition"
                  >
                    Close Position
                  </button>
                </div>
              )}
            </CycleStep>

            {/* Step 6: Withdraw */}
            <CycleStep
              step={6}
              label="Withdraw"
              desc="Withdraw collateral back to your wallet. Only when no open positions."
              done={marketReceipts.some(r => r.action === "Withdraw")}
              active={userAccount !== null && Number(userAccount.positionSize) === 0 && Number(userAccount.capital) > 0}
              disabled={userIdx === null || !!status || (userAccount !== null && Number(userAccount.positionSize) !== 0)}
              receipt={marketReceipts.find(r => r.action === "Withdraw")}
            >
              {userIdx !== null && userAccount && Number(userAccount.positionSize) === 0 && Number(userAccount.capital) > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    placeholder="Amount"
                    value={withdrawAmt}
                    onChange={(e) => setWithdrawAmt(e.target.value)}
                    className="w-40 bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1.5 text-[11px] text-zinc-300 font-mono"
                  />
                  <button
                    onClick={handleWithdraw}
                    disabled={!withdrawAmt || !!status}
                    className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.09] disabled:opacity-50 rounded text-[11px] font-medium text-zinc-300 transition"
                  >
                    Withdraw
                  </button>
                </div>
              )}
            </CycleStep>
          </div>

          {/* Cycle completion */}
          {marketReceipts.some(r => r.action === "Withdraw") && (
            <div className="mt-4 p-4 rounded-lg bg-emerald-500/[0.04] border border-emerald-500/20 text-center">
              <p className="text-[13px] font-bold text-emerald-400">Full Cycle Complete</p>
              <p className="text-[10px] text-zinc-500 mt-1">Init → Deposit → Crank → Trade → Close → Withdraw — all verified with receipts.</p>
            </div>
          )}
        </Section>

        {/* ============ 8) Receipts (market-scoped) ============ */}
        <Section title="Receipts" subtitle={`${marketReceipts.length} for this market`}>
          {marketReceipts.length === 0 ? (
            <p className="text-[10px] text-zinc-700 text-center py-4">No receipts for this market yet</p>
          ) : (
            <div className="space-y-1 max-h-[300px] overflow-auto">
              {marketReceipts.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-2 rounded bg-white/[0.015] border border-white/[0.04]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-zinc-300">{r.action}</span>
                      <span className="text-[9px] text-zinc-600 font-mono">{new Date(r.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-[9px] text-zinc-600 font-mono truncate">
                      {r.txSignatures[0]}
                      {r.txSignatures.length > 1 && ` (+${r.txSignatures.length - 1} more)`}
                    </div>
                    {r.pricingContext && (
                      <div className="text-[9px] text-zinc-500 mt-1">
                        <span className="italic">Guard at fill:</span>{" "}
                        {r.pricingContext.guardState?.toUpperCase() ?? "—"} ({r.pricingContext.guardReason ?? "—"})
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {r.invokedPrograms.slice(0, 3).map((p) => (
                      <a
                        key={p.programId}
                        href={p.explorerLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`${short(p.programId, 6)} — ${p.upgradeable ? "Upgradeable" : "Immutable"}${p.upgradeAuthority ? ` (auth: ${short(p.upgradeAuthority, 4)})` : ""}`}
                        className={`text-[7px] px-1 py-0.5 rounded font-bold uppercase hover:opacity-80 transition ${
                          p.upgradeable ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"
                        }`}
                      >
                        {p.upgradeable ? "Upgradeable" : "Immutable"}
                      </a>
                    ))}
                    <a
                      href={r.explorerLinks[0]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] text-emerald-600 hover:text-emerald-400 transition px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20"
                      title="View transaction on Explorer"
                    >
                      🔗 Explorer
                    </a>
                    <button
                      onClick={() => {
                        const obj = { ...r, pricingContext: r.pricingContext ? { ...r.pricingContext, markPriceE6: r.pricingContext.markPriceE6 != null ? String(r.pricingContext.markPriceE6) : undefined, oraclePriceE6: r.pricingContext.oraclePriceE6 != null ? String(r.pricingContext.oraclePriceE6) : undefined } : undefined };
                        const json = JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
                        const blob = new Blob([json], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `receipt-${r.action.replace(/\s+/g, "-")}-${r.timestamp.slice(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="text-[9px] text-zinc-500 hover:text-zinc-300 transition px-1.5 py-1 rounded"
                      title="Export this receipt as JSON"
                    >
                      Export JSON
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {marketReceipts.length > 0 && (
            <button
              onClick={() => {
                const json = JSON.stringify(marketReceipts, null, 2);
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `receipts-${short(marketId, 8)}.json`;
                a.click();
              }}
              className="mt-2 text-[10px] text-emerald-500 hover:text-emerald-400 transition"
            >
              Export Receipts JSON
            </button>
          )}
        </Section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/[0.04] bg-white/[0.01] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/[0.04] flex items-center gap-2">
        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">{title}</h3>
        {subtitle && <span className="text-[9px] text-zinc-700 italic">{subtitle}</span>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function AddrRow({ label, value, cluster, badge, onCopy, explorerKind = "account" }: { label: string; value: string; cluster: string; badge?: string; onCopy: () => void; explorerKind?: "account" | "tx" }) {
  const explorerHref = explorerKind === "tx" ? explorerTxUrl(value, cluster as "devnet") : explorerAccountUrl(value, cluster as "devnet");
  const explorerTitle = explorerKind === "tx" ? "View transaction on Explorer" : "View on Solana Explorer";
  return (
    <div className="flex items-center gap-3 py-1 group">
      <span className="text-[10px] text-zinc-600 w-28 shrink-0 uppercase tracking-wider">{label}</span>
      <span className="font-mono text-[10px] text-zinc-400 truncate flex-1">{value}</span>
      {badge && (
        <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-500">{badge}</span>
      )}
      <a
        href={explorerHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[9px] text-emerald-600 hover:text-emerald-400 transition shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20"
        title={explorerTitle}
      >
        🔗 Explorer
      </a>
      <CopyBtn onClick={onCopy} />
    </div>
  );
}

function CopyBtn({ onClick }: { onClick: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { onClick(); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className="text-[9px] text-zinc-600 hover:text-emerald-400 transition shrink-0 px-1"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function StatCard({ label, value, color = "text-zinc-300" }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-white/[0.015] border border-white/[0.04]">
      <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-0.5">{label}</p>
      <p className={`text-[12px] font-mono font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-zinc-600">{label}</span>
      <span className="font-mono text-zinc-400">{value}</span>
    </div>
  );
}

function StatusCard({ label, value, color = "text-zinc-300" }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-3 rounded-lg bg-white/[0.015] border border-white/[0.04]">
      <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-0.5">{label}</p>
      <p className={`text-[13px] font-bold ${color}`}>{value}</p>
    </div>
  );
}

/* ---- Full Cycle Step ---- */
function CycleStep({
  step, label, desc, done, active, disabled, receipt, children,
}: {
  step: number;
  label: string;
  desc: string;
  done: boolean;
  active: boolean;
  disabled: boolean;
  receipt?: { txSignatures: string[]; explorerLinks: string[] };
  children?: React.ReactNode;
}) {
  const borderColor = done
    ? "border-emerald-500/25"
    : active
    ? "border-white/[0.08]"
    : "border-white/[0.04]";
  const bgColor = done
    ? "bg-emerald-500/[0.02]"
    : active
    ? "bg-white/[0.015]"
    : "bg-white/[0.005]";

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-3 transition-colors`}>
      <div className="flex items-center gap-3">
        {/* Step indicator */}
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ${
          done
            ? "bg-emerald-500 text-white"
            : active
            ? "bg-white/[0.08] text-zinc-300 border border-white/[0.1]"
            : "bg-white/[0.02] text-zinc-700 border border-white/[0.04]"
        }`}>
          {done ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            step
          )}
        </div>

        {/* Label + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[12px] font-semibold ${done ? "text-emerald-400" : active ? "text-zinc-200" : "text-zinc-600"}`}>{label}</span>
            {done && receipt && (
              <a
                href={receipt.explorerLinks[0]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 hover:text-emerald-300 transition font-mono"
              >
                {receipt.txSignatures[0]?.slice(0, 12)}…
              </a>
            )}
          </div>
          <p className={`text-[9px] ${done ? "text-zinc-600" : active ? "text-zinc-500" : "text-zinc-700"}`}>{desc}</p>
        </div>
      </div>

      {/* Step action content (input fields, buttons) */}
      {!done && !disabled && children && (
        <div className="ml-10">
          {children}
        </div>
      )}
    </div>
  );
}
