"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCluster } from "./cluster-provider";
import type { Receipt } from "@sov/proof";

type ReceiptsContextValue = {
  receipts: Receipt[];
  addReceipt: (r: Receipt) => void;
  clearReceipts: () => void;
  exportReceipts: () => string;
};

const ReceiptsContext = createContext<ReceiptsContextValue | null>(null);

const STORAGE_KEY = "sov_receipts";

function storageKey(wallet: string | undefined, cluster: string) {
  return `${STORAGE_KEY}_${wallet || "anon"}_${cluster}`;
}

function loadFromStorage(wallet: string | undefined, cluster: string): Receipt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(wallet, cluster));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(
  wallet: string | undefined,
  cluster: string,
  receipts: Receipt[]
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(wallet, cluster), JSON.stringify(receipts));
  } catch {}
}

export function useReceipts() {
  const ctx = useContext(ReceiptsContext);
  if (!ctx) throw new Error("useReceipts must be used within ReceiptsProvider");
  return ctx;
}

export function ReceiptsProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const { cluster } = useCluster();
  const walletAddr = wallet.publicKey?.toBase58();

  const [receipts, setReceipts] = useState<Receipt[]>([]);

  // Load receipts from localStorage on mount and when wallet/cluster changes
  const prevKey = useRef<string>("");
  useEffect(() => {
    const key = storageKey(walletAddr, cluster);
    if (key !== prevKey.current) {
      prevKey.current = key;
      setReceipts(loadFromStorage(walletAddr, cluster));
    }
  }, [walletAddr, cluster]);

  const addReceipt = useCallback((r: Receipt) => {
    setReceipts((prev) => {
      const next = [r, ...prev];
      saveToStorage(r.wallet, r.cluster, next);
      return next;
    });
  }, []);

  const clearReceipts = useCallback(() => {
    setReceipts([]);
    // Also clear from localStorage
    if (typeof window !== "undefined") {
      try { localStorage.removeItem(storageKey(walletAddr, cluster)); } catch {}
    }
  }, [walletAddr, cluster]);

  const exportReceipts = useCallback(() => {
    return JSON.stringify(receipts, null, 2);
  }, [receipts]);

  return (
    <ReceiptsContext.Provider
      value={{ receipts, addReceipt, clearReceipts, exportReceipts }}
    >
      {children}
    </ReceiptsContext.Provider>
  );
}
