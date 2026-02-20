"use client";

import { useCluster } from "@/components/cluster-provider";
import { useEffect } from "react";
import { DevnetMarketDirectory } from "@/components/devnet-market-directory";

export default function DevnetPage() {
  const { setMode } = useCluster();

  useEffect(() => {
    setMode("devnet");
  }, [setMode]);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[1200px] mx-auto p-3 lg:p-5">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2.5 mb-1">
            <h2 className="text-[15px] font-bold text-white tracking-tight">Devnet Lab</h2>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/20">
              DEVNET
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed max-w-lg">
            Permissionless market creation and proof-native trading on Solana devnet. Launch markets, run the full cycle, verify every action.
          </p>
        </div>

        <DevnetMarketDirectory />
      </div>
    </div>
  );
}
