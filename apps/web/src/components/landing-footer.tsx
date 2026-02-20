"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight } from "lucide-react";

export function LandingFooter() {
  return (
    <footer className="relative rounded-t-[100px]">
      {/* Large CTA section - full-bleed video background */}
      <div className="relative w-full min-h-[22rem] lg:min-h-[26rem] overflow-hidden">
        {/* Video background - full viewport width */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover scale-110"
        >
          <source src="/videos/footer-bg.mp4" type="video/mp4" />
        </video>

        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-[#050507]/50" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050507]/70 via-transparent to-[#050507]/60" />

        {/* Web3: subtle orbs in CTA area */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div
            className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[80%] max-w-[500px] h-[60%] rounded-full opacity-[0.06] blur-[100px]"
            style={{ background: "radial-gradient(ellipse 60% 50% at 50% 80%, hsl(168 80% 42%), transparent 70%)" }}
          />
          <div
            className="absolute top-1/3 right-0 w-[40%] max-w-[300px] h-[40%] rounded-full opacity-[0.04] blur-[80px]"
            style={{ background: "radial-gradient(ellipse 50% 50% at 100% 30%, hsl(262 80% 50%), transparent 70%)" }}
          />
        </div>

        {/* Content - centered, max width */}
        <div className="relative z-10 flex flex-col items-center justify-center min-h-[22rem] lg:min-h-[26rem] py-16 lg:py-20 px-6">
          <div className="text-center max-w-4xl mx-auto">
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-white/40">
              Permissionless perpetual futures on Solana
            </p>

            <h2 className="font-display font-bold leading-[0.9] tracking-tight text-white mb-8">
              <span className="block text-[clamp(2.25rem,8vw,5rem)] uppercase">
                Build it.
              </span>
              <span className="block text-[clamp(2.25rem,8vw,5rem)] uppercase">
                Trade it.
              </span>
              <span className="block text-[clamp(2.25rem,8vw,5rem)] uppercase">
                Prove it.
              </span>
            </h2>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/app/devnet/launch"
                className="inline-flex items-center justify-center gap-2 rounded-full px-8 h-14 text-sm font-semibold text-[#050507] transition-all hover:opacity-95"
                style={{
                  background: "linear-gradient(135deg, #ffffff 0%, #ecfdf5 18%, #a7f3d0 38%, #6ee7b7 55%, #34d399 75%, #2dd4bf 90%, #14b8a6 100%)",
                  boxShadow: "0 0 28px rgba(52, 211, 153, 0.3), 0 0 0 1px rgba(255,255,255,0.1) inset",
                }}
              >
                Launch Your First Market
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/app/mainnet"
                className="inline-flex items-center justify-center rounded-full px-8 h-14 text-sm font-medium border border-white/20 text-white hover:border-white/30 transition-all"
              >
                Trade on Mainnet
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="h-px bg-white/[0.06]" />
      </div>

      {/* Footer links */}
      <div className="max-w-6xl mx-auto px-6 py-20">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-12 gap-x-8">
          {/* Connect */}
          <div>
            <h4 className="text-sm text-white/40 mb-5">Connect</h4>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://x.com/perplytrade"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-white hover:text-emerald-400 transition-colors"
                >
                  X / Twitter
                  <ArrowUpRight className="w-3 h-3 text-white/30" />
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/perply1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-white hover:text-emerald-400 transition-colors"
                >
                  GitHub
                  <ArrowUpRight className="w-3 h-3 text-white/30" />
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3 */}
          <div>
            <h4 className="text-sm text-white/40 mb-5">Product</h4>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/app/mainnet"
                  className="text-sm text-white hover:text-emerald-400 transition-colors"
                >
                  Trading Terminal
                </Link>
              </li>
              <li>
                <Link
                  href="/app/devnet"
                  className="text-sm text-white hover:text-emerald-400 transition-colors"
                >
                  Devnet Lab
                </Link>
              </li>
              <li>
                <Link
                  href="/app/devnet/launch"
                  className="text-sm text-white hover:text-emerald-400 transition-colors"
                >
                  Launch Market
                </Link>
              </li>
              <li>
                <Link
                  href="/app/devnet/mint"
                  className="text-sm text-white hover:text-emerald-400 transition-colors"
                >
                  Token Factory
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4 */}
          <div>
            <h4 className="text-sm text-white/40 mb-5">Developers</h4>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://github.com/perply1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-white hover:text-emerald-400 transition-colors"
                >
                  Source Code
                  <ArrowUpRight className="w-3 h-3 text-white/30" />
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="h-px bg-white/[0.06]" />
      </div>
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6 text-xs text-white/25">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/images/perply-logo.png" alt="Perply" width={80} height={22} className="h-5 w-auto opacity-70 hover:opacity-90 transition-opacity" />
          </Link>
          <span>&copy; 2026 Perply</span>
        </div>

        <nav className="flex items-center rounded-full border border-white/[0.08] bg-white/[0.02] p-1">
          <Link
            href="/app/mainnet"
            className="px-4 py-1.5 rounded-full text-xs font-medium text-[#050507] transition-all hover:opacity-95"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #ecfdf5 18%, #a7f3d0 38%, #6ee7b7 55%, #34d399 75%, #2dd4bf 90%, #14b8a6 100%)",
              boxShadow: "0 0 16px rgba(52, 211, 153, 0.25), 0 0 0 1px rgba(255,255,255,0.08) inset",
            }}
          >
            Trade
          </Link>
          <Link href="/app/devnet" className="px-4 py-1.5 rounded-full text-xs font-medium text-white/50 hover:text-white transition-colors">
            Build
          </Link>
          <a href="https://github.com/perply1" target="_blank" rel="noopener noreferrer" className="px-4 py-1.5 rounded-full text-xs font-medium text-white/50 hover:text-white transition-colors">
            Docs
          </a>
        </nav>
      </div>
    </footer>
  );
}

