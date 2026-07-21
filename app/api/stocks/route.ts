import { NextResponse } from 'next/server';

export const runtime = 'edge';

// ── IST Market Hours Helper ──────────────────────────────────────────────────
// NSE/BSE hours: Mon–Fri 09:15–15:30 IST (UTC+5:30)
// US markets (NYSE/NASDAQ): Mon–Fri 09:30–16:00 ET — we just flag "global open"
// For simplicity we check IST business hours since Umesh is based in India.
function getMarketStatus(): { isOpen: boolean; note: string } {
  const now = new Date();
  // Convert to IST
  const istOffset = 5.5 * 60; // minutes
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istDate = new Date(utcMs + istOffset * 60000);

  const day = istDate.getDay(); // 0=Sun, 6=Sat
  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const timeMin = hours * 60 + minutes; // minutes since midnight IST

  const NSE_OPEN = 9 * 60 + 15;   // 09:15 IST
  const NSE_CLOSE = 15 * 60 + 30; // 15:30 IST

  if (day === 0 || day === 6) {
    return { isOpen: false, note: 'Weekend — markets closed. Showing last available close.' };
  }

  if (timeMin < NSE_OPEN) {
    return { isOpen: false, note: 'Pre-market — NSE opens at 09:15 IST.' };
  }

  if (timeMin > NSE_CLOSE) {
    return { isOpen: false, note: 'After-hours — NSE closed at 15:30 IST.' };
  }

  return { isOpen: true, note: 'NSE/BSE market session active.' };
}

export async function GET() {
  const symbols = [
    'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS',
    'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'NVDA', 'META', 'TSLA', 'NFLX', 'AMD', 'INTC'
  ];
  const prices: Record<string, number> = {};
  const errors: string[] = [];

  const marketStatus = getMarketStatus();
  const fetchedAt = new Date().toISOString();

  // Fetch all symbols in parallel; partial failures are tolerated
  await Promise.allSettled(symbols.map(async (sym) => {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          cache: 'no-store',
          signal: AbortSignal.timeout(8000), // 8 s per symbol
        }
      );
      if (!res.ok) {
        errors.push(`${sym}: HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price !== undefined && price !== null) {
        prices[sym] = price;
      } else {
        errors.push(`${sym}: no price in response`);
      }
    } catch (e: any) {
      errors.push(`${sym}: ${e.message}`);
    }
  }));

  const hasAnyData = Object.keys(prices).length > 0;

  if (!hasAnyData) {
    // Complete failure — tell the client clearly
    return NextResponse.json(
      {
        prices: {},
        fetchedAt,
        marketOpen: marketStatus.isOpen,
        marketNote: marketStatus.note,
        error: 'All market data sources failed. Data unavailable.',
        errors,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    prices,
    fetchedAt,
    marketOpen: marketStatus.isOpen,
    marketNote: marketStatus.note,
    partialErrors: errors.length > 0 ? errors : undefined,
  });
}
