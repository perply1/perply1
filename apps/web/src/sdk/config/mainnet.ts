/**
 * Mainnet config – Native perps trading
 */

export const MAINNET = {
  /** Drift V2 program ID */
  perpsProgramId: "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",

  /** Jupiter Perps program ID (mainnet) */
  jupiterPerpsProgramId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",

  /** Jupiter JLP pool account (mainnet) */
  jlpPoolAccount: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4",

  /** USDC mint (mainnet) */
  usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",

  /** Wrapped SOL mint (mainnet) */
  wsolMint: "So11111111111111111111111111111111111111112",

  /** Spot market indices on Drift */
  spotMarkets: {
    USDC: { index: 0, decimals: 6, symbol: "USDC" },
    SOL: { index: 1, decimals: 9, symbol: "SOL" },
  } as Record<string, { index: number; decimals: number; symbol: string }>,

  /** Default collateral asset for deposits */
  defaultCollateral: "SOL",

  /** Perp market indices (Drift V2) */
  perpMarkets: {
    "SOL-PERP": 0,
    "BTC-PERP": 1,
    "ETH-PERP": 2,
    "1KBONK-PERP": 6,
    "WIF-PERP": 14,
    "JUP-PERP": 24,
  } as Record<string, number>,

  /** Default market */
  defaultMarket: "SOL-PERP",
} as const;
