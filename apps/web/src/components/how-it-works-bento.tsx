"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

const STEPS = [
  {
    num: "01",
    title: "Connect Wallet",
    desc: "Phantom, Solflare, or any Solana wallet. No signup, no KYC. One click and you are in.",
    gradient:
      "radial-gradient(ellipse at 20% 80%, #e040a0 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, #4060ff 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, #1a0040 0%, #0a0020 100%)",
  },
  {
    num: "02",
    title: "Launch or Pick a Market",
    desc: "Deploy a new perpetual market in 60 seconds or open an existing one. Fully permissionless.",
    gradient:
      "radial-gradient(ellipse at 30% 30%, #8040ff 0%, transparent 50%), radial-gradient(ellipse at 70% 70%, #4080ff 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, #2a1060 0%, #100840 100%)",
  },
  {
    num: "03",
    title: "Deposit Collateral",
    desc: "Transfer collateral into the market vault. Fully on-chain, non-custodial, verifiable.",
    gradient:
      "radial-gradient(ellipse at 70% 30%, #60c040 0%, transparent 50%), radial-gradient(ellipse at 30% 70%, #2080a0 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, #0a2020 0%, #081818 100%)",
  },
  {
    num: "04",
    title: "Trade Perps",
    desc: "Risk-increasing trades require a fresh crank. Perply enforces freshness and lets you crank in one click.",
    gradient:
      "radial-gradient(ellipse at 80% 60%, #c0a020 0%, transparent 50%), radial-gradient(ellipse at 20% 40%, #8060e0 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, #1a1808 0%, #101008 100%)",
  },
  {
    num: "05",
    title: "Verify On-Chain",
    desc: "Receipts include CPI call chains + upgrade authority — not just an explorer link.",
    gradient:
      "radial-gradient(ellipse at 40% 20%, #20c0c0 0%, transparent 50%), radial-gradient(ellipse at 60% 80%, #4040e0 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, #081820 0%, #060c18 100%)",
  },
  {
    num: "06",
    title: "Withdraw Anytime",
    desc: "Close your position, pull collateral back. Your keys, your funds. Always.",
    gradient:
      "radial-gradient(ellipse at 60% 20%, #ff6060 0%, transparent 50%), radial-gradient(ellipse at 30% 80%, #ff40a0 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, #200808 0%, #180810 100%)",
  },
];

function ExpandedContent({ step, onClose }: { step: (typeof STEPS)[0]; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end p-6 lg:p-8">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/60 transition-all"
        aria-label="Close details"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="space-y-3">
        <span className="text-xs font-mono text-white/50 tracking-wider block">
          STEP {step.num}
        </span>
        <h3 className="text-xl lg:text-2xl font-display font-bold text-white tracking-tight">
          {step.title}
        </h3>
        <p className="text-sm lg:text-base text-white/70 leading-relaxed max-w-xs">
          {step.desc}
        </p>
      </div>
    </div>
  );
}

function GradientCard({ step, index }: { step: (typeof STEPS)[0]; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.15 }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      className={`group relative flex-shrink-0 w-[300px] sm:w-[340px] lg:w-[360px] rounded-2xl overflow-hidden cursor-pointer transition-all duration-700 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      }`}
      style={{ transitionDelay: `${index * 120}ms` }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Gradient background */}
      <div
        className="absolute inset-0 transition-transform duration-700 group-hover:scale-105"
        style={{ background: step.gradient }}
      />

      {/* Noise texture overlay */}
      <div className="absolute inset-0 opacity-[0.15]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")" }} />

      {/* Card content container */}
      <div className="relative h-[420px] sm:h-[460px] flex flex-col">
        {/* Plus button */}
        {!expanded && (
          <div className="absolute top-4 right-4 z-10">
            <div className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white/60 group-hover:text-white group-hover:bg-white/20 transition-all">
              <Plus className="w-4 h-4" />
            </div>
          </div>
        )}

        {/* Content */}
        {expanded ? (
          <ExpandedContent step={step} onClose={() => setExpanded(false)} />
        ) : (
          <div className="mt-auto p-6 lg:p-8">
            <h3 className="text-lg lg:text-xl font-display font-bold text-white tracking-tight mb-2">
              {step.title}
            </h3>
            <p className="text-sm text-white/60 leading-relaxed line-clamp-2">
              {step.desc}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function HowItWorksBento() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = 380;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section id="how-it-works" className="relative py-24 lg:py-32 overflow-hidden">
      {/* Web3-style background: gradient orbs + subtle grid (match Core Infrastructure) */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div
          className="absolute top-1/4 right-0 w-[100%] max-w-[700px] h-[70%] rounded-full opacity-[0.1] blur-[100px]"
          style={{ background: "radial-gradient(ellipse 50% 50% at 80% 40%, hsl(168 80% 42%), transparent 65%)" }}
        />
        <div
          className="absolute bottom-1/4 left-0 w-[80%] max-w-[500px] h-[60%] rounded-full opacity-[0.08] blur-[90px]"
          style={{ background: "radial-gradient(ellipse 50% 60% at 10% 80%, hsl(262 80% 50%), transparent 65%)" }}
        />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[90%] max-w-[500px] h-[40%] rounded-full opacity-[0.06] blur-[80px]"
          style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, hsl(168 70% 45%), transparent 70%)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      <div className="relative max-w-[1400px] mx-auto overflow-hidden">
        {/* Header */}
        <div className="flex items-end justify-between px-6 lg:px-10 mb-12 lg:mb-16">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-medium text-emerald-400/80 uppercase tracking-[0.2em] mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 shadow-[0_0_10px_rgba(52,211,153,0.35)]" />
              How It Works
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white tracking-tight text-balance">
              Wallet to trade in six steps
            </h2>
          </div>

          {/* Navigation arrows */}
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={() => scroll("left")}
              disabled={!canScrollLeft}
              className={`w-11 h-11 rounded-full border flex items-center justify-center transition-all ${
                canScrollLeft
                  ? "border-white/20 text-white/70 hover:text-white hover:border-white/40 hover:bg-white/5"
                  : "border-white/[0.06] text-white/20 cursor-not-allowed"
              }`}
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scroll("right")}
              disabled={!canScrollRight}
              className={`w-11 h-11 rounded-full border flex items-center justify-center transition-all ${
                canScrollRight
                  ? "border-white/20 text-white/70 hover:text-white hover:border-white/40 hover:bg-white/5"
                  : "border-white/[0.06] text-white/20 cursor-not-allowed"
              }`}
              aria-label="Scroll right"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable cards - extra padding to prevent section overflow */}
        <div
          ref={scrollRef}
          className="flex gap-4 lg:gap-5 overflow-x-auto scrollbar-hide pl-6 lg:pl-10 pr-6 lg:pr-10 pb-6 min-w-0"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {/* Leading padding - space before first card */}
          <div className="flex-shrink-0 w-2 lg:w-4" aria-hidden="true" />
          {STEPS.map((step, i) => (
            <GradientCard key={step.num} step={step} index={i} />
          ))}

          {/* End spacer - space after last card */}
          <div className="flex-shrink-0 w-6 lg:w-10" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
