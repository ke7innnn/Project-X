import { NextResponse } from 'next/server';
import { fetchUnsplashImages } from '@/lib/unsplash';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Image proxy mode: fetch a remote image and return as base64
    const proxyUrl = searchParams.get('proxy');
    if (proxyUrl) {
      try {
        const imgRes = await fetch(proxyUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ArchitectApp/1.0)',
          },
        });
        if (!imgRes.ok) throw new Error('Failed to fetch image');
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        const arrayBuffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        return NextResponse.json({ base64, contentType });
      } catch (proxyErr: any) {
        return NextResponse.json({ error: proxyErr.message }, { status: 400 });
      }
    }

    // Normal Pexels search mode
    const query = searchParams.get('query') || 'nature';
    const page = parseInt(searchParams.get('page') || '1');

    console.log(`[API search-images] Received query: "${query}", page: ${page}`);
    
    const images = await fetchUnsplashImages(query, page);
    
    return NextResponse.json({ images });
  } catch (error: any) {
    console.error('Image search error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
