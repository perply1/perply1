"use client";

import { useCluster } from "@/components/cluster-provider";
import { useEffect } from "react";
import { TokenFactory } from "@/components/token-factory";

export default function TokenFactoryPage() {
  const { setMode } = useCluster();

  useEffect(() => {
    setMode("devnet");
  }, [setMode]);

  return <TokenFactory />;
}
