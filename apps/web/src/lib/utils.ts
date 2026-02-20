type ClassValue =
  | string
  | number
  | boolean
  | undefined
  | null
  | ClassValue[]
  | { [key: string]: boolean | undefined };

function flatten(input: ClassValue): string[] {
  if (input === undefined || input === null || input === false) return [];
  if (typeof input === "string") return input.trim() ? [input] : [];
  if (typeof input === "number") return [String(input)];
  if (Array.isArray(input)) return input.flatMap(flatten);
  if (typeof input === "object") {
    return Object.entries(input)
      .filter(([, v]) => v)
      .map(([k]) => k);
  }
  return [];
}

export function cn(...inputs: ClassValue[]) {
  return inputs.flatMap(flatten).filter(Boolean).join(" ");
}

/**
 * Isolated-margin liquidation price (standard perp formula).
 * Matches the convention used by most perp UIs (e.g. Jupiter-style).
 * - Long: equity = margin + (liq - entry)*size; at liq, equity = maint * notional → liq = entry * (1 - 1/lev) / (1 - maint)
 * - Short: equity = margin + (entry - liq)*size; at liq → liq = entry * (1 + 1/lev) / (1 + maint)
 * Note: Perply mainnet uses Drift; Jupiter Perps is a different protocol. Drift SDK liquidationPrice() is used when
 * available for open positions; this formula is used for order preview and fallback.
 */
export function liquidationPrice(
  entryPrice: number,
  leverage: number,
  direction: "long" | "short",
  maintenanceMarginRatio: number
): number {
  const lev = Math.max(1, leverage);
  const m = Math.min(0.99, Math.max(0, maintenanceMarginRatio));
  if (direction === "long") {
    const denom = 1 - m;
    if (denom <= 0) return 0;
    return entryPrice * (1 - 1 / lev) / denom;
  }
  return entryPrice * (1 + 1 / lev) / (1 + m);
}

/**
 * Live (mark-to-market) liquidation price for an open position.
 * Moves with price: when mark goes up/down, equity (margin + pnl) changes, so the
 * price level at which you'd be liquidated changes — like Jupiter and other perp UIs.
 * - Long: liq = (entry - equity/size) / (1 - maint)
 * - Short: liq = (entry + equity/size) / (1 + maint)
 * where equity = initial margin + pnl (margin = notional/leverage).
 */
export function liquidationPriceLive(
  entryPrice: number,
  size: number,
  leverage: number,
  direction: "long" | "short",
  pnl: number,
  maintenanceMarginRatio: number
): number {
  if (!Number.isFinite(size) || size <= 0) return 0;
  const m = Math.min(0.99, Math.max(0, maintenanceMarginRatio));
  const lev = Math.max(1, leverage);
  const margin = (size * entryPrice) / lev;
  const equity = margin + pnl;

  if (direction === "long") {
    const denom = 1 - m;
    if (denom <= 0) return 0;
    const liq = (entryPrice - equity / size) / denom;
    return Math.max(0, liq);
  }
  const liq = (entryPrice + equity / size) / (1 + m);
  return Math.max(0, liq);
}

/**
 * Format liquidation price for display. Always shows as a clear USD price (2 decimals).
 * Avoids displaying raw large numbers that can look like "80k" or wrong scale.
 */
export function formatLiquidationPrice(price: number): string {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) return "0.00";
  if (price >= 1_000_000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  if (price > 0) return price.toFixed(4);
  return "0.00";
}
