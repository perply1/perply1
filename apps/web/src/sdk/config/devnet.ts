/**
 * Devnet config - Percolator
 * All addresses in one place — no addresses in React components.
 */

export const DEVNET = {
  /** Percolator SOV program ID (our own deployment — large tier only) */
  percolatorProgramId: "2SSnp35m7FQ7cRLNKGdW5UzjYFF6RBUNq7d3m5mqNByp",

  /**
   * Tiered Percolator programs (from percolator-launch devnet deployments).
   * Same Percolator crate, compiled with different MAX_ACCOUNTS feature flags.
   * Source: https://github.com/dcccrypto/percolator-launch
   */
  percolatorTiers: {
    small: {
      programId: "FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD",
      maxAccounts: 256,
      slabBytes: 62_808,
      label: "Small",
    },
    medium: {
      programId: "FwfBKZXbYr4vTK23bMFkbgKq3npJ3MSDxEaKmq9Aj4Qn",
      maxAccounts: 1024,
      slabBytes: 249_480,
      label: "Medium",
    },
    large: {
      programId: "g9msRSV3sJmmE3r5Twn9HuBsxzuuRGTjKCVTKudm9in",
      maxAccounts: 4096,
      slabBytes: 992_560,
      label: "Large",
    },
  } as const,

  /** Matcher program ID (shared across all tiers) - PropAMM enabled */
  matcherProgramId: "Hhrt49nF43ztHt4bLe1vH1Li5h4RAjpNCReuiaf2Feum",
  /** PropAMM matcher deployment tx (devnet) */
  matcherDeployTx: "67j7Nq6UvN5H41FgBpPssDRoPak9K1HDRa7cyMeGAN4LuJHCsEniVvbT9EuMexHx7SQLEgNqPVbeQ8Rmt5Ey5okH",
  /** PropAMM matcher upgrade authority */
  matcherUpgradeAuthority: "CVeyMA8caamC6BMZFanMuTfuKQZvPtFhjmgp582oUGUh",

  /** Chainlink SOL/USD oracle on devnet */
  chainlinkSolUsd: "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR",

  /** Default market from vendor (for directory bootstrap) */
  defaultMarketSlab: "A7wQtRT9DhFqYho8wTVqQCDc7kYPTUXGPATiyVbZKVFs",

  /** Oracle program IDs for auto-detection */
  pythReceiverProgramId: "FsJ3A3u2vn5cTVofAjVy6KDNm2ERMx5Thrs2ac3opwZy",
  chainlinkOcr2ProgramId: "cjg3oHmg9uuPsP8D6g29NWvhySJkdYdAo9D25PRbKXJ",

  /** Well-known mints */
  wrappedSolMint: "So11111111111111111111111111111111111111112",

  /** Matcher modes */
  matcherModes: {
    passive: { kind: 0, label: "Passive (fixed spread)" },
    vamm: { kind: 1, label: "vAMM (spread + impact)" },
    propamm: { kind: 2, label: "PropAMM (vAMM + guardrails)" },
  },

  /** Default vAMM parameters */
  defaultVammParams: {
    tradingFeeBps: 5,
    baseSpreadBps: 10,
    impactKBps: 50,
    maxTotalBps: 200,
    liquidityNotionalE6: "10000000000", // 10k USD notional
  },

  /** Default passive matcher spread */
  defaultPassiveSpreadBps: 50,
} as const;
