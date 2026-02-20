"use client";

import { useSearchParams } from "next/navigation";
import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { inspectProgram } from "@sov/proof";
import { explorerAccountUrl } from "@sov/proof";
import { DEVNET } from "@sov/config";

const VERIFY_DOC_BASE_URL = "https://github.com/perply1/perply1/blob/main";
const VERIFY_ANCHOR_MATCHER = "matcher-program";
const VERIFY_ANCHOR_PERCOLATOR = "program-inspection";

function getVerifyDocUrl(programId: string): string {
  const anchor = programId === DEVNET.matcherProgramId ? VERIFY_ANCHOR_MATCHER : VERIFY_ANCHOR_PERCOLATOR;
  return `${VERIFY_DOC_BASE_URL}/apps/web/docs/verification-artifacts.md#${anchor}`;
}

function getVerifyCommand(programId: string, cluster: string): string {
  const url = cluster === "devnet" ? " --url devnet" : "";
  return `solana program show ${programId}${url}`;
}

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const { connection } = useConnection();
  const programId = searchParams.get("program") ?? "";
  const cluster = (searchParams.get("cluster") ?? "devnet") as "devnet" | "mainnet-beta";

  const [info, setInfo] = useState<{
    programId: string;
    upgradeable: boolean;
    upgradeAuthority: string | null;
    explorerLink: string;
    verificationStatus: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!programId) {
      setLoading(false);
      setError("Missing program ID");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    inspectProgram(connection, programId, cluster === "mainnet-beta" ? "mainnet-beta" : "devnet")
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load program");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [connection, programId, cluster]);

  const verifyCommand = programId ? getVerifyCommand(programId, cluster) : "";
  const docUrl = programId ? getVerifyDocUrl(programId) : "";
  const explorerLink = programId ? explorerAccountUrl(programId, cluster) : "";

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-4 lg:p-6 space-y-4">
        <section className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[18px] font-bold text-white tracking-tight">How to verify this build</h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">Program ID, explorer, upgrade authority, and copyable verify commands</p>
          </div>
          <Link
            href="/app/devnet"
            className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-[11px] text-zinc-400 transition border border-white/[0.06]"
          >
            ← Back
          </Link>
        </section>

        {!programId ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-[12px] text-amber-400">No program specified. Open from Program Truth: &quot;How to verify this build&quot; for a program.</p>
            <p className="text-[11px] text-zinc-500 mt-2">Or add query params: <span className="font-mono text-zinc-400">?program=&lt;programId&gt;&amp;cluster=devnet</span></p>
          </div>
        ) : loading ? (
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-6 text-center">
            <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-[11px] text-zinc-500">Loading program info…</p>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-[12px] text-red-400">{error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/[0.04]">
                <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Program</h2>
              </div>
              <div className="p-4 space-y-3 text-[11px]">
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-500">Program ID</span>
                  <span className="font-mono text-zinc-300 truncate max-w-[280px]" title={programId}>{programId}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-500">Cluster</span>
                  <span className="font-mono text-zinc-300">{cluster}</span>
                </div>
                <div className="flex justify-between gap-2 items-center">
                  <span className="text-zinc-500">Explorer</span>
                  <a href={explorerLink} target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 font-mono truncate max-w-[240px]">
                    {explorerLink}
                  </a>
                </div>
                {info && (
                  <>
                    <div className="flex justify-between gap-2">
                      <span className="text-zinc-500">Upgradeable</span>
                      <span className={info.upgradeable ? "text-amber-400" : "text-emerald-400"}>{info.upgradeable ? "Yes" : "No (immutable)"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-zinc-500">Upgrade Authority</span>
                      <span className="font-mono text-zinc-300">{info.upgradeAuthority ?? "—"}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/[0.04]">
                <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Repo &amp; docs</h2>
              </div>
              <div className="p-4 space-y-2 text-[11px]">
                <p className="text-zinc-500">Verification artifacts and build instructions:</p>
                <a href={docUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 break-all">
                  {docUrl}
                </a>
                <p className="text-zinc-600 mt-2">Repo: <span className="font-mono text-zinc-400">perply1/perply1</span> (main branch)</p>
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/[0.04] flex items-center justify-between">
                <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Verify command</h2>
                <button
                  type="button"
                  onClick={() => copy(verifyCommand)}
                  className="text-[9px] text-emerald-500 hover:text-emerald-400 px-2 py-1 rounded bg-emerald-500/10"
                >
                  Copy
                </button>
              </div>
              <div className="p-4">
                <pre className="text-[11px] font-mono text-zinc-300 bg-black/20 rounded p-3 overflow-x-auto">
                  {verifyCommand}
                </pre>
                <p className="text-[10px] text-zinc-600 mt-2">Run in terminal. Requires Solana CLI and RPC access to {cluster}.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
