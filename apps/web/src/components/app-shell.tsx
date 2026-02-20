"use client";

import { useState } from "react";
import { Wifi } from "lucide-react";
import { TopBar } from "./top-bar";
import { TickerTape } from "./ticker-tape";
import { ReceiptsDock } from "./receipts-dock";
import { useReceipts } from "./receipts-provider";
import { ShortcutsModal } from "./shortcuts-modal";
import { useRpcHealth } from "@/hooks/use-rpc-health";
import { PanelRightCloseIcon, PanelRightOpenIcon, GithubIcon, TerminalIcon, KeyboardIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [showReceipts, setShowReceipts] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const { receipts } = useReceipts();
  const { state, label, networkLabel, title } = useRpcHealth();

  return (
    <div className="flex h-screen flex-col bg-background">
      <TopBar
        showReceipts={showReceipts}
        onToggleReceipts={() => setShowReceipts((p) => !p)}
      />
      <TickerTape />

      <div className="flex flex-1 min-h-0">
        <div className="flex flex-1 flex-col min-h-0 min-w-0">{children}</div>

        <button
          onClick={() => setShowReceipts((p) => !p)}
          className="hidden lg:flex items-center justify-center w-8 h-full min-h-[44px] border-l border-border/40 bg-card/50 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          title={showReceipts ? "Close receipts" : "Open receipts"}
        >
          {showReceipts ? (
            <PanelRightCloseIcon />
          ) : (
            <PanelRightOpenIcon />
          )}
        </button>

        {showReceipts && (
          <div className="hidden lg:flex shrink-0">
            <ReceiptsDock receipts={receipts} />
          </div>
        )}
      </div>

      <ShortcutsModal open={showHelp} onClose={() => setShowHelp(false)} />

      <footer className="hidden lg:flex items-center justify-between border-t border-border/40 bg-card/50 px-4 py-1">
        <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground/70">
          <span className="flex items-center gap-1.5">
            <TerminalIcon />
            <span className="text-foreground/40 font-semibold">Perply</span>
            <span>v0.1</span>
          </span>
          <span className="h-2.5 w-px bg-border/40" />
          <span>Proof-of-Execution</span>
          <span className="h-2.5 w-px bg-border/40" />
          <span
            title={title}
            className={cn(
              "flex items-center gap-1.5",
              state === "healthy"
                ? "text-success"
                : state === "degraded"
                  ? "text-warning"
                  : state === "down"
                    ? "text-destructive"
                    : "text-muted-foreground/70"
            )}
          >
            <Wifi size={14} strokeWidth={2} className="shrink-0" />
            {networkLabel} RPC: {label}
          </span>
          <span className="h-2.5 w-px bg-border/40" />
          <button
            onClick={() => setShowHelp(true)}
            className="flex items-center gap-1 hover:text-primary transition-colors"
          >
            <KeyboardIcon />
            Shortcuts
          </button>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground/70">
          <a
            href="https://github.com/perply1"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-primary transition-colors"
          >
            <GithubIcon />
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
