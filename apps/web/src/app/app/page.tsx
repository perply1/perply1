"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import { useCluster } from "@/components/cluster-provider";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

function AppHomeContent() {
  const searchParams = useSearchParams();
  const { setMode } = useCluster();

  useEffect(() => {
    const m = searchParams.get("mode");
    if (m === "devnet") setMode("devnet");
    else setMode("mainnet");
  }, [searchParams, setMode]);

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-8 lg:p-12 overflow-auto">
      <div className="max-w-3xl w-full">
        {/* Header - corporate, clean */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Image src="/images/perply-logo.png" alt="Perply" width={96} height={26} className="h-6 w-auto" />
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.2em]">Environment</span>
          </div>
          <h2 className="text-2xl sm:text-[28px] font-semibold text-white tracking-tight mb-2">
            Select your environment
          </h2>
          <p className="text-sm text-zinc-500 max-w-md">
            Same protocol, same proof system. Choose production or development.
          </p>
          <div className="mt-6 h-px w-16 bg-gradient-to-r from-white/20 to-transparent" />
        </div>

        {/* Cards - minimal, professional */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          <Link
            href="/app/mainnet"
            className="group block p-6 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04] transition-all duration-200"
          >
            <div className="flex items-start justify-between mb-4">
              <span className="px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-widest text-emerald-400/90 bg-emerald-500/5 border border-emerald-500/10">
                Mainnet
              </span>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="text-base font-semibold text-white mb-2">Trading Terminal</h3>
            <p className="text-[13px] text-zinc-500 leading-relaxed mb-5">
              Professional perpetuals trading. Real markets, real liquidity, up to 50x leverage.
            </p>
            <ul className="space-y-2 text-[12px] text-zinc-500">
              {["SOL, ETH, BTC perpetuals", "TradingView charts", "Position management"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  {t}
                </li>
              ))}
            </ul>
          </Link>

          <Link
            href="/app/devnet"
            className="group block p-6 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04] transition-all duration-200"
          >
            <div className="flex items-start justify-between mb-4">
              <span className="px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-widest text-amber-400/90 bg-amber-500/5 border border-amber-500/10">
                Devnet
              </span>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
            </div>
            <h3 className="text-base font-semibold text-white mb-2">Devnet Lab</h3>
            <p className="text-[13px] text-zinc-500 leading-relaxed mb-5">
              Build and test. Launch markets, mint tokens — every action verified with proof.
            </p>
            <ul className="space-y-2 text-[12px] text-zinc-500">
              {["Permissionless market creation", "Token Factory", "Proof-native receipts"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  {t}
                </li>
              ))}
            </ul>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AppHomePage() {
  return (
    <Suspense fallback={<div className="p-8 text-zinc-600 text-sm">Loading…</div>}>
      <AppHomeContent />
    </Suspense>
  );
}
