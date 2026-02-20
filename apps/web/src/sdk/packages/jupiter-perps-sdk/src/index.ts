/**
 * @sov/jupiter-perps-sdk - Mainnet Jupiter Perps integration
 * Wraps Jupiter Perps API / IDL parsing for real mainnet markets.
 */

import { type Connection, PublicKey } from "@solana/web3.js";
import { MAINNET } from "@sov/config";

export const JUPITER_PERPS_PROGRAM_ID = MAINNET.jupiterPerpsProgramId;
export const JLP_POOL_ACCOUNT = MAINNET.jlpPoolAccount;

export interface JupiterPoolState {
  pool: string;
  aumUsd: bigint;
  custodies: string[];
}

/**
 * Fetch JLP pool state from mainnet
 */
export async function fetchPoolState(
  connection: Connection,
  poolAddress?: string
): Promise<JupiterPoolState | null> {
  const pool = poolAddress ?? JLP_POOL_ACCOUNT;
  try {
    const info = await connection.getAccountInfo(new PublicKey(pool));
    if (!info) return null;
    // TODO: Parse Jupiter Perps IDL for Pool struct
    return {
      pool,
      aumUsd: 0n,
      custodies: [],
    };
  } catch {
    return null;
  }
}
