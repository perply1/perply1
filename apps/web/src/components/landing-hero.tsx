"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";

export function LandingHero() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 0.75;
    }
  }, []);

  return (
    <section className="relative min-h-[100dvh] flex flex-col justify-center overflow-hidden bg-black rounded-b-[100px]">
      {/* Fullscreen video background */}
      <div className="absolute inset-0 z-0">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          aria-hidden="true"
        >
          <source src="/videos/hero-bg.mp4" type="video/mp4" />
        </video>

        {/* Dark overlays for text readability */}
        <div className="absolute inset-0 bg-[#050507]/60" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050507]/40 via-transparent to-[#050507]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050507]/30 via-transparent to-[#050507]/30" />

        {/* Web3: subtle gradient orbs (emerald + purple) behind content */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div
            className="absolute top-1/4 right-0 w-[80%] max-w-[600px] h-[50%] rounded-full opacity-[0.08] blur-[80px]"
            style={{ background: "radial-gradient(ellipse 50% 50% at 90% 30%, hsl(168 80% 42%), transparent 70%)" }}
          />
          <div
            className="absolute bottom-1/3 left-0 w-[60%] max-w-[400px] h-[40%] rounded-full opacity-[0.06] blur-[70px]"
            style={{ background: "radial-gradient(ellipse 50% 50% at 10% 70%, hsl(262 80% 50%), transparent 70%)" }}
          />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-[1200px] mx-auto w-full px-6 lg:px-10 pt-32 pb-24 lg:pt-40 lg:pb-32">
        {/* Top status bar */}
        <div className="flex items-center gap-3 mb-16 animate-fade-up">
          <div className="flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-white/40 font-medium">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.4)]" />
            Solana Mainnet
          </div>
          <span className="text-white/15">|</span>
          <span className="text-xs tracking-[0.15em] uppercase text-white/40 font-medium">
            Percolator-based
          </span>
        </div>

        {/* Main heading — gradient via inline style so it always shows */}
        <div className="max-w-4xl">
          <h1 className="animate-fade-up animation-delay-200">
            <span
              className="block text-[clamp(2.8rem,7.5vw,5.5rem)] font-display font-bold tracking-[-0.03em] leading-[1.05]"
              style={{
                background: "linear-gradient(to right, #ffffff 0%, #e0f2f1 25%, #99f6e4 55%, #34d399 85%, #2dd4bf 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Permissionless
            </span>
            <span
              className="block text-[clamp(2.8rem,7.5vw,5.5rem)] font-display font-bold tracking-[-0.03em] leading-[1.05]"
              style={{
                background: "linear-gradient(to right, #ffffff 0%, #e0f2f1 20%, #99f6e4 50%, #34d399 80%, #2dd4bf 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              perpetuals.
            </span>
          </h1>

          <p className="text-lg lg:text-xl text-white/50 max-w-xl leading-relaxed mt-8 animate-fade-up animation-delay-400 font-light">
            Launch permissionless perpetual markets in ~60 seconds, trade with a pro terminal, and verify every action with on-chain receipts. Built on the Percolator design.
          </p>
          <p className="text-sm text-white/35 max-w-xl leading-relaxed mt-3 animate-fade-up animation-delay-400 font-light">
            Proof Pages show oracle health, crank freshness, risk params, program upgrade authority, and <strong className="text-white/60">pricing engine guardrails</strong> — verifiable safety posture for thin markets.
          </p>
        </div>

        {/* CTA row */}
        <div className="flex flex-wrap items-center gap-4 mt-12 animate-fade-up animation-delay-600">
          <Link
            href="/app"
            className="inline-flex items-center gap-2.5 px-7 h-12 rounded-full text-[#050507] text-sm font-semibold tracking-[-0.01em] transition-all hover:opacity-95"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #ecfdf5 18%, #a7f3d0 38%, #6ee7b7 55%, #34d399 75%, #2dd4bf 90%, #14b8a6 100%)",
              boxShadow: "0 0 32px rgba(52, 211, 153, 0.35), 0 0 0 1px rgba(255,255,255,0.1) inset",
            }}
          >
            Launch App
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 px-7 h-12 rounded-full border border-white/15 text-white/70 text-sm font-medium tracking-[-0.01em] hover:text-white hover:border-white/30 transition-all"
          >
            Documentation
          </a>
        </div>

        {/* Bottom stats row */}
        <div className="flex flex-wrap items-stretch gap-px mt-20 animate-fade-up animation-delay-600">
          {[
            { value: "400ms", label: "Settlement Finality" },
            { value: "~60s", label: "Market Creation" },
            { value: "50x", label: "Max Leverage" },
            { value: "Every tx", label: "On-chain Receipts" },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="flex-1 min-w-[140px] relative px-6 lg:px-8 py-6"
            >
              {i > 0 && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-px bg-white/[0.08]" />
              )}
              <span className="block text-2xl lg:text-3xl font-display font-bold tracking-tight text-white">
                {stat.value}
              </span>
              <span className="block text-[11px] text-white/35 mt-1.5 uppercase tracking-[0.12em] font-medium">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
