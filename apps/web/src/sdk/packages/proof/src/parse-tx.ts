/**
 * Parse transaction to extract invoked programs (including inner/CPI)
 */

import { Connection } from "@solana/web3.js";
import type { Cluster } from "./explorer";
import { inspectProgram } from "./program-inspect";
import type { ProgramInfo } from "./receipt";
import type { Receipt } from "./receipt";

export interface ParseTxParams {
  connection: Connection;
  signature: string;
  cluster: Cluster;
  mode: "mainnet" | "devnet";
  venue: Receipt["venue"];
  action: string;
  marketId?: string;
  marketLabel?: string;
  wallet?: string;
  pricingContext?: Receipt["pricingContext"];
}

export interface ParseTxResult {
  receipt: Receipt;
  parseError?: string;
}

function toPubkeyString(key: unknown): string | null {
  if (!key) return null;
  if (typeof key === "string") return key;
  if (typeof key === "object" && "toBase58" in key) return (key as { toBase58: () => string }).toBase58();
  if (typeof key === "object" && "pubkey" in key) return (key as { pubkey: string }).pubkey;
  return null;
}

/**
 * Extract unique program IDs from transaction (outer + inner instructions)
 */
function extractInvokedProgramIds(tx: { transaction: { message: Record<string, unknown> }; meta?: { innerInstructions?: Array<{ instructions: Array<{ programIdIndex?: number; programId?: unknown }> }> } | null }): Set<string> {
  const ids = new Set<string>();
  if (!tx?.transaction?.message) return ids;

  const message = tx.transaction.message;
  const accountKeys: unknown[] =
    ("staticAccountKeys" in message && Array.isArray(message.staticAccountKeys))
      ? message.staticAccountKeys
      : ("accountKeys" in message && Array.isArray(message.accountKeys))
        ? message.accountKeys
        : [];

  const resolveProgramId = (ix: { programIdIndex?: number; programId?: unknown }): string | null => {
    if (ix.programIdIndex !== undefined && accountKeys[ix.programIdIndex]) {
      return toPubkeyString(accountKeys[ix.programIdIndex]);
    }
    return toPubkeyString(ix.programId);
  };

  const innerIxs = tx.meta?.innerInstructions ?? [];
  for (const inner of innerIxs) {
    for (const ix of inner.instructions) {
      const pid = resolveProgramId(ix);
      if (pid) ids.add(pid);
    }
  }

  const ixs =
    "compiledInstructions" in message && Array.isArray(message.compiledInstructions)
      ? message.compiledInstructions
      : "instructions" in message && Array.isArray(message.instructions)
        ? message.instructions
        : [];

  for (const ix of ixs) {
    const pid = resolveProgramId(ix as { programIdIndex?: number });
    if (pid) ids.add(pid);
  }

  return ids;
}

/**
 * Parse tx and build receipt with invoked programs inspection
 */
export async function parseTxAndBuildReceipt(params: ParseTxParams): Promise<ParseTxResult> {
  const {
    connection,
    signature,
    cluster,
    mode,
    venue,
    action,
    marketId,
    marketLabel,
    wallet,
  } = params;

  const receipt: Receipt = {
    id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    timestamp: new Date().toISOString(),
    mode,
    venue,
    action,
    marketId,
    marketLabel,
    txSignatures: [signature],
    explorerLinks: [],
    invokedPrograms: [],
    wallet,
    cluster,
    pricingContext: params.pricingContext,
  };

  receipt.explorerLinks = [
    cluster === "devnet"
      ? `https://explorer.solana.com/tx/${signature}?cluster=devnet`
      : `https://explorer.solana.com/tx/${signature}`,
  ];

  try {
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      receipt.invokedPrograms = [];
      return { receipt, parseError: "Transaction not found (RPC)" };
    }

    const programIds = extractInvokedProgramIds(tx as unknown as { transaction: { message: Record<string, unknown> }; meta?: { innerInstructions?: Array<{ instructions: Array<{ programIdIndex?: number; programId?: unknown }> }> } });
    const programs: ProgramInfo[] = [];

    for (const programId of programIds) {
      try {
        const info = await inspectProgram(connection, programId, cluster);
        programs.push(info);
      } catch {
        programs.push({
          programId,
          upgradeable: false,
          upgradeAuthority: null,
          explorerLink: `https://explorer.solana.com/address/${programId}${cluster === "devnet" ? "?cluster=devnet" : ""}`,
          verificationStatus: "unknown",
        });
      }
    }

    receipt.invokedPrograms = programs;
    return { receipt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { receipt, parseError: `RPC error: ${msg}` };
  }
}
