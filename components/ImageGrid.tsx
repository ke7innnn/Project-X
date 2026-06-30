'use client';

import React, { useState } from 'react';
import { NatureImage } from '@/types';
import NatureImageCard from './NatureImageCard';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useShallow } from 'zustand/react/shallow';
import { ExternalLink, Globe, Search, Download } from 'lucide-react';

const ImageGrid = React.memo(function ImageGrid({ initialImages, query }: { initialImages: NatureImage[], query: string }) {
  const [images, setImages] = useState<NatureImage[]>(initialImages);
  const [page, setPage] = useState(2);
  const [loading, setLoading] = useState(false);
  const [googleUrl] = useState(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query + ' architecture reference')}`);
  const { selectedNatureImage, setSelectedNatureImage, setHoveredNatureImage, addMessage } = useArchitectStore(useShallow(state => ({
    selectedNatureImage: state.selectedNatureImage,
    setSelectedNatureImage: state.setSelectedNatureImage,
    setHoveredNatureImage: state.setHoveredNatureImage,
    addMessage: state.addMessage
  })));

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

  const handleGoogleSearch = () => {
    window.open(googleUrl, '_blank', 'noopener,noreferrer');
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

      {/* Load More */}
      <button
        onClick={loadMore}
        disabled={loading}
        className="w-full py-2 border border-[#FFB000] text-[#FFB000] rounded-lg hover:bg-[#FFB000]/10 transition-colors disabled:opacity-50 text-xs font-mono tracking-wider uppercase mb-3"
      >
        {loading ? 'Loading...' : 'Show More from Pexels'}
      </button>

      {/* Google Search Fallback */}
      <div className="border border-[#FFB000]/20 rounded-lg p-3 bg-[#FFB000]/5">
        <div className="flex items-center gap-2 mb-2">
          <Globe size={12} className="text-[#FFB000]/70" />
          <span className="text-[10px] font-mono text-[#FFB000]/70 uppercase tracking-[2px]">
            Can&apos;t find what you need?
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleGoogleSearch}
            className="w-full py-2 px-3 flex items-center justify-between gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#FFB000]/40 rounded text-[10px] font-mono text-white/70 hover:text-white transition-all uppercase tracking-wider"
          >
            <div className="flex items-center gap-2">
              <Search size={11} className="text-[#FFB000]" />
              <span>Search on Google Images</span>
            </div>
            <ExternalLink size={10} className="opacity-60" />
          </button>
        </div>
      </div>
    </div>
  );
});

export default ImageGrid;
