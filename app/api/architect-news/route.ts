import { NextResponse } from 'next/server';

export const runtime = 'edge';

function cleanCdata(str: string): string {
  const trimmed = str.trim();
  if (trimmed.startsWith('<![CDATA[') && trimmed.endsWith(']]>')) {
    return trimmed.slice(9, -3).trim();
  }
  return trimmed;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export async function GET() {
  // ONLY Architectural Digest — Master Umesh's preferred source
  const feeds = [
    { url: 'https://www.architecturaldigest.com/feed/rss', source: 'Architectural Digest' },
    // Fallback: ArchDaily tagged with AD-style content if AD RSS is down
    { url: 'https://www.archdaily.com/feed', source: 'ArchDaily' },
  ];

  const allItems: Array<{
    title: string;
    link: string;
    description: string;
    pubDate: string;
    source: string;
    timestamp: number;
  }> = [];

  const adItems: typeof allItems = [];
  const archDailyItems: typeof allItems = [];

  try {
    await Promise.all(feeds.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          },
          next: { revalidate: 300 } // cache for 5 minutes
        });

        if (res.ok) {
          const xmlText = await res.text();
          const itemMatches = xmlText.matchAll(/<item>([\s\S]*?)<\/item>/gi);
          const bucket = feed.source === 'Architectural Digest' ? adItems : archDailyItems;

          for (const match of itemMatches) {
            const content = match[1];
            const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/i);
            const linkMatch = content.match(/<link>([\s\S]*?)<\/link>/i);
            const descMatch = content.match(/<description>([\s\S]*?)<\/description>/i);
            const pubDateMatch = content.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

            if (titleMatch) {
              const rawTitle = cleanCdata(titleMatch[1]);
              const link = linkMatch ? cleanCdata(linkMatch[1]) : '';
              const rawDesc = descMatch ? cleanCdata(descMatch[1]) : '';
              const pubDate = pubDateMatch ? cleanCdata(pubDateMatch[1]) : '';

              let timestamp = Date.now();
              if (pubDate) {
                const parsedDate = Date.parse(pubDate);
                if (!isNaN(parsedDate)) timestamp = parsedDate;
              }

              bucket.push({
                title: rawTitle,
                link,
                description: stripHtml(rawDesc).slice(0, 220) + (rawDesc.length > 220 ? '...' : ''),
                pubDate,
                source: feed.source,
                timestamp,
              });
            }
          }
        }
      } catch (e) {
        console.error(`Failed to fetch/parse news from ${feed.source}:`, e);
      }
    }));

    // Prefer Architectural Digest; fall back to ArchDaily only if AD returned nothing
    const primary = adItems.sort((a, b) => b.timestamp - a.timestamp);
    const fallback = archDailyItems.sort((a, b) => b.timestamp - a.timestamp);

    // Return top 5 AD items; if AD had nothing, return top 5 ArchDaily
    const topItems = primary.length > 0
      ? primary.slice(0, 5)
      : fallback.slice(0, 5);

    return NextResponse.json(topItems);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch news' }, { status: 500 });
  }
}
