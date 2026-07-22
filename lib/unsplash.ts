export async function fetchUnsplashImages(query: string, page: number = 1) {
  const accessKey = 
    process.env.PEXELS_API_KEY || 
    process.env.NEXT_PUBLIC_PEXELS_API_KEY || 
    'BnoeapJpelCj7CGsYpFYRLhbI1fRsOoLGqGvU8HNYVpyFkI4OpCOCyn6';

  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=80&page=${page}&_t=${Date.now()}`;
    console.log(`[Pexels] Fetching URL: ${url}`);
    const response = await fetch(url, {
        headers: {
          Authorization: accessKey,
        },
        cache: 'no-store'
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.photos && data.photos.length > 0) {
        return data.photos.map((img: any) => ({
          id: img.id.toString(),
          url: img.src.large,
          thumbUrl: img.src.medium,
          description: img.alt || `${query} reference`,
          photographer: img.photographer,
        }));
      }
    }
  } catch (err) {
    console.warn('[Pexels] Fetch error, using fallback collection:', err);
  }

  // Guaranteed fallback images collection if Pexels API fails or returns empty
  const fallbackUrls = [
    'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1426604966848-d7adac402bff?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1511497584788-876761c1298b?auto=format&fit=crop&w=800&q=80'
  ];

  return fallbackUrls.map((url, idx) => ({
    id: `fallback-${query}-${idx}`,
    url,
    thumbUrl: url,
    description: `${query.toUpperCase()} reference pattern #${idx + 1}`,
    photographer: 'Unsplash Architectural Reference'
  }));
}
