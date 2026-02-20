"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCluster } from "@/components/cluster-provider";
import { useConnection } from "@solana/wallet-adapter-react";
import { useReceipts } from "./receipts-provider";
import { WalletHeader } from "./wallet-header";
import { Volume2Icon, VolumeXIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { requestDevnetAirdrop, WEB_FAUCETS } from "@/lib/devnet-faucet";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";

const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? "";

function truncateAddress(addr: string, start = 4, end = 4): string {
  if (addr.length <= start + end) return addr;
  return `${addr.slice(0, start)}…${addr.slice(-end)}`;
}

function TokenAddressLink() {
  const [copied, setCopied] = useState(false);
  if (!TOKEN_ADDRESS || TOKEN_ADDRESS.length < 8) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(TOKEN_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const explorerUrl = `https://solscan.io/token/${TOKEN_ADDRESS}`;

  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center h-7 gap-2 pl-2.5 pr-1 min-w-[8.5rem] rounded-md text-[10px] font-mono leading-none bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.1] transition-colors text-muted-foreground hover:text-foreground"
      title={TOKEN_ADDRESS}
    >
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80 shrink-0 leading-none">CA:</span>
      <span className="tabular-nums truncate leading-none">{truncateAddress(TOKEN_ADDRESS)}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center justify-center p-1 rounded hover:bg-white/10 transition-colors shrink-0 h-5 w-5"
        title="Copy address"
        aria-label="Copy token address"
      >
        {copied ? (
          <svg className="w-3 h-3 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2m0 0v2m0 8v2m0-8a2 2 0 012-2h2m0 0a2 2 0 012 2v8a2 2 0 01-2 2h-2m0-8V6" />
          </svg>
        )}
      </button>
    </a>
  );
}
function AirdropButton() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"ok" | "fail" | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [showFallback, setShowFallback] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);
  const [balanceAtOpen, setBalanceAtOpen] = useState<number | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    if (!showFallback || !publicKey || balanceAtOpen === null) return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        await new Promise((r) => setTimeout(r, 4000));
        try {
          const bal = await connection.getBalance(publicKey);
          if (bal > balanceAtOpen) {
            setResult("ok");
            setTimeout(() => {
              setShowFallback(false);
              setResult(null);
            }, 3000);
            break;
          }
        } catch {}
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [showFallback, publicKey, connection, balanceAtOpen]);

  const handleAirdrop = async () => {
    if (!publicKey || cooldown > 0) return;
    setLoading(true);
    setResult(null);

    let currentBal = 0;
    try {
      currentBal = await connection.getBalance(publicKey);
    } catch {}

    const res = await requestDevnetAirdrop(publicKey.toBase58(), 1);

    if (res.success) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        await connection.getBalance(publicKey);
      } catch {}
      setResult("ok");
      setCooldown(15);
      setLoading(false);
      setTimeout(() => setResult(null), 5000);
    } else {
      navigator.clipboard.writeText(publicKey.toBase58());
      setResult("fail");
      setBalanceAtOpen(currentBal);
      setShowFallback(true);
      setCooldown(5);
      setLoading(false);
    }
  };

  const copyAddr = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey.toBase58());
    setAddrCopied(true);
    setTimeout(() => setAddrCopied(false), 2000);
  };

  if (!publicKey) return null;
  const disabled = loading || cooldown > 0;

  return (
    <div className="relative">
      <button
        onClick={showFallback ? () => setShowFallback(false) : handleAirdrop}
        disabled={disabled && !showFallback}
        className={cn(
          "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border transition",
          result === "ok"
            ? "bg-success/10 text-success border-success/20"
            : showFallback || result === "fail"
              ? "bg-warning/10 text-warning border-warning/20"
              : "bg-warning/10 text-warning border-warning/20 hover:bg-warning/20"
        )}
        style={{ opacity: disabled && !showFallback ? 0.5 : 1 }}
        title={showFallback ? "Close faucet panel" : "Request devnet SOL"}
      >
        {loading
          ? "Trying…"
          : result === "ok"
            ? "+SOL ✓"
            : showFallback
              ? "Get SOL ▾"
              : cooldown > 0
                ? `${cooldown}s`
                : "Airdrop"}
      </button>
      {showFallback && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowFallback(false)}
          />
          <div className="absolute right-0 top-full mt-1 w-72 rounded-lg border border-border bg-card shadow-2xl z-50 p-3">
            {result === "ok" ? (
              <div className="flex items-center gap-2 mb-2 p-1.5 rounded bg-success/5 border border-success/15">
                <span className="text-[9px] text-success font-semibold">
                  SOL received! Balance updated.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-2 p-1.5 rounded bg-success/5 border border-success/15">
                <div className="w-2.5 h-2.5 border-2 border-success/30 border-t-success rounded-full animate-spin shrink-0" />
                <span className="text-[9px] text-success">
                  Watching for balance change…
                </span>
              </div>
            )}

            <div className="flex items-center gap-1.5 mb-2 p-1.5 rounded bg-secondary">
              <code className="text-[8px] text-muted-foreground font-mono truncate flex-1">
                {publicKey.toBase58()}
              </code>
              <button
                onClick={copyAddr}
                className="px-1.5 py-0.5 bg-primary hover:bg-primary/90 rounded text-[8px] font-semibold text-primary-foreground transition shrink-0"
              >
                {addrCopied ? "Copied!" : "Copy"}
              </button>
            </div>

            <p className="text-[9px] text-muted-foreground mb-1.5">
              Open a faucet, paste your address:
            </p>
            <div className="space-y-1">
              {WEB_FAUCETS.map((f: { url: string; name: string; note: string; recommended?: boolean }) => (
                <a
                  key={f.url}
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={copyAddr}
                  className={cn(
                    "flex items-center justify-between px-2 py-1.5 rounded transition",
                    f.recommended
                      ? "bg-primary/10 hover:bg-primary/15"
                      : "hover:bg-secondary"
                  )}
                >
                  <div>
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        f.recommended ? "text-primary" : "text-foreground"
                      )}
                    >
                      {f.name}
                    </span>
                    {f.recommended && (
                      <span className="text-[7px] text-primary bg-primary/10 px-1 py-0.5 rounded ml-1 font-bold uppercase">
                        Best
                      </span>
                    )}
                    <span className="text-[8px] text-muted-foreground block">
                      {f.note}
                    </span>
                  </div>
                  <span className="text-[9px] text-muted-foreground">→</span>
                </a>
              ))}
            </div>

            <button
              onClick={() => setShowFallback(false)}
              className="w-full mt-2 py-1 rounded bg-secondary hover:bg-muted text-[9px] text-muted-foreground transition"
            >
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SoundToggle() {
  const [enabled, setEnabled] = React.useState(true);
  return (
    <button
      onClick={() => setEnabled(!enabled)}
      className={cn(
        "flex items-center gap-1 text-[10px] font-mono transition-colors",
        enabled
          ? "text-muted-foreground hover:text-foreground"
          : "text-muted-foreground/40 hover:text-muted-foreground"
      )}
      title={enabled ? "Mute sounds" : "Unmute sounds"}
    >
      {enabled ? <Volume2Icon /> : <VolumeXIcon />}
      <span className="hidden xl:inline">{enabled ? "SFX" : "MUTE"}</span>
    </button>
  );
}

const navItems: { href: string; label: string; exact?: boolean }[] = [
  { href: "/app/mainnet", label: "Trade", exact: true },
  { href: "/app/devnet", label: "Devnet", exact: true },
  { href: "/app/devnet/launch", label: "Launch" },
  { href: "/app/devnet/mint", label: "Mint" },
];

interface TopBarProps {
  showReceipts: boolean;
  onToggleReceipts: () => void;
}

export function TopBar({ showReceipts, onToggleReceipts }: TopBarProps) {
  const pathname = usePathname();
  const { mode, setMode } = useCluster();
  const { receipts } = useReceipts();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isDevnet =
    mode === "devnet" || Boolean(pathname?.startsWith("/app/devnet"));

  return (
    <header className="header-gradient sticky top-0 z-50 h-11 border-b border-border bg-card/95 backdrop-blur-xl flex items-center px-3 lg:px-4 shrink-0">
      <div className="flex items-center gap-4 mr-auto">
        <Link href="/" className="flex items-center gap-1.5 shrink-0">
          <Image src="/images/perply-logo.png" alt="Perply" width={90} height={24} className="h-5 sm:h-6 w-auto" />
        </Link>

        <nav className="hidden md:flex items-center gap-0.5">
          {navItems.map(({ href, label, exact }) => {
            const isActive = exact
              ? pathname === href
              : pathname === href || pathname?.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "px-2.5 py-1 rounded text-[12px] font-medium transition",
                  isActive
                    ? "text-foreground bg-muted"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="md:hidden">
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground"
            aria-label="Menu"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          {mobileNavOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMobileNavOpen(false)}
              />
              <div className="absolute left-3 top-full mt-1 py-1.5 w-40 rounded-lg border border-border bg-card shadow-2xl z-50">
                {navItems.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileNavOpen(false)}
                    className="block px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {TOKEN_ADDRESS.length >= 8 && (
          <>
            <div className="hidden sm:flex items-center">
              <TokenAddressLink />
            </div>
            <div className="hidden sm:block w-px h-4 bg-border" />
          </>
        )}
        <button
          onClick={() => setMode(mode === "mainnet" ? "devnet" : "mainnet")}
          className={cn(
            "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest transition",
            isDevnet
              ? "bg-warning/10 text-warning border border-warning/20"
              : "bg-success/10 text-success border border-success/20"
          )}
        >
          {isDevnet ? "DEVNET" : "MAINNET"}
        </button>

        {isDevnet && <AirdropButton />}

        <div className="hidden sm:flex items-center gap-2">
          <div className="w-px h-4 bg-border" />
          <SoundToggle />
        </div>

        <div className="w-px h-4 bg-border" />
        <WalletHeader />

        <button
          onClick={onToggleReceipts}
          className={cn(
            "p-1.5 rounded transition relative",
            showReceipts ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
          title="Receipts"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
            />
          </svg>
          {receipts.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary text-[7px] font-bold text-primary-foreground flex items-center justify-center">
              {receipts.length > 9 ? "9+" : receipts.length}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
