/**
 * Market info type - from JSON import or directory
 */

export interface DevnetMarketInfo {
  network: "devnet";
  slab: string;
  programId: string;
  matcherProgramId: string;
  mint: string;
  vault: string;
  vaultPda?: string;
  oracle: string;
  oracleType: "pyth" | "chainlink" | "authority";
  inverted?: boolean;
  lp?: {
    index: number;
    pda: string;
    matcherContext: string;
    collateral: number;
  };
  admin?: string;
  adminAta?: string;
  insuranceFund?: number;
  createdAt?: string;
}
