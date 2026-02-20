"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { pushPrices } from "@/hooks/use-price-history";

/* ------------------------------------------------------------------ */
/*  Static token metadata (no API needed)                              */
/* ------------------------------------------------------------------ */

export interface TokenMeta {
  id: string;
  symbol: string;
  label: string;
  logo: string;
}

export const TOKENS: TokenMeta[] = [
  { id: "solana", symbol: "SOL", label: "SOL-PERP", logo: "https://assets.coingecko.com/coins/images/4128/small/solana.png" },
  { id: "bitcoin", symbol: "BTC", label: "BTC-PERP", logo: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png" },
  { id: "ethereum", symbol: "ETH", label: "ETH-PERP", logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" },
  { id: "aptos", symbol: "APT", label: "APT-PERP", logo: "https://assets.coingecko.com/coins/images/26455/small/aptos_round.png" },
  { id: "bonk", symbol: "BONK", label: "BONK-PERP", logo: "https://assets.coingecko.com/coins/images/28600/small/bonk.jpg" },
  { id: "matic-network", symbol: "MATIC", label: "MATIC-PERP", logo: "https://assets.coingecko.com/coins/images/4713/small/polygon.png" },
  { id: "arbitrum", symbol: "ARB", label: "ARB-PERP", logo: "https://assets.coingecko.com/coins/images/16547/small/arb.jpg" },
  { id: "dogecoin", symbol: "DOGE", label: "DOGE-PERP", logo: "https://assets.coingecko.com/coins/images/5/small/dogecoin.png" },
  { id: "binancecoin", symbol: "BNB", label: "BNB-PERP", logo: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png" },
  { id: "sui", symbol: "SUI", label: "SUI-PERP", logo: "https://assets.coingecko.com/coins/images/26375/small/sui-ocean-square.png" },
  { id: "pepe", symbol: "PEPE", label: "PEPE-PERP", logo: "https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg" },
  { id: "dogwifcoin", symbol: "WIF", label: "WIF-PERP", logo: "https://assets.coingecko.com/coins/images/33566/small/dogwifhat.jpg" },
  { id: "jupiter-exchange-solana", symbol: "JUP", label: "JUP-PERP", logo: "https://assets.coingecko.com/coins/images/34188/small/jup.png" },
  { id: "render-token", symbol: "RNDR", label: "RNDR-PERP", logo: "https://assets.coingecko.com/coins/images/11636/small/rndr.png" },
  { id: "pyth-network", symbol: "PYTH", label: "PYTH-PERP", logo: "https://assets.coingecko.com/coins/images/31924/small/pyth.png" },
  { id: "jito-governance-token", symbol: "JTO", label: "JTO-PERP", logo: "https://assets.coingecko.com/coins/images/33228/small/jto.png" },
];

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MarketPriceData {
  price: number;
  change24h: number;
}

interface MarketDataState {
  /** price + 24h change keyed by coingecko id */
  prices: Record<string, MarketPriceData>;
  /** Whether first load is done */
  loaded: boolean;
}

const MarketDataContext = createContext<MarketDataState>({
  prices: {},
  loaded: false,
});

export const useMarketData = () => useContext(MarketDataContext);

/* ------------------------------------------------------------------ */
/*  Provider — single API call shared by all components                */
/* ------------------------------------------------------------------ */

export function MarketDataProvider({ children }: { children: ReactNode }) {
  const [prices, setPrices] = useState<Record<string, MarketPriceData>>({});
  const [loaded, setLoaded] = useState(false);
  const fetchingRef = useRef(false);

  const fetchPrices = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch("/api/coingecko/simple-price");
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, MarketPriceData> = {};
      for (const token of TOKENS) {
        const d = data[token.id];
        if (d) {
          map[token.id] = {
            price: d.usd ?? 0,
            change24h: d.usd_24h_change ?? 0,
          };
        }
      }
      setPrices(map);
      setLoaded(true);
      pushPrices(
        Object.fromEntries(
          Object.entries(map).map(([id, d]) => [id, { price: d.price }])
        )
      );
    } catch {
      // silent — keep previous data
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    const id = setInterval(fetchPrices, 15_000); // 15s for fresher PnL (CoinGecko free tier allows ~10–30/min)
    return () => clearInterval(id);
  }, [fetchPrices]);

  return (
    <MarketDataContext.Provider value={{ prices, loaded }}>
      {children}
    </MarketDataContext.Provider>
  );
}
