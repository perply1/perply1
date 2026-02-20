/**
 * Percolator launch defaults - risk/fee params
 */

export const PERCOLATOR_LAUNCH_DEFAULTS = {
  /** Max staleness for oracle (seconds for Pyth Pull; slots used for Chainlink in program) */
  maxStalenessSecs: 3600,

  /** Confidence filter bps */
  confFilterBps: 500,

  /** Warmup period slots */
  warmupPeriodSlots: 10,

  /** Maintenance margin 5% */
  maintenanceMarginBps: 500,

  /** Initial margin 10% */
  initialMarginBps: 1000,

  /** Trading fee 0.1% */
  tradingFeeBps: 10,

  /** Max accounts in slab */
  maxAccounts: 1024,

  /** New account fee (lamports) */
  newAccountFee: "1000000",

  /** Max crank staleness slots */
  maxCrankStalenessSlots: 200,

  /** Liquidation fee 1% */
  liquidationFeeBps: 100,

  /** Liquidation fee cap (raw) */
  liquidationFeeCap: "1000000000",

  /** Liquidation buffer 0.5% */
  liquidationBufferBps: 50,

  /** Min liquidation absolute */
  minLiquidationAbs: "100000",
} as const;
