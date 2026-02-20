"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { DEVNET } from "@sov/config";
import type { DevnetMarketInfo } from "@sov/percolator-sdk";
import {
  fetchSlab,
  parseEngine,
  parseConfig,
  parseHeader,
  parseParams,
  parseUsedIndices,
  parseAccount,
  AccountKind,
} from "@sov/percolator-sdk";
import { explorerAccountUrl, inspectProgram } from "@sov/proof";
import { calculateMarketQuality, getQualityColor, getQualityBgColor, type MarketQualityScore } from "@/lib/market-quality";
import { fetchMatcherContext } from "@/lib/matcher-context";

/* ------------------------------------------------------------------ */
/*  Local storage registry (no hardcoded markets)                      */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "sov_devnet_markets";

function loadMarketsFromStorage(): DevnetMarketInfo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMarketsToStorage(markets: DevnetMarketInfo[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(markets));
  } catch {}
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function short(s: string, len = 6) {
  if (s.length <= len * 2 + 3) return s;
  return `${s.slice(0, len)}…${s.slice(-len)}`;
}

function isValidBase58(s: string): boolean {
  try { new PublicKey(s); return true; } catch { return false; }
}

/* ------------------------------------------------------------------ */
/*  Market live status                                                 */
/* ------------------------------------------------------------------ */

type SlabStatus = {
  state: "loading" | "found" | "not_found" | "rpc_error";
  crankFresh?: boolean;
  crankAge?: number;
  usedAccounts?: number;
  vaultBalance?: string;
  hasLP?: boolean;
  errorMsg?: string;
};

function useSlabStatus(connection: ReturnType<typeof useConnection>["connection"], slab: string): SlabStatus {
  const [status, setStatus] = useState<SlabStatus>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchSlab(connection, new PublicKey(slab));
        const engine = parseEngine(data);
        const config = parseConfig(data);
        const crankAge = Number(engine.currentSlot) - Number(engine.lastCrankSlot);
        const maxStale = Number(engine.maxCrankStalenessSlots);

        let hasLP = false;
        try {
          const indices = parseUsedIndices(data);
          for (const idx of indices) {
            try {
              const acc = parseAccount(data, idx);
              if (acc.kind === AccountKind.LP) { hasLP = true; break; }
            } catch {}
          }
        } catch {}

        let vaultBalance: string | undefined;
        try {
          const bal = await connection.getTokenAccountBalance(config.vaultPubkey);
          vaultBalance = bal.value.uiAmountString ?? (Number(bal.value.amount) / (10 ** (bal.value.decimals || 9))).toFixed(4);
        } catch {}

        if (!cancelled) {
          setStatus({
            state: "found",
            crankFresh: crankAge <= maxStale,
            crankAge,
            usedAccounts: engine.numUsedAccounts,
            vaultBalance,
            hasLP,
          });
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        // Distinguish "not found" from actual RPC errors
        if (msg.includes("not found") || msg.includes("null")) {
          setStatus({ state: "not_found", errorMsg: "Account not found on devnet" });
        } else {
          setStatus({ state: "rpc_error", errorMsg: msg });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [connection, slab]);

  return status;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function DevnetMarketDirectory() {
  const { connection } = useConnection();
  const [markets, setMarkets] = useState<DevnetMarketInfo[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [selectedSlab, setSelectedSlab] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"quality" | "name">("quality");

  // Load from storage on mount
  useEffect(() => {
    setMarkets(loadMarketsFromStorage());
  }, []);

  /* ---- Import with validation ---- */
  const handleImport = async () => {
    setImportError(null);
    setImporting(true);
    try {
      const parsed = JSON.parse(importJson) as DevnetMarketInfo;

      // 1. Validate required fields
      if (!parsed.slab || !parsed.programId || !parsed.oracle) {
        throw new Error("Missing required fields: slab, programId, oracle");
      }

      // 2. Validate pubkeys
      if (!isValidBase58(parsed.slab)) throw new Error(`Invalid slab pubkey: ${parsed.slab}`);
      if (!isValidBase58(parsed.programId)) throw new Error(`Invalid programId: ${parsed.programId}`);
      if (!isValidBase58(parsed.oracle)) throw new Error(`Invalid oracle pubkey: ${parsed.oracle}`);
      if (parsed.matcherProgramId && !isValidBase58(parsed.matcherProgramId)) {
        throw new Error(`Invalid matcherProgramId: ${parsed.matcherProgramId}`);
      }

      // 3. Check slab exists on devnet
      const slabPk = new PublicKey(parsed.slab);
      const info = await connection.getAccountInfo(slabPk);
      if (!info) {
        throw new Error(`Slab not found on devnet: ${parsed.slab}\nThis address may not exist or may be on a different cluster.`);
      }

      // 4. Verify slab owner matches expected program
      const expectedProgram = parsed.programId || DEVNET.percolatorProgramId;
      if (info.owner.toBase58() !== expectedProgram) {
        throw new Error(
          `Slab owner mismatch: expected ${short(expectedProgram)}, got ${short(info.owner.toBase58())}.\nThis account may not be a Percolator market.`
        );
      }

      parsed.network = "devnet";
      const next = [parsed, ...markets.filter((m) => m.slab !== parsed.slab)];
      setMarkets(next);
      saveMarketsToStorage(next);
      setImportJson("");
      setShowImport(false);
    } catch (e) {
      if (e instanceof SyntaxError) {
        setImportError("Invalid JSON format");
      } else {
        setImportError(e instanceof Error ? e.message : "Import failed");
      }
    } finally {
      setImporting(false);
    }
  };

  const handleRemove = (slab: string) => {
    const next = markets.filter((m) => m.slab !== slab);
    setMarkets(next);
    saveMarketsToStorage(next);
    if (selectedSlab === slab) setSelectedSlab(null);
  };

  const selectedMarket = markets.find((m) => m.slab === selectedSlab);

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="flex gap-4 min-h-[calc(100vh-180px)] flex-col">
      {/* ====== Left: Market Directory (35%) ====== */}
      <div className="w-full shrink-0 flex flex-col">
        {/* Actions */}
        <div className="flex items-center gap-2 mb-3">
          <Link
            href="/app/devnet/launch"
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-[10px] font-bold text-white transition shadow-sm shadow-emerald-600/10 flex items-center gap-1.5"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Launch Market
          </Link>
          <button
            onClick={() => setShowImport(!showImport)}
            className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.07] rounded-lg text-[10px] text-zinc-400 transition border border-white/[0.06]"
          >
            {showImport ? "Cancel" : "Import JSON"}
          </button>
        </div>

        {/* Import form */}
        {showImport && (
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3 mb-3">
            <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-1.5">Import Market JSON</p>
            <textarea
              value={importJson}
              onChange={(e) => { setImportJson(e.target.value); setImportError(null); }}
              placeholder={'{\n  "slab": "...",\n  "programId": "...",\n  "oracle": "..."\n}'}
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded px-2.5 py-2 text-[10px] text-zinc-300 font-mono h-24 resize-none focus:outline-none focus:border-emerald-500/30 mb-2"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleImport}
                disabled={!importJson.trim() || importing}
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-[10px] font-medium text-white transition"
              >
                {importing ? "Validating…" : "Import"}
              </button>
            </div>
            {importError && (
              <div className="mt-2 p-2 rounded bg-red-500/[0.05] border border-red-500/15">
                <p className="text-[10px] text-red-400 whitespace-pre-wrap">{importError}</p>
              </div>
            )}
          </div>
        )}

        {/* Market list */}
        {markets.length === 0 ? (
          /* ---- Empty state ---- */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-6">
              <div className="w-10 h-10 rounded-full bg-white/[0.03] flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <p className="text-[13px] font-semibold text-zinc-400 mb-1">No devnet markets yet</p>
              <p className="text-[10px] text-zinc-600 leading-relaxed max-w-[240px] mx-auto mb-4">
                Markets are permissionless. Launch creates a live market + proof page on Solana devnet.
              </p>
              <div className="flex items-center gap-2 justify-center">
                <Link
                  href="/app/devnet/launch"
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-[11px] font-semibold text-white transition"
                >
                  Launch New Market
                </Link>
                <button
                  onClick={() => setShowImport(true)}
                  className="px-3 py-2 bg-white/[0.04] hover:bg-white/[0.07] rounded-lg text-[11px] text-zinc-400 transition"
                >
                  Import JSON
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Sort controls */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold">Sort by:</span>
              <button
                onClick={() => setSortBy("quality")}
                className={`px-2 py-1 rounded text-[9px] font-medium transition ${
                  sortBy === "quality"
                    ? "bg-emerald-600 text-white"
                    : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Quality Score
              </button>
              <button
                onClick={() => setSortBy("name")}
                className={`px-2 py-1 rounded text-[9px] font-medium transition ${
                  sortBy === "name"
                    ? "bg-emerald-600 text-white"
                    : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Name
              </button>
            </div>
            <div className="space-y-1.5 flex-1 overflow-auto">
              {markets
                .map((m) => ({ market: m, key: m.slab }))
                .sort((a, b) => {
                  if (sortBy === "quality") {
                    // Sort by quality score (will be computed in MarketListItem)
                    // For now, just maintain order - quality will be computed async
                    return 0;
                  } else {
                    return a.market.slab.localeCompare(b.market.slab);
                  }
                })
                .map(({ market: m }) => (
                  <MarketListItem
                    key={m.slab}
                    market={m}
                    connection={connection}
                    selected={selectedSlab === m.slab}
                    onSelect={() => setSelectedSlab(m.slab)}
                    onRemove={() => handleRemove(m.slab)}
                  />
                ))}
            </div>
          </>
        )}
      </div>

      {/* ====== Right: Market Inspector (65%) ====== */}
      <div className="flex-1 min-w-0">
        {selectedMarket ? (
          <MarketInspector market={selectedMarket} connection={connection} />
        ) : (
          <InspectorScaffold hasMarkets={markets.length > 0} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Market List Item                                                   */
/* ------------------------------------------------------------------ */

function MarketListItem({
  market,
  connection,
  selected,
  onSelect,
  onRemove,
}: {
  market: DevnetMarketInfo;
  connection: ReturnType<typeof useConnection>["connection"];
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const status = useSlabStatus(connection, market.slab);
  const [qualityScore, setQualityScore] = useState<MarketQualityScore | null>(null);
  const [currentSlot, setCurrentSlot] = useState<number | null>(null);

  // Fetch current slot
  useEffect(() => {
    connection.getSlot().then(setCurrentSlot).catch(() => {});
  }, [connection]);

  // Calculate quality score (lightweight, only if found)
  useEffect(() => {
    if (status.state !== "found" || !currentSlot) {
      setQualityScore(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const programInfo = await inspectProgram(connection, market.programId, "devnet");
        let matcherInitialized = false;
        let matcherMode: "passive" | "vamm" | "propamm" | undefined;
        if (market.matcherContext) {
          const matcherCtx = await fetchMatcherContext(connection, new PublicKey(market.matcherContext));
          if (matcherCtx) {
            matcherInitialized = true;
            matcherMode = matcherCtx.kind === 0 ? "passive" : matcherCtx.kind === 2 ? "propamm" : "vamm";
          }
        }
        const data = await fetchSlab(connection, new PublicKey(market.slab));
        const engine = parseEngine(data);
        const config = parseConfig(data);
        const openInterestE6 = engine.totalOpenInterest > 0n ? engine.totalOpenInterest : 0n;
        const maxOICapacityE6 = engine.vault > 0n ? engine.vault * BigInt(10) : BigInt(1_000_000_000_000);
        const utilization = maxOICapacityE6 > 0n ? Number(openInterestE6) / Number(maxOICapacityE6) : 0;
        let hasLPCapital = false;
        try {
          const indices = parseUsedIndices(data);
          for (const idx of indices) {
            try {
              const acc = parseAccount(data, idx);
              if (acc.kind === AccountKind.LP && acc.capital > 0n) {
                hasLPCapital = true;
                break;
              }
            } catch {}
          }
        } catch {}
        const score = calculateMarketQuality({
          oracleHealth: "healthy",
          crankFreshnessSlots: status.crankAge ?? 0,
          maxCrankStalenessSlots: Number(config.maxStalenessSlots),
          programUpgradeable: programInfo.upgradeable,
          upgradeAuthority: programInfo.upgradeAuthority,
          matcherInitialized,
          matcherMode,
          utilization,
          hasLPCapital,
        });
        if (!cancelled) setQualityScore(score);
      } catch {
        if (!cancelled) setQualityScore(null);
      }
    })();
    return () => { cancelled = true; };
  }, [status, market, connection, currentSlot]);

  return (
    <div
      onClick={onSelect}
      className={`rounded-lg border p-2.5 cursor-pointer transition ${
        selected
          ? "border-emerald-500/25 bg-emerald-500/[0.03]"
          : "border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-mono text-[10px] text-zinc-300 truncate">{short(market.slab, 8)}</span>
        <div className="flex items-center gap-1 shrink-0">
          {qualityScore && (
            <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${getQualityColor(qualityScore.grade)} ${getQualityBgColor(qualityScore.grade)}`}>
              {qualityScore.grade} {qualityScore.score.toFixed(0)}
            </div>
          )}
          {status.state === "loading" && (
            <div className="w-2.5 h-2.5 border border-zinc-700 border-t-zinc-500 rounded-full animate-spin" />
          )}
          {status.state === "found" && (
            <>
              <StatusDot ok={status.crankFresh} label={status.crankFresh ? "Fresh" : "Stale"} />
              {status.hasLP && <StatusDot ok={true} label="LP" />}
            </>
          )}
          {status.state === "not_found" && <StatusDot ok={false} label="Not found" />}
          {status.state === "rpc_error" && <StatusDot ok={null} label="RPC Error" />}
        </div>
      </div>
      <div className="flex items-center gap-2 text-[9px] text-zinc-600">
        <span className="uppercase font-bold">{market.oracleType || "unknown"}</span>
        {status.state === "found" && status.usedAccounts !== undefined && (
          <span>{status.usedAccounts} accts</span>
        )}
        {status.state === "found" && status.vaultBalance && (
          <span>Vault: {status.vaultBalance}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-1.5">
        <Link
          href={`/app/devnet/markets/${market.slab}`}
          onClick={(e) => e.stopPropagation()}
          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 rounded text-[9px] font-semibold text-white transition"
        >
          Proof Page
        </Link>
        <button
          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(JSON.stringify(market, null, 2)); }}
          className="px-2 py-0.5 bg-white/[0.04] hover:bg-white/[0.07] rounded text-[9px] text-zinc-500 transition"
        >
          Export
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="px-2 py-0.5 bg-red-500/[0.05] hover:bg-red-500/[0.12] rounded text-[9px] text-red-400/70 hover:text-red-400 transition ml-auto"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Market Inspector (right panel)                                     */
/* ------------------------------------------------------------------ */

function MarketInspector({
  market,
  connection,
}: {
  market: DevnetMarketInfo;
  connection: ReturnType<typeof useConnection>["connection"];
}) {
  const status = useSlabStatus(connection, market.slab);
  const [qualityScore, setQualityScore] = useState<MarketQualityScore | null>(null);
  const [currentSlot, setCurrentSlot] = useState<number | null>(null);

  // Fetch current slot
  useEffect(() => {
    connection.getSlot().then(setCurrentSlot).catch(() => {});
  }, [connection]);

  // Calculate quality score
  useEffect(() => {
    if (status.state !== "found" || !currentSlot) {
      setQualityScore(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // Fetch program info
        const programInfo = await inspectProgram(connection, market.programId, "devnet");
        
        // Fetch matcher context if available
        let matcherInitialized = false;
        let matcherMode: "passive" | "vamm" | "propamm" | undefined;
        if (market.matcherContext) {
          const matcherCtx = await fetchMatcherContext(connection, new PublicKey(market.matcherContext));
          if (matcherCtx) {
            matcherInitialized = true;
            matcherMode = matcherCtx.kind === 0 ? "passive" : matcherCtx.kind === 2 ? "propamm" : "vamm";
          }
        }

        // Fetch slab data for more details
        const data = await fetchSlab(connection, new PublicKey(market.slab));
        const engine = parseEngine(data);
        const config = parseConfig(data);
        
        const openInterestE6 = engine.totalOpenInterest > 0n
          ? engine.totalOpenInterest
          : 0n;
        const maxOICapacityE6 = engine.vault > 0n
          ? engine.vault * BigInt(10) // Assume 10x leverage capacity
          : BigInt(1_000_000_000_000);
        const utilization = maxOICapacityE6 > 0n
          ? Number(openInterestE6) / Number(maxOICapacityE6)
          : 0;

        // Check LP capital
        let hasLPCapital = false;
        try {
          const indices = parseUsedIndices(data);
          for (const idx of indices) {
            try {
              const acc = parseAccount(data, idx);
              if (acc.kind === AccountKind.LP && acc.capital > 0n) {
                hasLPCapital = true;
                break;
              }
            } catch {}
          }
        } catch {}

        const score = calculateMarketQuality({
          oracleHealth: "healthy", // Assume healthy if found
          crankFreshnessSlots: status.crankAge ?? 0,
          maxCrankStalenessSlots: Number(config.maxStalenessSlots),
          programUpgradeable: programInfo.upgradeable,
          upgradeAuthority: programInfo.upgradeAuthority,
          matcherInitialized,
          matcherMode,
          utilization,
          hasLPCapital,
        });

        if (!cancelled) setQualityScore(score);
      } catch {
        if (!cancelled) setQualityScore(null);
      }
    })();
    return () => { cancelled = true; };
  }, [status, market, connection, currentSlot]);

  if (status.state === "loading") {
    return (
      <div className="h-full flex items-center justify-center rounded-lg border border-white/[0.03] bg-white/[0.005]">
        <div className="text-center">
          <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-[10px] text-zinc-600">Loading market data…</p>
        </div>
      </div>
    );
  }

  if (status.state === "not_found") {
    return (
      <div className="h-full flex items-center justify-center rounded-lg border border-white/[0.03] bg-white/[0.005]">
        <div className="text-center max-w-sm">
          <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-[13px] font-semibold text-amber-400 mb-1">Account not found on devnet</p>
          <p className="text-[10px] text-zinc-600 font-mono mb-2">{market.slab}</p>
          <p className="text-[10px] text-zinc-600 mb-3">This address may be on a different cluster or not created yet.</p>
          <div className="flex items-center gap-2 justify-center">
            <a
              href={explorerAccountUrl(market.slab, "devnet")}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.07] rounded text-[10px] text-zinc-400 transition"
            >
              Open in Explorer (devnet)
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status.state === "rpc_error") {
    return (
      <div className="h-full flex items-center justify-center rounded-lg border border-white/[0.03] bg-white/[0.005]">
        <div className="text-center max-w-sm">
          <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <p className="text-[13px] font-semibold text-red-400 mb-1">RPC Error</p>
          <p className="text-[10px] text-zinc-600 mb-2">{status.errorMsg}</p>
        </div>
      </div>
    );
  }

  // Found — show overview
  return (
    <div className="rounded-lg border border-white/[0.03] bg-white/[0.005] p-4 space-y-3">
      {/* Quality Score */}
      {qualityScore && (
        <div className={`p-3 rounded-lg border ${getQualityBgColor(qualityScore.grade)}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">Market Quality Score</span>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getQualityColor(qualityScore.grade)}`}>
                {qualityScore.grade}
              </span>
              <span className={`text-lg font-mono ${getQualityColor(qualityScore.grade)}`}>
                {qualityScore.score.toFixed(0)}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2 text-[9px]">
            <div className="text-center">
              <div className="text-zinc-600 mb-0.5">Oracle</div>
              <div className={`font-mono font-semibold ${qualityScore.breakdown.oracle >= 20 ? "text-emerald-400" : qualityScore.breakdown.oracle >= 10 ? "text-amber-400" : "text-red-400"}`}>
                {qualityScore.breakdown.oracle.toFixed(0)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-zinc-600 mb-0.5">Crank</div>
              <div className={`font-mono font-semibold ${qualityScore.breakdown.crank >= 15 ? "text-emerald-400" : qualityScore.breakdown.crank >= 5 ? "text-amber-400" : "text-red-400"}`}>
                {qualityScore.breakdown.crank.toFixed(0)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-zinc-600 mb-0.5">Security</div>
              <div className={`font-mono font-semibold ${qualityScore.breakdown.security >= 20 ? "text-emerald-400" : qualityScore.breakdown.security >= 10 ? "text-amber-400" : "text-red-400"}`}>
                {qualityScore.breakdown.security.toFixed(0)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-zinc-600 mb-0.5">Pricing</div>
              <div className={`font-mono font-semibold ${qualityScore.breakdown.pricing >= 15 ? "text-emerald-400" : qualityScore.breakdown.pricing >= 5 ? "text-amber-400" : "text-red-400"}`}>
                {qualityScore.breakdown.pricing.toFixed(0)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-zinc-600 mb-0.5">Util</div>
              <div className={`font-mono font-semibold ${qualityScore.breakdown.utilization >= 10 ? "text-emerald-400" : qualityScore.breakdown.utilization >= 5 ? "text-amber-400" : "text-red-400"}`}>
                {qualityScore.breakdown.utilization.toFixed(0)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status strip */}
      <div className="flex items-center gap-3 flex-wrap">
        <StatusChip label="Market" value="Found" ok={true} />
        <StatusChip label="Crank" value={status.crankFresh ? "Fresh" : "Stale"} ok={status.crankFresh ?? false} />
        <StatusChip label="LP" value={status.hasLP ? "Active" : "None"} ok={status.hasLP ?? false} />
        {status.vaultBalance && <StatusChip label="Vault" value={`${status.vaultBalance} SOL`} ok={true} />}
        <StatusChip label="Accounts" value={String(status.usedAccounts ?? 0)} ok={true} />
      </div>

      {/* Addresses */}
      <div>
        <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-1.5">Addresses</p>
        <div className="space-y-0.5">
          <CopyRow label="Slab" value={market.slab} />
          <CopyRow label="Program" value={market.programId} />
          <CopyRow label="Matcher" value={market.matcherProgramId} />
          <CopyRow label="Oracle" value={market.oracle} />
          {market.mint && <CopyRow label="Mint" value={market.mint} />}
          {market.vault && <CopyRow label="Vault" value={market.vault} />}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-2 pt-1">
        <Link
          href={`/app/devnet/markets/${market.slab}`}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-[10px] font-semibold text-white transition"
        >
          Open Full Proof Page
        </Link>
        <a
          href={explorerAccountUrl(market.slab, "devnet")}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.07] rounded text-[10px] text-zinc-400 transition"
        >
          Explorer
        </a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared micro-components                                            */
/* ------------------------------------------------------------------ */

function StatusDot({ ok, label }: { ok: boolean | null | undefined; label: string }) {
  const c = ok === true ? "text-emerald-400" : ok === false ? "text-red-400" : "text-amber-400";
  return (
    <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/[0.03] ${c}`}>
      {label}
    </span>
  );
}

function StatusChip({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.02] border border-white/[0.04]">
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} />
      <span className="text-[9px] text-zinc-600">{label}:</span>
      <span className={`text-[9px] font-semibold ${ok ? "text-emerald-400" : "text-amber-400"}`}>{value}</span>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 py-0.5 group">
      <span className="text-[9px] text-zinc-600 w-16 shrink-0 uppercase tracking-wider">{label}</span>
      <span className="font-mono text-[9px] text-zinc-400 truncate flex-1">{value}</span>
      <button
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
        className="text-[8px] text-zinc-700 hover:text-emerald-400 transition opacity-0 group-hover:opacity-100 shrink-0"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inspector Scaffold (no market selected)                            */
/* ------------------------------------------------------------------ */

function InspectorScaffold({ hasMarkets }: { hasMarkets: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.03] bg-white/[0.005] p-4 space-y-3">
      {/* Status strip - all unknown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <ScaffoldCard label="Market" value={hasMarkets ? "Select a market" : "None"} />
        <ScaffoldCard label="Oracle" value="Unknown" />
        <ScaffoldCard label="Crank" value="Unknown" />
        <ScaffoldCard label="Vault" value="Unknown" />
      </div>

      {/* Program truth from config (always available) */}
      <div>
        <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-1.5">Program Truth (from config)</p>
        <div className="space-y-0.5">
          <ScaffoldRow label="Percolator" value={DEVNET.percolatorProgramId} />
          <ScaffoldRow label="Matcher" value={DEVNET.matcherProgramId} />
          <ScaffoldRow label="Chainlink OCR2" value={DEVNET.chainlinkOcr2ProgramId} />
        </div>
      </div>

      {/* Actions placeholder */}
      <div>
        <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-1.5">Actions</p>
        <div className="flex flex-wrap gap-2">
          {["Init User", "Deposit", "Withdraw", "Crank Now", "Trade"].map((action) => (
            <button
              key={action}
              disabled
              className="px-2.5 py-1.5 bg-white/[0.02] border border-white/[0.04] rounded text-[10px] text-zinc-700 cursor-not-allowed"
              title="Select a market to enable"
            >
              {action}
            </button>
          ))}
        </div>
        <p className="text-[9px] text-zinc-700 mt-1.5">
          {hasMarkets ? "Select a market on the left to enable actions" : "Launch or import a market to get started"}
        </p>
      </div>

      {/* Quickstart guide */}
      <div className="rounded-lg bg-white/[0.015] border border-white/[0.04] p-3">
        <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-2">Quickstart</p>
        <div className="space-y-1.5">
          {[
            { step: "1", label: "Airdrop SOL", desc: "Get devnet SOL from the top bar" },
            { step: "2", label: "Launch Market", desc: "Create a real market via the wizard" },
            { step: "3", label: "Open Proof Page", desc: "Inspect addresses, programs, oracle" },
            { step: "4", label: "Init → Deposit → Crank → Trade", desc: "Full trading flow with receipts" },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-white/[0.04] flex items-center justify-center text-[9px] font-bold text-zinc-600 shrink-0 mt-0.5">
                {item.step}
              </span>
              <div>
                <span className="text-[10px] text-zinc-400 font-medium">{item.label}</span>
                <span className="text-[9px] text-zinc-700 ml-1">{item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScaffoldCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-white/[0.01] border border-white/[0.04]">
      <p className="text-[8px] text-zinc-700 uppercase tracking-widest">{label}</p>
      <p className="text-[11px] text-zinc-600 font-medium mt-0.5">{value}</p>
    </div>
  );
}

function ScaffoldRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 py-0.5 group">
      <span className="text-[9px] text-zinc-600 w-20 shrink-0 uppercase tracking-wider">{label}</span>
      <span className="font-mono text-[9px] text-zinc-500 truncate flex-1">{value}</span>
      <button
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
        className="text-[8px] text-zinc-700 hover:text-emerald-400 transition opacity-0 group-hover:opacity-100 shrink-0"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
