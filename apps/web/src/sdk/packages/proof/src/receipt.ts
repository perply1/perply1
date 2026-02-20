/**
 * Receipt model - persisted per wallet+cluster
 */

import type { Cluster } from "./explorer";

export type Venue = "percolator" | "jupiter-perps" | "perps" | "spl-token";

export interface ProgramInfo {
  programId: string;
  upgradeable: boolean;
  upgradeAuthority: string | null;
  explorerLink: string;
  verificationStatus: "verified" | "unverified" | "unknown";
}

export interface PricingContext {
  /** Spread at fill (basis points) */
  spreadBps: number;
  /** Skew before trade (inventory imbalance) */
  skewBefore: number;
  /** Skew after trade */
  skewAfter: number;
  /** Volatility regime: "low" | "med" | "high" | null (null = no data available) */
  volRegime: "low" | "med" | "high" | null;
  /** Utilization (OI vs capacity, 0-1) */
  utilization: number;
  /** Oracle freshness (slots since last update); null when no real oracle (e.g. UNKNOWN) */
  oracleFreshnessSlots: number | null;
  /** Oracle divergence (mark vs oracle, basis points); null when no real oracle */
  oracleDivergenceBps: number | null;
  /** Crank freshness (slots since last crank) */
  crankFreshnessSlots: number;
  /** Guard state: "normal" | "widened" | "throttled" | "halted" */
  guardState: "normal" | "widened" | "throttled" | "halted";
  /** Whether any guard triggered */
  guardTriggered: boolean;
  /** Guard reason (e.g. "within thresholds", "CRANK_STALE") — optional for backward compat */
  guardReason?: string;
  /** Mark/oracle prices and thresholds for audit — optional */
  markPriceE6?: bigint;
  oraclePriceE6?: bigint;
  divergenceThresholdBps?: number;
  divergenceHaltBps?: number;
}

export interface Receipt {
  id: string;
  timestamp: string; // ISO
  mode: "mainnet" | "devnet";
  venue: Venue;
  action: string;
  marketId?: string;
  marketLabel?: string;
  txSignatures: string[];
  explorerLinks: string[];
  invokedPrograms: ProgramInfo[];
  wallet?: string;
  cluster: Cluster;
  /** Pricing context at execution time (for trades) */
  pricingContext?: PricingContext;
}

export function createReceiptId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
