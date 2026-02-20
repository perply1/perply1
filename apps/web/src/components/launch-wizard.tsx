"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import {
  PublicKey,
  Transaction,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { requestDevnetAirdrop, getAirdropCliCommand, WEB_FAUCETS } from "@/lib/devnet-faucet";
import {
  TOKEN_PROGRAM_ID,
  createInitializeAccountInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import {
  buildInitMarketIx,
  buildInitLPIx,
  buildSetOracleAuthorityIx,
  buildPushOraclePriceIx,
  buildUpdateAdminIx,
  addComputeBudget,
  SLAB_TIERS,
  deriveVaultAuthority,
  deriveLpPda,
  fetchSlab,
  parseHeader,
  type InitMarketArgs,
  type SlabTier,
} from "@sov/percolator-sdk";
import { DEVNET, PERCOLATOR_LAUNCH_DEFAULTS as DEFAULTS } from "@/sdk/config";
import { useReceipts } from "./receipts-provider";
import { useCluster } from "./cluster-provider";
import { parseTxAndBuildReceipt } from "@sov/proof";
import type { DevnetMarketInfo } from "@sov/percolator-sdk";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type OracleMode = "pyth" | "chainlink" | "authority";
type MatcherMode = "passive" | "vamm" | "propamm";
type AdminMode = "upgradeable" | "adminless";

interface WizardState {
  // Step 1 - Identity
  marketName: string;
  description: string;
  baseMint: string;
  collateralMint: string;
  createMint: boolean;
  // Step 2 - Oracle
  oracleMode: OracleMode;
  oracleAccount: string; // Pyth PriceUpdateV2 or Chainlink aggregator
  pythFeedId: string; // 64 hex chars for Pyth feed ID
  oracleAuthorityPubkey: string;
  initialPrice: string;
  inverted: boolean;
  // Step 3 - Slab tier
  slabTierIdx: number;
  // Step 4 - Matcher
  matcherMode: MatcherMode;
  matcherProgramId: string;
  passiveSpreadBps: string;
  vammTradingFeeBps: string;
  vammBaseSpreadBps: string;
  vammImpactKBps: string;
  vammMaxTotalBps: string;
  vammLiquidityE6: string;
  // Step 5 - Risk
  maintenanceMarginBps: string;
  initialMarginBps: string;
  tradingFeeBps: string;
  maxCrankStalenessSlots: string;
  liquidationFeeBps: string;
  liquidationBufferBps: string;
  warmupPeriodSlots: string;
  newAccountFee: string;
  lpSeedCapital: string; // Extra tokens to fund the LP (beyond the account fee)
  // Admin mode
  adminMode: AdminMode;
  burnAdminConfirm: string; // User must type "BURN" to enable burn step
  // Computed
  unitScale: string;
  confFilterBps: string;
  maxStalenessSecs: string;
}

const INITIAL_STATE: WizardState = {
  marketName: "",
  description: "",
  baseMint: "",
  collateralMint: DEVNET.wrappedSolMint,
  createMint: false,
  oracleMode: "authority",
  oracleAccount: DEVNET.chainlinkSolUsd,
  pythFeedId: "0".repeat(64),
  oracleAuthorityPubkey: "",
  initialPrice: "150",
  inverted: false,
  slabTierIdx: 0,
  matcherMode: "passive",
  matcherProgramId: DEVNET.matcherProgramId,
  passiveSpreadBps: String(DEVNET.defaultPassiveSpreadBps),
  vammTradingFeeBps: String(DEVNET.defaultVammParams.tradingFeeBps),
  vammBaseSpreadBps: String(DEVNET.defaultVammParams.baseSpreadBps),
  vammImpactKBps: String(DEVNET.defaultVammParams.impactKBps),
  vammMaxTotalBps: String(DEVNET.defaultVammParams.maxTotalBps),
  vammLiquidityE6: DEVNET.defaultVammParams.liquidityNotionalE6,
  maintenanceMarginBps: String(DEFAULTS.maintenanceMarginBps),
  initialMarginBps: String(DEFAULTS.initialMarginBps),
  tradingFeeBps: String(DEFAULTS.tradingFeeBps),
  maxCrankStalenessSlots: String(DEFAULTS.maxCrankStalenessSlots),
  liquidationFeeBps: String(DEFAULTS.liquidationFeeBps),
  liquidationBufferBps: String(DEFAULTS.liquidationBufferBps),
  warmupPeriodSlots: String(DEFAULTS.warmupPeriodSlots),
  newAccountFee: DEFAULTS.newAccountFee,
  lpSeedCapital: "100000000", // 100M raw units — LP needs capital to back trades (fee alone gives zero capital)
  adminMode: "upgradeable",
  burnAdminConfirm: "",
  unitScale: "0",
  confFilterBps: String(DEFAULTS.confFilterBps),
  maxStalenessSecs: String(DEFAULTS.maxStalenessSecs),
};

const TOTAL_STEPS = 8;
const STEP_LABELS = [
  "Preconditions",
  "Market Identity",
  "Oracle Setup",
  "Slab Size",
  "Matcher",
  "Risk / Fees",
  "Cost Breakdown",
  "Execute Launch",
];

/* ---- Quick Launch maps directly to SLAB_TIERS (real program tiers) ---- */
const QUICK_SIZES = SLAB_TIERS.map((t, i) => ({
  label: t.label,
  maxAccounts: t.maxAccounts,
  bytes: t.bytes,
  tierIdx: i,
  desc: i === 0 ? "Cheapest — testing & prototyping"
      : i === 1 ? "Recommended for devnet"
      : "Full capacity (production max)",
}));

/* ---- Thin Market Safe Mode preset ---- */
const THIN_MARKET_PRESET: Partial<WizardState> = {
  matcherMode: "vamm",
  vammTradingFeeBps: "10", // Higher base fee (0.1%)
  vammBaseSpreadBps: "30", // Higher base spread (0.3%)
  vammImpactKBps: "150", // Stronger impact sensitivity
  vammMaxTotalBps: "500", // Higher max spread (5%)
  vammLiquidityE6: "5000000000", // Lower liquidity depth ($5k)
  maintenanceMarginBps: String(DEFAULTS.maintenanceMarginBps + 100), // +1% margin
  initialMarginBps: String(DEFAULTS.initialMarginBps + 200), // +2% initial margin
  maxCrankStalenessSlots: String(Math.floor(Number(DEFAULTS.maxCrankStalenessSlots) * 0.5)), // Stricter crank freshness (50% of default)
  confFilterBps: String(Number(DEFAULTS.confFilterBps) + 50), // Stricter oracle confidence filter
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function LaunchWizard() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const router = useRouter();
  const { addReceipt } = useReceipts();
  const { cluster } = useCluster();

  const [launchMode, setLaunchMode] = useState<"quick" | "advanced">("quick");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardState>(INITIAL_STATE);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [airdropping, setAirdropping] = useState(false);

  // Quick Launch state
  const [quickName, setQuickName] = useState("SOL-PERP");
  const [quickMint, setQuickMint] = useState(DEVNET.wrappedSolMint);
  const [quickCustomMint, setQuickCustomMint] = useState("");
  const [quickUseCustom, setQuickUseCustom] = useState(false);
  const [quickPrice, setQuickPrice] = useState("1.00");
  const [quickSizeIdx, setQuickSizeIdx] = useState(0); // Small default (cheapest)
  const [quickThinMarketMode, setQuickThinMarketMode] = useState(false); // Thin Market Safe Mode
  const pendingQuickLaunchRef = useRef(false);

  // Rent estimates (computed live)
  const [slabRent, setSlabRent] = useState<number>(0);
  const [vaultRent, setVaultRent] = useState<number>(0);
  const [matcherCtxRent, setMatcherCtxRent] = useState<number>(0);

  // Launch execution
  const [launching, setLaunching] = useState(false);
  const [launchStep, setLaunchStep] = useState(0);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchSigs, setLaunchSigs] = useState<string[]>([]);
  const [launchedMarketId, setLaunchedMarketId] = useState<string | null>(null);

  // Generated keypairs — persisted to sessionStorage so we can resume after partial failures.
  // On mount, try to restore from session. If not found, generate fresh.
  const [slabKeypair] = useState<Keypair>(() => {
    try {
      const saved = sessionStorage.getItem("sov_launch_keypairs");
      if (saved) { const d = JSON.parse(saved); return Keypair.fromSecretKey(new Uint8Array(d.slab)); }
    } catch {}
    return Keypair.generate();
  });
  const [vaultKeypair] = useState<Keypair>(() => {
    try {
      const saved = sessionStorage.getItem("sov_launch_keypairs");
      if (saved) { const d = JSON.parse(saved); return Keypair.fromSecretKey(new Uint8Array(d.vault)); }
    } catch {}
    return Keypair.generate();
  });
  const [matcherCtxKeypair] = useState<Keypair>(() => {
    try {
      const saved = sessionStorage.getItem("sov_launch_keypairs");
      if (saved) { const d = JSON.parse(saved); return Keypair.fromSecretKey(new Uint8Array(d.matcher)); }
    } catch {}
    return Keypair.generate();
  });

  const selectedTier = SLAB_TIERS[form.slabTierIdx] || SLAB_TIERS[0];

  const set = (partial: Partial<WizardState>) => setForm((f) => ({ ...f, ...partial }));

  // ---- Fetch SOL balance ----
  useEffect(() => {
    if (!wallet.publicKey) { setSolBalance(null); return; }
    let cancelled = false;
    connection.getBalance(wallet.publicKey).then((b) => {
      if (!cancelled) setSolBalance(b / LAMPORTS_PER_SOL);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [wallet.publicKey, connection, step]);

  // ---- Auto-fill oracle authority ----
  useEffect(() => {
    if (wallet.publicKey && !form.oracleAuthorityPubkey) {
      set({ oracleAuthorityPubkey: wallet.publicKey.toBase58() });
    }
  }, [wallet.publicKey]);

  const [rentFetchedAt, setRentFetchedAt] = useState<string | null>(null);

  // ---- Compute rent estimates for ALL tiers ----
  const [tierRents, setTierRents] = useState<Record<number, number>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rentPromises = SLAB_TIERS.map((t) => connection.getMinimumBalanceForRentExemption(t.bytes));
        const [vRent, mRent, ...slabRents] = await Promise.all([
          connection.getMinimumBalanceForRentExemption(165), // SPL Token Account
          connection.getMinimumBalanceForRentExemption(320), // Matcher context
          ...rentPromises,
        ]);
        if (!cancelled) {
          const rents: Record<number, number> = {};
          SLAB_TIERS.forEach((_, i) => { rents[i] = slabRents[i]; });
          setTierRents(rents);
          setSlabRent(rents[form.slabTierIdx] ?? slabRents[0]);
          setVaultRent(vRent);
          setMatcherCtxRent(mRent);
          setRentFetchedAt(new Date().toLocaleTimeString());
        }
      } catch {
        if (!cancelled) setRentFetchedAt(null);
      }
    })();
    return () => { cancelled = true; };
  }, [connection]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update slab rent when tier selection changes
  useEffect(() => {
    if (tierRents[form.slabTierIdx] !== undefined) {
      setSlabRent(tierRents[form.slabTierIdx]);
    }
  }, [form.slabTierIdx, tierRents]);

  const totalRentLamports = slabRent + vaultRent + matcherCtxRent;
  const totalRentSol = totalRentLamports / LAMPORTS_PER_SOL;
  const estimatedTotalSol = totalRentSol + 0.01; // + tx fees buffer

  const [airdropError, setAirdropError] = useState<string | null>(null);
  const [airdropCooldown, setAirdropCooldown] = useState(0);
  const [airdropAmount, setAirdropAmount] = useState<number>(1);
  const [showFaucets, setShowFaucets] = useState(false);
  const [pollingBalance, setPollingBalance] = useState(false);

  // Cooldown countdown
  useEffect(() => {
    if (airdropCooldown <= 0) return;
    const id = setInterval(() => setAirdropCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [airdropCooldown]);

  // Snapshot balance at the time faucets are shown, to detect increase
  const [balanceAtFaucetOpen, setBalanceAtFaucetOpen] = useState<number>(0);

  // ---- Auto-poll balance when user is using web faucet ----
  useEffect(() => {
    if (!pollingBalance || !wallet.publicKey) return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        await new Promise((r) => setTimeout(r, 4000));
        try {
          const bal = await connection.getBalance(wallet.publicKey!);
          const solBal = bal / LAMPORTS_PER_SOL;
          setSolBalance(solBal);
          if (bal > balanceAtFaucetOpen) {
            setPollingBalance(false);
            // Keep faucets visible so user sees updated balance — don't auto-hide
            setAirdropError(null);
            break;
          }
        } catch {}
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [pollingBalance, wallet.publicKey, connection, balanceAtFaucetOpen]);

  // ---- Airdrop: try RPC first, then show web faucets ----
  const handleAirdrop = async () => {
    if (!wallet.publicKey || airdropCooldown > 0) return;
    setAirdropping(true);
    setAirdropError(null);

    // Snapshot current balance to detect increase
    let currentBal = 0;
    try { currentBal = await connection.getBalance(wallet.publicKey); } catch {}

    const res = await requestDevnetAirdrop(wallet.publicKey.toBase58(), airdropAmount);

    if (res.success) {
      // Poll balance via Helius
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const bal = await connection.getBalance(wallet.publicKey);
          setSolBalance(bal / LAMPORTS_PER_SOL);
          if (bal > currentBal) break;
        } catch {}
      }
      setAirdropCooldown(15);
    } else {
      // RPC airdrop failed — show web faucets and start polling for balance increase
      setAirdropError("RPC faucet unavailable. Use a web faucet below — balance will update automatically.");
      setBalanceAtFaucetOpen(currentBal);
      setShowFaucets(true);
      setPollingBalance(true);
      setAirdropCooldown(5);
    }
    setAirdropping(false);
  };

  /* ------------------------------------------------------------------ */
  /*  Launch execution                                                   */
  /* ------------------------------------------------------------------ */

  const executeLaunch = async () => {
    if (!wallet.publicKey || !wallet.sendTransaction) return;
    setLaunching(true);
    setLaunchError(null);
    setLaunchSigs([]);
    setLaunchStep(0);

    // Use tier-specific program ID (different compiled binaries with different slab sizes)
    const tierProgramId = selectedTier.programId || DEVNET.percolatorProgramId;
    const programId = new PublicKey(tierProgramId);
    const mint = new PublicKey(form.collateralMint);
    const payer = wallet.publicKey;
    const sigs: string[] = [];
    let txStep = 0;

    // Persist keypairs to sessionStorage so we can resume if post-core steps fail
    try {
      sessionStorage.setItem("sov_launch_keypairs", JSON.stringify({
        slab: Array.from(slabKeypair.secretKey),
        vault: Array.from(vaultKeypair.secretKey),
        matcher: Array.from(matcherCtxKeypair.secretKey),
      }));
    } catch {}

    const receipt = async (sig: string, action: string, marketId?: string, extraMetadata?: Record<string, string>) => {
      try {
        const { receipt } = await parseTxAndBuildReceipt({
          connection, signature: sig, cluster, mode: "devnet",
          venue: "percolator", action, marketId, wallet: payer.toBase58(),
        });
        addReceipt(receipt);
      } catch {}
    };

    try {
      // ==============================================================
      //  PHASE 1 — ATOMIC CORE TRANSACTION
      //  Combines: CreateSlab + CreateVault + InitVault + (CreateATA) + InitMarket
      //  into ONE atomic Solana transaction.
      //  If ANY instruction fails, the ENTIRE transaction rolls back
      //  and zero SOL is lost (only the tiny tx fee ~0.000005 SOL).
      //  This prevents the ~7 SOL slab cost from being stranded.
      // ==============================================================
      txStep = 1; setLaunchStep(txStep);

      // Pre-flight checks
      const payerBalance = await connection.getBalance(payer);
      
      // --- Compute rent costs (tier-specific slab size) ---
      const slabBytes = selectedTier.bytes;
      const slabLamports = await connection.getMinimumBalanceForRentExemption(slabBytes);
      const vaultSpace = 165;
      const vaultLamports = await connection.getMinimumBalanceForRentExemption(vaultSpace);
      const estimatedCost = slabLamports + vaultLamports + 0.001 * LAMPORTS_PER_SOL; // Rent + fees
      
      if (payerBalance < estimatedCost) {
        throw new Error(`Insufficient SOL balance.\n\nNeed: ~${(estimatedCost / LAMPORTS_PER_SOL).toFixed(4)} SOL\nHave: ${(payerBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n\nGet devnet SOL: https://faucet.solana.com/`);
      }

      // Validate mint exists
      try {
        const mintInfo = await connection.getAccountInfo(mint);
        if (!mintInfo) {
          throw new Error(`Collateral mint ${mint.toBase58()} not found on devnet.\n\nMake sure the mint address is correct or create a token first.`);
        }
      } catch (mintErr) {
        throw new Error(`Failed to verify collateral mint: ${mintErr instanceof Error ? mintErr.message : String(mintErr)}`);
      }

      const [vaultAuthority] = deriveVaultAuthority(programId, slabKeypair.publicKey);

      // Check if slab already exists (resume after previous success)
      const existingSlab = await connection.getAccountInfo(slabKeypair.publicKey);

      if (!existingSlab) {
        // --- Check if payer ATA exists (needed as dummy account for InitMarket) ---
        const dummyAta = getAssociatedTokenAddressSync(mint, payer);
        const ataInfo = await connection.getAccountInfo(dummyAta);

        // --- Build InitMarket args ---
        // Program rule: if feed_id is all zeros ("Hyperp mode"), initial_mark_price_e6 MUST be non-zero.
        // Pyth uses a real feed ID (non-zero). Both Authority and Chainlink use all-zero feed ID.
        let indexFeedId = "0".repeat(64);
        let initialMarkPriceE6 = BigInt(0);
        if (form.oracleMode === "pyth") {
          indexFeedId = form.pythFeedId;
        } else {
          const priceStr = form.initialPrice || "100";
          const parsed = parseFloat(priceStr);
          const priceNum = isNaN(parsed) || parsed <= 0 ? 100 : parsed;
          initialMarkPriceE6 = BigInt(Math.floor(priceNum * 1_000_000));
          if (initialMarkPriceE6 === 0n) initialMarkPriceE6 = BigInt(100_000_000);
        }

        const initMarketArgs: InitMarketArgs = {
          admin: payer,
          collateralMint: mint,
          indexFeedId,
          maxStalenessSecs: BigInt(form.maxStalenessSecs),
          confFilterBps: parseInt(form.confFilterBps),
          invert: form.inverted ? 1 : 0,
          unitScale: parseInt(form.unitScale),
          initialMarkPriceE6,
          warmupPeriodSlots: BigInt(form.warmupPeriodSlots),
          maintenanceMarginBps: BigInt(form.maintenanceMarginBps),
          initialMarginBps: BigInt(form.initialMarginBps),
          tradingFeeBps: BigInt(form.tradingFeeBps),
          maxAccounts: BigInt(selectedTier.maxAccounts),
          newAccountFee: BigInt(form.newAccountFee),
          riskReductionThreshold: BigInt(0),
          maintenanceFeePerSlot: BigInt(0),
          maxCrankStalenessSlots: BigInt(form.maxCrankStalenessSlots),
          liquidationFeeBps: BigInt(form.liquidationFeeBps),
          liquidationFeeCap: BigInt(DEFAULTS.liquidationFeeCap),
          liquidationBufferBps: BigInt(form.liquidationBufferBps),
          minLiquidationAbs: BigInt(DEFAULTS.minLiquidationAbs),
        };

        const initMarketIx = buildInitMarketIx(
          { programId, slab: slabKeypair.publicKey, mint, vault: vaultKeypair.publicKey, admin: payer },
          initMarketArgs,
        );

        // --- Assemble the ATOMIC transaction ---
        const atomicTx = new Transaction();
        addComputeBudget(atomicTx, 600_000);

        // Instruction 1: Create slab account (owned by Percolator program)
        atomicTx.add(
          SystemProgram.createAccount({
            fromPubkey: payer,
            newAccountPubkey: slabKeypair.publicKey,
            lamports: slabLamports,
            space: slabBytes,
            programId,
          })
        );

        // Instruction 2: Create vault token account (owned by SPL Token)
        atomicTx.add(
          SystemProgram.createAccount({
            fromPubkey: payer,
            newAccountPubkey: vaultKeypair.publicKey,
            lamports: vaultLamports,
            space: vaultSpace,
            programId: TOKEN_PROGRAM_ID,
          })
        );

        // Instruction 3: Initialize vault as SPL token account
        atomicTx.add(
          createInitializeAccountInstruction(vaultKeypair.publicKey, mint, vaultAuthority)
        );

        // Instruction 4 (conditional): Create payer ATA if it doesn't exist
        if (!ataInfo) {
          atomicTx.add(
            createAssociatedTokenAccountInstruction(payer, dummyAta, payer, mint)
          );
        }

        // Instruction 5: InitMarket — the core program call
        atomicTx.add(initMarketIx);

        // Send as ONE atomic transaction — all or nothing
        const coreSig = await wallet.sendTransaction(atomicTx, connection, {
          signers: [slabKeypair, vaultKeypair],
        });
        await connection.confirmTransaction(coreSig);
        sigs.push(coreSig);
        setLaunchSigs([...sigs]);
        await receipt(coreSig, "Create Market (atomic: slab + vault + init)", slabKeypair.publicKey.toBase58());
      } else {
        // Slab exists — we're resuming a previous launch
        sigs.push("(resumed — slab already exists)");
        setLaunchSigs([...sigs]);
      }

      // ==============================================================
      //  PHASE 2 — Oracle Authority (if authority mode)
      //  These are cheap operations, no risk of losing significant SOL.
      // ==============================================================
      if (form.oracleMode === "authority") {
        txStep++; setLaunchStep(txStep);

        // Always call SetOracleAuthority — it's idempotent (just writes the pubkey).
        // Costs only a tx fee (<0.000005 SOL) and is safe to re-run on resume.
        // Previous approach of reading raw slab bytes was fragile (wrong offset caused bugs).
        const authorityPk = new PublicKey(form.oracleAuthorityPubkey || payer.toBase58());
        const setAuthIx = buildSetOracleAuthorityIx(
          { programId, slab: slabKeypair.publicKey },
          payer,
          authorityPk,
        );
        const setAuthTx = new Transaction().add(setAuthIx);
        addComputeBudget(setAuthTx, 200_000);
        const setAuthSig = await wallet.sendTransaction(setAuthTx, connection);
        await connection.confirmTransaction(setAuthSig);
        sigs.push(setAuthSig);
        setLaunchSigs([...sigs]);
        await receipt(setAuthSig, "Set Oracle Authority", slabKeypair.publicKey.toBase58());

        // Push initial price (always push if we have one)
        if (form.initialPrice) {
          const priceE6 = BigInt(Math.floor(parseFloat(form.initialPrice) * 1_000_000));
          const ts = BigInt(Math.floor(Date.now() / 1000));
          const pushIx = buildPushOraclePriceIx(
            { programId, slab: slabKeypair.publicKey },
            payer,
            priceE6,
            ts,
          );
          const pushTx = new Transaction().add(pushIx);
          addComputeBudget(pushTx, 200_000);
          const pushSig = await wallet.sendTransaction(pushTx, connection);
          await connection.confirmTransaction(pushSig);
          sigs.push(pushSig);
          setLaunchSigs([...sigs]);
          await receipt(pushSig, "Push Initial Price", slabKeypair.publicKey.toBase58());
        }
      }

      // ==============================================================
      //  PHASE 3 — Create matcher context + Init Matcher + InitLP
      // ==============================================================
      txStep++; setLaunchStep(txStep);
      {
        const matcherProgId = new PublicKey(form.matcherProgramId);

        // Check if matcher context already exists (resume check)
        const existingCtx = await connection.getAccountInfo(matcherCtxKeypair.publicKey);

        if (!existingCtx) {
          const ctxSpace = 320;
          const ctxLamports = await connection.getMinimumBalanceForRentExemption(ctxSpace);
          const createCtxTx = new Transaction().add(
            SystemProgram.createAccount({
              fromPubkey: payer,
              newAccountPubkey: matcherCtxKeypair.publicKey,
              lamports: ctxLamports,
              space: ctxSpace,
              programId: matcherProgId,
            })
          );
          const ctxSig = await wallet.sendTransaction(createCtxTx, connection, { signers: [matcherCtxKeypair] });
          await connection.confirmTransaction(ctxSig);
          sigs.push(ctxSig);
          setLaunchSigs([...sigs]);
          await receipt(ctxSig, "Create Matcher Context", slabKeypair.publicKey.toBase58());
        } else {
          sigs.push("(resumed — matcher context already exists)");
          setLaunchSigs([...sigs]);
        }

        // Derive LP PDA for matcher init (LP will be index 0)
        const [lpPda] = deriveLpPda(programId, slabKeypair.publicKey, 0);

        // Initialize matcher context (Tag 2 = InitVamm) — the only init instruction
        // Layout: [tag(1) | mode(1) | trading_fee_bps(4) | base_spread_bps(4) | max_total_bps(4) |
        //          impact_k_bps(4) | liquidity_notional_e6(16) | max_fill_abs(16) | max_inventory_abs(16)]
        const matcherMode = form.matcherMode === "propamm" ? 2 : form.matcherMode === "vamm" ? 1 : 0; // 0=Passive, 1=vAMM, 2=PropAMM
        const initVammData = Buffer.alloc(66);
        initVammData[0] = 2; // Tag 2 = InitVamm
        initVammData[1] = matcherMode;
        // For Passive mode: use passiveSpreadBps as both trading fee and base spread
        const spreadBps = parseInt(form.passiveSpreadBps) || 50;
        // trading_fee_bps (offset 2, u32 LE)
        initVammData.writeUInt32LE(
          matcherMode >= 1 ? (parseInt(form.vammTradingFeeBps) || 10) : spreadBps,
          2
        );
        // base_spread_bps (offset 6, u32 LE)
        initVammData.writeUInt32LE(
          matcherMode >= 1 ? (parseInt(form.vammBaseSpreadBps) || 50) : spreadBps,
          6
        );
        // max_total_bps (offset 10, u32 LE)
        initVammData.writeUInt32LE(
          matcherMode >= 1 ? (parseInt(form.vammMaxTotalBps) || 500) : 500,
          10
        );
        // impact_k_bps (offset 14, u32 LE) - only for vAMM mode
        initVammData.writeUInt32LE(
          matcherMode >= 1 ? (parseInt(form.vammImpactKBps) || 0) : 0,
          14
        );
        // liquidity_notional_e6 (offset 18, u128 LE as 16 bytes)
        {
          const liq = BigInt(matcherMode >= 1 ? (form.vammLiquidityE6 || "0") : "0");
          const buf = Buffer.alloc(16);
          buf.writeBigUInt64LE(liq & BigInt("0xFFFFFFFFFFFFFFFF"), 0);
          buf.writeBigUInt64LE(liq >> 64n, 8);
          initVammData.set(buf, 18);
        }
        // max_fill_abs (offset 34, u128 LE) - large default
        {
          const maxFill = BigInt("1000000000000"); // 1 trillion
          const buf = Buffer.alloc(16);
          buf.writeBigUInt64LE(maxFill & BigInt("0xFFFFFFFFFFFFFFFF"), 0);
          buf.writeBigUInt64LE(maxFill >> 64n, 8);
          initVammData.set(buf, 34);
        }
        // max_inventory_abs (offset 50, u128 LE) - 0 = no limit
        // Already zero from Buffer.alloc

        const initVammIx = {
          programId: matcherProgId,
          keys: [
            { pubkey: lpPda, isSigner: false, isWritable: false },
            { pubkey: matcherCtxKeypair.publicKey, isSigner: false, isWritable: true },
          ],
          data: initVammData,
        };

        const initMatcherTx = new Transaction().add(initVammIx);
        addComputeBudget(initMatcherTx, 100_000);
        const initMatcherSig = await wallet.sendTransaction(initMatcherTx, connection);
        await connection.confirmTransaction(initMatcherSig);
        sigs.push(initMatcherSig);
        setLaunchSigs([...sigs]);
        await receipt(initMatcherSig, "Init Matcher Context", slabKeypair.publicKey.toBase58());

        // InitLP
        const initLpParams = {
          programId,
          slab: slabKeypair.publicKey,
          oracle: new PublicKey(form.oracleAccount),
          matcherProgramId: matcherProgId,
          matcherContext: matcherCtxKeypair.publicKey,
        };
        // LP funding = newAccountFee (goes to insurance) + lpSeedCapital (becomes LP capital for trades)
        // Without the excess, the LP has ZERO capital and all trades fail with EngineUndercollateralized
        const lpFunding = BigInt(form.newAccountFee) + BigInt(form.lpSeedCapital || "100000000");
        const lpIx = await buildInitLPIx(connection, initLpParams, payer, lpFunding);
        const lpTx = new Transaction().add(lpIx);
        addComputeBudget(lpTx, 200_000);
        const lpSig = await wallet.sendTransaction(lpTx, connection);
        await connection.confirmTransaction(lpSig);
        sigs.push(lpSig);
        setLaunchSigs([...sigs]);
        await receipt(lpSig, "Init LP", slabKeypair.publicKey.toBase58());
      }

      // ==============================================================
      //  PHASE 4 — Burn Admin Key (if adminless mode selected)
      // ==============================================================
      if (form.adminMode === "adminless") {
        // Safety check: cannot burn admin if oracle mode is authority (requires oracle authority)
        if (form.oracleMode === "authority") {
          throw new Error("Cannot make market adminless when using Authority oracle mode. Switch to Pyth/Chainlink first, or keep admin mode as 'Upgradeable'.");
        }

        txStep++; setLaunchStep(txStep);

        // Read current admin before burn
        const slabDataBefore = await fetchSlab(connection, slabKeypair.publicKey);
        const headerBefore = parseHeader(slabDataBefore);
        const adminBefore = headerBefore.admin.toBase58();

        // Burn admin key: set to PublicKey.default() (all zeros)
        const zeroAdmin = PublicKey.default;
        const burnAdminIx = buildUpdateAdminIx(
          { programId, slab: slabKeypair.publicKey },
          payer,
          zeroAdmin,
        );
        const burnTx = new Transaction().add(burnAdminIx);
        addComputeBudget(burnTx, 50_000);
        const burnSig = await wallet.sendTransaction(burnTx, connection);
        await connection.confirmTransaction(burnSig);
        sigs.push(burnSig);
        setLaunchSigs([...sigs]);

        // Verify burn succeeded
        const slabDataAfter = await fetchSlab(connection, slabKeypair.publicKey);
        const headerAfter = parseHeader(slabDataAfter);
        const adminAfter = headerAfter.admin.toBase58();
        
        if (adminAfter !== zeroAdmin.toBase58()) {
          throw new Error(`Admin burn failed: expected ${zeroAdmin.toBase58()}, got ${adminAfter}`);
        }

        // Create receipt with before/after info in action description
        await receipt(burnSig, `Burn Admin Key (Adminless) - Before: ${adminBefore.slice(0, 8)}...${adminBefore.slice(-8)}, After: ${zeroAdmin.toBase58()}`, slabKeypair.publicKey.toBase58());
      }

      // ==============================================================
      //  DONE — Save market & redirect
      // ==============================================================
      setLaunchStep(TOTAL_STEPS);
      setLaunchedMarketId(slabKeypair.publicKey.toBase58());

      // Clean up session keypairs
      try { sessionStorage.removeItem("sov_launch_keypairs"); } catch {}

      // Save to localStorage
      const marketInfo: DevnetMarketInfo = {
        network: "devnet",
        slab: slabKeypair.publicKey.toBase58(),
        programId: tierProgramId,
        matcherProgramId: form.matcherProgramId,
        oracle: form.oracleAccount,
        oracleType: form.oracleMode,
        mint: form.collateralMint,
        vault: vaultKeypair.publicKey.toBase58(),
        createdAt: new Date().toISOString(),
      };
      try {
        const existing = JSON.parse(localStorage.getItem("sov_devnet_markets") || "[]");
        existing.unshift(marketInfo);
        localStorage.setItem("sov_devnet_markets", JSON.stringify(existing));
      } catch {}

    } catch (e) {
      const stepNames = form.oracleMode === "authority"
        ? form.adminMode === "adminless"
          ? ["Create Market (atomic: slab + vault + init)", "Set Oracle Authority + Push Price", "Create Matcher + Init LP", "Burn Admin Key"]
          : ["Create Market (atomic: slab + vault + init)", "Set Oracle Authority + Push Price", "Create Matcher + Init LP"]
        : form.adminMode === "adminless"
          ? ["Create Market (atomic: slab + vault + init)", "Create Matcher + Init LP", "Burn Admin Key"]
          : ["Create Market (atomic: slab + vault + init)", "Create Matcher + Init LP"];
      const failedStep = stepNames[txStep - 1] || `Step ${txStep}`;
      // Extract meaningful error from Solana tx errors
      let msg = "Unknown error";
      if (e instanceof Error) {
        msg = e.message;
        // Try to extract program logs from SendTransactionError
        const anyErr = e as unknown as Record<string, unknown>;
        if (anyErr.logs && Array.isArray(anyErr.logs)) {
          const programErrors = (anyErr.logs as string[]).filter(
            (l: string) => l.includes("Error") || l.includes("failed") || l.includes("custom program error")
          );
          if (programErrors.length > 0) {
            msg += "\n\nProgram logs:\n" + programErrors.join("\n");
          }
        }
        // Extract error code if available
        if (anyErr.code) {
          msg += `\n\nError code: ${anyErr.code}`;
        }
        // Extract instruction error if available
        if (anyErr.err) {
          msg += `\n\nTransaction error: ${JSON.stringify(anyErr.err, null, 2)}`;
        }
        // For SendTransactionError, try to get simulation logs
        if (anyErr.simulationResponse) {
          const simResp = anyErr.simulationResponse as Record<string, unknown>;
          if (simResp.logs && Array.isArray(simResp.logs)) {
            const simLogs = (simResp.logs as string[]).filter(
              (l: string) => l.includes("Error") || l.includes("failed") || l.includes("custom program error")
            );
            if (simLogs.length > 0) {
              msg += "\n\nSimulation logs:\n" + simLogs.join("\n");
            }
          }
        }
      } else {
        msg = String(e);
      }
      setLaunchError(`${failedStep} failed:\n\n${msg}`);
    } finally {
      setLaunching(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Quick Launch                                                       */
  /* ------------------------------------------------------------------ */

  const handleQuickLaunch = () => {
    const collMint = quickUseCustom ? quickCustomMint : quickMint;
    if (!collMint || !wallet.publicKey) return;

    // Map quick size directly to SLAB_TIERS index
    const tierIdx = QUICK_SIZES[quickSizeIdx]?.tierIdx ?? 0;

    // Populate the full wizard form with sensible defaults
    const baseForm: WizardState = {
      ...INITIAL_STATE,
      marketName: quickName || "My Market",
      collateralMint: collMint,
      oracleMode: "authority",
      oracleAccount: wallet.publicKey.toBase58(), // dummy, authority mode uses wallet
      oracleAuthorityPubkey: wallet.publicKey.toBase58(),
      initialPrice: quickPrice || "1.00",
      inverted: false,
      slabTierIdx: tierIdx >= 0 ? tierIdx : 0,
      matcherMode: "passive",
      matcherProgramId: DEVNET.matcherProgramId,
      passiveSpreadBps: String(DEVNET.defaultPassiveSpreadBps),
      maintenanceMarginBps: String(DEFAULTS.maintenanceMarginBps),
      initialMarginBps: String(DEFAULTS.initialMarginBps),
      tradingFeeBps: String(DEFAULTS.tradingFeeBps),
      maxCrankStalenessSlots: String(DEFAULTS.maxCrankStalenessSlots),
      liquidationFeeBps: String(DEFAULTS.liquidationFeeBps),
      liquidationBufferBps: String(DEFAULTS.liquidationBufferBps),
      warmupPeriodSlots: String(DEFAULTS.warmupPeriodSlots),
      newAccountFee: DEFAULTS.newAccountFee,
      lpSeedCapital: "100000000", // 100M raw units — gives LP capital to back trades
      unitScale: "0",
      confFilterBps: String(DEFAULTS.confFilterBps),
      maxStalenessSecs: String(DEFAULTS.maxStalenessSecs),
    };
    
    // Apply Thin Market Safe Mode preset if enabled
    const quickForm: WizardState = quickThinMarketMode
      ? { ...baseForm, ...THIN_MARKET_PRESET }
      : baseForm;

    setForm(quickForm);
    setStep(7); // Jump to Execute step
    pendingQuickLaunchRef.current = true;
  };

  // Auto-trigger execution when Quick Launch populates the form
  useEffect(() => {
    if (pendingQuickLaunchRef.current && step === 7 && !launching) {
      pendingQuickLaunchRef.current = false;
      executeLaunch();
    }
  }, [step, launching]); // eslint-disable-line react-hooks/exhaustive-deps

  const quickCanLaunch =
    !!wallet.publicKey &&
    (solBalance ?? 0) >= estimatedTotalSol &&
    !!(quickUseCustom ? quickCustomMint : quickMint) &&
    !!quickPrice;

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  const canProceed = (s: number): boolean => {
    switch (s) {
      case 0: return !!wallet.publicKey && (solBalance ?? 0) >= estimatedTotalSol;
      case 1: return !!form.collateralMint;
      case 2: {
        if (form.oracleMode === "pyth") return !!form.oracleAccount && !!form.pythFeedId;
        // Authority + Chainlink both need initial price (Hyperp mode on-chain)
        if (form.oracleMode === "chainlink") return !!form.oracleAccount && !!form.initialPrice;
        return !!form.initialPrice; // authority
      }
      case 3: return true;
      case 4: return !!form.matcherProgramId;
      case 5: {
        const riskValid = !!form.maintenanceMarginBps && !!form.initialMarginBps;
        // If adminless mode, require "BURN" confirmation and oracle must not be authority
        if (form.adminMode === "adminless") {
          return riskValid && form.burnAdminConfirm === "BURN" && form.oracleMode !== "authority";
        }
        return riskValid;
      }
      case 6: return true; // cost breakdown is informational
      case 7: return false; // execute step
      default: return false;
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[1100px] mx-auto p-4 lg:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-bold text-white tracking-tight">Launch Market</h2>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  DEVNET
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">
                Deploy a permissionless perpetual futures market. Costs computed live from RPC.
              </p>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => { setLaunchMode("quick"); setStep(0); }}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition ${
              launchMode === "quick"
                ? "bg-emerald-600 text-white"
                : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Quick Launch
          </button>
          <button
            onClick={() => { setLaunchMode("advanced"); setStep(0); }}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition ${
              launchMode === "advanced"
                ? "bg-emerald-600 text-white"
                : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Advanced Wizard
          </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/*  QUICK LAUNCH MODE                                           */}
        {/* ============================================================ */}
        {launchMode === "quick" && step < 7 && (
          <div className="flex gap-4">
            {/* Left: Quick form */}
            <div className="flex-1 min-w-0 space-y-4">
              {/* Wallet check */}
              {!wallet.publicKey && (
                <div className="p-4 rounded-lg bg-amber-500/[0.05] border border-amber-500/20">
                  <p className="text-[11px] text-amber-400">Connect your wallet to continue.</p>
                </div>
              )}

              {/* Market Name */}
              <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-4">
                <label className="block text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Market Name</label>
                <input
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  placeholder="e.g. SOL-PERP, BTC-PERP, DOGE-PERP"
                  className="w-full bg-black/30 border border-white/[0.06] rounded px-3 py-2 text-[12px] text-white placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/30"
                />
                <p className="text-[9px] text-zinc-700 mt-1">Display name for your market. Can be anything.</p>
              </div>

              {/* Collateral Token */}
              <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-4">
                <label className="block text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Collateral Token</label>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => { setQuickUseCustom(false); setQuickMint(DEVNET.wrappedSolMint); }}
                    className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-medium transition border ${
                      !quickUseCustom
                        ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-400"
                        : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Wrapped SOL (default)
                  </button>
                  <button
                    onClick={() => setQuickUseCustom(true)}
                    className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-medium transition border ${
                      quickUseCustom
                        ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-400"
                        : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Custom Token
                  </button>
                </div>
                {quickUseCustom && (
                  <div className="space-y-2">
                    <input
                      value={quickCustomMint}
                      onChange={(e) => setQuickCustomMint(e.target.value)}
                      placeholder="Paste token mint address..."
                      className="w-full bg-black/30 border border-white/[0.06] rounded px-3 py-2 text-[11px] text-white font-mono placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/30"
                    />
                    <a
                      href="/app/devnet/mint"
                      target="_blank"
                      className="inline-block text-[10px] text-emerald-600 hover:text-emerald-400 transition"
                    >
                      Create Custom Token &rarr;
                    </a>
                  </div>
                )}
                {!quickUseCustom && (
                  <p className="text-[9px] text-zinc-700">
                    Wrapped SOL ({DEVNET.wrappedSolMint.slice(0, 6)}...): Deposit SOL and it wraps automatically.
                  </p>
                )}
              </div>

              {/* Initial Price */}
              <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-4">
                <label className="block text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Initial Price (USD)</label>
                <input
                  value={quickPrice}
                  onChange={(e) => setQuickPrice(e.target.value)}
                  type="number"
                  step="0.01"
                  min="0.0001"
                  placeholder="e.g. 1.00"
                  className="w-full bg-black/30 border border-white/[0.06] rounded px-3 py-2 text-[12px] text-white placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/30"
                />
                <p className="text-[9px] text-zinc-700 mt-1">
                  Starting price in USD. You are the oracle authority — you can push new prices anytime after launch.
                </p>
              </div>

              {/* Market Size */}
              <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-4">
                <label className="block text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Market Size</label>
                <div className="grid grid-cols-3 gap-2">
                  {/* Thin Market Safe Mode Toggle */}
                  <div className="col-span-full mb-2 p-3 rounded-lg border border-white/[0.04] bg-white/[0.01]">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={quickThinMarketMode}
                        onChange={(e) => setQuickThinMarketMode(e.target.checked)}
                        className="w-4 h-4 rounded border-white/[0.1] bg-white/[0.05] text-emerald-600 focus:ring-emerald-500/20"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-white">Thin Market Safe Mode</span>
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            PROTECTED
                          </span>
                        </div>
                        <p className="text-[9px] text-zinc-600 mt-0.5">
                          Higher spreads, stronger skew sensitivity, stricter oracle divergence, stricter crank freshness, lower max leverage. Markets can graduate as liquidity deepens.
                        </p>
                      </div>
                    </label>
                  </div>

                  {QUICK_SIZES.map((s, i) => {
                    const rent = tierRents[s.tierIdx];
                    const rentSol = rent ? (rent / LAMPORTS_PER_SOL).toFixed(1) : "...";
                    return (
                      <button
                        key={i}
                        onClick={() => { setQuickSizeIdx(i); setForm(f => ({ ...f, slabTierIdx: s.tierIdx })); }}
                        className={`p-3 rounded-lg text-center transition border ${
                          quickSizeIdx === i
                            ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                            : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                        }`}
                      >
                        <div className={`text-[13px] font-bold ${quickSizeIdx === i ? "text-emerald-400" : "text-zinc-400"}`}>
                          {s.label}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono">{s.maxAccounts} slots</div>
                        <div className={`text-[12px] font-bold font-mono mt-1 ${quickSizeIdx === i ? "text-emerald-300" : "text-zinc-500"}`}>
                          ~{rentSol} SOL
                        </div>
                        <div className="text-[9px] text-zinc-700 mt-0.5">{s.desc}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] text-zinc-700 mt-2">
                  Each size uses a different on-chain program (compiled with different capacity). Smaller = cheaper rent.
                </p>
              </div>

              {/* SOL Balance + Airdrop */}
              {wallet.publicKey && (solBalance ?? 0) < estimatedTotalSol && (
                <div className="p-4 rounded-lg bg-amber-500/[0.04] border border-amber-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-amber-400 font-medium">Insufficient SOL</span>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {solBalance?.toFixed(2) ?? "0"} / ~{estimatedTotalSol.toFixed(2)} SOL needed
                    </span>
                  </div>
                  <button
                    onClick={handleAirdrop}
                    disabled={airdropping || airdropCooldown > 0}
                    className="w-full px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg text-[11px] font-semibold text-white transition"
                  >
                    {airdropping ? "Requesting..." : airdropCooldown > 0 ? `Wait ${airdropCooldown}s` : `Airdrop ${airdropAmount} SOL`}
                  </button>
                  {showFaucets && (
                    <div className="mt-2 space-y-1">
                      {WEB_FAUCETS.map((f) => (
                        <a key={f.name} href={f.url} target="_blank" rel="noopener noreferrer" className="block text-[9px] text-emerald-600 hover:text-emerald-400">
                          {f.name} &rarr;
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Launch button */}
              <button
                onClick={handleQuickLaunch}
                disabled={!quickCanLaunch || launching}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-[13px] font-bold text-white transition"
              >
                {launching ? "Launching..." : "Launch Market"}
              </button>

              {/* SOL protection notice */}
              <p className="text-[9px] text-center text-zinc-700">
                All accounts created in a single atomic transaction. If anything fails, your SOL is returned.
              </p>
            </div>

            {/* Right: Cost & preset panel */}
            <div className="w-[280px] shrink-0 hidden lg:block">
              <div className="sticky top-14 space-y-3">
                {/* Cost */}
                <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-2">Estimated Cost</p>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-zinc-600">Slab ({Math.round(selectedTier.bytes / 1024)} KB)</span>
                      <span className="text-zinc-400 font-mono">{slabRent > 0 ? (slabRent / LAMPORTS_PER_SOL).toFixed(4) : "..."}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600">Vault + ATA</span>
                      <span className="text-zinc-400 font-mono">{vaultRent > 0 ? (vaultRent / LAMPORTS_PER_SOL).toFixed(4) : "..."}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600">Matcher</span>
                      <span className="text-zinc-400 font-mono">{matcherCtxRent > 0 ? (matcherCtxRent / LAMPORTS_PER_SOL).toFixed(4) : "..."}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600">Tx fees</span>
                      <span className="text-zinc-400 font-mono">~0.01</span>
                    </div>
                    <div className="border-t border-white/[0.06] pt-1 mt-1 flex justify-between font-semibold">
                      <span className="text-zinc-400">Total</span>
                      <span className="text-emerald-400 font-mono">{estimatedTotalSol.toFixed(4)} SOL</span>
                    </div>
                  </div>
                </div>

                {/* Balance */}
                <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-1">Your Balance</p>
                  <p className={`text-[14px] font-mono font-bold ${(solBalance ?? 0) >= estimatedTotalSol ? "text-emerald-400" : "text-red-400"}`}>
                    {solBalance?.toFixed(4) ?? "—"} SOL
                  </p>
                </div>

                {/* Preset info */}
                <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-2">Preset Configuration</p>
                  <div className="space-y-1.5 text-[10px]">
                    <div className="flex justify-between"><span className="text-zinc-600">Oracle</span><span className="text-zinc-400">Authority (you)</span></div>
                    <div className="flex justify-between"><span className="text-zinc-600">Matcher</span><span className="text-zinc-400">Passive</span></div>
                    <div className="flex justify-between"><span className="text-zinc-600">Spread</span><span className="text-zinc-400">{DEVNET.defaultPassiveSpreadBps} bps ({(DEVNET.defaultPassiveSpreadBps / 100).toFixed(1)}%)</span></div>
                    <div className="flex justify-between"><span className="text-zinc-600">Trade fee</span><span className="text-zinc-400">{DEFAULTS.tradingFeeBps} bps ({(Number(DEFAULTS.tradingFeeBps) / 100).toFixed(1)}%)</span></div>
                    <div className="flex justify-between"><span className="text-zinc-600">Init margin</span><span className="text-zinc-400">{DEFAULTS.initialMarginBps} bps ({(Number(DEFAULTS.initialMarginBps) / 100).toFixed(0)}%)</span></div>
                    <div className="flex justify-between"><span className="text-zinc-600">Maint margin</span><span className="text-zinc-400">{DEFAULTS.maintenanceMarginBps} bps ({(Number(DEFAULTS.maintenanceMarginBps) / 100).toFixed(0)}%)</span></div>
                    <div className="flex justify-between"><span className="text-zinc-600">Liq fee</span><span className="text-zinc-400">{DEFAULTS.liquidationFeeBps} bps</span></div>
                    <div className="flex justify-between"><span className="text-zinc-600">Crank stale</span><span className="text-zinc-400">{DEFAULTS.maxCrankStalenessSlots} slots</span></div>
                    <div className="flex justify-between"><span className="text-zinc-600">LP seed capital</span><span className="text-zinc-400 font-mono">100M raw</span></div>
                  </div>
                  <button
                    onClick={() => { setLaunchMode("advanced"); setStep(0); }}
                    className="mt-3 text-[9px] text-emerald-600 hover:text-emerald-400 transition"
                  >
                    Customize all parameters &rarr;
                  </button>
                </div>

                {/* How it works */}
                <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-2">How It Works</p>
                  <ol className="space-y-1 text-[9px] text-zinc-600">
                    <li>1. One atomic transaction creates slab + vault + market</li>
                    <li>2. Oracle authority set to your wallet (push prices anytime)</li>
                    <li>3. Matcher + LP initialized for trading</li>
                    <li>4. You land on the Proof Page to verify and trade</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Launch: show execution UI when launching */}
        {launchMode === "quick" && step === 7 && (
          <div className="max-w-[700px]">
            <StepExecute
              launching={launching}
              launchStep={launchStep}
              launchError={launchError}
              launchSigs={launchSigs}
              launchedMarketId={launchedMarketId}
              cluster={cluster}
              form={form}
              onLaunch={executeLaunch}
              onGoToMarket={() => {
                if (launchedMarketId) router.push(`/app/devnet/markets/${launchedMarketId}`);
              }}
            />
            {!launchedMarketId && !launching && launchError && (
              <button
                onClick={() => setStep(0)}
                className="mt-3 px-4 py-2 bg-white/[0.04] hover:bg-white/[0.07] rounded-lg text-[11px] text-zinc-400 transition"
              >
                Back to Quick Launch
              </button>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/*  ADVANCED WIZARD MODE                                        */}
        {/* ============================================================ */}
        {launchMode === "advanced" && (
          <>
            {/* Step indicator */}
            <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
              {STEP_LABELS.map((label, i) => (
                <button
                  key={i}
                  onClick={() => { if (i <= step) setStep(i); }}
                  disabled={i > step}
                  className={`px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap transition ${
                    i === step
                      ? "bg-emerald-600 text-white"
                      : i < step
                        ? "bg-white/[0.06] text-zinc-400 hover:text-white"
                        : "bg-white/[0.02] text-zinc-700"
                  }`}
                >
                  {i + 1}. {label}
                </button>
              ))}
            </div>

            {/* Two-column: form + sticky panel */}
            <div className="flex gap-4">
              {/* Left: Step content */}
              <div className="flex-1 min-w-0">
                <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-5 mb-4">
                  {step === 0 && (
                    <StepPreconditions
                      wallet={wallet}
                      solBalance={solBalance}
                      estimatedSol={estimatedTotalSol}
                      airdropping={airdropping}
                      airdropError={airdropError}
                      airdropCooldown={airdropCooldown}
                      airdropAmount={airdropAmount}
                      showFaucets={showFaucets}
                      pollingBalance={pollingBalance}
                      onAirdropAmountChange={setAirdropAmount}
                      onAirdrop={handleAirdrop}
                    />
                  )}
                  {step === 1 && <StepIdentity form={form} set={set} />}
                  {step === 2 && <StepOracle form={form} set={set} walletKey={wallet.publicKey?.toBase58()} />}
                  {step === 3 && <StepSlabTier form={form} set={set} slabRent={slabRent} tierRents={tierRents} />}
                  {step === 4 && <StepMatcher form={form} set={set} />}
                  {step === 5 && <StepRisk form={form} set={set} />}
                  {step === 6 && (
                    <StepCostBreakdown
                      tier={selectedTier}
                      slabRent={slabRent}
                      vaultRent={vaultRent}
                      matcherCtxRent={matcherCtxRent}
                    />
                  )}
                  {step === 7 && (
                    <StepExecute
                      launching={launching}
                      launchStep={launchStep}
                      launchError={launchError}
                      launchSigs={launchSigs}
                      launchedMarketId={launchedMarketId}
                      cluster={cluster}
                      form={form}
                      onLaunch={executeLaunch}
                      onGoToMarket={() => {
                        if (launchedMarketId) router.push(`/app/devnet/markets/${launchedMarketId}`);
                      }}
                    />
                  )}
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setStep(Math.max(0, step - 1))}
                    disabled={step === 0}
                    className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.07] disabled:opacity-30 rounded-lg text-[11px] text-zinc-400 transition"
                  >
                    Back
                  </button>
                  {step < TOTAL_STEPS - 1 ? (
                    <button
                      onClick={() => setStep(step + 1)}
                      disabled={!canProceed(step)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-[11px] font-semibold text-white transition"
                    >
                      Continue
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Right: Sticky summary panel */}
              <div className="w-[260px] shrink-0 hidden lg:block">
                <div className="sticky top-14 space-y-3">
                  {/* Current step */}
                  <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
                    <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-2">Current Step</p>
                    <p className="text-[12px] font-semibold text-white">{step + 1}. {STEP_LABELS[step]}</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">Step {step + 1} of {TOTAL_STEPS}</p>
                  </div>

                  {/* Cost estimate */}
                  <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
                    <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-2">Estimated Cost</p>
                    <div className="space-y-1 text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-zinc-600">Slab ({Math.round(selectedTier.bytes / 1024)} KB)</span>
                        <span className="text-zinc-400 font-mono">{slabRent > 0 ? (slabRent / LAMPORTS_PER_SOL).toFixed(4) : "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-600">Vault</span>
                        <span className="text-zinc-400 font-mono">{vaultRent > 0 ? (vaultRent / LAMPORTS_PER_SOL).toFixed(4) : "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-600">Matcher Ctx</span>
                        <span className="text-zinc-400 font-mono">{matcherCtxRent > 0 ? (matcherCtxRent / LAMPORTS_PER_SOL).toFixed(4) : "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-600">Tx fees ~</span>
                        <span className="text-zinc-400 font-mono">0.0100</span>
                      </div>
                      <div className="border-t border-white/[0.06] pt-1 mt-1 flex justify-between font-semibold">
                        <span className="text-zinc-400">Total</span>
                        <span className="text-emerald-400 font-mono">{estimatedTotalSol.toFixed(4)} SOL</span>
                      </div>
                    </div>
                    <p className="text-[8px] text-zinc-700 mt-2">
                      {totalRentLamports > 0
                        ? `Computed live from RPC${rentFetchedAt ? ` at ${rentFetchedAt}` : ""}`
                        : "Cost unavailable — RPC not responding"}
                    </p>
                  </div>

                  {/* Balance */}
                  <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
                    <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-1">Your Balance</p>
                    <p className={`text-[13px] font-mono font-bold ${(solBalance ?? 0) >= estimatedTotalSol ? "text-emerald-400" : "text-red-400"}`}>
                      {solBalance?.toFixed(4) ?? "—"} SOL
                    </p>
                    {(solBalance ?? 0) < estimatedTotalSol && (
                      <button
                        onClick={handleAirdrop}
                        disabled={airdropping || airdropCooldown > 0}
                        className="mt-2 w-full px-2 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-[10px] font-semibold text-white transition"
                      >
                        {airdropping ? "Airdropping…" : airdropCooldown > 0 ? `Wait ${airdropCooldown}s` : `Request ${airdropAmount} SOL Airdrop`}
                      </button>
                    )}
                  </div>

                  {/* Config summary */}
                  {form.marketName && (
                    <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
                      <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-2">Config</p>
                      <div className="space-y-1 text-[10px]">
                        {form.marketName && <div className="text-zinc-400">{form.marketName}</div>}
                        <div className="text-zinc-600">Oracle: <span className="text-zinc-400 uppercase">{form.oracleMode}</span></div>
                        <div className="text-zinc-600">Tier: <span className="text-zinc-400">{selectedTier.label} ({selectedTier.maxAccounts} accts)</span></div>
                        <div className="text-zinc-600">Matcher: <span className="text-zinc-400">{form.matcherMode}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step Components                                                    */
/* ------------------------------------------------------------------ */

function StepPreconditions({
  wallet,
  solBalance,
  estimatedSol,
  airdropping,
  airdropError,
  airdropCooldown,
  airdropAmount,
  showFaucets,
  pollingBalance,
  onAirdropAmountChange,
  onAirdrop,
}: {
  wallet: ReturnType<typeof useWallet>;
  solBalance: number | null;
  estimatedSol: number;
  airdropping: boolean;
  airdropError: string | null;
  airdropCooldown: number;
  airdropAmount: number;
  showFaucets: boolean;
  pollingBalance: boolean;
  onAirdropAmountChange: (v: number) => void;
  onAirdrop: () => void;
}) {
  const checks = [
    { label: "Wallet connected", ok: !!wallet.publicKey },
    { label: "Cluster = devnet", ok: true },
    { label: "Config loaded", ok: true },
    { label: `SOL balance >= ${estimatedSol.toFixed(3)} SOL`, ok: (solBalance ?? 0) >= estimatedSol },
  ];

  const cliCmd = getAirdropCliCommand(wallet.publicKey?.toBase58() ?? "<address>", airdropAmount);
  const [cliCopied, setCliCopied] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-zinc-500">Verify prerequisites before launching.</p>
      <div className="space-y-2">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-2">
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
              c.ok ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
            }`}>
              {c.ok ? "✓" : "✗"}
            </span>
            <span className={`text-[11px] ${c.ok ? "text-zinc-300" : "text-zinc-500"}`}>{c.label}</span>
          </div>
        ))}
      </div>
      {wallet.publicKey && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500">Balance:</span>
            <span className="text-[13px] text-zinc-200 font-mono font-bold">{solBalance?.toFixed(4) ?? "…"} SOL</span>
          </div>

          {/* Airdrop controls */}
          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] space-y-2">
            <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold">Devnet Airdrop</p>
            <div className="flex items-center gap-2">
              {/* Amount selector */}
              <div className="flex items-center gap-1">
                {[0.5, 1, 2].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => onAirdropAmountChange(amt)}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition ${
                      airdropAmount === amt
                        ? "bg-amber-600 text-white"
                        : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {amt} SOL
                  </button>
                ))}
              </div>
              <button
                onClick={onAirdrop}
                disabled={airdropping || airdropCooldown > 0}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-[10px] font-semibold text-white transition"
              >
                {airdropping ? "Requesting…" : airdropCooldown > 0 ? `Wait ${airdropCooldown}s` : "Request Airdrop"}
              </button>
            </div>
            <p className="text-[9px] text-zinc-700">
              Auto-retries with backoff if rate-limited. Lower amounts succeed more often.
            </p>
          </div>

          {/* Web faucet fallback */}
          {(airdropError || showFaucets) && (
            <div className="p-3 rounded-lg bg-amber-500/[0.03] border border-amber-500/15 space-y-3">
              {airdropError && <p className="text-[10px] text-amber-400">{airdropError}</p>}

              {/* Polling indicator */}
              {pollingBalance && (
                <div className="flex items-center gap-2 p-2 rounded bg-emerald-500/[0.05] border border-emerald-500/15">
                  <div className="w-3 h-3 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                  <span className="text-[10px] text-emerald-400">Watching for balance change… fund your wallet and it will auto-detect.</span>
                </div>
              )}

              {/* Your address — copy first */}
              <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                <p className="text-[9px] text-zinc-600 mb-1">1. Copy your wallet address:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[10px] text-zinc-300 font-mono bg-white/[0.03] rounded px-2 py-1.5 truncate select-all">
                    {wallet.publicKey?.toBase58()}
                  </code>
                  <button
                    onClick={() => { if (wallet.publicKey) { navigator.clipboard.writeText(wallet.publicKey.toBase58()); setCliCopied(true); setTimeout(() => setCliCopied(false), 2000); } }}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-[9px] font-semibold text-white transition shrink-0"
                  >
                    {cliCopied ? "Copied!" : "Copy Address"}
                  </button>
                </div>
              </div>

              {/* Web faucets */}
              <div>
                <p className="text-[9px] text-zinc-600 mb-1.5">2. Open a faucet, paste your address, and request SOL:</p>
                <div className="space-y-1">
                  {WEB_FAUCETS.map((f) => (
                    <a
                      key={f.url}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => { if (wallet.publicKey) navigator.clipboard.writeText(wallet.publicKey.toBase58()); }}
                      className={`flex items-center justify-between px-3 py-2 rounded transition ${
                        (f as any).recommended
                          ? "bg-emerald-500/[0.06] border border-emerald-500/15 hover:bg-emerald-500/[0.1]"
                          : "bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04]"
                      }`}
                    >
                      <div>
                        <span className={`text-[11px] font-medium ${(f as any).recommended ? "text-emerald-400" : "text-zinc-300"}`}>
                          {f.name}
                        </span>
                        {(f as any).recommended && (
                          <span className="text-[8px] text-emerald-500 bg-emerald-500/10 px-1 py-0.5 rounded ml-1.5 font-bold uppercase">Recommended</span>
                        )}
                        <span className="text-[9px] text-zinc-600 block mt-0.5">{f.note}</span>
                      </div>
                      <span className="text-[10px] text-zinc-600 shrink-0">Open &rarr;</span>
                    </a>
                  ))}
                </div>
              </div>

              {/* CLI fallback */}
              <details className="group">
                <summary className="text-[9px] text-zinc-600 cursor-pointer hover:text-zinc-400 transition">
                  CLI Fallback (advanced)
                </summary>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="flex-1 text-[9px] text-zinc-400 font-mono bg-white/[0.03] rounded px-2 py-1.5 truncate">
                    {cliCmd}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(cliCmd); setCliCopied(true); setTimeout(() => setCliCopied(false), 2000); }}
                    className="px-2 py-1 bg-white/[0.06] hover:bg-white/[0.1] rounded text-[9px] text-zinc-400 transition shrink-0"
                  >
                    {cliCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </details>
            </div>
          )}
        </div>
      )}
      {!wallet.publicKey && (
        <p className="text-[10px] text-zinc-600">Connect your wallet to continue.</p>
      )}
    </div>
  );
}

function StepIdentity({ form, set }: { form: WizardState; set: (p: Partial<WizardState>) => void }) {
  const isWrappedSol = form.collateralMint === DEVNET.wrappedSolMint;
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-zinc-500">Define market identity and choose the collateral token for deposits.</p>
      <Field label="Market Name (display)" value={form.marketName} onChange={(v) => set({ marketName: v })} placeholder="e.g. SOL-PERP" />
      <Field label="Description (optional)" value={form.description} onChange={(v) => set({ description: v })} placeholder="Optional description" />

      {/* Collateral section */}
      <div className="space-y-2">
        <Field label="Collateral Mint" value={form.collateralMint} onChange={(v) => set({ collateralMint: v })} placeholder="SPL Token mint pubkey" mono />

        {/* Quick options */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => set({ collateralMint: DEVNET.wrappedSolMint })}
            className={`px-2.5 py-1 rounded text-[9px] font-semibold transition ${
              isWrappedSol
                ? "bg-emerald-600 text-white"
                : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Wrapped SOL (default)
          </button>
          <a
            href="/app/devnet/mint"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded bg-white/[0.04] text-[9px] text-zinc-400 hover:text-white hover:bg-white/[0.08] transition font-semibold"
          >
            Create Custom Token &rarr;
          </a>
        </div>

        {/* Explainer */}
        <div className={`p-2.5 rounded-lg border text-[10px] ${
          isWrappedSol
            ? "bg-emerald-500/[0.03] border-emerald-500/10 text-zinc-500"
            : "bg-amber-500/[0.03] border-amber-500/10 text-zinc-500"
        }`}>
          {isWrappedSol ? (
            <>
              <span className="text-emerald-400 font-semibold">Wrapped SOL</span> — Traders deposit SOL which gets auto-wrapped. No token minting needed. This is the simplest option for testing.
            </>
          ) : (
            <>
              <span className="text-amber-400 font-semibold">Custom Token</span> — Traders must hold this token to deposit collateral. {" "}
              {form.collateralMint ? (
                <>Make sure you have minted tokens and they are in your wallet. </>
              ) : (
                <>Paste a mint address or{" "}
                  <a href="/app/devnet/mint" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline hover:no-underline">
                    create one in the Token Factory
                  </a>.
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StepOracle({ form, set, walletKey }: { form: WizardState; set: (p: Partial<WizardState>) => void; walletKey?: string }) {
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-zinc-500">Choose oracle mode. Authority mode is recommended for devnet testing.</p>

      <div className="flex gap-2">
        {(["authority", "chainlink", "pyth"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => set({ oracleMode: mode })}
            className={`px-3 py-1.5 rounded text-[10px] font-semibold uppercase transition ${
              form.oracleMode === mode
                ? "bg-emerald-600 text-white"
                : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {form.oracleMode === "authority" && (
        <div className="space-y-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          <p className="text-[10px] text-amber-400">
            Authority mode: You push prices manually. Great for devnet testing.
          </p>
          <Field label="Oracle Authority Pubkey" value={form.oracleAuthorityPubkey} onChange={(v) => set({ oracleAuthorityPubkey: v })} placeholder={walletKey || "Your wallet"} mono />
          <Field label="Initial Price (USD)" value={form.initialPrice} onChange={(v) => set({ initialPrice: v })} placeholder="e.g. 150" type="number" />
          <Field label="Oracle Account (dummy)" value={form.oracleAccount} onChange={(v) => set({ oracleAccount: v })} placeholder="Any valid account" mono />
        </div>
      )}

      {form.oracleMode === "chainlink" && (
        <div className="space-y-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          <Field label="Chainlink Aggregator Account" value={form.oracleAccount} onChange={(v) => set({ oracleAccount: v })} placeholder="Pubkey" mono />
          <Field label="Initial Price (USD)" value={form.initialPrice} onChange={(v) => set({ initialPrice: v })} placeholder="e.g. 150" type="number" />
          <p className="text-[9px] text-zinc-600">
            Required: The on-chain program needs an initial mark price when using Chainlink. Chainlink prices will override this during crank.
          </p>
          <label className="flex items-center gap-2 text-[11px] text-zinc-400">
            <input type="checkbox" checked={form.inverted} onChange={(e) => set({ inverted: e.target.checked })} className="rounded" />
            Invert price (e.g. USD/SOL to SOL/USD)
          </label>
        </div>
      )}

      {form.oracleMode === "pyth" && (
        <div className="space-y-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          <Field label="Pyth Feed ID (64 hex chars)" value={form.pythFeedId} onChange={(v) => set({ pythFeedId: v })} placeholder="0x..." mono />
          <Field label="Pyth PriceUpdateV2 Account" value={form.oracleAccount} onChange={(v) => set({ oracleAccount: v })} placeholder="Pubkey" mono />
        </div>
      )}
    </div>
  );
}

function StepSlabTier({ form, set, slabRent, tierRents }: { form: WizardState; set: (p: Partial<WizardState>) => void; slabRent: number; tierRents: Record<number, number> }) {
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-zinc-500">Each tier uses a different program deployment with different slab sizes. Smaller tiers cost less rent.</p>
      <div className="grid grid-cols-3 gap-3">
        {SLAB_TIERS.map((tier, i) => {
          const rent = tierRents[i];
          const rentSol = rent ? (rent / LAMPORTS_PER_SOL).toFixed(1) : "...";
          return (
            <button
              key={tier.label}
              onClick={() => set({ slabTierIdx: i })}
              className={`p-3 rounded-lg border text-left transition ${
                form.slabTierIdx === i
                  ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                  : "border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.02]"
              }`}
            >
              <div className="text-[12px] font-bold text-white">{tier.label}</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">{tier.maxAccounts} accounts</div>
              <div className="text-[10px] text-zinc-600 mt-0.5 font-mono">{(tier.bytes / 1024).toFixed(0)} KB slab</div>
              <div className={`text-[10px] mt-0.5 font-mono font-bold ${form.slabTierIdx === i ? "text-emerald-400" : "text-emerald-500/60"}`}>~{rentSol} SOL</div>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-zinc-600 font-mono">
        Selected: {SLAB_TIERS[form.slabTierIdx]?.label} — Slab rent: {(slabRent / LAMPORTS_PER_SOL).toFixed(4)} SOL (computed live from RPC)
      </p>
    </div>
  );
}

function StepMatcher({ form, set }: { form: WizardState; set: (p: Partial<WizardState>) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-zinc-500">Configure matcher for trade execution via CPI.</p>
      <Field label="Matcher Program ID" value={form.matcherProgramId} onChange={(v) => set({ matcherProgramId: v })} mono />

      <div className="flex gap-2 flex-wrap">
        {(["passive", "vamm", "propamm"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => set({ matcherMode: mode })}
            className={`px-3 py-1.5 rounded text-[10px] font-semibold uppercase transition ${
              form.matcherMode === mode
                ? "bg-emerald-600 text-white"
                : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {mode === "passive" ? "Passive (fixed spread)" : mode === "vamm" ? "vAMM (spread + impact)" : "PropAMM (vAMM + guardrails)"}
          </button>
        ))}
      </div>

      {form.matcherMode === "passive" && (
        <Field label="Spread (bps)" value={form.passiveSpreadBps} onChange={(v) => set({ passiveSpreadBps: v })} type="number" />
      )}

      {(form.matcherMode === "vamm" || form.matcherMode === "propamm") && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Trading Fee (bps)" value={form.vammTradingFeeBps} onChange={(v) => set({ vammTradingFeeBps: v })} type="number" />
          <Field label="Base Spread (bps)" value={form.vammBaseSpreadBps} onChange={(v) => set({ vammBaseSpreadBps: v })} type="number" />
          <Field label="Impact K (bps)" value={form.vammImpactKBps} onChange={(v) => set({ vammImpactKBps: v })} type="number" />
          <Field label="Max Total (bps)" value={form.vammMaxTotalBps} onChange={(v) => set({ vammMaxTotalBps: v })} type="number" />
          <Field label="Liquidity Notional (e6)" value={form.vammLiquidityE6} onChange={(v) => set({ vammLiquidityE6: v })} type="text" mono />
        </div>
      )}
    </div>
  );
}

function StepRisk({ form, set }: { form: WizardState; set: (p: Partial<WizardState>) => void }) {
  const cannotBurnAdmin = form.oracleMode === "authority";
  
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-zinc-500">Risk and fee parameters. Defaults from config.</p>
      
      {/* Admin Mode Selection */}
      <div className="p-4 rounded-lg border border-white/[0.04] bg-white/[0.01]">
        <label className="block text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Admin Mode</label>
        <div className="flex gap-2 flex-wrap mb-3">
          {(["upgradeable", "adminless"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                if (mode === "adminless" && cannotBurnAdmin) return; // Block if oracle is authority
                set({ adminMode: mode, burnAdminConfirm: "" });
              }}
              disabled={mode === "adminless" && cannotBurnAdmin}
              className={`px-3 py-1.5 rounded text-[10px] font-semibold uppercase transition ${
                form.adminMode === mode
                  ? "bg-emerald-600 text-white"
                  : mode === "adminless" && cannotBurnAdmin
                  ? "bg-white/[0.02] text-zinc-700 cursor-not-allowed opacity-50"
                  : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {mode === "upgradeable" ? "Upgradeable (default)" : "Adminless (burn admin key)"}
            </button>
          ))}
        </div>
        {cannotBurnAdmin && form.adminMode === "adminless" && (
          <p className="text-[9px] text-red-400 mb-2">
            ⚠️ Cannot make market adminless when using Authority oracle mode. Switch to Pyth/Chainlink first, or keep admin mode as "Upgradeable".
          </p>
        )}
        {form.adminMode === "adminless" && !cannotBurnAdmin && (
          <>
            <p className="text-[9px] text-amber-400 mb-2">
              ⚠️ Adminless markets cannot be updated after launch. This is IRREVERSIBLE. Type "BURN" below to confirm.
            </p>
            <input
              type="text"
              value={form.burnAdminConfirm}
              onChange={(e) => set({ burnAdminConfirm: e.target.value })}
              placeholder='Type "BURN" to confirm'
              className="w-full bg-black/30 border border-white/[0.06] rounded px-3 py-2 text-[12px] text-white placeholder:text-zinc-700 focus:outline-none focus:border-amber-500/30"
            />
            {form.burnAdminConfirm !== "BURN" && form.burnAdminConfirm.length > 0 && (
              <p className="text-[9px] text-red-400 mt-1">Must type exactly "BURN" to enable adminless mode.</p>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Initial Margin (bps)" value={form.initialMarginBps} onChange={(v) => set({ initialMarginBps: v })} type="number" />
        <Field label="Maintenance Margin (bps)" value={form.maintenanceMarginBps} onChange={(v) => set({ maintenanceMarginBps: v })} type="number" />
        <Field label="Trading Fee (bps)" value={form.tradingFeeBps} onChange={(v) => set({ tradingFeeBps: v })} type="number" />
        <Field label="Liquidation Fee (bps)" value={form.liquidationFeeBps} onChange={(v) => set({ liquidationFeeBps: v })} type="number" />
        <Field label="Liquidation Buffer (bps)" value={form.liquidationBufferBps} onChange={(v) => set({ liquidationBufferBps: v })} type="number" />
        <Field label="Max Crank Staleness (slots)" value={form.maxCrankStalenessSlots} onChange={(v) => set({ maxCrankStalenessSlots: v })} type="number" />
        <Field label="Warmup Period (slots)" value={form.warmupPeriodSlots} onChange={(v) => set({ warmupPeriodSlots: v })} type="number" />
        <Field label="New Account Fee (raw tokens)" value={form.newAccountFee} onChange={(v) => set({ newAccountFee: v })} type="text" mono />
        <Field label="LP Seed Capital (raw tokens)" value={form.lpSeedCapital} onChange={(v) => set({ lpSeedCapital: v })} type="text" mono />
        <p className="text-[9px] text-zinc-600 -mt-1 ml-1">Extra tokens deposited to the LP as trading capital. Without this, the LP has zero capital and all trades fail.</p>
        <Field label="Conf Filter (bps)" value={form.confFilterBps} onChange={(v) => set({ confFilterBps: v })} type="number" />
        <Field label="Max Staleness (secs)" value={form.maxStalenessSecs} onChange={(v) => set({ maxStalenessSecs: v })} type="number" />
        <Field label="Unit Scale" value={form.unitScale} onChange={(v) => set({ unitScale: v })} type="number" />
      </div>
    </div>
  );
}

function StepCostBreakdown({
  tier,
  slabRent,
  vaultRent,
  matcherCtxRent,
}: {
  tier: SlabTier;
  slabRent: number;
  vaultRent: number;
  matcherCtxRent: number;
}) {
  const rows = [
    { name: "Slab Account", owner: "Percolator Program", space: tier.bytes, rent: slabRent, why: "Stores all market state (config, engine, accounts)" },
    { name: "Vault Token Account", owner: "SPL Token Program", space: 165, rent: vaultRent, why: "Holds collateral deposits" },
    { name: "Matcher Context", owner: "Matcher Program", space: 320, rent: matcherCtxRent, why: "Matcher state (spread/vAMM config)" },
  ];
  const total = rows.reduce((s, r) => s + r.rent, 0);

  const allLive = rows.every((r) => r.rent > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-[11px] text-zinc-500">Account plan + costs computed live from RPC.</p>
        {allLive ? (
          <span className="text-[8px] text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded font-semibold uppercase">Live</span>
        ) : (
          <span className="text-[8px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded font-semibold uppercase">Partial</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-zinc-600 uppercase tracking-widest border-b border-white/[0.04]">
              <th className="text-left py-2 px-2">Account</th>
              <th className="text-left py-2 px-2">Owner</th>
              <th className="text-right py-2 px-2">Space</th>
              <th className="text-right py-2 px-2">Rent (SOL)</th>
              <th className="text-left py-2 px-2">Purpose</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-white/[0.02]">
                <td className="py-2 px-2 text-zinc-300 font-semibold">{r.name}</td>
                <td className="py-2 px-2 text-zinc-500 font-mono">{r.owner}</td>
                <td className="py-2 px-2 text-zinc-400 font-mono text-right">{r.space.toLocaleString()}</td>
                <td className="py-2 px-2 text-zinc-300 font-mono text-right">{r.rent > 0 ? (r.rent / LAMPORTS_PER_SOL).toFixed(4) : "—"}</td>
                <td className="py-2 px-2 text-zinc-600">{r.why}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/[0.06]">
              <td colSpan={3} className="py-2 px-2 text-zinc-400 font-bold text-right">Total Rent:</td>
              <td className="py-2 px-2 text-emerald-400 font-mono font-bold text-right">{(total / LAMPORTS_PER_SOL).toFixed(4)}</td>
              <td className="py-2 px-2 text-zinc-600">+ ~0.01 SOL tx fees</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[8px] text-zinc-700">
        Rent values from <code className="text-zinc-600">getMinimumBalanceForRentExemption(space)</code>. Space from Percolator slab layout constants.
      </p>
    </div>
  );
}

function StepExecute({
  launching,
  launchStep,
  launchError,
  launchSigs,
  launchedMarketId,
  cluster,
  form,
  onLaunch,
  onGoToMarket,
}: {
  launching: boolean;
  launchStep: number;
  launchError: string | null;
  launchSigs: string[];
  launchedMarketId: string | null;
  cluster: string;
  form: WizardState;
  onLaunch: () => void;
  onGoToMarket: () => void;
}) {
  const txPlan = [
    { label: "Create Market (slab + vault + init)", desc: "Atomic: all-or-nothing. No SOL lost on failure." },
    ...(form.oracleMode === "authority"
      ? [{ label: "Set oracle authority + push price", desc: "Configures who can push prices." }]
      : []),
    { label: "Create matcher context + Init LP", desc: "Sets up the matching engine." },
  ];

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-zinc-500">
        Execute the transaction plan. Each step produces a receipt with program truth.
      </p>

      {/* SOL Protection Notice */}
      <div className="p-2.5 rounded-lg bg-emerald-500/[0.03] border border-emerald-500/10">
        <p className="text-[10px] text-emerald-500/80">
          <span className="font-bold">SOL Protected:</span> The core market creation (slab + vault + init) is bundled into a single atomic transaction.
          If any part fails, the entire transaction rolls back and your SOL is returned. No funds at risk.
        </p>
      </div>

      {/* Tx Plan */}
      <div className="space-y-1.5">
        {txPlan.map((item, i) => {
          const idx = i + 1;
          const done = launchStep > idx || !!(launchedMarketId && i < txPlan.length);
          const active = launchStep === idx && launching;
          // Collect all sigs for this step (atomic tx may produce just one, but oracle may produce 2)
          const sig = launchSigs[i];
          const isResume = sig?.startsWith("(resumed");

          return (
            <div key={i} className={`p-2.5 rounded-lg border ${
              done
                ? "border-emerald-500/20 bg-emerald-500/[0.03]"
                : active
                  ? "border-amber-500/20 bg-amber-500/[0.03]"
                  : "border-white/[0.04] bg-white/[0.01]"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  done ? "bg-emerald-500/20 text-emerald-400" : active ? "bg-amber-500/20 text-amber-400" : "bg-white/[0.06] text-zinc-600"
                }`}>
                  {done ? "✓" : active ? (
                    <div className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                  ) : idx}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-[11px] font-medium ${done ? "text-emerald-400" : active ? "text-amber-400" : "text-zinc-400"}`}>
                    {item.label}
                  </span>
                  <p className="text-[9px] text-zinc-600 mt-0.5">{item.desc}</p>
                  {sig && !isResume && (
                    <a
                      href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-[9px] text-emerald-600 hover:text-emerald-400 font-mono truncate mt-0.5"
                    >
                      {sig}
                    </a>
                  )}
                  {isResume && (
                    <span className="text-[9px] text-amber-600 italic">{sig}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error + Retry */}
      {launchError && (
        <div className="p-3 rounded-lg bg-red-500/[0.05] border border-red-500/20 space-y-2">
          <p className="text-[11px] text-red-400 break-all whitespace-pre-wrap">{launchError}</p>
          <p className="text-[9px] text-zinc-600">
            {launchStep <= 1
              ? "The atomic transaction rolled back — no SOL was lost. Fix the issue and try again."
              : "The market was created successfully. You can retry to complete the remaining steps without losing SOL."}
          </p>
          <button
            onClick={onLaunch}
            disabled={launching}
            className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded text-[10px] font-medium transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Launch or redirect */}
      {launchedMarketId ? (
        <div className="p-4 rounded-lg bg-emerald-500/[0.05] border border-emerald-500/20 space-y-4">
          <div className="text-center">
            <p className="text-[14px] font-bold text-emerald-400 mb-1">Market Launched Successfully!</p>
            <p className="text-[10px] text-zinc-500 font-mono mb-1">{launchedMarketId}</p>
          </div>

          {/* Export JSON */}
          <div className="p-3 rounded bg-white/[0.02] border border-white/[0.04]">
            <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-1">Export Market JSON</p>
            <p className="text-[9px] text-zinc-700 mb-2">Share this with others to import your market.</p>
            <button
              onClick={() => {
                const json = JSON.stringify({
                  slab: launchedMarketId,
                  programId: SLAB_TIERS[form.slabTierIdx]?.programId || DEVNET.percolatorProgramId,
                  matcherProgramId: form.matcherProgramId,
                  oracle: form.oracleAccount,
                  oracleType: form.oracleMode,
                  mint: form.collateralMint,
                  network: "devnet",
                }, null, 2);
                navigator.clipboard.writeText(json);
              }}
              className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] rounded text-[10px] text-zinc-400 transition"
            >
              Copy Market JSON
            </button>
          </div>

          {/* Next steps */}
          <div className="p-3 rounded bg-white/[0.02] border border-white/[0.04]">
            <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-2">Next Steps</p>
            <div className="space-y-1">
              {[
                "Open Proof Page to verify all addresses and programs",
                "Init User to create your trading account",
                "Deposit collateral to fund your account",
                "Crank Now to update the market state",
                "Trade to open long or short positions",
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-500/10 flex items-center justify-center text-[8px] text-emerald-400 shrink-0">{i + 1}</span>
                  <span className="text-[10px] text-zinc-500">{s}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={onGoToMarket}
            className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-[12px] font-bold text-white transition"
          >
            Go to Proof Page
          </button>
        </div>
      ) : (
        <button
          onClick={onLaunch}
          disabled={launching}
          className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-[12px] font-bold text-white transition"
        >
          {launching ? "Launching…" : "Execute Launch"}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared form field                                                  */
/* ------------------------------------------------------------------ */

function Field({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-white/[0.03] border border-white/[0.06] rounded px-2.5 py-1.5 text-[11px] text-zinc-300 focus:outline-none focus:border-emerald-500/30 ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}
