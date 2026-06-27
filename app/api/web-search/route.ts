import { NextResponse } from 'next/server';

export const maxDuration = 15;

/**
 * Performs a web search using Tavily AI Search API.
 * Tavily is specifically designed for LLM agents — it returns clean, 
 * extracted content (not raw HTML) that can be directly fed to a model.
 * Free tier: 1,000 searches/month. No credit card needed.
 * Sign up at: https://app.tavily.com
 */
export async function POST(request: Request) {
  try {
    const { query } = await request.json();
    if (!query?.trim()) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'TAVILY_API_KEY not configured' }, { status: 500 });
    }

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',        // 'basic' uses 1 credit; 'advanced' uses 2
        include_answer: true,         // Tavily's own AI summary of results
        include_raw_content: false,
        max_results: 5,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown');
      console.error(`[web-search] Tavily error ${res.status}: ${errText}`);
      return NextResponse.json({ error: `Tavily ${res.status}` }, { status: res.status });
    }

    const data = await res.json();

    // Return the clean answer + top result snippets to Batman
    const answer = data.answer || '';
    const results = (data.results || []).slice(0, 4).map((r: any) => ({
      title: r.title,
      url: r.url,
      content: r.content?.substring(0, 400), // Trim to keep token usage low
    }));

    return NextResponse.json({ answer, results });
  } catch (err: any) {
    console.error('[web-search] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
