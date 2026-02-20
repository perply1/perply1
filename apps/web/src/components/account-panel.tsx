"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useDrift, type CollateralAsset } from "./drift-provider";
import { useReceipts } from "./receipts-provider";
import { useCluster } from "./cluster-provider";

/**
 * Slim account overview bar — shows collateral status.
 * Withdraw-only since deposits happen automatically with each trade.
 */
export function AccountPanel() {
  const wallet = useWallet();
  const {
    hasAccount,
    freeCollateral,
    totalCollateral,
    unrealizedPnl,
    withdraw,
  } = useDrift();
  const { addReceipt } = useReceipts();
  const { cluster } = useCluster();

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [asset, setAsset] = useState<CollateralAsset>("SOL");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleWithdraw = useCallback(async () => {
    setError(null);
    setSuccess(null);
    const val = parseFloat(amount);
    if (!val || val <= 0) { setError("Enter an amount"); return; }
    setSubmitting(true);
    try {
      const txSig = await withdraw(val, asset);
      setSuccess("Withdrawn");
      setAmount("");
      addReceipt({
        id: txSig,
        timestamp: new Date().toISOString(),
        cluster,
        mode: "mainnet",
        venue: "perps",
        action: `WITHDRAW ${asset}`,
        marketId: asset,
        wallet: wallet.publicKey?.toBase58() || "",
        txSignatures: [txSig],
        explorerLinks: [`https://solscan.io/tx/${txSig}`],
        invokedPrograms: [],
      });
    } catch (e: any) {
      setError(e?.message?.slice(0, 100) || "Withdraw failed");
    } finally {
      setSubmitting(false);
    }
  }, [amount, asset, withdraw, addReceipt, cluster, wallet.publicKey]);

  if (!wallet.publicKey || !hasAccount) return null;

  return (
    <div className="border-t border-white/[0.04]">
      {/* Collateral summary row */}
      <div className="flex items-center justify-between px-3 h-8 bg-white/[0.01]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-zinc-600">Equity</span>
            <span className="font-mono text-zinc-400 tabular-nums">${totalCollateral.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-zinc-600">Free</span>
            <span className="font-mono text-zinc-400 tabular-nums">${freeCollateral.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-zinc-600">uPnL</span>
            <span className={`font-mono tabular-nums ${unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toFixed(2)}
            </span>
          </div>
        </div>
        <button
          onClick={() => setShowWithdraw(!showWithdraw)}
          className="text-[9px] text-zinc-600 hover:text-zinc-400 font-bold uppercase tracking-wider transition"
        >
          {showWithdraw ? "Close" : "Withdraw"}
        </button>
      </div>

      {/* Withdraw form (expandable) */}
      {showWithdraw && (
        <div className="px-3 py-2.5 border-t border-white/[0.04] space-y-2">
          <div className="flex gap-1.5">
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value as CollateralAsset)}
              className="appearance-none bg-white/[0.04] border border-white/[0.06] rounded-md pl-2 pr-6 text-[11px] font-bold text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value="SOL" className="bg-[#111113]">SOL</option>
              <option value="USDC" className="bg-[#111113]">USDC</option>
            </select>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="any"
              className="sov-input flex-1 text-[12px] py-1.5"
            />
            <button
              onClick={handleWithdraw}
              disabled={submitting}
              className="sov-btn-primary px-3 py-1.5 text-[11px]"
            >
              {submitting ? "…" : "Withdraw"}
            </button>
          </div>
          {error && <div className="text-[10px] text-red-400">{error}</div>}
          {success && <div className="text-[10px] text-emerald-400">{success}</div>}
        </div>
      )}
    </div>
  );
}
