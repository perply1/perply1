"use client";

import React from "react";
import { useMarketData, TOKENS } from "@/components/market-data-provider";

function formatCompact(price: number): string {
  if (price >= 10000)
    return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (price >= 1)
    return `$${price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

/**
 * Bloomberg-style scrolling ticker tape showing market prices.
 * Uses real data from CoinGecko via MarketDataProvider.
 */
export function TickerTape() {
  const { prices, loaded } = useMarketData();

  const priced = React.useMemo(() => {
    if (!loaded) return [];
    return TOKENS.filter((t) => {
      const p = prices[t.id];
      return p && p.price > 0;
    });
  }, [prices, loaded]);

  if (!loaded || priced.length === 0) return null;

  const items = [...priced, ...priced];

  return (
    <div className="ticker-tape-gradient border-b border-white/[0.04] overflow-hidden relative">
      <div
        className="flex items-center ticker-scroll whitespace-nowrap py-1.5"
        style={
          {
            "--ticker-duration": `${priced.length * 3}s`,
          } as React.CSSProperties
        }
      >
        {items.map((m, i) => {
          const data = prices[m.id];
          const price = data?.price ?? 0;
          return (
            <div
              key={`${m.id}-${i}`}
              className="flex items-center gap-1.5 px-4 shrink-0"
            >
              <img
                src={m.logo}
                alt={m.symbol}
                className="w-4 h-4 rounded-full shrink-0"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <span className="text-[10px] font-mono font-bold text-muted-foreground">
                {m.symbol}
              </span>
              <span className="text-[10px] font-mono text-foreground">
                {formatCompact(price)}
              </span>
              <span className="text-border/30">|</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
