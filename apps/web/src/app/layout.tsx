import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const SITE_URL = "https://www.perply.trade";
const OG_IMAGE = `${SITE_URL}/images/og-image.png`;
const OG_IMAGE_DIMS = { width: 1200, height: 630 };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Perply | Terminal + Launch Layer for Permissionless Perps",
  description:
    "Perply is the proof-first perps terminal and permissionless market launch layer built on the Percolator design. Trade, launch, and verify every action with on-chain receipts.",
  applicationName: "Perply",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Perply | Terminal + Launch Layer for Permissionless Perps",
    description:
      "Perply is the proof-first perps terminal and permissionless market launch layer built on the Percolator design. Trade, launch, and verify every action with on-chain receipts.",
    url: SITE_URL,
    siteName: "Perply",
    images: [
      {
        url: OG_IMAGE,
        ...OG_IMAGE_DIMS,
        alt: "Perply — Permissionless Perps Terminal",
        type: "image/png",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Perply | Terminal + Launch Layer for Permissionless Perps",
    description:
      "Perply is the proof-first perps terminal and permissionless market launch layer built on the Percolator design. Trade, launch, and verify every action with on-chain receipts.",
    site: "@perplytrade",
    creator: "@perplytrade",
    images: [
      { url: OG_IMAGE, ...OG_IMAGE_DIMS, alt: "Perply — Permissionless Perps Terminal" },
    ],
  },
  keywords: [
    "Perply",
    "permissionless perps",
    "perps",
    "perpetual futures",
    "Solana",
    "Percolator",
    "trading terminal",
    "market launch",
    "on-chain receipts",
    "oracle health",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}