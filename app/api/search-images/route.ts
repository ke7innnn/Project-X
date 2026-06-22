import { NextResponse } from 'next/server';
import { fetchUnsplashImages } from '@/lib/unsplash';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || 'nature';
    const page = parseInt(searchParams.get('page') || '1');

    console.log(`[API search-images] Received query: "${query}", page: ${page}`);
    
    const images = await fetchUnsplashImages(query, page);
    
    return NextResponse.json({ images });
  } catch (error: any) {
    console.error('Unsplash search error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
