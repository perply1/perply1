"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

function getRpcUrl(cluster: "mainnet-beta" | "devnet"): string {
  if (typeof window === "undefined") return "https://api.mainnet.solana.com";
  const env =
    cluster === "devnet"
      ? process.env.NEXT_PUBLIC_DEVNET_RPC_URL
      : process.env.NEXT_PUBLIC_MAINNET_RPC_URL;
  return env || (cluster === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet.solana.com");
}

export function WalletProvider({
  children,
  cluster,
}: {
  children: React.ReactNode;
  cluster: "mainnet-beta" | "devnet";
}) {
  const endpoint = useMemo(() => getRpcUrl(cluster), [cluster]);

  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint} key={cluster}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
