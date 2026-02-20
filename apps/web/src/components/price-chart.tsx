"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType } from "lightweight-charts";

export function PriceChart({
  symbol = "SOL",
  days = 7,
  height = 320,
}: {
  symbol?: string;
  days?: number;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    const loadChart = async () => {
      setError(null);
      setLoading(true);
      try {
        const coinId = symbol === "SOL" ? "solana" : symbol.toLowerCase();
        const res = await fetch(
          `/api/coingecko/coins/${coinId}/ohlc?days=${days}`
        );
        if (!res.ok) throw new Error("Failed to fetch price data");
        const raw: [number, number, number, number, number][] = await res.json();

        const data = raw.map(([time, o, h, l, c]) => ({
          time: Math.floor(time / 1000) as import("lightweight-charts").Time,
          open: o,
          high: h,
          low: l,
          close: c,
        }));

        if (chartRef.current) chartRef.current.remove();
        const container = containerRef.current;
        if (!container) return;
        const chart = createChart(container, {
          layout: {
            background: { type: ColorType.Solid, color: "#0a0a0b" },
            textColor: "#a1a1aa",
          },
          grid: {
            vertLines: { color: "rgba(255,255,255,0.06)" },
            horzLines: { color: "rgba(255,255,255,0.06)" },
          },
          width: container.clientWidth,
          height,
          rightPriceScale: { borderColor: "rgba(255,255,255,0.06)" },
          timeScale: {
            borderColor: "rgba(255,255,255,0.06)",
            timeVisible: true,
            secondsVisible: false,
          },
        });

        const candlestickSeries = chart.addCandlestickSeries({
          upColor: "#22c55e",
          downColor: "#f87171",
          borderVisible: false,
        });
        candlestickSeries.setData(data);
        chart.timeScale().fitContent();
        chartRef.current = chart;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chart unavailable");
      } finally {
        setLoading(false);
      }
    };

    loadChart();
    const resize = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height,
        });
      }
    });
    resize.observe(containerRef.current);

    return () => {
      resize.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [symbol, days, height]);

  return (
    <div className="relative" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 text-zinc-500">
          Loading chart…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 text-amber-400">
          {error}
        </div>
      )}
    </div>
  );
}
