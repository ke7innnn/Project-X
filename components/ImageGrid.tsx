'use client';

import React, { useState } from 'react';
import { NatureImage } from '@/types';
import NatureImageCard from './NatureImageCard';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useShallow } from 'zustand/react/shallow';
import { ExternalLink, Globe, Search, LayoutGrid, Grid, Sparkles } from 'lucide-react';

const ImageGrid = React.memo(function ImageGrid({ initialImages, query }: { initialImages: NatureImage[], query: string }) {
  const [images, setImages] = useState<NatureImage[]>(initialImages);
  const [page, setPage] = useState(2);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'moodboard' | 'standard'>('moodboard');
  const [googleUrl] = useState(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query + ' architecture reference')}`);
  
  const { selectedNatureImage, setSelectedNatureImage, setHoveredNatureImage } = useArchitectStore(useShallow(state => ({
    selectedNatureImage: state.selectedNatureImage,
    setSelectedNatureImage: state.setSelectedNatureImage,
    setHoveredNatureImage: state.setHoveredNatureImage,
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
    <div className="w-full font-sans">
      {/* Moodboard Header Control Bar */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-cyan-500/20">
        <div className="flex items-center gap-1.5">
          <Sparkles size={12} className="text-cyan-400" />
          <span className="text-[10px] font-mono font-bold tracking-[2px] uppercase text-cyan-400">
            CONCEPT MOODBOARD ({images.length})
          </span>
        </div>

        {/* View Toggle Mode */}
        <div className="flex items-center gap-1 bg-black/40 border border-blue-900/40 p-0.5 rounded-lg text-[9px] font-mono">
          <button
            onClick={() => setViewMode('moodboard')}
            className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 uppercase tracking-wider cursor-pointer ${
              viewMode === 'moodboard' ? 'bg-cyan-500 text-black font-bold shadow-[0_0_6px_#00f0ff]' : 'text-cyan-400/60 hover:text-white'
            }`}
            title="Moodboard Grid View (3x3 Compact)"
          >
            <LayoutGrid size={10} />
            Moodboard
          </button>
          <button
            onClick={() => setViewMode('standard')}
            className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 uppercase tracking-wider cursor-pointer ${
              viewMode === 'standard' ? 'bg-cyan-500 text-black font-bold shadow-[0_0_6px_#00f0ff]' : 'text-cyan-400/60 hover:text-white'
            }`}
            title="Expanded Card View (2x2 Large)"
          >
            <Grid size={10} />
            Expanded
          </button>
        </div>
      </div>

      {/* Image Grid Container */}
      <div className={viewMode === 'moodboard' ? 'grid grid-cols-3 gap-2 mb-3' : 'grid grid-cols-2 gap-3 mb-4'}>
        {images.map(img => (
          <NatureImageCard 
            key={img.id} 
            image={img} 
            layoutMode={viewMode}
            isSelected={selectedNatureImage?.id === img.id}
            onSelect={setSelectedNatureImage}
            onHover={setHoveredNatureImage}
          />
        ))}
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={loadMore}
          disabled={loading}
          className="flex-1 py-2 bg-blue-950/40 border border-cyan-500/30 hover:border-cyan-400 text-cyan-400 hover:text-white rounded-lg transition-all disabled:opacity-50 text-[10px] font-mono tracking-wider uppercase font-bold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          {loading ? 'Loading...' : '+ Load More References'}
        </button>
      </div>

      {/* Google Search Fallback */}
      <div className="border border-blue-900/30 rounded-lg p-2.5 bg-black/40 backdrop-blur">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Globe size={11} className="text-cyan-400/70" />
            <span className="text-[9px] font-mono text-cyan-400/70 uppercase tracking-[1.5px]">
              Custom Web Reference
            </span>
          </div>
        </div>
        <button
          onClick={handleGoogleSearch}
          className="w-full py-1.5 px-2.5 flex items-center justify-between gap-2 bg-blue-950/30 hover:bg-blue-900/40 border border-blue-900/40 hover:border-cyan-400/50 rounded text-[9.5px] font-mono text-zinc-300 hover:text-white transition-all uppercase tracking-wider cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <Search size={10} className="text-cyan-400" />
            <span>Search Google Images</span>
          </div>
          <ExternalLink size={10} className="opacity-60" />
        </button>
      </div>
    </div>
  );
});

export default ImageGrid;

