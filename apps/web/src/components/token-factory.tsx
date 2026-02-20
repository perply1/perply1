"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import {
  PublicKey,
  Transaction,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
} from "@solana/spl-token";
import { requestDevnetAirdrop, WEB_FAUCETS } from "@/lib/devnet-faucet";
import { useReceipts } from "./receipts-provider";
import { useCluster } from "./cluster-provider";
import { parseTxAndBuildReceipt } from "@sov/proof";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MintResult {
  mintAddress: string;
  ataAddress: string;
  supply: string;
  decimals: number;
  signatures: string[];
}

/* ------------------------------------------------------------------ */
/*  Token Factory Component                                            */
/* ------------------------------------------------------------------ */

export function TokenFactory() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const router = useRouter();
  const { addReceipt } = useReceipts();
  const { cluster } = useCluster();

  // Form state
  const [tokenName, setTokenName] = useState("Test Token");
  const [symbol, setSymbol] = useState("TEST");
  const [decimals, setDecimals] = useState(6);
  const [supply, setSupply] = useState("1000000");
  const [recipient, setRecipient] = useState("");

  // Mint-more state
  const [existingMint, setExistingMint] = useState("");
  const [mintMoreAmount, setMintMoreAmount] = useState("1000000");

  // UI state
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [mintingMore, setMintingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
  const [recentMints, setRecentMints] = useState<MintResult[]>([]);

  // Load recent mints from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("sov:devnet-mints");
      if (stored) setRecentMints(JSON.parse(stored));
    } catch {}
  }, []);

  // Save recent mints to localStorage
  const saveMint = useCallback((mint: MintResult) => {
    setRecentMints((prev) => {
      const next = [mint, ...prev.filter((m) => m.mintAddress !== mint.mintAddress)].slice(0, 20);
      try { localStorage.setItem("sov:devnet-mints", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Set recipient to wallet by default
  useEffect(() => {
    if (wallet.publicKey && !recipient) {
      setRecipient(wallet.publicKey.toBase58());
    }
  }, [wallet.publicKey, recipient]);

  // Poll balance
  useEffect(() => {
    if (!wallet.publicKey) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const bal = await connection.getBalance(wallet.publicKey!);
        if (!cancelled) setSolBalance(bal / LAMPORTS_PER_SOL);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, [wallet.publicKey, connection]);

  // Receipt helper
  const receipt = async (sig: string, action: string) => {
    try {
      const { receipt } = await parseTxAndBuildReceipt({
        connection, signature: sig, cluster, mode: "devnet",
        venue: "spl-token", action, wallet: wallet.publicKey?.toBase58(),
      });
      addReceipt(receipt);
    } catch {}
  };

  /* ------------------------------------------------------------------ */
  /*  Create new mint + mint tokens                                      */
  /* ------------------------------------------------------------------ */

  const handleCreate = async () => {
    if (!wallet.publicKey || !wallet.sendTransaction) return;
    setCreating(true);
    setError(null);
    setMintResult(null);

    try {
      const payer = wallet.publicKey;
      const mintKeypair = Keypair.generate();
      const recipientPk = new PublicKey(recipient || payer.toBase58());

      // 1. Create mint account
      const lamports = await getMinimumBalanceForRentExemptMint(connection);
      const createMintIx = SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: mintKeypair.publicKey,
        lamports,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      });
      const initMintIx = createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        payer, // mint authority
        payer, // freeze authority (optional)
      );

      // 2. Create ATA for recipient
      const ata = getAssociatedTokenAddressSync(mintKeypair.publicKey, recipientPk);
      const createAtaIx = createAssociatedTokenAccountInstruction(
        payer,
        ata,
        recipientPk,
        mintKeypair.publicKey,
      );

      // 3. Mint tokens
      const supplyRaw = BigInt(Math.floor(parseFloat(supply) * 10 ** decimals));
      const mintToIx = createMintToInstruction(
        mintKeypair.publicKey,
        ata,
        payer, // mint authority
        supplyRaw,
      );

      // Send as single transaction
      const tx = new Transaction().add(createMintIx, initMintIx, createAtaIx, mintToIx);
      const sig = await wallet.sendTransaction(tx, connection, { signers: [mintKeypair] });
      await connection.confirmTransaction(sig, "confirmed");

      await receipt(sig, "Create Mint + Mint Tokens");

      const result: MintResult = {
        mintAddress: mintKeypair.publicKey.toBase58(),
        ataAddress: ata.toBase58(),
        supply,
        decimals,
        signatures: [sig],
      };
      setMintResult(result);
      saveMint(result);

      // Refresh balance
      try {
        const bal = await connection.getBalance(payer);
        setSolBalance(bal / LAMPORTS_PER_SOL);
      } catch {}
    } catch (e: any) {
      setError(e?.message || "Failed to create token");
    } finally {
      setCreating(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Mint more of existing token                                        */
  /* ------------------------------------------------------------------ */

  const handleMintMore = async () => {
    if (!wallet.publicKey || !wallet.sendTransaction || !existingMint) return;
    setMintingMore(true);
    setError(null);

    try {
      const payer = wallet.publicKey;
      const mintPk = new PublicKey(existingMint);
      const recipientPk = new PublicKey(recipient || payer.toBase58());

      // Ensure ATA exists
      const ata = getAssociatedTokenAddressSync(mintPk, recipientPk);
      const ataInfo = await connection.getAccountInfo(ata);

      const tx = new Transaction();
      if (!ataInfo) {
        tx.add(createAssociatedTokenAccountInstruction(payer, ata, recipientPk, mintPk));
      }

      // Get mint info to know decimals
      const mintInfo = await connection.getAccountInfo(mintPk);
      if (!mintInfo) throw new Error("Mint account not found on devnet");
      // Decimals is at byte 44 in SPL Mint layout
      const mintDecimals = mintInfo.data[44];

      const amountRaw = BigInt(Math.floor(parseFloat(mintMoreAmount) * 10 ** mintDecimals));
      tx.add(createMintToInstruction(mintPk, ata, payer, amountRaw));

      const sig = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");

      await receipt(sig, "Mint More Tokens");

      setError(null);
      // Update result to show success
      setMintResult({
        mintAddress: existingMint,
        ataAddress: ata.toBase58(),
        supply: mintMoreAmount,
        decimals: mintDecimals,
        signatures: [sig],
      });
    } catch (e: any) {
      setError(e?.message || "Failed to mint tokens");
    } finally {
      setMintingMore(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Explorer URL                                                       */
  /* ------------------------------------------------------------------ */

  const explorerUrl = (addr: string) =>
    `https://explorer.solana.com/address/${addr}?cluster=devnet`;

  /* ------------------------------------------------------------------ */
  /*  Render                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <div className="flex-1 overflow-auto">
      <div className="w-full max-w-none px-4 lg:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[16px] font-bold text-white tracking-tight">Token Factory</h1>
                <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[8px] font-bold uppercase tracking-widest">Devnet</span>
              </div>
              <p className="text-[11px] text-zinc-500">
                Create SPL tokens for testing. Use as collateral in the{" "}
                <Link href="/app/devnet/launch" className="text-emerald-400 hover:underline">Launch Wizard</Link>.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Left: Main form */}
          <div className="lg:col-span-3 space-y-4">
            {/* Wallet status */}
            <Section title="1. Wallet">
              {wallet.publicKey ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <code className="text-[11px] text-zinc-300 font-mono">{wallet.publicKey.toBase58().slice(0, 8)}…{wallet.publicKey.toBase58().slice(-6)}</code>
                  {solBalance !== null && (
                    <span className="text-[10px] text-zinc-500 ml-auto">{solBalance.toFixed(4)} SOL</span>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-amber-400">Connect your wallet to continue.</p>
              )}
            </Section>

            {/* Token config */}
            <Section title="2. New Token">
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Token Name" value={tokenName} onChange={setTokenName} placeholder="e.g. Test USDC" />
                <InputField label="Symbol" value={symbol} onChange={setSymbol} placeholder="e.g. tUSDC" />
                <InputField label="Decimals" value={String(decimals)} onChange={(v) => { const n = parseInt(v); setDecimals(isNaN(n) ? 6 : n); }} type="number" />
                <InputField label="Supply (tokens)" value={supply} onChange={setSupply} type="number" />
              </div>
              <InputField label="Recipient Address" value={recipient} onChange={setRecipient} mono placeholder="Defaults to your wallet" />
              <p className="text-[9px] text-zinc-600 mt-1">
                You will be the mint authority. Tokens will be sent to the recipient address (your wallet by default).
              </p>

              <button
                onClick={handleCreate}
                disabled={creating || !wallet.publicKey}
                className="w-full mt-3 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-[12px] font-bold text-white transition"
              >
                {creating ? "Creating…" : `Create Mint + Mint ${formatAmount(supply, decimals)} Tokens`}
              </button>
            </Section>

            {/* Mint more section */}
            <Section title="3. Mint More (Existing Token)">
              <p className="text-[10px] text-zinc-600 mb-2">
                Already created a token? Mint more supply. You must be the mint authority.
              </p>
              <InputField label="Existing Mint Address" value={existingMint} onChange={setExistingMint} mono placeholder="Paste mint pubkey…" />
              <InputField label="Amount to Mint" value={mintMoreAmount} onChange={setMintMoreAmount} type="number" />
              <button
                onClick={handleMintMore}
                disabled={mintingMore || !wallet.publicKey || !existingMint}
                className="w-full mt-2 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-semibold text-zinc-300 transition"
              >
                {mintingMore ? "Minting…" : `Mint ${formatAmount(mintMoreAmount)} More Tokens`}
              </button>
            </Section>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-lg bg-red-500/[0.06] border border-red-500/15">
                <p className="text-[11px] text-red-400 font-semibold">Error</p>
                <p className="text-[10px] text-red-400/80 mt-0.5 break-all">{error}</p>
              </div>
            )}

            {/* Result */}
            {mintResult && (
              <div className="p-4 rounded-lg bg-emerald-500/[0.04] border border-emerald-500/15">
                <p className="text-[12px] font-bold text-emerald-400 mb-2">Token Created Successfully</p>
                <div className="space-y-1.5">
                  <ResultRow label="Mint Address" value={mintResult.mintAddress} copyable explorerUrl={explorerUrl(mintResult.mintAddress)} />
                  <ResultRow label="Your Token Account" value={mintResult.ataAddress} copyable explorerUrl={explorerUrl(mintResult.ataAddress)} />
                  <ResultRow label="Supply" value={`${formatAmount(mintResult.supply, mintResult.decimals)} tokens (${mintResult.decimals} decimals)`} />
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(mintResult.mintAddress);
                    }}
                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-[10px] font-semibold text-white transition"
                  >
                    Copy Mint Address
                  </button>
                  <Link
                    href="/app/devnet/launch"
                    className="px-3 py-1.5 rounded bg-white/[0.06] hover:bg-white/[0.1] text-[10px] font-semibold text-zinc-300 transition"
                  >
                    Use in Launch Wizard &rarr;
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Right: Info panel */}
          <div className="lg:col-span-2 space-y-3">
            {/* How it works */}
            <div className="p-3 rounded-lg border border-white/[0.04] bg-white/[0.01]">
              <p className="text-[11px] font-bold text-zinc-300 mb-2">How It Works</p>
              <div className="space-y-2 text-[10px] text-zinc-500">
                <Step n={1}>Create an SPL token mint on devnet (you become the mint authority)</Step>
                <Step n={2}>Tokens are minted and sent to your wallet automatically</Step>
                <Step n={3}>Use the mint address as the <b className="text-zinc-400">Collateral Mint</b> in the Launch Wizard</Step>
                <Step n={4}>When trading, you deposit these tokens as collateral</Step>
              </div>
            </div>

            {/* FAQ */}
            <div className="p-3 rounded-lg border border-white/[0.04] bg-white/[0.01]">
              <p className="text-[11px] font-bold text-zinc-300 mb-2">FAQ</p>
              <div className="space-y-2">
                <Faq q="Do I need a custom token?">
                  Not necessarily. You can use <b className="text-zinc-300">Wrapped SOL</b> (default) as collateral — just wrap SOL when depositing. Custom tokens are useful for testing stablecoin-margined markets.
                </Faq>
                <Faq q="Do I need tokens in my wallet?">
                  Yes. To deposit into a Percolator market, you need tokens of the collateral mint in your wallet. This page mints them directly to you.
                </Faq>
                <Faq q="What about Wrapped SOL?">
                  If your market uses Wrapped SOL as collateral (the default), you don't need to mint anything — the Launch Wizard handles wrapping SOL automatically.
                </Faq>
                <Faq q="Can I mint more later?">
                  Yes, use the "Mint More" section below. You must be the mint authority (the wallet that created the token).
                </Faq>
              </div>
            </div>

            {/* Recent mints */}
            {recentMints.length > 0 && (
              <div className="p-3 rounded-lg border border-white/[0.04] bg-white/[0.01]">
                <p className="text-[11px] font-bold text-zinc-300 mb-2">Your Recent Mints</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {recentMints.map((m) => (
                    <button
                      key={m.mintAddress}
                      onClick={() => {
                        setExistingMint(m.mintAddress);
                        navigator.clipboard.writeText(m.mintAddress);
                      }}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/[0.03] transition text-left"
                    >
                      <div>
                        <code className="text-[9px] text-zinc-400 font-mono">{m.mintAddress.slice(0, 8)}…{m.mintAddress.slice(-6)}</code>
                        <span className="text-[8px] text-zinc-600 ml-1.5">{m.decimals}d</span>
                      </div>
                      <span className="text-[8px] text-zinc-600">Click to copy</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick links */}
            <div className="flex flex-col gap-1.5">
              <Link
                href="/app/devnet/launch"
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] transition"
              >
                <span className="text-[10px] text-zinc-400">Launch Perp Market</span>
                <span className="text-[10px] text-zinc-600">&rarr;</span>
              </Link>
              <Link
                href="/app/devnet"
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] transition"
              >
                <span className="text-[10px] text-zinc-400">Markets Directory</span>
                <span className="text-[10px] text-zinc-600">&rarr;</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-lg border border-white/[0.04] bg-white/[0.01]">
      <h2 className="text-[12px] font-bold text-zinc-300 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-[9px] text-zinc-600 uppercase tracking-wider mb-1 font-semibold">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-2.5 py-1.5 rounded bg-white/[0.03] border border-white/[0.06] text-[11px] text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/30 transition ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}

function ResultRow({
  label,
  value,
  copyable = false,
  explorerUrl,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  explorerUrl?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-zinc-600 w-28 shrink-0">{label}</span>
      <code className="text-[10px] text-zinc-300 font-mono truncate flex-1">{value}</code>
      {copyable && (
        <button
          onClick={() => navigator.clipboard.writeText(value)}
          className="text-[8px] text-zinc-500 hover:text-zinc-300 transition shrink-0"
        >
          Copy
        </button>
      )}
      {explorerUrl && (
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="text-[8px] text-zinc-500 hover:text-zinc-300 transition shrink-0">
          Explorer
        </a>
      )}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-4 h-4 rounded-full bg-white/[0.06] flex items-center justify-center text-[8px] font-bold text-zinc-500 shrink-0 mt-0.5">{n}</span>
      <span>{children}</span>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-zinc-400">{q}</p>
      <p className="text-[9px] text-zinc-600 mt-0.5">{children}</p>
    </div>
  );
}

function formatAmount(amount: string, decimals?: number): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
