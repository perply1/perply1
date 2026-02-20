"use client";

import { useEffect, useState } from "react";
import { useMarketData } from "./market-data-provider";

/**
 * Top stats bar for current selected market.
 * Gets base price from shared data, fetches extra stats (high/low/vol) separately.
 */
export function MarketStatsBar({
  symbol = "SOL",
  coingeckoId = "solana",
}: {
  symbol?: string;
  coingeckoId?: string;
}) {
  const { prices } = useMarketData();
  const baseData = prices[coingeckoId];

  const [extra, setExtra] = useState<{ high24h: number; low24h: number; volume24h: number } | null>(null);

  // Fetch extra stats (high/low/vol) — one small call
  useEffect(() => {
    let cancelled = false;
    const fetchExtra = async () => {
      try {
        const res = await fetch(`/api/coingecko/coins/${coingeckoId}`);
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled) {
          setExtra({
            high24h: d.market_data?.high_24h?.usd ?? 0,
            low24h: d.market_data?.low_24h?.usd ?? 0,
            volume24h: d.market_data?.total_volume?.usd ?? 0,
          });
        }
      } catch {}
    };
    fetchExtra();
    const id = setInterval(fetchExtra, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [coingeckoId]);

  const price = baseData?.price ?? 0;
  const change = baseData?.change24h ?? 0;

  const fmt = (n: number) =>
    n >= 10000 ? n.toFixed(0) : n >= 100 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(4);
  const fmtVol = (n: number) => {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    return `$${(n / 1e3).toFixed(0)}K`;
  };

  return (
    <div className="flex items-center h-7 px-2 border-b border-white/[0.04] bg-[#0a0a0c] shrink-0 overflow-x-auto gap-4">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[12px] font-bold text-white">{symbol}-PERP</span>
        {price > 0 && (
          <span className="text-[13px] font-bold font-mono text-white tabular-nums">${fmt(price)}</span>
        )}
        {price > 0 && (
          <span className={`text-[10px] font-bold tabular-nums font-mono ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {change >= 0 ? "+" : ""}{change.toFixed(2)}%
          </span>
        )}
      </div>

      <div className="w-px h-3 bg-white/[0.06] shrink-0" />

      {price > 0 && (
        <>
          <Stat label="Mark" value={`$${fmt(price)}`} />
          {extra && (
            <>
              <Stat label="24H Vol" value={fmtVol(extra.volume24h)} />
              <Stat label="24H High" value={`$${fmt(extra.high24h)}`} />
              <Stat label="24H Low" value={`$${fmt(extra.low24h)}`} />
            </>
          )}
        </>
      )}
      {!price && <span className="text-[10px] text-zinc-700">Loading…</span>}
    </div>
  );
}

function Stat({ label, value, valueColor = "text-zinc-300" }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <span className="text-[9px] text-zinc-600 uppercase tracking-wider">{label}</span>
      <span className={`text-[10px] font-mono font-semibold tabular-nums ${valueColor}`}>{value}</span>
    </div>
  );
}
