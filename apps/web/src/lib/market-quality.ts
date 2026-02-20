/**
 * Market Quality Score
 * 
 * Computes a quality score (0-100) for devnet markets based on:
 * - Oracle health
 * - Crank freshness
 * - Upgrade authority (immutable/adminless gets higher)
 * - Pricing guardrails enabled
 * - Utilization risk
 */

export interface MarketQualityFactors {
  /** Oracle health: "healthy" | "stale" | "unknown" */
  oracleHealth: "healthy" | "stale" | "unknown";
  /** Crank freshness: slots since last crank */
  crankFreshnessSlots: number;
  /** Max crank staleness threshold */
  maxCrankStalenessSlots: number;
  /** Program upgradeable: false = immutable (higher score) */
  programUpgradeable: boolean;
  /** Upgrade authority: null = adminless (highest score) */
  upgradeAuthority: string | null;
  /** Matcher context initialized */
  matcherInitialized: boolean;
  /** Matcher mode: "vamm" | "propamm" = better (has guardrails) */
  matcherMode?: "passive" | "vamm" | "propamm";
  /** Utilization (OI vs capacity, 0-1) */
  utilization?: number;
  /** Has LP with capital */
  hasLPCapital: boolean;
}

export interface MarketQualityScore {
  /** Overall score (0-100) */
  score: number;
  /** Breakdown by factor */
  breakdown: {
    oracle: number;
    crank: number;
    security: number;
    pricing: number;
    utilization: number;
  };
  /** Grade: "A" | "B" | "C" | "D" | "F" */
  grade: "A" | "B" | "C" | "D" | "F";
}

/**
 * Calculate market quality score
 */
export function calculateMarketQuality(factors: MarketQualityFactors): MarketQualityScore {
  let oracleScore = 0;
  let crankScore = 0;
  let securityScore = 0;
  let pricingScore = 0;
  let utilizationScore = 0;

  // Oracle health (0-25 points)
  switch (factors.oracleHealth) {
    case "healthy":
      oracleScore = 25;
      break;
    case "stale":
      oracleScore = 10;
      break;
    case "unknown":
      oracleScore = 5;
      break;
  }

  // Crank freshness (0-20 points)
  const crankFresh = factors.crankFreshnessSlots <= factors.maxCrankStalenessSlots;
  if (crankFresh) {
    // Fresh: full points, scaled by how fresh
    const freshnessRatio = Math.max(0, 1 - (factors.crankFreshnessSlots / factors.maxCrankStalenessSlots));
    crankScore = 20 * freshnessRatio;
  } else {
    // Stale: penalty based on how stale
    const stalenessRatio = Math.min(1, (factors.crankFreshnessSlots - factors.maxCrankStalenessSlots) / factors.maxCrankStalenessSlots);
    crankScore = Math.max(0, 20 * (1 - stalenessRatio * 2)); // Harsh penalty
  }

  // Security (program upgradeability + authority) (0-25 points)
  if (!factors.programUpgradeable) {
    // Immutable: full points
    securityScore = 25;
  } else if (factors.upgradeAuthority === null) {
    // Upgradeable but adminless: high score
    securityScore = 20;
  } else {
    // Upgradeable with admin: lower score
    securityScore = 10;
  }

  // Pricing guardrails (0-20 points)
  if (factors.matcherInitialized) {
    if (factors.matcherMode === "propamm") {
      // PropAMM has full guardrails: full points
      pricingScore = 20;
    } else if (factors.matcherMode === "vamm") {
      // vAMM has guardrails: full points
      pricingScore = 20;
    } else {
      // Passive matcher: partial points
      pricingScore = 10;
    }
  } else {
    // No matcher: zero
    pricingScore = 0;
  }

  // Utilization risk (0-10 points)
  if (factors.utilization !== undefined) {
    if (factors.utilization < 0.5) {
      // Low utilization: full points
      utilizationScore = 10;
    } else if (factors.utilization < 0.8) {
      // Medium utilization: scaled
      utilizationScore = 10 * (1 - (factors.utilization - 0.5) / 0.3);
    } else {
      // High utilization: penalty
      utilizationScore = Math.max(0, 10 * (1 - (factors.utilization - 0.8) / 0.2));
    }
  } else {
    // Unknown: neutral
    utilizationScore = 5;
  }

  // Bonus: LP capital (0-5 points)
  if (factors.hasLPCapital) {
    utilizationScore += 5;
  }

  const totalScore = oracleScore + crankScore + securityScore + pricingScore + utilizationScore;
  const clampedScore = Math.max(0, Math.min(100, totalScore));

  // Determine grade
  let grade: "A" | "B" | "C" | "D" | "F";
  if (clampedScore >= 90) grade = "A";
  else if (clampedScore >= 75) grade = "B";
  else if (clampedScore >= 60) grade = "C";
  else if (clampedScore >= 40) grade = "D";
  else grade = "F";

  return {
    score: clampedScore,
    breakdown: {
      oracle: oracleScore,
      crank: crankScore,
      security: securityScore,
      pricing: pricingScore,
      utilization: utilizationScore,
    },
    grade,
  };
}

/**
 * Get quality score color class
 */
export function getQualityColor(grade: "A" | "B" | "C" | "D" | "F"): string {
  switch (grade) {
    case "A":
      return "text-emerald-400";
    case "B":
      return "text-green-400";
    case "C":
      return "text-yellow-400";
    case "D":
      return "text-orange-400";
    case "F":
      return "text-red-400";
  }
}

/**
 * Get quality score background color class
 */
export function getQualityBgColor(grade: "A" | "B" | "C" | "D" | "F"): string {
  switch (grade) {
    case "A":
      return "bg-emerald-500/10 border-emerald-500/20";
    case "B":
      return "bg-green-500/10 border-green-500/20";
    case "C":
      return "bg-yellow-500/10 border-yellow-500/20";
    case "D":
      return "bg-orange-500/10 border-orange-500/20";
    case "F":
      return "bg-red-500/10 border-red-500/20";
  }
}
