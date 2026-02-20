/**
 * Common config - RPC URLs from env
 */

export type Cluster = "mainnet-beta" | "devnet";

export function getMainnetRpcUrl(): string {
  const url = process.env.NEXT_PUBLIC_MAINNET_RPC_URL;
  if (!url) throw new Error("NEXT_PUBLIC_MAINNET_RPC_URL not set");
  return url;
}

export function getDevnetRpcUrl(): string {
  const url = process.env.NEXT_PUBLIC_DEVNET_RPC_URL;
  if (!url) throw new Error("NEXT_PUBLIC_DEVNET_RPC_URL not set");
  return url;
}

export function getRpcUrl(cluster: Cluster): string {
  return cluster === "mainnet-beta" ? getMainnetRpcUrl() : getDevnetRpcUrl();
}

export function getJupiterApiKey(): string | undefined {
  return process.env.NEXT_PUBLIC_JUPITER_API_KEY;
}
