"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const principles = [
  {
    tag: "Permissionless",
    heading: "Launch markets",
    highlight: "permissionlessly",
    headingEnd: "in under a minute",
    desc: "Perply lets anyone deploy Percolator-style perp markets with real collateral, on-chain settlement, and full program truth — no KYC, no approvals.",
    stat: "50+",
    statLabel: "Markets Created and tested Permissionlessly",
    cta: "Learn More",
  },
  {
    tag: "Verifiable",
    heading: "On-chain receipts",
    highlight: "for every action.",
    headingEnd: "",
    desc: "Each receipt includes the tx signature, invoked programs (including CPI), and program truth (upgradeability + upgrade authority) — exportable as JSON.",
    stat: "100%",
    statLabel: "On-chain Verification",
    cta: "Get Started",
  },
  {
    tag: "Composable",
    heading: "Flexible oracle modes:",
    highlight: "Pyth, Chainlink, or Authority",
    headingEnd: "(for devnet testing)",
    desc: "Oracle health and staleness are surfaced on the proof page.",
    stat: "Oracle modes",
    statLabel: "Staleness tracked",
    cta: "Explore Case Studies",
  },
];

export function PrinciplesSection() {
  const [, setActiveIndex] = useState(0);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const panels = panelRefs.current.filter(Boolean) as HTMLDivElement[];
    if (!panels.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;

        visible.sort(
          (a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0)
        );
        const idx = panels.indexOf(visible[0].target as HTMLDivElement);
        if (idx !== -1) setActiveIndex(idx);
      },
      {
        root: null,
        threshold: [0.25, 0.5, 0.75],
        rootMargin: "-20% 0px -55% 0px",
      }
    );

    panels.forEach((p) => obs.observe(p));
    return () => obs.disconnect();
  }, []);

  return (
    <section className="relative overflow-x-clip">
      {/* Web3: gradient orbs + grid (desktop and mobile) */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div
          className="absolute top-0 right-0 w-[70%] max-w-[500px] h-[60%] rounded-full opacity-[0.08] blur-[90px]"
          style={{ background: "radial-gradient(ellipse 50% 50% at 100% 20%, hsl(168 80% 42%), transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 left-0 w-[50%] max-w-[400px] h-[50%] rounded-full opacity-[0.06] blur-[80px]"
          style={{ background: "radial-gradient(ellipse 50% 50% at 0% 100%, hsl(262 80% 50%), transparent 70%)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>
      {/* Video background - mobile only, behind text */}
      <div className="absolute inset-0 lg:hidden">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src="/videos/seda-fast-lower-quiet.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/70" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12">
        <div className="pt-24 lg:pt-36 pb-8">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-emerald-400 uppercase tracking-[0.2em] mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 shadow-[0_0_10px_rgba(52,211,153,0.35)]" />
            Core Principles
          </span>
          <h2 className="text-4xl sm:text-5xl lg:text-7xl font-display font-bold text-white tracking-tight text-balance drop-shadow-lg">
            Built different.
          </h2>
        </div>

        <div className="h-px bg-gradient-to-r from-white/[0.08] via-white/[0.04] to-transparent mb-8" />

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20">
          <div className="flex flex-col max-w-2xl">
          {principles.map((p, i) => (
            <div
              key={p.tag}
              ref={(el) => {
                panelRefs.current[i] = el;
              }}
              className="py-20 lg:py-32 first:pt-12 last:pb-28"
            >
              {i > 0 && <div className="h-px bg-white/[0.06] mb-20" />}

              <span className="inline-block px-3 py-1.5 rounded-full border border-white/[0.12] bg-black/20 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70 mb-8 backdrop-blur-sm">
                {p.tag}
              </span>

              <h3 className="text-3xl sm:text-4xl lg:text-[2.8rem] font-display font-bold text-white leading-[1.12] tracking-tight mb-6 text-balance drop-shadow-md">
                {p.heading}{" "}
                <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                  {p.highlight}
                </span>
                {p.headingEnd ? <> {p.headingEnd}</> : null}
              </h3>

              <p className="text-white/70 text-base lg:text-lg leading-relaxed mb-10 max-w-lg drop-shadow">
                {p.desc}
              </p>

              <div className="mb-10">
                <span className="text-4xl lg:text-5xl font-display font-bold text-white drop-shadow-md">
                  {p.stat}
                </span>
                <p className="text-white/50 text-sm mt-1.5 uppercase tracking-wider">
                  {p.statLabel}
                </p>
              </div>

              <Link
                href="#"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-white/20 bg-black/30 text-white text-sm font-medium hover:bg-black/50 transition-all backdrop-blur-sm"
              >
                {p.cta}
              </Link>
            </div>
          ))}
          </div>

          {/* Desktop: sticky video on right */}
          <div className="hidden lg:block">
            <div className="sticky top-20 flex justify-center">
              <div className="relative w-full max-w-[840px] mx-auto rounded-2xl overflow-hidden">
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-[700px] h-[550px] object-cover"
                >
                  <source src="/videos/seda-fast-lower-quiet.mp4" type="video/mp4" />
                </video>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
