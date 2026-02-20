"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useCluster } from "@/components/cluster-provider";

export type RpcHealthState = "healthy" | "degraded" | "down" | "checking" | null;

export function useRpcHealth() {
  const { connection } = useConnection();
  const { cluster } = useCluster();
  const [state, setState] = useState<RpcHealthState>("checking");
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!cancelled) setState((s) => (s === null ? "checking" : s));
      try {
        const start = Date.now();
        await connection.getSlot();
        const ms = Date.now() - start;
        if (!cancelled) {
          setLatency(ms);
          setState(ms > 3000 ? "degraded" : ms > 1500 ? "degraded" : "healthy");
        }
      } catch {
        if (!cancelled) {
          setLatency(null);
          setState("down");
        }
      }
    };
    check();
    const id = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connection]);

  const labels = {
    healthy: "Healthy",
    degraded: "Degraded",
    down: "Down",
    checking: "Checking…",
  };
  const networkLabel = cluster === "mainnet-beta" ? "Mainnet" : "Devnet";
  const label = labels[state ?? "checking"];
  const title =
    state === "checking" || state === null
      ? `${networkLabel} RPC: ${labels.checking}`
      : `${networkLabel} RPC: ${labels[state!]}${latency != null ? ` (${latency}ms)` : ""}`;

  return { state, latency, label, networkLabel, title };
}
