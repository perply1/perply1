"use client";

import { useMarketData, TOKENS } from "./market-data-provider";

const fmt = (p: number) => {
  if (p >= 10000) return `$${p.toFixed(0)}`;
  if (p >= 100) return `$${p.toFixed(1)}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
};

/**
 * Top scrolling ticker bar — uses shared market data (no extra API calls).
 */
export function TickerBar() {
  const { prices, loaded } = useMarketData();

  if (!loaded) return null;

  return (
    <div className="h-6 flex items-center bg-[#07070a] border-b border-white/[0.03] overflow-x-auto shrink-0">
      <div className="flex items-center gap-0 px-1 min-w-max">
        {TOKENS.map((t) => {
          const data = prices[t.id];
          if (!data) return null;
          return (
            <div
              key={t.symbol}
              className="flex items-center gap-1.5 px-2.5 border-r border-white/[0.03] last:border-0"
            >
              <span className="text-[10px] font-bold text-zinc-500">{t.symbol}</span>
              <span className="text-[10px] font-mono text-zinc-300 tabular-nums">{fmt(data.price)}</span>
              <span
                className={`text-[9px] font-mono tabular-nums ${
                  data.change24h >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {data.change24h >= 0 ? "+" : ""}
                {data.change24h.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
