'use client';

import { useState } from 'react';
import { NatureImage } from '@/types';
import NatureImageCard from './NatureImageCard';
import { useArchitectStore } from '@/store/useArchitectStore';

export default function ImageGrid({ initialImages, query }: { initialImages: NatureImage[], query: string }) {
  const [images, setImages] = useState<NatureImage[]>(initialImages);
  const [page, setPage] = useState(2);
  const [loading, setLoading] = useState(false);
  const { selectedNatureImage, setSelectedNatureImage, setHoveredNatureImage } = useArchitectStore();

  const loadMore = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/search-images?query=${encodeURIComponent(query)}&page=${page}&_t=${Date.now()}`);
      const data = await res.json();
      if (data.images) {
        setImages([...images, ...data.images]);
        setPage(page + 1);
      }
    } catch (e) {
      console.error('Failed to load more images', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-3 mb-4">
        {images.map(img => (
          <NatureImageCard 
            key={img.id} 
            image={img} 
            isSelected={selectedNatureImage?.id === img.id}
            onSelect={setSelectedNatureImage}
            onHover={setHoveredNatureImage}
          />
        ))}
      </div>
      <button
        onClick={loadMore}
        disabled={loading}
        className="w-full py-2 border border-[#FFB000] text-[#FFB000] rounded-lg hover:bg-[#FFB000]/10 transition-colors disabled:opacity-50"
      >
        {loading ? 'Loading...' : 'Show More'}
      </button>
    </div>
  );
}
