export async function fetchUnsplashImages(query: string, page: number = 1) {
  const accessKey = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY;
  if (!accessKey) throw new Error('API key is missing');

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=80&page=${page}&_t=${Date.now()}`;
  console.log(`[Pexels] Fetching URL: ${url}`);
  const response = await fetch(url, {
      headers: {
        Authorization: accessKey,
      },
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch images from Pexels');
  }

  const data = await response.json();
  
  return (data.photos || []).map((img: any) => ({
    id: img.id.toString(),
    url: img.src.large,
    thumbUrl: img.src.medium,
    description: img.alt || 'Nature reference',
    photographer: img.photographer,
  }));
}
