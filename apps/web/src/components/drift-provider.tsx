"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMarketData } from "@/components/market-data-provider";
import { liquidationPrice as calcLiquidationPrice, liquidationPriceLive } from "@/lib/utils";
import { PublicKey } from "@solana/web3.js";
import {
  DriftClient,
  Wallet as DriftWallet,
  QUOTE_PRECISION,
  BASE_PRECISION,
  PRICE_PRECISION,
  PositionDirection,
  getMarketOrderParams,
  getLimitOrderParams,
  convertToNumber,
  PerpMarkets,
  initialize,
  BN,
  User,
  calculateEntryPrice,
  calculateReservePrice,
} from "@drift-labs/sdk";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PerpPositionView {
  marketIndex: number;
  marketName: string;
  direction: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  leverage: number;
  liquidationPrice: number;
}

export type CollateralAsset = "SOL" | "USDC";

export interface TradeParams {
  marketIndex: number;
  direction: "long" | "short";
  sizeUsd: number;
  leverage: number;
  collateralAsset: CollateralAsset;
  orderType?: "market" | "limit";
  limitPrice?: number;
}

interface DriftState {
  isReady: boolean;
  isInitializing: boolean;
  initError: string | null;
  hasAccount: boolean;
  freeCollateral: number;
  totalCollateral: number;
  unrealizedPnl: number;
  positions: PerpPositionView[];
  /** Live mark price per market (e.g. "SOL-PERP") — updates every 500ms so order preview liq moves with price (Jupiter-style) */
  markPricesByMarket: Record<string, number>;
  placeTrade: (params: TradeParams) => Promise<string[]>;
  withdraw: (amount: number, asset: CollateralAsset) => Promise<string>;
  closePosition: (marketIndex: number) => Promise<string>;
  refreshPositions: () => Promise<void>;
  retryInit: () => void;
}

const DriftContext = createContext<DriftState>({
  isReady: false,
  isInitializing: false,
  initError: null,
  hasAccount: false,
  freeCollateral: 0,
  totalCollateral: 0,
  unrealizedPnl: 0,
  positions: [],
  markPricesByMarket: {},
  placeTrade: async () => [],
  withdraw: async () => "",
  closePosition: async () => "",
  refreshPositions: async () => {},
  retryInit: () => {},
});

export const useDrift = () => useContext(DriftContext);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ENV = "mainnet-beta" as const;

const ASSET_CONFIG: Record<CollateralAsset, { spotIndex: number; decimals: number }> = {
  USDC: { spotIndex: 0, decimals: 6 },
  SOL: { spotIndex: 1, decimals: 9 },
};

function marketNameFromIndex(idx: number): string {
  const m = PerpMarkets[ENV]?.find((p) => p.marketIndex === idx);
  return m ? m.baseAssetSymbol + "-PERP" : `PERP-${idx}`;
}

/** Map market labels to CoinGecko IDs — used for live mark price fallback (Drift oracle can be stale) */
const MARKET_TO_COINGECKO: Record<string, string> = {
  "SOL-PERP": "solana", "BTC-PERP": "bitcoin", "ETH-PERP": "ethereum",
  "APT-PERP": "aptos", "BONK-PERP": "bonk", "MATIC-PERP": "matic-network",
  "ARB-PERP": "arbitrum", "DOGE-PERP": "dogecoin", "BNB-PERP": "binancecoin",
  "SUI-PERP": "sui", "PEPE-PERP": "pepe", "WIF-PERP": "dogwifcoin",
  "JUP-PERP": "jupiter-exchange-solana", "RNDR-PERP": "render-token",
  "PYTH-PERP": "pyth-network", "JTO-PERP": "jito-governance-token",
};

function amountToBN(amount: number, asset: CollateralAsset): BN {
  const { decimals } = ASSET_CONFIG[asset];
  return new BN(Math.floor(amount * 10 ** decimals));
}

/**
 * For SOL deposits, the Drift SDK auto-wraps native SOL to WSOL
 * when the token account equals the wallet's public key.
 * For USDC, we need the actual associated token account.
 */
async function getTokenAccountForDeposit(
  dc: DriftClient,
  asset: CollateralAsset,
  walletPubkey: PublicKey
): Promise<PublicKey> {
  if (asset === "SOL") {
    // Pass wallet pubkey — SDK detects this and creates a temp WSOL account
    return walletPubkey;
  }
  // For USDC, use the actual associated token account
  return dc.getAssociatedTokenAccount(ASSET_CONFIG[asset].spotIndex);
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function DriftProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { prices } = useMarketData();
  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [hasAccount, setHasAccount] = useState(false);
  const [freeCollateral, setFreeCollateral] = useState(0);
  const [totalCollateral, setTotalCollateral] = useState(0);
  const [unrealizedPnl, setUnrealizedPnl] = useState(0);
  const [positions, setPositions] = useState<PerpPositionView[]>([]);
  const [markPricesByMarket, setMarkPricesByMarket] = useState<Record<string, number>>({});
  const [retryCount, setRetryCount] = useState(0);

  const clientRef = useRef<DriftClient | null>(null);
  const userRef = useRef<User | null>(null);

  /* ---- init Drift client when wallet connects ---- */
  useEffect(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return;

    let cancelled = false;

    (async () => {
      setIsReady(false);
      setInitError(null);

      try {
        const sdkConfig = initialize({ env: ENV });

        const driftWallet = {
          publicKey: wallet.publicKey!,
          signTransaction: wallet.signTransaction!,
          signAllTransactions: wallet.signAllTransactions!,
        } as any as DriftWallet;

        const conn = connection as any;

        const driftClient = new DriftClient({
          connection: conn,
          wallet: driftWallet,
          programID: new PublicKey(sdkConfig.DRIFT_PROGRAM_ID),
          accountSubscription: {
            type: "websocket",
          },
        });

        await driftClient.subscribe();

        if (cancelled) {
          await driftClient.unsubscribe();
          return;
        }

        clientRef.current = driftClient;

        // Check if user already has a Drift account
        try {
          const driftUser = new User({
            driftClient,
            userAccountPublicKey: await driftClient.getUserAccountPublicKey(),
            accountSubscription: { type: "websocket" },
          });

          const exists = await driftUser.exists();
          if (exists && !cancelled) {
            await driftUser.subscribe();
            userRef.current = driftUser;
            setHasAccount(true);
          }
        } catch {
          // No account yet — that's fine
        }

        if (!cancelled) {
          setIsReady(true);
          setInitError(null);
          console.log("[drift] SDK initialized successfully");
        }
      } catch (e: any) {
        console.error("[drift] init error:", e);
        if (!cancelled) {
          setInitError(e?.message?.slice(0, 150) || "Failed to connect to trading protocol");
          setIsReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      clientRef.current?.unsubscribe().catch(() => {});
      clientRef.current = null;
      userRef.current?.unsubscribe().catch(() => {});
      userRef.current = null;
      setIsReady(false);
      setHasAccount(false);
      setInitError(null);
    };
  }, [wallet.publicKey, wallet.signTransaction, connection, retryCount]);

  const retryInit = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  /* ---- refresh positions & collateral ---- */
  const refreshPositions = useCallback(async () => {
    const u = userRef.current;
    const dc = clientRef.current;
    if (!u || !dc) return;

    try {
      const perpPositions = u.getActivePerpPositions();
      const views: PerpPositionView[] = [];

      for (const pos of perpPositions) {
        const idx = pos.marketIndex;
        const baseAmount = convertToNumber(pos.baseAssetAmount, BASE_PRECISION);
        const dir = baseAmount >= 0 ? "long" : "short";
        const size = Math.abs(baseAmount);
        const entry = convertToNumber(calculateEntryPrice(pos), PRICE_PRECISION);

        // Mark price: use Drift's true mark (AMM peg + oracle) via calculateReservePrice — matches Drift UI
        const marketName = marketNameFromIndex(idx);
        let mark = entry;
        try {
          const marketAccount = dc.getPerpMarketAccount(idx);
          const mmOracle = dc.getMMOracleDataForPerpMarket(idx);
          if (marketAccount && mmOracle) {
            const markBN = calculateReservePrice(marketAccount, mmOracle);
            if (markBN && !markBN.isZero()) mark = convertToNumber(markBN, PRICE_PRECISION);
          }
        } catch { /* fallback */ }
        if (mark <= 0) {
          try {
            const oracleData = dc.getOracleDataForPerpMarket(idx);
            if (oracleData) mark = convertToNumber(oracleData.price, PRICE_PRECISION);
          } catch { /* ignore */ }
        }
        if (mark <= 0) {
          const cgId = MARKET_TO_COINGECKO[marketName];
          if (cgId && prices[cgId]?.price) mark = prices[cgId].price;
        }
        if (mark <= 0) mark = entry;

        // Unrealized PnL = (baseAmount × mark) + quoteAssetAmount (funding embedded; Drift precision)
        // quoteAssetAmount is the cost basis (negative for longs = you spent quote to buy base)
        // So for a long: pnl = (size * mark) - (size * entry) = size * (mark - entry)
        const quoteAmount = convertToNumber(pos.quoteAssetAmount, QUOTE_PRECISION);
        const pnl = (baseAmount * mark) + quoteAmount;

        // Leverage: use Drift SDK (cross-margin aware) when available
        let leverage = 0;
        try {
          const levBN = u.getLeverage(false, idx);
          if (levBN && !levBN.isZero()) leverage = Number(levBN) / 10_000; // TEN_THOUSAND precision
        } catch { /* fallback */ }
        if (leverage <= 0) {
          const notional = Math.abs(baseAmount * mark);
          const equity = notional + quoteAmount;
          leverage = equity > 0 ? notional / equity : 0;
        }

        // Live liquidation price: moves with mark/pnl (like Jupiter) so it updates when price goes up/down
        const maintMargin = idx <= 2 ? 0.03125 : 0.05;
        const lev = Math.max(1, leverage);
        let liqPrice =
          leverage > 0 && size > 0
            ? liquidationPriceLive(entry, size, lev, dir, pnl, maintMargin)
            : 0;
        if (liqPrice <= 0) {
          liqPrice = calcLiquidationPrice(entry, lev, dir, maintMargin);
        }
        if (liqPrice <= 0) {
          try {
            const liqBN = u.liquidationPrice(idx);
            if (liqBN && !liqBN.isZero()) liqPrice = convertToNumber(liqBN, PRICE_PRECISION);
          } catch { /* SDK may not have position */ }
        }

        views.push({
          marketIndex: idx,
          marketName: marketNameFromIndex(idx),
          direction: dir,
          size,
          entryPrice: entry,
          markPrice: mark,
          pnl,
          leverage,
          liquidationPrice: Math.max(0, liqPrice),
        });
      }

      setPositions(views);
      setFreeCollateral(convertToNumber(u.getFreeCollateral(), QUOTE_PRECISION));
      setTotalCollateral(convertToNumber(u.getTotalCollateral(), QUOTE_PRECISION));
      setUnrealizedPnl(convertToNumber(u.getUnrealizedPNL(true), QUOTE_PRECISION));
    } catch (e) {
      console.error("[drift] refresh error:", e);
    }
  }, [prices]);

  /* ---- Live mark prices for all perp markets (so order preview liq moves with price, Jupiter-style) ---- */
  const refreshMarkPrices = useCallback(() => {
    const dc = clientRef.current;
    if (!dc) return;
    const markets = PerpMarkets[ENV];
    if (!markets?.length) return;
    const map: Record<string, number> = {};
    for (const m of markets) {
      const idx = m.marketIndex;
      const marketName = m.baseAssetSymbol + "-PERP";
      let mark = 0;
      try {
        const marketAccount = dc.getPerpMarketAccount(idx);
        const mmOracle = dc.getMMOracleDataForPerpMarket(idx);
        if (marketAccount && mmOracle) {
          const markBN = calculateReservePrice(marketAccount, mmOracle);
          if (markBN && !markBN.isZero()) mark = convertToNumber(markBN, PRICE_PRECISION);
        }
      } catch { /* skip */ }
      if (mark <= 0) {
        try {
          const oracleData = dc.getOracleDataForPerpMarket(idx);
          if (oracleData) mark = convertToNumber(oracleData.price, PRICE_PRECISION);
        } catch { /* skip */ }
      }
      if (mark > 0) map[marketName] = mark;
    }
    setMarkPricesByMarket((prev) => (Object.keys(map).length ? { ...prev, ...map } : prev));
  }, []);

  /* ---- Auto-refresh: fast cycle for live mark & PnL ---- */
  useEffect(() => {
    if (!hasAccount) return;
    refreshPositions();
    const id = setInterval(refreshPositions, 500);
    return () => clearInterval(id);
  }, [hasAccount, refreshPositions]);

  /* ---- Live mark prices every 500ms when Drift is ready (so order preview liq updates with price) ---- */
  useEffect(() => {
    if (!clientRef.current) return;
    refreshMarkPrices();
    const id = setInterval(refreshMarkPrices, 500);
    return () => clearInterval(id);
  }, [isReady, refreshMarkPrices]);

  /* ---- Burst refresh after tx: catch websocket update quickly ---- */
  const burstRefresh = useCallback(() => {
    refreshPositions();
    [400, 800, 1500, 3000].forEach((ms) => setTimeout(refreshPositions, ms));
  }, [refreshPositions]);

  /* ---- ensure user account exists ---- */
  const ensureAccount = useCallback(
    async (depositAmount: number, asset: CollateralAsset): Promise<string | null> => {
      const dc = clientRef.current;
      if (!dc || !wallet.publicKey) throw new Error("Protocol not connected. Try refreshing the page.");

      if (hasAccount && userRef.current) return null;

      setIsInitializing(true);
      try {
        const { spotIndex } = ASSET_CONFIG[asset];
        const amountBN = amountToBN(depositAmount, asset);

        // For SOL: pass wallet.publicKey so SDK auto-wraps native SOL → WSOL
        // For USDC: pass the actual USDC associated token account
        const tokenAccount = await getTokenAccountForDeposit(dc, asset, wallet.publicKey);

        // initializeUserAccountAndDepositCollateral(amount, tokenAccount, marketIndex)
        // marketIndex MUST match the asset: 0 = USDC, 1 = SOL
        const [txSig] = await dc.initializeUserAccountAndDepositCollateral(
          amountBN,
          tokenAccount,
          spotIndex  // <-- critical: tells Drift which spot market to deposit into
        );

        const driftUser = new User({
          driftClient: dc,
          userAccountPublicKey: await dc.getUserAccountPublicKey(),
          accountSubscription: { type: "websocket" },
        });
        await driftUser.subscribe();
        userRef.current = driftUser;
        setHasAccount(true);
        return txSig;
      } finally {
        setIsInitializing(false);
      }
    },
    [wallet.publicKey, hasAccount]
  );

  /* ---- deposit collateral into existing account ---- */
  const depositCollateral = useCallback(
    async (amount: number, asset: CollateralAsset): Promise<string> => {
      const dc = clientRef.current;
      if (!dc || !wallet.publicKey) throw new Error("Protocol not connected");
      const { spotIndex } = ASSET_CONFIG[asset];
      const amountBN = amountToBN(amount, asset);
      const tokenAccount = await getTokenAccountForDeposit(dc, asset, wallet.publicKey);
      const txSig = await dc.deposit(amountBN, spotIndex, tokenAccount);
      burstRefresh();
      await refreshPositions();
      return txSig;
    },
    [wallet.publicKey, refreshPositions, burstRefresh]
  );

  /* ---- MAIN ACTION: place trade (auto-create account + auto-deposit) ---- */
  const placeTrade = useCallback(
    async (params: TradeParams): Promise<string[]> => {
      const dc = clientRef.current;
      if (!dc || !wallet.publicKey) throw new Error("Protocol not connected. Try refreshing the page.");

      const txSignatures: string[] = [];

      // Margin required = sizeUsd / leverage (in USD terms)
      const marginUsd = params.sizeUsd / params.leverage;

      // Get asset price for SOL conversion
      const getSolPrice = (): number => {
        const oracleData = dc.getOracleDataForPerpMarket(0); // SOL-PERP = market 0
        return convertToNumber(oracleData.price, PRICE_PRECISION);
      };

      // Convert USD margin to asset amount
      const usdToAssetAmount = (usd: number): number => {
        if (params.collateralAsset === "SOL") {
          const solPrice = getSolPrice();
          return (usd / solPrice) * 1.05; // 5% buffer for price movement + fees
        }
        return usd * 1.02; // 2% buffer for fees
      };

      // Step 1: Ensure account exists
      if (!hasAccount || !userRef.current) {
        const depositAmount = usdToAssetAmount(marginUsd);
        const initTx = await ensureAccount(depositAmount, params.collateralAsset);
        if (initTx) txSignatures.push(initTx);

        // Wait for account to be ready on-chain
        await new Promise((r) => setTimeout(r, 1500));
        burstRefresh();
        await refreshPositions();
      } else {
        // Step 2: Deposit more if needed
        const currentFree = freeCollateral;
        if (currentFree < marginUsd) {
          const deficit = marginUsd - currentFree;
          const depositAmount = usdToAssetAmount(deficit);
          const depTx = await depositCollateral(depositAmount, params.collateralAsset);
          txSignatures.push(depTx);
          await new Promise((r) => setTimeout(r, 1000));
          burstRefresh();
          await refreshPositions();
        }
      }

      // Step 3: Place the perp order
      const dir = params.direction === "long" ? PositionDirection.LONG : PositionDirection.SHORT;
      const oracleData = dc.getOracleDataForPerpMarket(params.marketIndex);
      const oraclePrice = convertToNumber(oracleData.price, PRICE_PRECISION);
      const baseAmount = params.sizeUsd / oraclePrice;
      const baseAmountBN = new BN(Math.floor(baseAmount * 1e9));

      let orderTx: string;
      if (params.orderType === "limit" && params.limitPrice) {
        const priceBN = new BN(Math.floor(params.limitPrice * 1e6));
        orderTx = await dc.placePerpOrder(
          getLimitOrderParams({
            baseAssetAmount: baseAmountBN,
            direction: dir,
            marketIndex: params.marketIndex,
            price: priceBN,
          })
        );
      } else {
        orderTx = await dc.placePerpOrder(
          getMarketOrderParams({
            baseAssetAmount: baseAmountBN,
            direction: dir,
            marketIndex: params.marketIndex,
          })
        );
      }
      txSignatures.push(orderTx);
      burstRefresh();
      await refreshPositions();
      return txSignatures;
    },
    [wallet.publicKey, hasAccount, freeCollateral, ensureAccount, depositCollateral, refreshPositions, burstRefresh]
  );

  /* ---- withdraw ---- */
  const withdraw = useCallback(
    async (amount: number, asset: CollateralAsset): Promise<string> => {
      const dc = clientRef.current;
      if (!dc || !wallet.publicKey) throw new Error("Protocol not connected");
      const { spotIndex } = ASSET_CONFIG[asset];
      const amountBN = amountToBN(amount, asset);
      const tokenAccount = await getTokenAccountForDeposit(dc, asset, wallet.publicKey);
      const txSig = await dc.withdraw(amountBN, spotIndex, tokenAccount);
      burstRefresh();
      await refreshPositions();
      return txSig;
    },
    [wallet.publicKey, refreshPositions, burstRefresh]
  );

  /* ---- close position ---- */
  const closePosition = useCallback(
    async (marketIndex: number): Promise<string> => {
      const dc = clientRef.current;
      if (!dc) throw new Error("Protocol not connected");
      const txSig = await dc.closePosition(marketIndex);
      // Optimistic update: remove position immediately so UI reflects close
      setPositions((prev) => prev.filter((p) => p.marketIndex !== marketIndex));
      burstRefresh();
      await refreshPositions();
      return txSig;
    },
    [refreshPositions, burstRefresh]
  );

  return (
    <DriftContext.Provider
      value={{
        isReady,
        isInitializing,
        initError,
        hasAccount,
        freeCollateral,
        totalCollateral,
        unrealizedPnl,
        positions,
        markPricesByMarket,
        placeTrade,
        withdraw,
        closePosition,
        refreshPositions,
        retryInit,
      }}
    >
      {children}
    </DriftContext.Provider>
  );
}
