"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function EnvironmentsSection() {
  return (
    <section className="relative py-20 lg:py-28 overflow-hidden">
      {/* Web3: gradient orbs + grid */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[90%] max-w-[600px] h-[50%] rounded-full opacity-[0.07] blur-[90px]"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 0%, hsl(168 80% 42%), transparent 70%)" }}
        />
        <div
          className="absolute bottom-1/4 right-0 w-[50%] max-w-[400px] h-[50%] rounded-full opacity-[0.05] blur-[80px]"
          style={{ background: "radial-gradient(ellipse 50% 50% at 100% 80%, hsl(262 80% 50%), transparent 70%)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        <div className="mb-12 lg:mb-20">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-emerald-400 uppercase tracking-[0.2em] mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 shadow-[0_0_10px_rgba(52,211,153,0.35)]" />
            Environments
          </span>
          <h2 className="text-3xl sm:text-5xl font-display font-bold text-white mb-4 tracking-tight">
            Two modes.{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">One standard.</span>
          </h2>
          <p className="text-white/40 text-sm sm:text-base max-w-lg leading-relaxed">
            Production-ready trading and a builder sandbox. Same protocol, same proof system.
          </p>
        </div>

        <div className="relative">
          <div className="relative mb-10 lg:mb-16">
            <div className="absolute left-[70px] sm:left-[100px] md:left-[140px] right-0 top-[16px] lg:top-[20px] h-[2px] bg-emerald-500/60" />
            <div className="flex items-start gap-0 relative">
              <div className="relative z-10 shrink-0 flex items-center gap-1.5 sm:gap-2.5 px-3 sm:px-5 py-1.5 sm:py-2 rounded-full border border-emerald-500/30 bg-[#0d1210] text-emerald-400 text-[11px] sm:text-sm font-semibold">
                <span className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-emerald-400 animate-pulse" />
                mainnet
              </div>
              <div className="flex-1 relative h-10 sm:h-14 min-w-0">
                <div className="absolute left-[8%] sm:left-[10%] top-[4px] sm:top-[6px]">
                  <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full border-2 border-emerald-500/40 bg-[#050507] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-500" />
                  </div>
                  <span className="absolute top-7 sm:top-10 left-1/2 -translate-x-1/2 text-[8px] sm:text-[10px] font-mono text-white/30 whitespace-nowrap">market deployed</span>
                </div>
                <div className="absolute left-[32%] sm:left-[35%] top-[4px] sm:top-[6px]">
                  <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full border-2 border-emerald-500/40 bg-[#050507] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-500" />
                  </div>
                  <span className="absolute -top-5 sm:-top-7 left-1/2 -translate-x-1/2 text-[8px] sm:text-[10px] font-mono text-white/25 whitespace-nowrap">14:02:38</span>
                  <span className="absolute top-7 sm:top-10 left-1/2 -translate-x-1/2 text-[8px] sm:text-[10px] font-mono text-white/30 whitespace-nowrap">liquidity added</span>
                </div>
                <div className="absolute left-[56%] sm:left-[60%] top-[4px] sm:top-[6px]">
                  <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full border-2 border-emerald-500/60 bg-[#050507] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-500" />
                  </div>
                  <span className="absolute -top-5 sm:-top-7 left-1/2 -translate-x-1/2 text-[8px] sm:text-[10px] font-mono text-white/25 whitespace-nowrap">14:03:01</span>
                  <span className="absolute top-7 sm:top-10 left-1/2 -translate-x-1/2 text-[8px] sm:text-[10px] font-mono text-white/30 whitespace-nowrap">trade executed</span>
                </div>
                <div className="absolute left-[78%] sm:left-[82%] top-[4px] sm:top-[6px]">
                  <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full border-2 border-emerald-500/40 bg-[#050507] flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="absolute top-7 sm:top-10 left-1/2 -translate-x-1/2 text-[8px] sm:text-[10px] font-mono text-white/30 whitespace-nowrap">receipt issued</span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative ml-[90px] sm:ml-[130px] md:ml-[180px] mb-10 lg:mb-16">
            <div className="absolute -top-8 sm:-top-10 left-[40px] sm:left-[60px] w-px h-8 sm:h-10 border-l border-dashed border-white/10" />
            <div
              className="absolute left-[40px] sm:left-[60px] right-[25%] sm:right-[20%] top-[16px] lg:top-[20px] h-[2px]"
              style={{ backgroundImage: "repeating-linear-gradient(to right, hsl(173 58% 39% / 0.4) 0, hsl(173 58% 39% / 0.4) 6px, transparent 6px, transparent 12px)" }}
            />
            <div className="flex items-start gap-0 relative">
              <div className="relative z-10 shrink-0 flex items-center gap-1.5 sm:gap-2.5 px-3 sm:px-5 py-1.5 sm:py-2 rounded-full border border-teal-500/30 bg-[#0a0d0f] text-teal-400 text-[11px] sm:text-sm font-semibold">
                <span className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-teal-400" />
                devnet-market
              </div>
              <div className="flex-1 relative h-10 sm:h-14 min-w-0">
                <div className="absolute left-[12%] sm:left-[15%] top-[4px] sm:top-[6px]">
                  <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full border-2 border-teal-500/40 bg-[#050507] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 rounded-full bg-teal-500" />
                  </div>
                  <span className="absolute top-7 sm:top-10 left-1/2 -translate-x-1/2 text-[8px] sm:text-[10px] font-mono text-white/30 whitespace-nowrap">tokens minted</span>
                </div>
                <div className="absolute left-[42%] sm:left-[45%] top-[4px] sm:top-[6px]">
                  <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full border-2 border-teal-500/40 bg-[#050507] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 rounded-full bg-teal-500" />
                  </div>
                  <span className="absolute top-7 sm:top-10 left-1/2 -translate-x-1/2 text-[8px] sm:text-[10px] font-mono text-white/30 whitespace-nowrap">test trade</span>
                </div>
                <div className="absolute left-[68%] sm:left-[72%] top-[4px] sm:top-[6px]">
                  <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full border-2 border-teal-500/40 bg-[#050507] flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="absolute top-7 sm:top-10 left-1/2 -translate-x-1/2 text-[8px] sm:text-[10px] font-mono text-white/30 whitespace-nowrap">verified</span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative ml-[150px] sm:ml-[220px] md:ml-[300px]">
            <div className="absolute -top-8 sm:-top-10 left-[40px] sm:left-[60px] w-px h-8 sm:h-10 border-l border-dashed border-white/10" />
            <div
              className="absolute left-[40px] sm:left-[60px] right-[40%] sm:right-[35%] top-[16px] lg:top-[20px] h-[2px]"
              style={{ backgroundImage: "repeating-linear-gradient(to right, hsl(234 89% 74% / 0.4) 0, hsl(234 89% 74% / 0.4) 6px, transparent 6px, transparent 12px)" }}
            />
            <div className="flex items-start gap-0 relative">
              <div className="relative z-10 shrink-0 flex items-center gap-1.5 sm:gap-2.5 px-3 sm:px-5 py-1.5 sm:py-2 rounded-full border border-indigo-500/30 bg-[#0a0a10] text-indigo-400 text-[11px] sm:text-sm font-semibold">
                <span className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-indigo-400" />
                test-receipt
              </div>
              <div className="flex-1 relative h-10 sm:h-14 min-w-0">
                <div className="absolute left-[18%] sm:left-[20%] top-[4px] sm:top-[6px]">
                  <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full border-2 border-indigo-500/40 bg-[#050507] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 rounded-full bg-indigo-500" />
                  </div>
                  <span className="absolute top-7 sm:top-10 left-1/2 -translate-x-1/2 text-[8px] sm:text-[10px] font-mono text-white/30 whitespace-nowrap">proof generated</span>
                </div>
                <div className="absolute left-[48%] sm:left-[50%] top-[4px] sm:top-[6px]">
                  <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full border-2 border-indigo-500/40 bg-[#050507] flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="absolute top-7 sm:top-10 left-1/2 -translate-x-1/2 text-[8px] sm:text-[10px] font-mono text-white/30 whitespace-nowrap">receipt valid</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-stretch gap-px mt-16 lg:mt-24">
          {[
            { value: "400ms", label: "Settlement Finality" },
            { value: "~60s", label: "Market Creation" },
            { value: "50x", label: "Max Leverage" },
            { value: "Every tx", label: "On-chain Receipts" },
          ].map((stat, i) => (
            <div key={stat.label} className="flex-1 min-w-[140px] relative px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
              {i > 0 && <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-px bg-white/[0.08]" />}
              <span className="block text-xl sm:text-2xl lg:text-3xl font-display font-bold tracking-tight text-white">{stat.value}</span>
              <span className="block text-[10px] sm:text-[11px] text-white/35 mt-1.5 uppercase tracking-[0.12em] font-medium">{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 mt-8 lg:mt-10">
          <Link
            href="/app/mainnet"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-[#050507] font-semibold text-sm transition-all hover:opacity-95"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #ecfdf5 18%, #a7f3d0 38%, #6ee7b7 55%, #34d399 75%, #2dd4bf 90%, #14b8a6 100%)",
              boxShadow: "0 0 24px rgba(52, 211, 153, 0.3), 0 0 0 1px rgba(255,255,255,0.08) inset",
            }}
          >
            Open Terminal
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/app/devnet" className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-white/10 text-white font-medium text-sm hover:bg-white/[0.04] transition-colors">
            Explore Devnet
          </Link>
        </div>
      </div>
    </section>
  );
}
