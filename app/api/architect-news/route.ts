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
  const feeds = [
    { url: 'https://www.archdaily.com/feed', source: 'ArchDaily' },
    { url: 'https://www.architecturaldigest.com/feed/rss', source: 'Architectural Digest' }
  ];

  const allItems: Array<{
    title: string;
    link: string;
    description: string;
    pubDate: string;
    source: string;
    timestamp: number;
  }> = [];

  try {
    await Promise.all(feeds.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          next: { revalidate: 300 } // cache for 5 minutes
        });

        if (res.ok) {
          const xmlText = await res.text();
          const itemMatches = xmlText.matchAll(/<item>([\s\S]*?)<\/item>/gi);

          for (const match of itemMatches) {
            const content = match[1];
            const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/i);
            const linkMatch = content.match(/<link>([\s\S]*?)<\/link>/i);
            const descMatch = content.match(/<description>([\s\S]*?)<\/description>/i);
            const pubDateMatch = content.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

            if (titleMatch) {
              const rawTitle = cleanCdata(titleMatch[1]);
              const link = linkMatch ? cleanCdata(linkMatch[1]) : "";
              const rawDesc = descMatch ? cleanCdata(descMatch[1]) : "";
              const pubDate = pubDateMatch ? cleanCdata(pubDateMatch[1]) : "";

              // Try parsing pubDate to get a timestamp for sorting
              let timestamp = Date.now();
              if (pubDate) {
                const parsedDate = Date.parse(pubDate);
                if (!isNaN(parsedDate)) {
                  timestamp = parsedDate;
                }
              }

              allItems.push({
                title: rawTitle,
                link,
                description: stripHtml(rawDesc).slice(0, 180) + (rawDesc.length > 180 ? "..." : ""),
                pubDate,
                source: feed.source,
                timestamp
              });
            }
          }
        }
      } catch (e) {
        console.error(`Failed to fetch or parse news from ${feed.source}:`, e);
      }
    }));

    // Sort combined articles by timestamp descending (newest first)
    allItems.sort((a, b) => b.timestamp - a.timestamp);

    // Limit to top 8 items
    const topItems = allItems.slice(0, 8);

    return NextResponse.json(topItems);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch architectural news" }, { status: 500 });
  }
}
