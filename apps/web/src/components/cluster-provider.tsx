"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { WalletProvider } from "./wallet-provider";

export type Cluster = "mainnet-beta" | "devnet";

type ClusterContextValue = {
  mode: "mainnet" | "devnet";
  cluster: Cluster;
  setMode: (m: "mainnet" | "devnet") => void;
};

const ClusterContext = createContext<ClusterContextValue | null>(null);

export function useCluster() {
  const ctx = useContext(ClusterContext);
  if (!ctx) throw new Error("useCluster must be used within ClusterProvider");
  return ctx;
}

export function ClusterProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<"mainnet" | "devnet">("mainnet");
  const cluster: Cluster = mode === "mainnet" ? "mainnet-beta" : "devnet";

  const setMode = useCallback((m: "mainnet" | "devnet") => {
    setModeState(m);
  }, []);

  return (
    <ClusterContext.Provider value={{ mode, cluster, setMode }}>
      <WalletProvider cluster={cluster}>{children}</WalletProvider>
    </ClusterContext.Provider>
  );
}
