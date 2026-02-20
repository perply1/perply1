"use client";

const SHORTCUTS = [
  { key: "1", label: "1", description: "Switch to Mainnet Terminal" },
  { key: "2", label: "2", description: "Switch to Devnet Lab" },
  { key: "b", label: "B", description: "Set side to Long (Buy)" },
  { key: "s", label: "S", description: "Set side to Short (Sell)" },
  { key: "r", label: "R", description: "Toggle receipts panel" },
  { key: "?", label: "?", description: "Show keyboard shortcuts" },
  { key: "Escape", label: "Esc", description: "Close modals / clear" },
];

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-sm rounded-md border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold font-mono uppercase tracking-widest text-foreground">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xs font-mono"
          >
            Esc
          </button>
        </div>

        <div className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30"
            >
              <span className="text-[11px] font-mono text-muted-foreground">
                {s.description}
              </span>
              <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-secondary px-1.5 text-[10px] font-mono font-bold text-foreground">
                {s.label}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t">
          <p className="text-[10px] font-mono text-muted-foreground/60 text-center">
            Shortcuts are disabled when typing in input fields
          </p>
        </div>
      </div>
    </div>
  );
}
