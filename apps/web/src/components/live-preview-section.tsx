"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, ChevronRight } from "lucide-react";

const tabs = [
  { id: "verify", label: "Verify Receipt" },
  { id: "launch", label: "Launch Market" },
  { id: "trade", label: "Execute Trade" },
];

const codeBlocks: Record<string, { file: string; lines: { text: string; type: "comment" | "code" | "highlight" | "empty" }[] }> = {
  verify: {
    file: "verify-receipt.ts",
    lines: [
      { text: "// Fetch and verify a trade receipt", type: "comment" },
      { text: "import { Perply } from '@perply/sdk';", type: "code" },
      { text: "", type: "empty" },
      { text: "const perply = new Perply({ network: 'mainnet' });", type: "code" },
      { text: "", type: "empty" },
      { text: "const receipt = await perply.proof.verify({", type: "highlight" },
      { text: "  market: '7xKq...9mPd',", type: "highlight" },
      { text: "  tx: '5Kx2...mNqT'", type: "highlight" },
      { text: "});", type: "highlight" },
      { text: "", type: "empty" },
      { text: "// Returns: cryptographic receipt", type: "comment" },
      { text: "console.log(receipt.programs);", type: "code" },
      { text: "console.log(receipt.liveness);", type: "code" },
    ],
  },
  launch: {
    file: "launch-market.ts",
    lines: [
      { text: "// Deploy a new perpetual market", type: "comment" },
      { text: "import { Perply } from '@perply/sdk';", type: "code" },
      { text: "", type: "empty" },
      { text: "const perply = new Perply({ network: 'devnet' });", type: "code" },
      { text: "", type: "empty" },
      { text: "const market = await perply.market.create({", type: "highlight" },
      { text: "  pair: 'SOL-PERP',", type: "highlight" },
      { text: "  collateral: 'wSOL',", type: "highlight" },
      { text: "  leverage: { max: 50 },", type: "highlight" },
      { text: "  oracle: 'CHAINLINK'", type: "highlight" },
      { text: "});", type: "highlight" },
      { text: "", type: "empty" },
      { text: "// Market live in ~60 seconds", type: "comment" },
    ],
  },
  trade: {
    file: "execute-trade.ts",
    lines: [
      { text: "// Open a leveraged position", type: "comment" },
      { text: "import { Perply } from '@perply/sdk';", type: "code" },
      { text: "", type: "empty" },
      { text: "const perply = new Perply({ network: 'mainnet' });", type: "code" },
      { text: "", type: "empty" },
      { text: "const position = await perply.trade.open({", type: "highlight" },
      { text: "  market: '7xKq...9mPd',", type: "highlight" },
      { text: "  side: 'LONG',", type: "highlight" },
      { text: "  size: 10,", type: "highlight" },
      { text: "  leverage: 20", type: "highlight" },
      { text: "});", type: "highlight" },
      { text: "", type: "empty" },
      { text: "// Receipt auto-generated", type: "comment" },
    ],
  },
};

const outputBlocks: Record<string, { status: string; fields: { label: string; value: string }[] }> = {
  verify: {
    status: "Verified",
    fields: [
      { label: "Market", value: "7xKq...9mPd" },
      { label: "Collateral", value: "wSOL" },
      { label: "Oracle", value: "AUTHORITY" },
      { label: "Percolator", value: "Upgradeable" },
      { label: "Crank", value: "Fresh (12 slots)" },
      { label: "Vault", value: "4.2910 tokens" },
    ],
  },
  launch: {
    status: "Deployed",
    fields: [
      { label: "Market ID", value: "9bRm...4kWz" },
      { label: "Pair", value: "SOL-PERP" },
      { label: "Max Leverage", value: "50x" },
      { label: "Collateral", value: "wSOL" },
      { label: "Oracle", value: "CHAINLINK" },
      { label: "Deploy Time", value: "58.2s" },
    ],
  },
  trade: {
    status: "Filled",
    fields: [
      { label: "Position ID", value: "3mXk...7pRq" },
      { label: "Side", value: "LONG" },
      { label: "Size", value: "10 SOL" },
      { label: "Leverage", value: "50x" },
      { label: "Entry", value: "$142.38" },
      { label: "Receipt", value: "5Kx2...mNqT" },
    ],
  },
};

export function LivePreviewSection() {
  const [activeTab, setActiveTab] = useState("verify");
  const [copied, setCopied] = useState(false);

  const code = codeBlocks[activeTab];
  const output = outputBlocks[activeTab];

  const handleCopy = () => {
    const text = code.lines.map((l) => l.text).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative py-24 lg:py-36 overflow-hidden">
      {/* Web3: gradient orbs + grid */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div
          className="absolute top-0 left-0 w-[70%] max-w-[500px] h-[60%] rounded-full opacity-[0.08] blur-[90px]"
          style={{ background: "radial-gradient(ellipse 50% 50% at 0% 30%, hsl(168 80% 42%), transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 right-0 w-[60%] max-w-[450px] h-[50%] rounded-full opacity-[0.06] blur-[80px]"
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
      <div className="relative max-w-6xl mx-auto px-6">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-14">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-medium text-emerald-400 uppercase tracking-[0.2em] mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 shadow-[0_0_10px_rgba(52,211,153,0.35)]" />
              Developer Preview
            </span>
            <h2 className="text-3xl sm:text-5xl font-display font-bold text-white tracking-tight text-balance">
              Ship in minutes,{" "}
              <span className="text-white/40">not months.</span>
            </h2>
            <p className="mt-4 max-w-xl text-base text-white/35 leading-relaxed">
              Three lines to verify. One click to open the Proof Page. Six lines to launch. Full SDK for everything in between.
            </p>
            <p className="mt-2 max-w-xl text-xs text-white/25 leading-relaxed">
              Proof Page shows oracle health, crank freshness, risk params, CPI trace, and program upgrade authority.
            </p>
          </div>
          <Link
            href="/app/devnet"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-white/15 text-sm font-medium text-white hover:bg-white/[0.04] transition-colors shrink-0"
          >
            Open Devnet Lab
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0c0c10] overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5">
            <div className="flex items-center gap-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative px-5 py-3.5 text-[13px] font-medium transition-colors ${
                    activeTab === tab.id ? "text-white" : "text-white/30 hover:text-white/50"
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && <div className="absolute bottom-0 left-2 right-2 h-px bg-emerald-400" />}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono text-white/20">{code.file}</span>
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-md hover:bg-white/[0.05] transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-white/25" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px]">
            <div className="p-6 lg:p-8 border-b lg:border-b-0 lg:border-r border-white/[0.06]">
              <div className="font-mono text-[13px] leading-[1.85]">
                {code.lines.map((line, i) => (
                  <div
                    key={`${activeTab}-${i}`}
                    className={`flex items-start gap-5 ${
                      line.type === "highlight"
                        ? "text-emerald-300/90"
                        : line.type === "comment"
                          ? "text-white/20"
                          : line.type === "empty"
                            ? ""
                            : "text-white/55"
                    }`}
                  >
                    <span className="text-white/10 select-none w-4 text-right shrink-0 text-xs leading-[1.85]">{i + 1}</span>
                    <span className="whitespace-pre">{line.text || " "}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 lg:p-8 bg-[#090910]">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">Response</span>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
                  {output.status}
                </span>
              </div>

              <div className="space-y-0">
                {output.fields.map((field, i) => (
                  <div
                    key={field.label}
                    className={`flex items-center justify-between py-3 ${i < output.fields.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                  >
                    <span className="text-[12px] text-white/25 font-mono">{field.label}</span>
                    <span className="text-[12px] text-white/60 font-mono">{field.value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-5 border-t border-white/[0.06]">
                <div className="flex items-center gap-2 text-[11px] text-white/20 font-mono">
                  <ChevronRight className="w-3 h-3 text-emerald-400/40" />
                  <span>{"2 programs inspected \u00B7 400ms"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
