'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Trash2, 
  Sparkles, 
  Loader2, 
  UploadCloud, 
  Maximize2, 
  Download, 
  Check, 
  Layers, 
  ExternalLink,
  ArrowRight,
  Palette
} from 'lucide-react';

export interface MoodboardItem {
  id: string;
  url: string;
  title: string;
  source: string;
}

interface ConceptMoodboardProps {
  onApplyToPrompt: (keywords: string) => void;
}

const PRESET_SEARCH_PILLS = [
  'Biophilic Luxury Tower',
  'Curved Balcony Architecture',
  'Modern Glass High-Rise',
  'Infinity Pool & Sky Garden',
  'Parametric Facade Geometry',
  'Brutalist Concrete Villa',
  'Tropical Resort Architecture',
  'Timber Louvers & Terraces',
  'Futuristic Atrium Design'
];

export default function ConceptMoodboard({ onApplyToPrompt }: ConceptMoodboardProps) {
  const [searchQuery, setSearchQuery] = useState('Biophilic Luxury Tower');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pinnedItems, setPinnedItems] = useState<MoodboardItem[]>([
    {
      id: 'default-1',
      url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
      title: 'Modern High-Rise Balconies',
      source: 'Unsplash'
    },
    {
      id: 'default-2',
      url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80',
      title: 'Luxury Villa with Infinity Pool',
      source: 'Unsplash'
    },
    {
      id: 'default-3',
      url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
      title: 'Curved Organic Architectural Facade',
      source: 'Unsplash'
    }
  ]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [appliedNotice, setAppliedNotice] = useState(false);

  useEffect(() => {
    handleSearch(searchQuery);
  }, []);

  const handleSearch = async (queryToUse: string) => {
    if (!queryToUse.trim() || isSearching) return;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search-images?query=${encodeURIComponent(queryToUse)}&page=1`);
      const data = await res.json();
      if (data.images && data.images.length > 0) {
        setSearchResults(data.images);
      }
    } catch (err) {
      console.warn('Moodboard image search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handlePinImage = (img: any) => {
    if (pinnedItems.some(p => p.url === img.url)) return;

    const newItem: MoodboardItem = {
      id: Math.random().toString(),
      url: img.url,
      title: img.description || searchQuery,
      source: img.photographer || 'Architectural Reference'
    };

    setPinnedItems(prev => [newItem, ...prev]);
  };

  const handleUnpinImage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedItems(prev => prev.filter(p => p.id !== id));
  };

  const handleCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        const newItem: MoodboardItem = {
          id: Math.random().toString(),
          url: base64,
          title: file.name.replace(/\.[^/.]+$/, ''),
          source: 'User Upload'
        };
        setPinnedItems(prev => [newItem, ...prev]);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApplyInspiration = () => {
    if (pinnedItems.length === 0) return;

    const keywords = pinnedItems
      .map(p => p.title)
      .filter(t => !t.startsWith('fallback'))
      .slice(0, 3)
      .join(', ');

    const combinedEnrichment = `${searchQuery} style aesthetics, featuring ${keywords || 'curved panoramic glass terraces, double-height atriums, biophilic planters, and luxury resort materials'}.`;

    onApplyToPrompt(combinedEnrichment);
    setAppliedNotice(true);
    setTimeout(() => setAppliedNotice(false), 2500);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden font-sans text-slate-200">
      
      {/* Search Header Bar */}
      <div className="p-4 border-b border-white/10 bg-slate-900/60 backdrop-blur-md flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between gap-4">
          
          {/* Search Input */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(searchQuery);
            }}
            className="relative flex-1 max-w-xl"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search architectural styles (e.g. Biophilic curved tower, Glass facade, Infinity pool)..."
              className="w-full bg-black/60 border border-white/15 rounded-xl pl-9 pr-24 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-black text-[10px] font-mono font-bold uppercase rounded-lg transition-all"
            >
              {isSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Search'}
            </button>
          </form>

          {/* Action Bar */}
          <div className="flex items-center gap-2">
            <label className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-mono rounded-xl cursor-pointer flex items-center gap-1.5 transition-all">
              <UploadCloud className="w-3.5 h-3.5 text-cyan-400" /> Upload Photo
              <input type="file" accept="image/*" onChange={handleCustomUpload} className="hidden" />
            </label>

            <button
              onClick={handleApplyInspiration}
              disabled={pinnedItems.length === 0}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-black font-mono font-bold text-xs uppercase tracking-wider rounded-xl flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
            >
              {appliedNotice ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Applied to Prompt!
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" /> Apply Moodboard to Prompt <ArrowRight className="w-3 h-3" />
                </>
              )}
            </button>
          </div>

        </div>

        {/* Quick Discovery Search Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
          <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest shrink-0 mr-1">Trending:</span>
          {PRESET_SEARCH_PILLS.map((pill) => (
            <button
              key={pill}
              onClick={() => {
                setSearchQuery(pill);
                handleSearch(pill);
              }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono shrink-0 transition-all border ${
                searchQuery === pill 
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-cyan-500/30'
              }`}
            >
              {pill}
            </button>
          ))}
        </div>
      </div>

      {/* Main Moodboard Body: Split between Pinned Board (Left) and Image Search Gallery (Right) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Active Pinned Moodboard */}
        <div className="w-[380px] border-r border-white/10 bg-slate-900/40 p-4 flex flex-col gap-3 overflow-y-auto custom-scrollbar shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Active Moodboard ({pinnedItems.length})
            </span>
            {pinnedItems.length > 0 && (
              <button
                onClick={() => setPinnedItems([])}
                className="text-[9px] font-mono text-red-400 hover:text-red-300 uppercase tracking-wider"
              >
                Clear Board
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {pinnedItems.map((item) => (
              <div
                key={item.id}
                className="group/pin relative rounded-xl overflow-hidden border border-white/10 bg-black/60 shadow-lg aspect-square cursor-pointer"
                onClick={() => setLightboxUrl(item.url)}
              >
                <img 
                  src={item.url} 
                  alt={item.title} 
                  className="w-full h-full object-cover group-hover/pin:scale-105 transition-transform duration-300"
                />
                
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 opacity-0 group-hover/pin:opacity-100 transition-opacity p-2 flex flex-col justify-between">
                  <button
                    onClick={(e) => handleUnpinImage(item.id, e)}
                    className="self-end p-1 rounded-md bg-black/70 hover:bg-red-600 text-white text-[10px] transition-colors"
                    title="Remove from moodboard"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>

                  <span className="text-[9px] font-mono text-white/90 line-clamp-2 leading-tight">
                    {item.title}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {pinnedItems.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/10 rounded-2xl">
              <Palette className="w-8 h-8 text-slate-600 mb-2" />
              <span className="text-xs font-mono text-slate-400 uppercase">Moodboard Empty</span>
              <p className="text-[10px] font-mono text-slate-600 mt-1">
                Click "+" on any search result on the right to pin references to your moodboard.
              </p>
            </div>
          )}
        </div>

        {/* Right: Search Image Results Stream */}
        <div className="flex-1 p-5 overflow-y-auto custom-scrollbar bg-black/40">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
              Search Results for "{searchQuery}"
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {searchResults.length} architectural reference images found
            </span>
          </div>

          {isSearching ? (
            <div className="flex flex-col items-center justify-center py-24 text-cyan-400">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <span className="text-xs font-mono tracking-widest uppercase">Fetching Reference Photography...</span>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {searchResults.map((img) => {
                const isPinned = pinnedItems.some(p => p.url === img.url);
                return (
                  <div
                    key={img.id}
                    className="group/img relative rounded-xl overflow-hidden border border-white/10 bg-slate-900 aspect-[4/3] shadow-md hover:border-cyan-400/60 transition-all"
                  >
                    <img 
                      src={img.thumbUrl || img.url} 
                      alt={img.description} 
                      className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300 cursor-pointer"
                      onClick={() => setLightboxUrl(img.url)}
                    />

                    {/* Overlay Action Bar */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity p-2.5 flex flex-col justify-between pointer-events-none">
                      <div className="self-end pointer-events-auto">
                        <button
                          onClick={() => handlePinImage(img)}
                          disabled={isPinned}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase flex items-center gap-1 transition-all cursor-pointer shadow ${
                            isPinned
                              ? 'bg-emerald-500 text-black'
                              : 'bg-cyan-500 hover:bg-cyan-400 text-black'
                          }`}
                        >
                          {isPinned ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          {isPinned ? 'Pinned' : 'Pin'}
                        </button>
                      </div>

                      <div className="pointer-events-none">
                        <p className="text-[10px] font-mono text-white/90 line-clamp-1">
                          {img.description}
                        </p>
                        <span className="text-[8px] font-mono text-cyan-400/70 block">
                          Photo: {img.photographer || 'Architectural Feed'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-slate-500">
              <Search className="w-8 h-8 mb-2 opacity-50" />
              <span className="text-xs font-mono uppercase">No images found for this query</span>
            </div>
          )}
        </div>

      </div>

      {/* Lightbox Modal */}
      {lightboxUrl && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-6 select-none cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img 
              src={lightboxUrl} 
              alt="Moodboard Reference Enlarge" 
              className="max-w-full max-h-[82vh] object-contain rounded-xl shadow-2xl border border-white/20"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => {
                  handlePinImage({ url: lightboxUrl, description: searchQuery });
                  setLightboxUrl(null);
                }}
                className="px-4 py-1.5 bg-cyan-500 text-black font-mono font-bold text-xs uppercase rounded-lg shadow"
              >
                + Pin to Moodboard
              </button>
              <button
                onClick={() => setLightboxUrl(null)}
                className="px-4 py-1.5 bg-white/10 text-white font-mono text-xs uppercase rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
