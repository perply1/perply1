"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, X, ChevronDown, ArrowUpRight } from "lucide-react";
import { useState } from "react";

const TOKEN_CA = process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? "";

function truncateCa(addr: string, start = 4, end = 4) {
  if (addr.length <= start + end) return addr;
  return `${addr.slice(0, start)}…${addr.slice(-end)}`;
}

function CAWithCopy() {
  const [copied, setCopied] = useState(false);
  if (!TOKEN_CA || TOKEN_CA.length < 8) return null;

  const copy = () => {
    navigator.clipboard.writeText(TOKEN_CA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="hidden sm:flex items-center gap-2 rounded-full pl-3 pr-1.5 py-1.5 bg-[#0f0f0f] border border-[#2a2a2a]">
      <span className="text-[11px] font-medium text-[#E5E5E5]/70">CA:</span>
      <span className="text-[11px] font-mono text-[#E5E5E5]/90 tabular-nums" title={TOKEN_CA}>
        {truncateCa(TOKEN_CA)}
      </span>
      <button
        type="button"
        onClick={copy}
        className="p-1.5 rounded-md hover:bg-white/10 text-[#E5E5E5]/60 hover:text-emerald-400 transition-colors"
        title="Copy contract address"
        aria-label="Copy CA"
      >
        {copied ? (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2m0 0v2m0 8v2m0-8a2 2 0 012-2h2m0 0a2 2 0 012 2v8a2 2 0 01-2 2h-2m0-8V6" />
          </svg>
        )}
      </button>
    </div>
  );
}

const TRADE_ITEMS = [
  { href: "/app/mainnet", title: "Trading Terminal", desc: "Real perps, real liquidity" },
  { href: "/app/devnet", title: "Devnet Lab", desc: "Launch, mint, test" },
];

const BUILD_ITEMS = [
  { href: "/app/devnet/launch", title: "Launch Market", desc: "Deploy a perp market" },
  { href: "/app/devnet/mint", title: "Token Factory", desc: "Mint SPL tokens" },
];

export function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);

  const marqueeText = "PERPLY • PERMISSIONLESS PERPS • PERCOLATOR-BASED • PROOF PAGES • PROPAmm PRICING • ON-CHAIN RECEIPTS • DEVNET LAB • MAINNET TERMINAL • ";

  return (
    <nav className="fixed top-0 left-0 right-0 z-[60]">
      {/* Marquee: full width end-to-end, above header, outside container */}
      <div className="landing-marquee-gradient w-full border-b border-white/[0.04] overflow-hidden">
        <div
          className="flex items-center ticker-scroll whitespace-nowrap py-1.5 text-[11px] font-medium text-[#E5E5E5]/80 tracking-wider"
          style={{ "--ticker-duration": "25s" } as React.CSSProperties}
        >
          <span className="shrink-0 px-2">{marqueeText.repeat(3)}</span>
          <span className="shrink-0 px-2">{marqueeText.repeat(3)}</span>
        </div>
      </div>

      {/* Header row: in container, moved a bit from top */}
      <div className="mx-auto w-full max-w-7xl px-6 lg:max-w-[80rem] pt-3">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 pl-2">
            <Image
              src="/images/perply-logo.png"
              alt="Perply"
              width={120}
              height={32}
              className="h-8 w-auto"
            />
          </Link>

          <div className="hidden lg:flex items-center gap-1.5 rounded-full px-1.5 py-1 bg-[#0f0f0f]">
            <div
              className="relative"
              onMouseEnter={() => setTradeOpen(true)}
              onMouseLeave={() => setTradeOpen(false)}
            >
              <button className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium text-[#E5E5E5]/85 hover:text-[#E5E5E5] hover:bg-[#E5E5E5]/6 transition-colors">
                Trade
                <ChevronDown className={`h-3 w-3 transition-transform ${tradeOpen ? "rotate-180" : ""}`} />
              </button>
              {tradeOpen && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 pt-3">
                  <div className="w-[280px] rounded-2xl p-4 bg-[#101010] ring-1 ring-white/10 shadow-2xl">
                    {TRADE_ITEMS.map(({ href, title, desc }) => (
                      <Link
                        key={href}
                        href={href}
                        className="group flex rounded-xl px-3 py-2.5 hover:bg-white/[0.06] transition-colors"
                        onClick={() => setTradeOpen(false)}
                      >
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-[#E5E5E5]">{title}</h4>
                          <p className="text-xs text-[#E5E5E5]/70">{desc}</p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-[#E5E5E5]/70 group-hover:text-emerald-400 shrink-0 mt-0.5" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div
              className="relative"
              onMouseEnter={() => setBuildOpen(true)}
              onMouseLeave={() => setBuildOpen(false)}
            >
              <button className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium text-[#E5E5E5]/85 hover:text-[#E5E5E5] hover:bg-[#E5E5E5]/6 transition-colors">
                Build
                <ChevronDown className={`h-3 w-3 transition-transform ${buildOpen ? "rotate-180" : ""}`} />
              </button>
              {buildOpen && (
                <div className="absolute top-full right-0 pt-3">
                  <div className="w-[280px] rounded-2xl p-4 bg-[#101010] ring-1 ring-white/10 shadow-2xl">
                    {BUILD_ITEMS.map(({ href, title, desc }) => (
                      <Link
                        key={href}
                        href={href}
                        className="group flex rounded-xl px-3 py-2.5 hover:bg-white/[0.06] transition-colors"
                        onClick={() => setBuildOpen(false)}
                      >
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-[#E5E5E5]">{title}</h4>
                          <p className="text-xs text-[#E5E5E5]/70">{desc}</p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-[#E5E5E5]/70 group-hover:text-emerald-400 shrink-0 mt-0.5" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <CAWithCopy />
            <div className="mx-1 h-4 w-px bg-emerald-500/15" />
            <div className="flex items-center gap-1.5 px-1.5">
              <a href="https://x.com/perplytrade" target="_blank" rel="noopener noreferrer" className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#111111] text-gray-400 transition-all hover:border-white hover:text-white" aria-label="X / Twitter">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a href="https://github.com/perply1" target="_blank" rel="noopener noreferrer" className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#111111] text-gray-400 transition-all hover:border-white hover:text-white" aria-label="GitHub">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
              </a>
              <div className="mx-1 h-4 w-px bg-emerald-500/15" />
              <Link
                href="/app"
                className="inline-flex h-9 items-center justify-center rounded-full px-5 text-[12px] font-semibold text-[#050507] transition-all hover:opacity-95"
                style={{
                  background: "linear-gradient(135deg, #ffffff 0%, #ecfdf5 18%, #a7f3d0 38%, #6ee7b7 55%, #34d399 75%, #2dd4bf 90%, #14b8a6 100%)",
                  boxShadow: "0 0 24px rgba(52, 211, 153, 0.3), 0 0 0 1px rgba(255,255,255,0.08) inset",
                }}
              >
                Open App
              </Link>
            </div>
          </div>

          <button className="lg:hidden text-[#E5E5E5] pr-3" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle menu">
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="lg:hidden rounded-b-2xl bg-[#101010]/95 backdrop-blur-lg ring-1 ring-white/10 py-6 shadow-2xl">
            <div className="flex flex-col gap-4 px-5">
              {TOKEN_CA.length >= 8 && (
                <div className="flex items-center justify-between rounded-xl px-3 py-2.5 bg-[#0f0f0f] border border-[#2a2a2a]">
                  <span className="text-xs text-[#E5E5E5]/70">CA:</span>
                  <span className="text-xs font-mono text-[#E5E5E5]/90">{truncateCa(TOKEN_CA)}</span>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(TOKEN_CA); }}
                    className="p-1.5 rounded-md hover:bg-white/10 text-[#E5E5E5]/60"
                    aria-label="Copy CA"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2m0 0v2m0 8v2m0-8a2 2 0 012-2h2m0 0a2 2 0 012 2v8a2 2 0 01-2 2h-2m0-8V6" />
                    </svg>
                  </button>
                </div>
              )}
              {[...TRADE_ITEMS, ...BUILD_ITEMS].map(({ href, title, desc }) => (
                <Link key={href} href={href} className="rounded-xl px-3 py-3 hover:bg-white/[0.06]" onClick={() => setMobileOpen(false)}>
                  <h4 className="text-sm font-semibold text-white">{title}</h4>
                  <p className="text-xs text-zinc-500">{desc}</p>
                </Link>
              ))}
              <div className="h-px bg-white/10" />
              <Link
                href="/app"
                className="inline-flex h-10 items-center justify-center rounded-lg text-[13px] font-semibold text-[#050507] transition-all hover:opacity-95"
                style={{
                  background: "linear-gradient(135deg, #ffffff 0%, #ecfdf5 18%, #a7f3d0 38%, #6ee7b7 55%, #34d399 75%, #2dd4bf 90%, #14b8a6 100%)",
                  boxShadow: "0 0 24px rgba(52, 211, 153, 0.3), 0 0 0 1px rgba(255,255,255,0.08) inset",
                }}
                onClick={() => setMobileOpen(false)}
              >
                Open App
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
