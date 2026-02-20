/**
 * Devnet SOL Faucet — Multi-strategy airdrop
 *
 * REALITY CHECK (from reading faucet.solana.com source code):
 * - `requestAirdrop` RPC method is frequently broken ("Internal error")
 * - faucet.solana.com requires GitHub auth + Cloudflare CAPTCHA (cannot call programmatically)
 * - Third-party faucets (SolFaucet, Solfate, etc.) are web-only
 *
 * Strategy:
 * 1. Try RPC requestAirdrop (sometimes works, especially off-peak)
 * 2. If fails → show web faucet links + auto-poll balance for when user funds manually
 */

import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

export type AirdropResult = {
  success: boolean;
  signature?: string;
  error?: string;
};

/**
 * Try the RPC requestAirdrop. Returns quickly if it fails.
 */
export async function requestDevnetAirdrop(
  address: string,
  solAmount = 1,
): Promise<AirdropResult> {
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

  // Try direct JSON-RPC POST (more control than web3.js wrapper)
  try {
    const res = await fetch("https://api.devnet.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "requestAirdrop",
        params: [address, lamports],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const json = await res.json();

    if (json.result) {
      // Got a signature — wait for confirmation
      const sig = json.result as string;
      const conn = new Connection("https://api.devnet.solana.com", "confirmed");
      const start = Date.now();

      while (Date.now() - start < 25_000) {
        try {
          const status = await conn.getSignatureStatus(sig);
          if (
            status?.value?.confirmationStatus === "confirmed" ||
            status?.value?.confirmationStatus === "finalized"
          ) {
            return { success: true, signature: sig };
          }
          if (status?.value?.err) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Unconfirmed but might have worked
      return { success: true, signature: sig };
    }

    // RPC returned an error
    const errMsg = json.error?.message || "RPC airdrop failed";
    return { success: false, error: errMsg };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

/**
 * Generate a CLI fallback command.
 */
export function getAirdropCliCommand(address: string, amount = 1): string {
  return `solana airdrop ${amount} ${address} --url https://api.devnet.solana.com`;
}

/**
 * Web faucets that work (as of 2026).
 * The official faucet requires GitHub + CAPTCHA but is most reliable.
 */
export const WEB_FAUCETS = [
  { name: "Solana Faucet", url: "https://faucet.solana.com", note: "Official — up to 5 SOL with GitHub login", recommended: true },
  { name: "SolFaucet", url: "https://solfaucet.com", note: "1 SOL, no signup needed" },
  { name: "Solfate", url: "https://solfate.com/faucet", note: "1 SOL, no signup needed" },
  { name: "SolanaHub", url: "https://dev-faucet.solanahub.app", note: "1 SOL, no signup needed" },
];
