import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET() {
  // Top 3 Indian stocks: Reliance Industries, Tata Consultancy Services, HDFC Bank
  const symbols = ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS'];
  const results: Record<string, number> = {};

  try {
    await Promise.all(symbols.map(async (sym) => {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        cache: 'no-store', // always real-time
      });
      if (res.ok) {
        const data = await res.json();
        const price = data.chart.result?.[0]?.meta?.regularMarketPrice;
        if (price !== undefined) {
          results[sym] = price;
        }
      }
    }));

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch market data" }, { status: 500 });
  }
}
