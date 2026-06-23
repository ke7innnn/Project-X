'use client';

import { useState } from 'react';
import { NatureImage } from '@/types';
import NatureImageCard from './NatureImageCard';
import { useArchitectStore } from '@/store/useArchitectStore';
import { ExternalLink, Globe, Search, Download } from 'lucide-react';

export default function ImageGrid({ initialImages, query }: { initialImages: NatureImage[], query: string }) {
  const [images, setImages] = useState<NatureImage[]>(initialImages);
  const [page, setPage] = useState(2);
  const [loading, setLoading] = useState(false);
  const [googleUrl] = useState(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query + ' architecture reference')}`);
  const { selectedNatureImage, setSelectedNatureImage, setHoveredNatureImage, addMessage } = useArchitectStore();

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

  const handleUseImageUrl = async () => {
    const url = prompt('Paste an image URL from Google Images:');
    if (!url || !url.startsWith('http')) return;

    try {
      // Fetch and convert to base64 via proxy
      const res = await fetch(`/api/search-images?proxy=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.base64) {
          useArchitectStore.getState().setLastUploadedImage(data.base64, `Google Image: ${query}`);
          addMessage({
            role: 'model',
            parts: [{ text: `✅ Google image added as your reference for "${query}". You can now type your request and it will be used.` }]
          });
          return;
        }
      }
      // Fallback: just use URL directly as nature image
      const fakeImage: NatureImage = {
        id: `google-${Date.now()}`,
        url: url,
        thumbUrl: url,
        description: `Google: ${query}`,
        photographer: 'Google Search',
      };
      setSelectedNatureImage(fakeImage);
      addMessage({
        role: 'model',
        parts: [{ text: `✅ Image URL added as reference for "${query}".` }]
      });
    } catch (e) {
      // Fallback with URL directly
      const fakeImage: NatureImage = {
        id: `google-${Date.now()}`,
        url: url,
        thumbUrl: url,
        description: `Google: ${query}`,
        photographer: 'Google Search',
      };
      setSelectedNatureImage(fakeImage);
      addMessage({
        role: 'model',
        parts: [{ text: `✅ Image URL added as reference. You can continue.` }]
      });
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
          <button
            onClick={handleUseImageUrl}
            className="w-full py-2 px-3 flex items-center justify-between gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#FFB000]/40 rounded text-[10px] font-mono text-white/70 hover:text-white transition-all uppercase tracking-wider"
          >
            <div className="flex items-center gap-2">
              <Download size={11} className="text-[#FFB000]" />
              <span>Paste Image URL from Google</span>
            </div>
          </button>
        </div>
        <p className="text-[9px] text-white/30 mt-2 font-mono leading-tight">
          Open Google Images → right-click any image → &quot;Copy image address&quot; → paste above
        </p>
      </div>
    </div>
  );
}
