"use client";

import { useParams } from "next/navigation";
import { DevnetMarketProofPage } from "@/components/devnet-market-proof-page";

export default function MarketProofPage() {
  const params = useParams();
  const marketId = params.marketId as string;

  return <DevnetMarketProofPage marketId={marketId} />;
}
