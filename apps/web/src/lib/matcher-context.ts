/**
 * Matcher Context Parser
 * Parses matcher context account data (unified MatcherCtx layout)
 */

import { PublicKey, Connection } from "@solana/web3.js";

const MATCHER_MAGIC = BigInt("0x504552434d415443"); // "PERCMATC"
const CTX_VAMM_OFFSET = 64; // Matcher context starts at offset 64 in account

export interface MatcherContext {
  /** Matcher kind: 0 = Passive, 1 = vAMM, 2 = PropAMM */
  kind: number;
  /** Trading fee (basis points) */
  tradingFeeBps: number;
  /** Base spread (basis points) */
  baseSpreadBps: number;
  /** Max total spread (basis points) */
  maxTotalBps: number;
  /** Impact multiplier (vAMM only, basis points) */
  impactKBps: number;
  /** Liquidity notional (e6, vAMM only) */
  liquidityNotionalE6: bigint;
  /** Max fill size (base units) */
  maxFillAbs: bigint;
  /** Current inventory (base units, positive = long, negative = short) */
  inventoryBase: bigint;
  /** Last oracle price (e6) */
  lastOraclePriceE6: bigint;
  /** Last execution price (e6) */
  lastExecPriceE6: bigint;
  /** Max inventory limit (base units) */
  maxInventoryAbs: bigint;
}

/**
 * Parse matcher context from account data
 */
export function parseMatcherContext(data: Buffer): MatcherContext | null {
  if (data.length < CTX_VAMM_OFFSET + 256) {
    return null;
  }

  const offset = CTX_VAMM_OFFSET;
  
  // Read magic (8 bytes)
  const magic = data.readBigUInt64LE(offset);
  if (magic !== MATCHER_MAGIC) {
    return null; // Not initialized
  }

  // Read version (4 bytes, offset 8)
  // const version = data.readUInt32LE(offset + 8);
  
  // Read kind (1 byte, offset 12)
  const kind = data[offset + 12];
  
  // Read LP PDA (32 bytes, offset 16) - skip for now
  
  // Read trading_fee_bps (4 bytes, offset 48)
  const tradingFeeBps = data.readUInt32LE(offset + 48);
  
  // Read base_spread_bps (4 bytes, offset 52)
  const baseSpreadBps = data.readUInt32LE(offset + 52);
  
  // Read max_total_bps (4 bytes, offset 56)
  const maxTotalBps = data.readUInt32LE(offset + 56);
  
  // Read impact_k_bps (4 bytes, offset 60)
  const impactKBps = data.readUInt32LE(offset + 60);
  
  // Read liquidity_notional_e6 (16 bytes, offset 64)
  const liquidityNotionalE6 = data.readBigUInt64LE(offset + 64) + 
    (data.readBigUInt64LE(offset + 72) << 64n);
  
  // Read max_fill_abs (16 bytes, offset 80)
  const maxFillAbs = data.readBigUInt64LE(offset + 80) + 
    (data.readBigUInt64LE(offset + 88) << 64n);
  
  // Read inventory_base (16 bytes, offset 96, signed)
  const inventoryLow = data.readBigUInt64LE(offset + 96);
  const inventoryHigh = data.readBigUInt64LE(offset + 104);
  const inventoryBase = BigInt.asIntN(128, inventoryLow + (inventoryHigh << 64n));
  
  // Read last_oracle_price_e6 (8 bytes, offset 112)
  const lastOraclePriceE6 = data.readBigUInt64LE(offset + 112);
  
  // Read last_exec_price_e6 (8 bytes, offset 120)
  const lastExecPriceE6 = data.readBigUInt64LE(offset + 120);
  
  // Read max_inventory_abs (16 bytes, offset 128)
  const maxInventoryAbs = data.readBigUInt64LE(offset + 128) + 
    (data.readBigUInt64LE(offset + 136) << 64n);

  return {
    kind,
    tradingFeeBps,
    baseSpreadBps,
    maxTotalBps,
    impactKBps,
    liquidityNotionalE6,
    maxFillAbs,
    inventoryBase,
    lastOraclePriceE6,
    lastExecPriceE6,
    maxInventoryAbs,
  };
}

/**
 * Fetch and parse matcher context from account
 */
export async function fetchMatcherContext(
  connection: Connection,
  matcherContextPubkey: PublicKey
): Promise<MatcherContext | null> {
  try {
    const accountInfo = await connection.getAccountInfo(matcherContextPubkey);
    if (!accountInfo) return null;
    return parseMatcherContext(Buffer.from(accountInfo.data));
  } catch {
    return null;
  }
}
