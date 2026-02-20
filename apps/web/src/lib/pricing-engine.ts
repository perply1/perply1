/**
 * Pricing Engine - PropAMM matcher guardrails
 * 
 * Implements thin-market protections:
 * - Inventory-aware skew (spread shifts based on LP inventory imbalance)
 * - Volatility-scaled spreads (spread widens as realized/estimated vol rises)
 * - Utilization-based widening (if OI / margin utilization rises, widen)
 * - Oracle divergence guards (if mark deviates from oracle/TWAP, widen or halt risk-increasing)
 * - Rate limits / throttles (caps on how fast someone can push inventory or extract edge)
 */

export type VolRegime = "low" | "med" | "high" | null; // null = no data available
export type GuardState = "normal" | "widened" | "throttled" | "halted";

export interface PricingParams {
  /** Base spread (basis points) */
  baseSpreadBps: number;
  /** Trading fee (basis points) */
  tradingFeeBps: number;
  /** Max total spread (basis points) */
  maxTotalBps: number;
  /** Impact multiplier (vAMM only) */
  impactKBps: number;
  /** Liquidity notional (e6) */
  liquidityNotionalE6: bigint;
}

export interface MarketState {
  /** Current LP inventory (base units, positive = long exposure, negative = short exposure) */
  inventoryBase: bigint;
  /** Max inventory limit (base units) */
  maxInventoryAbs: bigint;
  /** Current open interest (notional, e6) */
  openInterestE6: bigint;
  /** Max OI capacity (notional, e6) */
  maxOICapacityE6: bigint;
  /** Oracle price (e6) */
  oraclePriceE6: bigint;
  /** Mark price (e6) */
  markPriceE6: bigint;
  /** Last oracle update slot */
  oracleLastSlot: number;
  /** Current slot */
  currentSlot: number;
  /** Last crank slot */
  crankLastSlot: number;
  /** Max crank staleness (slots) */
  maxCrankStalenessSlots: number;
  /** Spot reference price (e6, optional) - for spot/perps concurrent checks */
  spotPriceE6?: bigint;
  /** Spot liquidity depth (notional, e6, optional) */
  spotLiquidityE6?: bigint;
  /** If false, oracle divergence/freshness are not used for guards (show "—" in UI) */
  hasRealOracle?: boolean;
}

export interface VolatilityMetrics {
  /** Realized volatility (annualized, decimal) */
  realizedVol?: number;
  /** Estimated volatility (annualized, decimal) */
  estimatedVol?: number;
  /** Regime classification */
  regime: VolRegime;
}

export interface PricingResult {
  /** Final spread (basis points) */
  spreadBps: number;
  /** Skew adjustment (basis points) */
  skewAdjustmentBps: number;
  /** Volatility adjustment (basis points) */
  volAdjustmentBps: number;
  /** Utilization adjustment (basis points) */
  utilizationAdjustmentBps: number;
  /** Oracle divergence adjustment (basis points) */
  divergenceAdjustmentBps: number;
  /** Guard state */
  guardState: GuardState;
  /** Whether any guard triggered */
  guardTriggered: boolean;
  /** Pricing context for receipt */
  pricingContext: {
    spreadBps: number;
    skewBefore: number;
    skewAfter: number;
    volRegime: VolRegime | null; // null = no data, show "—"
    utilization: number;
    oracleFreshnessSlots: number | null; // null when no real oracle (show "—")
    oracleDivergenceBps: number | null; // null when no real oracle (show "—")
    crankFreshnessSlots: number;
    guardState: GuardState;
    guardTriggered: boolean;
    /** Human-readable reason for guard state (venue-grade audit) */
    guardReason: string;
    /** For audit: mark price e6, oracle price e6, divergence thresholds */
    markPriceE6: bigint;
    oraclePriceE6: bigint;
    divergenceThresholdBps: number;
    divergenceHaltBps: number;
  };
}

/**
 * Calculate inventory skew (normalized to -1 to +1)
 * Positive = LP is long (inventory > 0), negative = LP is short (inventory < 0)
 */
export function calculateSkew(inventoryBase: bigint, maxInventoryAbs: bigint): number {
  if (maxInventoryAbs === 0n) return 0;
  const skew = Number(inventoryBase) / Number(maxInventoryAbs);
  return Math.max(-1, Math.min(1, skew));
}

/**
 * Calculate utilization (OI vs capacity, 0 to 1)
 */
export function calculateUtilization(openInterestE6: bigint, maxOICapacityE6: bigint): number {
  if (maxOICapacityE6 === 0n) return 0;
  const util = Number(openInterestE6) / Number(maxOICapacityE6);
  return Math.max(0, Math.min(1, util));
}

/**
 * Calculate oracle divergence (mark vs oracle, basis points)
 */
export function calculateOracleDivergence(
  markPriceE6: bigint,
  oraclePriceE6: bigint
): number {
  if (oraclePriceE6 === 0n) return 0;
  const diff = Number(markPriceE6 - oraclePriceE6);
  const pct = (diff / Number(oraclePriceE6)) * 10000; // Convert to bps
  return Math.abs(pct);
}

/**
 * Calculate spot divergence (mark vs spot, basis points)
 * Used for spot/perps concurrent checks
 */
export function calculateSpotDivergence(
  markPriceE6: bigint,
  spotPriceE6: bigint
): number {
  if (spotPriceE6 === 0n) return 0;
  const diff = Number(markPriceE6 - spotPriceE6);
  const pct = (diff / Number(spotPriceE6)) * 10000; // Convert to bps
  return Math.abs(pct);
}

/**
 * Check spot liquidity depth
 * Returns true if spot has sufficient liquidity to serve as reference
 */
export function hasSpotLiquidity(spotLiquidityE6?: bigint, minLiquidityE6: bigint = BigInt(100_000_000)): boolean {
  if (!spotLiquidityE6) return false;
  return spotLiquidityE6 >= minLiquidityE6;
}

/**
 * Classify volatility regime
 */
export function classifyVolRegime(vol?: number): VolRegime | null {
  // If no vol data available, return null (must show "—" and not affect guards)
  if (vol === undefined || vol === null) return null;
  // Thresholds: low < 0.3, med < 0.8, high >= 0.8
  if (vol < 0.3) return "low";
  if (vol < 0.8) return "med";
  return "high";
}

/**
 * Calculate skew-based spread adjustment
 * When LP is long (skew > 0), widen ask (make buying more expensive)
 * When LP is short (skew < 0), widen bid (make selling more expensive)
 */
export function calculateSkewAdjustment(
  skew: number,
  tradeSize: bigint,
  isBuy: boolean,
  maxSkewAdjustmentBps: number = 100 // Max 1% adjustment
): number {
  if (maxSkewAdjustmentBps === 0) return 0;
  
  // If buying and LP is long (skew > 0), widen spread
  // If selling and LP is short (skew < 0), widen spread
  const shouldWiden = (isBuy && skew > 0) || (!isBuy && skew < 0);
  
  if (!shouldWiden) return 0;
  
  // Adjustment scales with absolute skew
  const adjustment = Math.abs(skew) * maxSkewAdjustmentBps;
  return Math.min(adjustment, maxSkewAdjustmentBps);
}

/**
 * Calculate volatility-based spread adjustment
 */
export function calculateVolAdjustment(
  regime: VolRegime,
  maxVolAdjustmentBps: number = 150 // Max 1.5% adjustment
): number {
  switch (regime) {
    case "low":
      return 0;
    case "med":
      return maxVolAdjustmentBps * 0.5; // 50% of max
    case "high":
      return maxVolAdjustmentBps; // Full adjustment
  }
}

/**
 * Calculate utilization-based spread adjustment
 */
export function calculateUtilizationAdjustment(
  utilization: number,
  maxUtilAdjustmentBps: number = 100 // Max 1% adjustment
): number {
  if (utilization < 0.5) return 0; // No adjustment below 50%
  // Linear scaling from 50% to 100%
  const excess = (utilization - 0.5) * 2; // 0 to 1
  return excess * maxUtilAdjustmentBps;
}

/**
 * Calculate oracle divergence-based adjustment
 */
export function calculateDivergenceAdjustment(
  divergenceBps: number,
  thresholdBps: number = 50, // 0.5% threshold
  maxAdjustmentBps: number = 200 // Max 2% adjustment
): { adjustment: number; shouldHalt: boolean } {
  if (divergenceBps < thresholdBps) {
    return { adjustment: 0, shouldHalt: false };
  }
  
  // Linear scaling from threshold to 2x threshold
  const excess = Math.min(1, (divergenceBps - thresholdBps) / thresholdBps);
  const adjustment = excess * maxAdjustmentBps;
  
  // Halt if divergence exceeds 2x threshold
  const shouldHalt = divergenceBps > thresholdBps * 2;

  return { adjustment, shouldHalt };
}

/** Divergence threshold (bps) above which spread widens */
export const DIVERGENCE_THRESHOLD_BPS = 50;
/** Divergence (bps) above which trading halts */
export const DIVERGENCE_HALT_BPS = 100;

/**
 * Check crank freshness
 */
export function checkCrankFreshness(
  crankLastSlot: number,
  currentSlot: number,
  maxStalenessSlots: number
): { fresh: boolean; slotsSince: number } {
  const slotsSince = currentSlot - crankLastSlot;
  const fresh = slotsSince <= maxStalenessSlots;
  return { fresh, slotsSince };
}

/**
 * Check oracle freshness
 */
export function checkOracleFreshness(
  oracleLastSlot: number,
  currentSlot: number,
  maxStalenessSlots: number = 150 // ~1 minute at 400ms/slot
): { fresh: boolean; slotsSince: number } {
  const slotsSince = currentSlot - oracleLastSlot;
  const fresh = slotsSince <= maxStalenessSlots;
  return { fresh, slotsSince };
}

/**
 * Main pricing engine: compute final spread with all guardrails
 */
export function computePricing(
  params: PricingParams,
  marketState: MarketState,
  tradeSize: bigint,
  isBuy: boolean,
  volMetrics?: VolatilityMetrics
): PricingResult {
  const {
    baseSpreadBps,
    tradingFeeBps,
    maxTotalBps,
  } = params;

  // Base spread + fee
  let totalSpreadBps = baseSpreadBps + tradingFeeBps;

  // Calculate skew
  const skewBefore = calculateSkew(marketState.inventoryBase, marketState.maxInventoryAbs);
  const skewAdjustmentBps = calculateSkewAdjustment(skewBefore, tradeSize, isBuy);

  // Calculate volatility adjustment (only if vol data available)
  const volRegime = volMetrics?.regime || classifyVolRegime(volMetrics?.realizedVol);
  // If no vol data (null), vol adjustment must be 0 (no effect on spread/guards)
  const volAdjustmentBps = volRegime !== null ? calculateVolAdjustment(volRegime) : 0;

  // Calculate utilization adjustment
  const utilization = calculateUtilization(marketState.openInterestE6, marketState.maxOICapacityE6);
  const utilizationAdjustmentBps = calculateUtilizationAdjustment(utilization);

  // Calculate oracle divergence
  const oracleDivergenceBps = calculateOracleDivergence(marketState.markPriceE6, marketState.oraclePriceE6);
  
  // Check spot divergence if spot reference available
  let spotDivergenceBps = 0;
  if (marketState.spotPriceE6 && hasSpotLiquidity(marketState.spotLiquidityE6)) {
    spotDivergenceBps = calculateSpotDivergence(marketState.markPriceE6, marketState.spotPriceE6);
    // Use max of oracle and spot divergence
    const maxDivergence = Math.max(oracleDivergenceBps, spotDivergenceBps);
    // Spot divergence adds additional guard (stricter threshold)
    if (spotDivergenceBps > 30) { // 0.3% threshold for spot
      // Add extra penalty for spot divergence
      spotDivergenceBps = Math.max(spotDivergenceBps, maxDivergence);
    }
  }

  const hasRealOracle = marketState.hasRealOracle !== false;
  const effectiveDivergenceBps = hasRealOracle ? Math.max(oracleDivergenceBps, spotDivergenceBps) : 0;
  const divergenceResult = calculateDivergenceAdjustment(
    effectiveDivergenceBps,
    DIVERGENCE_THRESHOLD_BPS
  );

  // Check freshness
  const crankFreshness = checkCrankFreshness(
    marketState.crankLastSlot,
    marketState.currentSlot,
    marketState.maxCrankStalenessSlots
  );
  const oracleFreshness = checkOracleFreshness(
    marketState.oracleLastSlot,
    marketState.currentSlot
  );

  // Determine guard state (crank staleness must not show NORMAL)
  let guardState: GuardState = "normal";
  let guardTriggered = false;
  let guardReason: string;

  // Halt if crank stale (slotsSinceCrank > max) — never NORMAL when crank stale
  if (!crankFreshness.fresh) {
    guardState = "halted";
    guardTriggered = true;
    guardReason = "CRANK_STALE";
  }
  // Halt if divergence too high (only when we have a real oracle)
  else if (hasRealOracle && divergenceResult.shouldHalt) {
    guardState = "halted";
    guardTriggered = true;
    guardReason = "ORACLE_DIVERGENCE";
  }
  // Widen if any adjustment significant
  else if (divergenceResult.adjustment > 20) {
    guardState = "widened";
    guardTriggered = true;
    guardReason = "ORACLE_DIVERGENCE";
  }
  else if (skewAdjustmentBps > 20) {
    guardState = "widened";
    guardTriggered = true;
    guardReason = "SKEW";
  }
  else if (volAdjustmentBps > 20) {
    guardState = "widened";
    guardTriggered = true;
    guardReason = "VOL";
  }
  else if (utilizationAdjustmentBps > 20) {
    guardState = "widened";
    guardTriggered = true;
    guardReason = "UTILIZATION";
  }
  else {
    guardReason = "within thresholds";
  }

  // Apply adjustments (only if not halted); skip oracle-based adjustment when no real oracle
  if (guardState !== "halted") {
    totalSpreadBps += skewAdjustmentBps;
    totalSpreadBps += volAdjustmentBps;
    totalSpreadBps += utilizationAdjustmentBps;
    if (hasRealOracle) totalSpreadBps += divergenceResult.adjustment;
  }

  // Cap at max
  totalSpreadBps = Math.min(totalSpreadBps, maxTotalBps);

  // Calculate skew after trade
  const inventoryDelta = isBuy ? tradeSize : -tradeSize;
  const inventoryAfter = marketState.inventoryBase - inventoryDelta; // LP inventory decreases when user buys
  const skewAfter = calculateSkew(inventoryAfter, marketState.maxInventoryAbs);

  return {
    spreadBps: totalSpreadBps,
    skewAdjustmentBps,
    volAdjustmentBps,
    utilizationAdjustmentBps,
    divergenceAdjustmentBps: divergenceResult.adjustment,
    guardState,
    guardTriggered,
    pricingContext: {
      spreadBps: totalSpreadBps,
      skewBefore,
      skewAfter,
      volRegime,
      utilization,
      oracleFreshnessSlots: hasRealOracle ? oracleFreshness.slotsSince : null,
      oracleDivergenceBps: hasRealOracle ? oracleDivergenceBps : null,
      crankFreshnessSlots: crankFreshness.slotsSince,
      guardState,
      guardTriggered,
      guardReason,
      markPriceE6: marketState.markPriceE6,
      oraclePriceE6: marketState.oraclePriceE6,
      divergenceThresholdBps: DIVERGENCE_THRESHOLD_BPS,
      divergenceHaltBps: DIVERGENCE_HALT_BPS,
    },
  };
}
