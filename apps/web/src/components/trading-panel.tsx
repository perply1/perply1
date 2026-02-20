"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useDrift, type CollateralAsset } from "./drift-provider";
import { MAINNET } from "@sov/config";
import { liquidationPrice, liquidationPriceLive, formatLiquidationPrice } from "@/lib/utils";
import { useReceipts } from "./receipts-provider";
import { useCluster } from "./cluster-provider";

const LAMPORTS_PER_SOL = 1e9;

// Drift max leverage per market tier
const MAX_LEVERAGE: Record<string, number> = {
  "SOL-PERP": 50,
  "BTC-PERP": 50,
  "ETH-PERP": 50,
  "APT-PERP": 20,
  "BONK-PERP": 20,
  "MATIC-PERP": 20,
  "ARB-PERP": 20,
  "DOGE-PERP": 20,
  "BNB-PERP": 20,
  "SUI-PERP": 20,
  "PEPE-PERP": 20,
  "WIF-PERP": 20,
  "JUP-PERP": 20,
  "RNDR-PERP": 20,
  "PYTH-PERP": 20,
  "JTO-PERP": 20,
};

// Drift maintenance margin ratio per market (approximate)
const MAINTENANCE_MARGIN: Record<string, number> = {
  "SOL-PERP": 0.03125,
  "BTC-PERP": 0.03125,
  "ETH-PERP": 0.03125,
};
const DEFAULT_MAINT_MARGIN = 0.05;

export function TradingPanel({
  currentMarket,
  markPrice,
}: {
  currentMarket: string;
  markPrice: number;
}) {
  const wallet = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const {
    isReady,
    initError,
    hasAccount,
    freeCollateral,
    totalCollateral,
    positions,
    placeTrade,
    retryInit,
  } = useDrift();
  const { addReceipt } = useReceipts();
  const { cluster } = useCluster();

  const [direction, setDirection] = useState<"long" | "short">("long");
  const [sizeInput, setSizeInput] = useState("");
  const [leverage, setLeverage] = useState(5);
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [collateralAsset, setCollateralAsset] = useState<CollateralAsset>("SOL");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [walletSol, setWalletSol] = useState<number | null>(null);

  const marketIndex = MAINNET.perpMarkets[currentMarket] ?? 0;
  const maxLev = MAX_LEVERAGE[currentMarket] || 20;
  const maintMargin = MAINTENANCE_MARGIN[currentMarket] || DEFAULT_MAINT_MARGIN;
  const sizeNum = parseFloat(sizeInput) || 0;

  // Clamp leverage if market changed and max is lower
  useEffect(() => {
    if (leverage > maxLev) setLeverage(maxLev);
  }, [maxLev, leverage]);

  // Compute sizeUsd from input (input is in collateral asset units)
  const sizeUsd = useMemo(() => {
    if (!sizeNum) return 0;
    if (collateralAsset === "SOL" && markPrice > 0) {
      return sizeNum * markPrice; // SOL amount × price = USD
    }
    return sizeNum; // USDC is already USD
  }, [sizeNum, collateralAsset, markPrice]);

  // Fetch wallet SOL balance
  useEffect(() => {
    if (!wallet.publicKey) { setWalletSol(null); return; }
    let cancelled = false;
    const fetchBal = () => {
      connection.getBalance(wallet.publicKey!).then((b) => {
        if (!cancelled) setWalletSol(b / LAMPORTS_PER_SOL);
      }).catch(() => {});
    };
    fetchBal();
    const id = setInterval(fetchBal, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [connection, wallet.publicKey]);

  // Leverage presets based on max
  const leveragePresets = useMemo(() => {
    const presets = [1, 2, 5, 10, 20];
    if (maxLev >= 50) presets.push(50);
    if (maxLev >= 100) presets.push(100);
    return presets.filter((l) => l <= maxLev);
  }, [maxLev]);

  // Order details with proper calculations
  const orderInfo = useMemo(() => {
    if (!markPrice || !sizeUsd) return null;

    const entryPrice = orderType === "limit" && parseFloat(limitPrice) ? parseFloat(limitPrice) : markPrice;
    const positionSizeUsd = sizeUsd * leverage;
    const marginUsd = sizeUsd;
    const sizeInBaseAsset = positionSizeUsd / entryPrice;

    // Standard isolated-margin liquidation price (same convention as Jupiter perps UI)
    const liqPrice = liquidationPrice(entryPrice, leverage, direction, maintMargin);

    // Drift taker fee: 0.1% (10 bps)
    const fee = positionSizeUsd * 0.001;

    // Margin in collateral terms
    let marginDisplay: string;
    if (collateralAsset === "SOL" && markPrice > 0) {
      marginDisplay = `${(marginUsd / markPrice).toFixed(4)} SOL`;
    } else {
      marginDisplay = `${marginUsd.toFixed(2)} USDC`;
    }

    return {
      entryPrice,
      positionSizeUsd,
      marginUsd,
      marginDisplay,
      liqPrice: Math.max(0, liqPrice),
      fee,
      sizeInBaseAsset,
    };
  }, [markPrice, sizeUsd, leverage, direction, orderType, limitPrice, collateralAsset, maintMargin]);

  // Open position in current market — used to show Liq. Price after execution
  const currentPosition = useMemo(() => {
    return positions.find((p) => p.marketName === currentMarket) ?? null;
  }, [positions, currentMarket]);

  const positionInfo = useMemo(() => {
    if (!currentPosition) return null;
    const { entryPrice, size, leverage, direction, markPrice: mark, pnl } = currentPosition;
    // Live liq price: moves with mark/pnl (like Jupiter) so it updates when price goes up/down
    const lev = Math.max(1, leverage || 1);
    const liqPrice = liquidationPriceLive(entryPrice, size, lev, direction, pnl, maintMargin);
    return {
      entryPrice,
      markPrice: mark,
      liqPrice,
      size,
      pnl,
      positionUsd: size * mark,
    };
  }, [currentPosition, maintMargin]);

  const handleTrade = useCallback(async () => {
    setError(null);
    setSuccess(null);
    if (!sizeUsd || sizeUsd <= 0) { setError("Enter a valid size"); return; }
    if (!isReady) { setError("Connecting to protocol…"); return; }

    setSubmitting(true);
    try {
      const txSigs = await placeTrade({
        marketIndex,
        direction,
        sizeUsd,
        leverage,
        collateralAsset,
        orderType,
        limitPrice: orderType === "limit" ? parseFloat(limitPrice) : undefined,
      });

      setSuccess("Order placed");
      setSizeInput("");
      setTimeout(() => setSuccess(null), 4000);

      const lastTx = txSigs[txSigs.length - 1];
      addReceipt({
        id: lastTx,
        timestamp: new Date().toISOString(),
        cluster,
        mode: "mainnet",
        venue: "perps",
        action: `${direction.toUpperCase()} ${currentMarket}`,
        marketId: currentMarket,
        wallet: wallet.publicKey?.toBase58() || "",
        txSignatures: txSigs,
        explorerLinks: txSigs.map((tx) => `https://solscan.io/tx/${tx}`),
        invokedPrograms: [],
      });
    } catch (e: any) {
      setError(e?.message?.slice(0, 120) || "Trade failed");
    } finally {
      setSubmitting(false);
    }
  }, [sizeUsd, placeTrade, marketIndex, direction, leverage, collateralAsset, orderType, limitPrice, currentMarket, addReceipt, cluster, wallet.publicKey, isReady]);

  /* ---- Not connected ---- */
  if (!wallet.publicKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <svg className="w-8 h-8 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
        </svg>
        <p className="text-[12px] text-zinc-500">Connect wallet to start trading</p>
        <button onClick={() => setVisible(true)} className="sov-btn-primary px-4 py-2 text-[12px]">
          Connect Wallet
        </button>
      </div>
    );
  }

  if (!isReady && !initError) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Connecting…
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <p className="text-[11px] text-zinc-400">Connection failed</p>
        <p className="text-[10px] text-zinc-600 max-w-[200px]">{initError}</p>
        <button onClick={retryInit} className="sov-btn-primary px-4 py-1.5 text-[11px]">Retry</button>
      </div>
    );
  }

  const assetLabel = collateralAsset;
  const fmtPrice = (p: number) => p >= 100 ? p.toFixed(2) : p >= 1 ? p.toFixed(4) : p.toFixed(6);

  return (
    <div className="flex flex-col h-full text-[11px]">
      {/* Market + mark price + depth */}
      <div className="px-3 pt-2.5 pb-2 border-b border-white/[0.04]">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-bold text-white">{currentMarket}</span>
          {markPrice > 0 && (
            <span className="text-[13px] font-mono font-bold text-white tabular-nums">
              ${fmtPrice(markPrice)}
            </span>
          )}
        </div>
        {markPrice > 0 && (
          <div className="mt-1.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-zinc-600">DEPTH</span>
              <div className="flex gap-2.5">
                <span className="text-long font-mono tabular-nums">Bid ${(markPrice * 0.9997).toFixed(2)}</span>
                <span className="text-short font-mono tabular-nums">Ask ${(markPrice * 1.0003).toFixed(2)}</span>
              </div>
            </div>
            <div className="flex h-[3px] rounded-full overflow-hidden bg-white/[0.03] mt-0.5">
              <div className="bg-long/60 rounded-l-full" style={{ width: "52%" }} />
              <div className="bg-short/60 rounded-r-full" style={{ width: "48%" }} />
            </div>
          </div>
        )}
      </div>

      {/* Direction */}
      <div className="flex mx-3 mt-2.5 p-[2px] rounded-md bg-white/[0.02] border border-white/[0.04]">
        <button
          onClick={() => setDirection("long")}
          className={`flex-1 py-[6px] rounded-[4px] text-[11px] font-bold transition-all ${direction === "long" ? "bg-long text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
        >
          Long
        </button>
        <button
          onClick={() => setDirection("short")}
          className={`flex-1 py-[6px] rounded-[4px] text-[11px] font-bold transition-all ${direction === "short" ? "bg-short text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
        >
          Short
        </button>
      </div>

      {/* Order type */}
      <div className="flex mx-3 mt-1.5 gap-px">
        {(["market", "limit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            className={`px-3 py-[4px] rounded text-[10px] font-bold uppercase tracking-widest transition ${orderType === t ? "bg-white/[0.06] text-zinc-200" : "text-zinc-600 hover:text-zinc-400"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Scrollable form */}
      <div className="flex-1 px-3 pt-2.5 pb-1 space-y-2.5 overflow-y-auto min-h-0">
        {/* Pay with */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">Pay with</label>
            {walletSol !== null && collateralAsset === "SOL" && (
              <span className="text-[9px] text-zinc-600 font-mono tabular-nums">{walletSol.toFixed(3)} SOL</span>
            )}
          </div>
          <div className="flex gap-[3px]">
            {(["SOL", "USDC"] as CollateralAsset[]).map((a) => (
              <button
                key={a}
                onClick={() => { setCollateralAsset(a); setSizeInput(""); }}
                className={`flex-1 py-[4px] rounded text-[10px] font-bold transition ${collateralAsset === a ? "bg-white/[0.08] text-white" : "bg-white/[0.02] text-zinc-600 hover:text-zinc-400"}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Size in selected asset */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">
              Size ({assetLabel})
            </label>
            {collateralAsset === "SOL" && walletSol !== null && (
              <button
                onClick={() => {
                  const max = Math.max(0, walletSol! - 0.01);
                  setSizeInput(max > 0 ? max.toFixed(4) : "0");
                }}
                className="text-[9px] text-long hover:text-long/80 font-bold uppercase tracking-wider"
              >
                Max
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type="number"
              value={sizeInput}
              onChange={(e) => setSizeInput(e.target.value)}
              placeholder="0.00"
              min="0"
              step="any"
              className="sov-input text-[12px] py-[7px]"
            />
          </div>
          {/* USD equivalent */}
          {sizeUsd > 0 && collateralAsset === "SOL" && (
            <div className="text-[9px] text-zinc-600 font-mono mt-0.5 tabular-nums">
              ≈ ${sizeUsd.toFixed(2)} USD
            </div>
          )}
          {/* Quick sizes in asset terms */}
          <div className="flex gap-1 mt-1">
            {collateralAsset === "SOL"
              ? [0.1, 0.25, 0.5, 1, 2].map((p) => (
                  <button
                    key={p}
                    onClick={() => setSizeInput(String(p))}
                    className={`flex-1 py-[3px] rounded text-[9px] font-bold transition ${sizeInput === String(p) ? "bg-white/[0.08] text-white" : "bg-white/[0.02] text-zinc-600 hover:text-zinc-400"}`}
                  >
                    {p}
                  </button>
                ))
              : [10, 25, 50, 100, 500].map((p) => (
                  <button
                    key={p}
                    onClick={() => setSizeInput(String(p))}
                    className={`flex-1 py-[3px] rounded text-[9px] font-bold transition ${sizeInput === String(p) ? "bg-white/[0.08] text-white" : "bg-white/[0.02] text-zinc-600 hover:text-zinc-400"}`}
                  >
                    ${p}
                  </button>
                ))}
          </div>
        </div>

        {/* Limit price */}
        {orderType === "limit" && (
          <div>
            <label className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold mb-1 block">Limit Price</label>
            <div className="relative">
              <input
                type="number"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={markPrice > 0 ? fmtPrice(markPrice) : "0.00"}
                min="0"
                step="any"
                className="sov-input pl-5 text-[12px] py-[7px]"
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600 text-[11px]">$</span>
            </div>
          </div>
        )}

        {/* Leverage */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">Leverage</label>
            <span className="text-[12px] font-mono font-bold text-white tabular-nums">{leverage}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={maxLev}
            step={1}
            value={leverage}
            onChange={(e) => setLeverage(parseInt(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none bg-white/[0.06] accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
          />
          <div className="flex gap-[3px] mt-1">
            {leveragePresets.map((l) => (
              <button
                key={l}
                onClick={() => setLeverage(l)}
                className={`flex-1 py-[3px] rounded text-[9px] font-bold transition ${leverage === l ? "bg-white/[0.08] text-white" : "bg-white/[0.02] text-zinc-600 hover:text-zinc-400"}`}
              >
                {l}x
              </button>
            ))}
          </div>
        </div>

        {/* Open position in this market — one Liq. Price for your current position */}
        {positionInfo && (
          <div className="rounded-md bg-white/[0.015] border border-white/[0.04] p-2 space-y-[4px]">
            <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mb-0.5">Open position</div>
            <InfoRow label="Entry" value={`$${fmtPrice(positionInfo.entryPrice)}`} />
            <InfoRow label="Mark" value={`$${fmtPrice(positionInfo.markPrice)}`} />
            <InfoRow label="Liq. Price" value={`$${formatLiquidationPrice(positionInfo.liqPrice)}`} valueColor="text-amber-400" />
            <InfoRow label="Size" value={`${positionInfo.size.toFixed(4)} ${currentMarket.replace("-PERP", "")}`} />
            <InfoRow
              label="PnL"
              value={`${positionInfo.pnl >= 0 ? "+" : ""}$${Math.abs(positionInfo.pnl) < 0.01 && positionInfo.pnl !== 0 ? positionInfo.pnl.toFixed(4) : positionInfo.pnl.toFixed(2)}`}
              valueColor={positionInfo.pnl >= 0 ? "text-emerald-400" : "text-red-400"}
            />
          </div>
        )}

        {/* Order preview — Liq. Price for the new order you're about to place */}
        {orderInfo && (
          <div className="rounded-md bg-white/[0.015] border border-white/[0.04] p-2 space-y-[4px]">
            <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mb-0.5">
              {positionInfo ? "New order preview" : "Order preview"}
            </div>
            <InfoRow label="Entry Price" value={`$${fmtPrice(orderInfo.entryPrice)}`} />
            <InfoRow label="Position" value={`$${orderInfo.positionSizeUsd.toFixed(2)}`} />
            <InfoRow label="Margin" value={orderInfo.marginDisplay} />
            <InfoRow label="Liq. Price" value={`$${formatLiquidationPrice(orderInfo.liqPrice)}`} valueColor="text-amber-400" />
            <InfoRow label="Size" value={`${orderInfo.sizeInBaseAsset.toFixed(4)} ${currentMarket.replace("-PERP", "")}`} />
            <InfoRow label="Fee (0.1%)" value={`$${orderInfo.fee.toFixed(2)}`} />
          </div>
        )}

        {/* Account info */}
        {hasAccount && (
          <div className="rounded-md bg-white/[0.015] border border-white/[0.04] p-2 space-y-[4px]">
            <InfoRow label="Equity" value={`$${totalCollateral.toFixed(2)}`} />
            <InfoRow label="Free" value={`$${freeCollateral.toFixed(2)}`} />
          </div>
        )}

        {/* Feedback */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-2.5 py-1.5 text-[10px] text-destructive">{error}</div>
        )}
        {success && (
          <div className="rounded-md bg-long/10 border border-long/20 px-2.5 py-1.5 text-[10px] text-long font-mono">{success}</div>
        )}
      </div>

      {/* Submit */}
      <div className="px-3 pb-3 pt-1 shrink-0">
        <button
          onClick={handleTrade}
          disabled={submitting || !isReady}
          className={`w-full py-2.5 rounded-md text-[12px] font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
            direction === "long"
              ? "bg-long hover:bg-long/90 text-white shadow-lg shadow-long/15"
              : "bg-short hover:bg-short/90 text-white shadow-lg shadow-short/15"
          }`}
        >
          {submitting ? (
            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              {direction === "long" ? "↗" : "↘"} {direction === "long" ? "Long" : "Short"} {currentMarket.replace("-PERP", "")}
            </>
          )}
        </button>
        {!hasAccount && (
          <p className="text-[9px] text-zinc-600 text-center mt-1">Account auto-created on first trade</p>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, valueColor = "text-zinc-300" }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-zinc-600">{label}</span>
      <span className={`text-[10px] font-mono font-semibold tabular-nums ${valueColor}`}>{value}</span>
    </div>
  );
}
