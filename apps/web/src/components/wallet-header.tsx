"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";

const LAMPORTS_PER_SOL = 1e9;

function formatSol(lamports: number): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  if (sol >= 1000) return sol.toFixed(0);
  if (sol >= 1) return sol.toFixed(2);
  if (sol >= 0.01) return sol.toFixed(3);
  return sol.toFixed(4);
}

export function WalletHeader() {
  const { publicKey, connected, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (!publicKey) { setBalance(null); return; }
    let cancelled = false;
    const fetch = () => {
      connection.getBalance(publicKey).then((b) => {
        if (!cancelled) setBalance(b);
      }).catch(() => {});
    };
    fetch();
    const id = setInterval(fetch, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [connection, publicKey]);

  if (!connected || !publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-sm"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        Connect
      </button>
    );
  }

  const addr = publicKey.toBase58();
  const short = `${addr.slice(0, 4)}..${addr.slice(-4)}`;

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition"
      >
        {/* Wallet icon */}
        {wallet?.adapter?.icon && (
          <img src={wallet.adapter.icon} alt="" className="w-3.5 h-3.5 rounded-sm" />
        )}
        <span className="text-[11px] font-mono text-zinc-300 tabular-nums">{short}</span>
        {balance !== null && (
          <>
            <div className="w-px h-3 bg-white/[0.06]" />
            <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
              {formatSol(balance)} SOL
            </span>
          </>
        )}
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-white/[0.06] bg-[#111113] shadow-2xl z-50 py-1">
            <button
              onClick={() => {
                navigator.clipboard.writeText(addr);
                setShowMenu(false);
              }}
              className="w-full px-3 py-1.5 text-left text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.04] transition"
            >
              Copy Address
            </button>
            <a
              href={`https://solscan.io/account/${addr}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-1.5 text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.04] transition"
              onClick={() => setShowMenu(false)}
            >
              View on Explorer
            </a>
            <div className="border-t border-white/[0.04] my-1" />
            <button
              onClick={() => {
                disconnect();
                setShowMenu(false);
              }}
              className="w-full px-3 py-1.5 text-left text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/8 transition"
            >
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
