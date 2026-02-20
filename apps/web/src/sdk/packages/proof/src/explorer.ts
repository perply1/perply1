/**
 * Explorer link helpers - cluster-agnostic
 */

export type Cluster = "mainnet-beta" | "devnet";

export function explorerTxUrl(signature: string, cluster: Cluster): string {
  const base = "https://explorer.solana.com";
  const query = cluster === "devnet" ? "?cluster=devnet" : "";
  return `${base}/tx/${signature}${query}`;
}

export function explorerAccountUrl(address: string, cluster: Cluster): string {
  const base = "https://explorer.solana.com";
  const query = cluster === "devnet" ? "?cluster=devnet" : "";
  return `${base}/address/${address}${query}`;
}
