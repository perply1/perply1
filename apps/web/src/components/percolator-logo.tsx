"use client";

import { cn } from "@/lib/utils";

interface PercolatorLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

/**
 * Percolator brand logo — an abstract "drip filter" mark.
 * Three stacked horizontal bars with a drip, evoking both a
 * coffee percolator and a trading order-book depth chart.
 */
export function PercolatorLogo({
  size = 24,
  className,
  showText = true,
}: PercolatorLogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <circle
          cx="16"
          cy="16"
          r="14.5"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          opacity="0.35"
        />
        <rect
          x="8"
          y="10"
          width="16"
          height="2"
          rx="1"
          fill="hsl(var(--primary))"
        />
        <rect
          x="10"
          y="15"
          width="12"
          height="2"
          rx="1"
          fill="hsl(var(--primary))"
          opacity="0.7"
        />
        <rect
          x="12"
          y="20"
          width="8"
          height="2"
          rx="1"
          fill="hsl(var(--primary))"
          opacity="0.45"
        />
        <circle
          cx="16"
          cy="27"
          r="1.5"
          fill="hsl(var(--primary))"
        />
        <line
          x1="16"
          y1="22"
          x2="16"
          y2="25.5"
          stroke="hsl(var(--primary))"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.6"
        />
      </svg>

      {showText && (
        <div className="flex flex-col leading-none">
          <span className="text-sm font-bold font-mono text-foreground tracking-[0.15em] uppercase">
            Percolator
          </span>
          <span className="text-[8px] font-mono text-primary/70 tracking-[0.3em] uppercase mt-0.5">
            Perpetuals
          </span>
        </div>
      )}
    </div>
  );
}

export function PercolatorMark({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
    >
      <circle
        cx="16"
        cy="16"
        r="14.5"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        opacity="0.35"
      />
      <rect
        x="8"
        y="10"
        width="16"
        height="2"
        rx="1"
        fill="hsl(var(--primary))"
      />
      <rect
        x="10"
        y="15"
        width="12"
        height="2"
        rx="1"
        fill="hsl(var(--primary))"
        opacity="0.7"
      />
      <rect
        x="12"
        y="20"
        width="8"
        height="2"
        rx="1"
        fill="hsl(var(--primary))"
        opacity="0.45"
      />
      <circle cx="16" cy="27" r="1.5" fill="hsl(var(--primary))" />
      <line
        x1="16"
        y1="22"
        x2="16"
        y2="25.5"
        stroke="hsl(var(--primary))"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}
