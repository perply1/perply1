"use client";

const LOGOS = [
  "Solana",
  "Phantom",
  "Switchboard",
  "Jupiter",
  "Raydium",
  "Percolator",
  "Marinade",
  "Pyth",
];

export function StatsSection() {
  return (
    <section className="relative py-16 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center">
          <p className="text-xs text-white/30 uppercase tracking-[0.2em] font-medium mb-8">
            Powered by the Solana ecosystem
          </p>
          <div className="relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#050507] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#050507] to-transparent z-10 pointer-events-none" />
            <div className="flex animate-marquee">
              {[...LOGOS, ...LOGOS].map((logo, i) => (
                <div
                  key={`${logo}-${i}`}
                  className="flex items-center justify-center mx-8 lg:mx-12 shrink-0"
                >
                  <span className="text-sm font-medium text-white/20 hover:text-white/40 transition-colors whitespace-nowrap tracking-wide">
                    {logo}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
