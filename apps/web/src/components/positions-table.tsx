"use client";

import { useState } from "react";
import { useDrift } from "./drift-provider";
import { useReceipts } from "./receipts-provider";
import { useCluster } from "./cluster-provider";
import { useWallet } from "@solana/wallet-adapter-react";

type Tab = "positions" | "orders" | "history";

export function PositionsTable() {
  const { positions, closePosition, hasAccount, isReady } = useDrift();
  const { addReceipt, receipts } = useReceipts();
  const { cluster } = useCluster();
  const wallet = useWallet();
  const [closingIdx, setClosingIdx] = useState<number | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("positions");

  const handleClose = async (marketIndex: number, marketName: string) => {
    setClosingIdx(marketIndex);
    setCloseError(null);
    try {
      const txSig = await closePosition(marketIndex);
      addReceipt({
        id: txSig,
        timestamp: new Date().toISOString(),
        cluster,
        mode: "mainnet",
        venue: "perps",
        action: `CLOSE ${marketName}`,
        marketId: marketName,
        wallet: wallet.publicKey?.toBase58() || "",
        txSignatures: [txSig],
        explorerLinks: [`https://solscan.io/tx/${txSig}`],
        invokedPrograms: [],
      });
    } catch (e: any) {
      console.error("Close failed:", e);
      setCloseError(e?.message?.slice(0, 80) || "Close failed");
      setTimeout(() => setCloseError(null), 5000);
    } finally {
      setClosingIdx(null);
    }
  };

  const handleCloseAll = async () => {
    for (const pos of positions) {
      await handleClose(pos.marketIndex, pos.marketName);
    }
  };

  const history = receipts
    .filter((r) => r.mode === "mainnet" && r.venue === "perps")
    .slice(0, 30);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center h-7 px-3 border-b border-white/[0.04] shrink-0 gap-3">
        {(["positions", "orders", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-[10px] font-bold uppercase tracking-widest transition pb-px ${
              tab === t
                ? "text-white border-b border-emerald-500"
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {t}
            {t === "positions" && positions.length > 0 && (
              <span className="ml-1 text-[9px] text-emerald-400">{positions.length}</span>
            )}
          </button>
        ))}
        {positions.length > 0 && tab === "positions" && (
          <button
            onClick={handleCloseAll}
            className="ml-auto text-[9px] text-zinc-600 hover:text-red-400 font-bold uppercase tracking-wider transition"
          >
            Close All
          </button>
        )}
        {closeError && (
          <span className="ml-auto text-[9px] text-red-400 truncate max-w-[200px]">{closeError}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto min-h-0">
        {tab === "positions" && (
          <PositionsTab
            positions={positions}
            isReady={isReady}
            hasAccount={hasAccount}
            closingIdx={closingIdx}
            onClose={handleClose}
          />
        )}
        {tab === "orders" && <OrdersTab />}
        {tab === "history" && <HistoryTab history={history} />}
      </div>
    </div>
  );
}

function PositionsTab({
  positions,
  isReady,
  hasAccount,
  closingIdx,
  onClose,
}: {
  positions: any[];
  isReady: boolean;
  hasAccount: boolean;
  closingIdx: number | null;
  onClose: (idx: number, name: string) => void;
}) {
  if (!isReady) {
    return <Empty text="Connecting…" />;
  }
  if (!hasAccount) {
    return <Empty text="Place your first trade to get started." />;
  }
  if (positions.length === 0) {
    return <Empty text="No open positions" />;
  }

  return (
    <table className="w-full text-[10px]">
      <thead>
        <tr className="border-b border-white/[0.03]">
          {["Market", "Side", "Size", "Entry", "Mark", "Liq.", "PnL", ""].map((h, i) => (
            <th
              key={h || i}
              className={`px-2.5 py-1.5 text-[9px] text-zinc-600 uppercase tracking-widest font-bold ${
                i < 2 ? "text-left" : "text-right"
              }`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {positions.map((pos) => (
          <tr
            key={pos.marketIndex}
            className="border-b border-white/[0.02] hover:bg-white/[0.01] transition"
          >
            <td className="px-2.5 py-2 font-semibold text-zinc-200">{pos.marketName}</td>
            <td className="px-2.5 py-2">
              <span
                className={`inline-flex items-center px-1.5 py-[1px] rounded text-[9px] font-bold uppercase ${
                  pos.direction === "long"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {pos.direction}
              </span>
            </td>
            <td className="px-2.5 py-2 text-right font-mono text-zinc-400 tabular-nums">
              {pos.size.toFixed(4)}
            </td>
            <td className="px-2.5 py-2 text-right font-mono text-zinc-500 tabular-nums">
              ${pos.entryPrice.toFixed(2)}
            </td>
            <td className="px-2.5 py-2 text-right font-mono text-zinc-300 tabular-nums">
              ${pos.markPrice.toFixed(2)}
            </td>
            <td className="px-2.5 py-2 text-right font-mono text-amber-400/90 tabular-nums">
              ${pos.liquidationPrice.toFixed(2)}
            </td>
            <td
              className={`px-2.5 py-2 text-right font-mono font-bold tabular-nums ${
                pos.pnl >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {pos.pnl >= 0 ? "+" : ""}${Math.abs(pos.pnl) < 0.01 && pos.pnl !== 0 ? pos.pnl.toFixed(4) : pos.pnl.toFixed(2)}
            </td>
            <td className="px-2.5 py-2 text-right">
              <button
                onClick={() => onClose(pos.marketIndex, pos.marketName)}
                disabled={closingIdx === pos.marketIndex}
                className="px-2 py-[3px] rounded text-[9px] font-bold bg-red-500/8 text-red-400 hover:bg-red-500/15 hover:text-red-300 transition disabled:opacity-40"
              >
                {closingIdx === pos.marketIndex ? (
                  <span className="inline-block w-3 h-3 border-[1.5px] border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                ) : (
                  "Close"
                )}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrdersTab() {
  return <Empty text="No open orders" />;
}

function HistoryTab({ history }: { history: any[] }) {
  if (history.length === 0) return <Empty text="No trade history" />;
  return (
    <table className="w-full text-[10px]">
      <thead>
        <tr className="border-b border-white/[0.03]">
          <th className="px-2.5 py-1.5 text-[9px] text-zinc-600 uppercase tracking-widest font-bold text-left">
            Action
          </th>
          <th className="px-2.5 py-1.5 text-[9px] text-zinc-600 uppercase tracking-widest font-bold text-left">
            Market
          </th>
          <th className="px-2.5 py-1.5 text-[9px] text-zinc-600 uppercase tracking-widest font-bold text-right">
            Time
          </th>
          <th className="px-2.5 py-1.5 text-[9px] text-zinc-600 uppercase tracking-widest font-bold text-right">
            Tx
          </th>
        </tr>
      </thead>
      <tbody>
        {history.map((r) => (
          <tr key={r.id} className="border-b border-white/[0.02] hover:bg-white/[0.01]">
            <td className="px-2.5 py-1.5 font-semibold text-zinc-300">{r.action}</td>
            <td className="px-2.5 py-1.5 text-zinc-500">{r.marketId}</td>
            <td className="px-2.5 py-1.5 text-right text-zinc-600 font-mono tabular-nums">
              {new Date(r.timestamp).toLocaleTimeString()}
            </td>
            <td className="px-2.5 py-1.5 text-right">
              <a
                href={r.explorerLinks?.[0] || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-500 hover:text-emerald-400 font-mono"
              >
                {r.txSignatures?.[0]?.slice(0, 8)}…
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-full text-[10px] text-zinc-600 p-4">
      {text}
    </div>
  );
}
