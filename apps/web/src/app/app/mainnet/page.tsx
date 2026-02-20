"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useCluster } from "@/components/cluster-provider";
import { MarketStatsBar } from "@/components/market-stats-bar";
import { MarketSidebar } from "@/components/market-sidebar";
import { TradingPanel } from "@/components/trading-panel";
import { PositionsTable } from "@/components/positions-table";
import { AccountPanel } from "@/components/account-panel";
import { DriftProvider, useDrift } from "@/components/drift-provider";
import { useMarketData } from "@/components/market-data-provider";

const TradingViewChart = dynamic(
  () => import("@/components/tradingview-chart").then((m) => m.TradingViewChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-muted-foreground text-[11px]">
        Loading chart…
      </div>
    ),
  }
);

/** Map market labels to CoinGecko IDs and TradingView symbols */
const MARKET_MAP: Record<string, { coingeckoId: string; tvSymbol: string; baseSymbol: string }> = {
  "SOL-PERP": { coingeckoId: "solana", tvSymbol: "PYTH:SOLUSD", baseSymbol: "SOL" },
  "BTC-PERP": { coingeckoId: "bitcoin", tvSymbol: "PYTH:BTCUSD", baseSymbol: "BTC" },
  "ETH-PERP": { coingeckoId: "ethereum", tvSymbol: "PYTH:ETHUSD", baseSymbol: "ETH" },
  "APT-PERP": { coingeckoId: "aptos", tvSymbol: "PYTH:APTUSD", baseSymbol: "APT" },
  "BONK-PERP": { coingeckoId: "bonk", tvSymbol: "PYTH:BONKUSD", baseSymbol: "BONK" },
  "MATIC-PERP": { coingeckoId: "matic-network", tvSymbol: "PYTH:MATICUSD", baseSymbol: "MATIC" },
  "ARB-PERP": { coingeckoId: "arbitrum", tvSymbol: "PYTH:ARBUSD", baseSymbol: "ARB" },
  "DOGE-PERP": { coingeckoId: "dogecoin", tvSymbol: "PYTH:DOGEUSD", baseSymbol: "DOGE" },
  "BNB-PERP": { coingeckoId: "binancecoin", tvSymbol: "PYTH:BNBUSD", baseSymbol: "BNB" },
  "SUI-PERP": { coingeckoId: "sui", tvSymbol: "PYTH:SUIUSD", baseSymbol: "SUI" },
  "PEPE-PERP": { coingeckoId: "pepe", tvSymbol: "PYTH:PEPEUSD", baseSymbol: "PEPE" },
  "WIF-PERP": { coingeckoId: "dogwifcoin", tvSymbol: "PYTH:WIFUSD", baseSymbol: "WIF" },
  "JUP-PERP": { coingeckoId: "jupiter-exchange-solana", tvSymbol: "PYTH:JUPUSD", baseSymbol: "JUP" },
  "RNDR-PERP": { coingeckoId: "render-token", tvSymbol: "PYTH:RNDRUSD", baseSymbol: "RNDR" },
  "PYTH-PERP": { coingeckoId: "pyth-network", tvSymbol: "PYTH:PYTHUSD", baseSymbol: "PYTH" },
  "JTO-PERP": { coingeckoId: "jito-governance-token", tvSymbol: "PYTH:JTOUSD", baseSymbol: "JTO" },
};

export default function MainnetPage() {
  return <MainnetContent />;
}

function MainnetContent() {
  const { setMode } = useCluster();
  const [currentMarket, setCurrentMarket] = useState("SOL-PERP");
  const { prices } = useMarketData();

  useEffect(() => {
    setMode("mainnet");
  }, [setMode]);

  const marketInfo = MARKET_MAP[currentMarket] || MARKET_MAP["SOL-PERP"];
  const fallbackMarkPrice = prices[marketInfo.coingeckoId]?.price ?? 0;

  const handleMarketSelect = useCallback((label: string, _coingeckoId: string) => {
    setCurrentMarket(label);
  }, []);

  return (
    <DriftProvider>
      <div className="flex-1 flex flex-col min-h-0 bg-background">
        <MarketStatsBar symbol={marketInfo.baseSymbol} coingeckoId={marketInfo.coingeckoId} />

        <div className="flex-1 flex flex-col lg:flex-row min-h-0 min-w-0">
          <div className="hidden lg:flex shrink-0">
            <MarketSidebar selectedMarket={currentMarket} onSelect={handleMarketSelect} />
          </div>

          <div className="flex-1 flex flex-col min-w-0 min-h-0 order-1 lg:order-2">
            <div className="flex-1 min-h-[180px] sm:min-h-[200px]">
              <TradingViewChart symbol={marketInfo.tvSymbol} interval="15" />
            </div>

            <div className="h-[140px] sm:h-[180px] lg:h-[200px] border-t border-border shrink-0">
              <PositionsTable />
            </div>
          </div>

          <div className="w-full lg:w-[280px] xl:w-[300px] border-t lg:border-t-0 lg:border-l border-border flex flex-col shrink-0 order-2 lg:order-3 min-h-[280px] lg:min-h-0">
            <div className="flex-1 overflow-auto lg:overflow-hidden min-h-0">
              <TradingPanelWithLiveMark
                currentMarket={currentMarket}
                fallbackMarkPrice={fallbackMarkPrice}
              />
            </div>
            <AccountPanel />
          </div>
        </div>
      </div>
    </DriftProvider>
  );
}

/** Uses Drift live mark when available so order preview liq price updates with price (Jupiter-style). */
function TradingPanelWithLiveMark({
  currentMarket,
  fallbackMarkPrice,
}: {
  currentMarket: string;
  fallbackMarkPrice: number;
}) {
  const { markPricesByMarket } = useDrift();
  const markPrice = markPricesByMarket[currentMarket] ?? fallbackMarkPrice;
  return <TradingPanel currentMarket={currentMarket} markPrice={markPrice} />;
}
