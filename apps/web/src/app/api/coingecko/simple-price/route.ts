import { NextResponse } from "next/server";

const TOKEN_IDS =
  "solana,bitcoin,ethereum,aptos,bonk,matic-network,arbitrum,dogecoin,binancecoin,sui,pepe,dogwifcoin,jupiter-exchange-solana,render-token,pyth-network,jito-governance-token";

/** Proxy CoinGecko simple/price to avoid CORS and rate limits. Cached 60s. */
export async function GET() {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${TOKEN_IDS}&vs_currencies=usd&include_24hr_change=true`,
      {
        headers: {
          Accept: "application/json",
        },
        next: { revalidate: 60 },
      }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: "CoinGecko API error", status: res.status },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch prices" },
      { status: 500 }
    );
  }
}
