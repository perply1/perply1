"use client";

import { useEffect, useRef, memo } from "react";

interface Props {
  symbol?: string;
  interval?: string;
}

/**
 * TradingView Advanced Chart widget.
 * The contentWindow console error is a known TradingView issue and doesn't affect functionality.
 */
function TradingViewChartInner({ symbol = "PYTH:SOLUSD", interval = "15" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const currentId = ++widgetIdRef.current;

    // Clear previous widget
    container.innerHTML = "";

    // Create wrapper div that TradingView expects
    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.width = "100%";
    widgetDiv.style.height = "100%";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(9, 9, 11, 1)",
      gridColor: "rgba(255, 255, 255, 0.03)",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
      withdateranges: true,
      details: false,
      hotlist: false,
      studies: ["RSI@tv-basicstudies"],
    });

    // Suppress the known TradingView contentWindow error
    script.onerror = () => {};
    widgetDiv.appendChild(script);

    return () => {
      if (currentId === widgetIdRef.current && container) {
        container.innerHTML = "";
      }
    };
  }, [symbol, interval]);

  return (
    <div
      className="tradingview-widget-container w-full h-full"
      ref={containerRef}
      suppressHydrationWarning
    />
  );
}

export const TradingViewChart = memo(TradingViewChartInner);
