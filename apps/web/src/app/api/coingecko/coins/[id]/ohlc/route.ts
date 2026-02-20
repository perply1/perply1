import { NextRequest, NextResponse } from "next/server";

/** Proxy CoinGecko coins/{id}/ohlc to avoid CORS and rate limits. Cached 5min. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const days = req.nextUrl.searchParams.get("days") ?? "7";
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${days}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 }, // 5 min
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
      { error: "Failed to fetch OHLC data" },
      { status: 500 }
    );
  }
}
