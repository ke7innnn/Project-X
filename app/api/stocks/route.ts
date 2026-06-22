import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET() {
  const symbols = ['AAPL', 'TSLA', '^GSPC', 'BTC-USD'];
  const results: Record<string, number> = {};

  try {
    await Promise.all(symbols.map(async (sym) => {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        next: { revalidate: 60 } // cache for 60 seconds
      });
      if (res.ok) {
        const data = await res.json();
        results[sym] = data.chart.result[0].meta.regularMarketPrice;
      }
    }));

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch market data" }, { status: 500 });
  }
}
