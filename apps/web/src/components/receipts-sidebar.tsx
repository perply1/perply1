"use client";

import { useState } from "react";

export function ReceiptsSidebar() {
  const [search, setSearch] = useState("");
  const receipts: { action?: string; txSignature?: string }[] = [];

  const filtered = search
    ? receipts.filter(
        (r) =>
          r.action?.toLowerCase().includes(search.toLowerCase()) ||
          r.txSignature?.toLowerCase().includes(search.toLowerCase())
      )
    : receipts;

  return (
    <div className="flex h-full w-full flex-col border-l bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-foreground">
          Receipts
          {receipts.length > 0 && (
            <span className="ml-1.5 text-muted-foreground font-normal">
              {receipts.length}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            Export
          </button>
          <button className="text-muted-foreground hover:text-destructive transition-colors">
            Clear
          </button>
        </div>
      </div>

      {receipts.length > 0 && (
        <div className="border-b px-3 py-1.5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter..."
            className="w-full rounded bg-secondary px-2 py-1 text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none font-mono"
          />
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 pt-20 text-center">
            <span className="text-[10px] text-muted-foreground/50 font-mono">
              {receipts.length === 0
                ? "On-chain actions will appear here."
                : "No matching receipts."}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
