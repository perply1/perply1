import type { Metadata, Viewport } from "next";
import AppLayoutClient from "@/components/app-layout-client";

const SITE_URL = "https://www.perply.trade";
const APP_PATH = "/app";
const APP_URL = `${SITE_URL}${APP_PATH}`;
const OG_IMAGE = `${SITE_URL}/images/og-image.png`;
const OG_IMAGE_DIMS = { width: 1200, height: 630 };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: "Perply | Trading Terminal & Devnet Lab",
  description:
    "Trade perpetual futures on Solana or launch your own market. Professional trading terminal on mainnet, builder sandbox on devnet. Every transaction verified with proof.",

  applicationName: "Perply",

  alternates: {
    canonical: APP_PATH,
  },

  openGraph: {
    title: "Perply | Trading Terminal & Devnet Lab",
    description:
      "Trade perpetual futures on Solana or launch your own market. Professional trading terminal on mainnet, builder sandbox on devnet. Every transaction verified with proof.",
    url: APP_URL,
    siteName: "Perply",
    images: [
      {
        url: OG_IMAGE,
        ...OG_IMAGE_DIMS,
        alt: "Perply App — Trading Terminal & Devnet Lab",
        type: "image/png",
      },
    ],
    locale: "en_US",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "Perply | Trading Terminal & Devnet Lab",
    description:
      "Trade perpetual futures on Solana or launch your own market. Professional trading terminal on mainnet, builder sandbox on devnet. Every transaction verified with proof.",
    site: "@perplytrade",
    creator: "@perplytrade",
    images: [
      { url: OG_IMAGE, ...OG_IMAGE_DIMS, alt: "Perply App — Trading Terminal & Devnet Lab" },
    ],
  },

  keywords: [
    "Perply",
    "perps",
    "perpetual futures",
    "Solana",
    "trading terminal",
    "perp terminal",
    "devnet lab",
    "permissionless markets",
    "Percolator",
    "launch perps markets",
    "on-chain receipts",
    "proof",
    "keeper crank",
    "vAMM",
    "DeFi",
  ],

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#030407",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppLayoutClient>{children}</AppLayoutClient>;
}