'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useActiveProjectGuard } from '@/lib/useActiveProjectGuard';
import { FLAGS } from '@/lib/featureFlags';
import { 
  ArrowLeft, Download, Presentation, Loader2, Plus, Trash2, ArrowUp, ArrowDown, Layout, Palette, Image as ImageIcon, FileText, AlertTriangle, Sparkles, UploadCloud, Play, Link as LinkIcon
} from 'lucide-react';
import AnimatedPlayer from '@/components/AnimatedPlayer';

interface Slide {
  id: string;
  layout: 'cover' | 'image-full' | 'image+text' | 'grid' | 'table' | 'contact';
  title: string;
  subtitle: string;
  body: string;
  imageUrls: string[]; // Can contain vault images, uploads, or empty
}

export default function PresentationPage() {
  const router = useRouter();

  // Guard active project spine
  const { activeProject } = useActiveProjectGuard();
  const { addProjectAsset, projectName } = useArchitectStore();

  // Mode: 'auto' is always available. Others are gated by feature flags.
  const [mode, setMode] = useState<'auto' | 'custom' | 'ai-smart'>('auto');
  const [theme, setTheme] = useState<'cream' | 'dark'>('cream');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);

  // Animated deck states (only active when FLAGS.ANIMATED_DECK is true)
  const [presentationStyle, setPresentationStyle] = useState<'minimal' | 'animated'>('minimal');
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [showAnimatedPlayer, setShowAnimatedPlayer] = useState(false);
  const [storyboardData, setStoryboardData] = useState<any>(null);

  // AI Smart Deck states (only active when FLAGS.AI_SMART_DECK is true)
  const [smartTopic, setSmartTopic] = useState('');
  const [smartImages, setSmartImages] = useState<string[]>([]);
  const [smartSlides, setSmartSlides] = useState<Slide[]>([]);
  const [smartActiveSlideIndex, setSmartActiveSlideIndex] = useState(0);
  const [isGeneratingSmartDeck, setIsGeneratingSmartDeck] = useState(false);

  // Mock architectural sample asset kit for immediate trial preview
  const DEMO_SAMPLE_ASSETS = {
    topic: 'Modern Minimalist Pavilion Villa — Goa',
    floorPlan: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80',
    hero: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=80',
    angles: [
      { label: '3/4 PERSPECTIVE VIEW', url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=80' },
      { label: 'POOL & COURTYARD', url: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=80' },
      { label: 'DAYLIGHT PAVILION', url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=80' }
    ]
  };

  const handleLoadDemoAssets = () => {
    addProjectAsset('floorPlans', { url: DEMO_SAMPLE_ASSETS.floorPlan, source: 'generated', isPrimary: true });
    addProjectAsset('hero', DEMO_SAMPLE_ASSETS.hero);
    DEMO_SAMPLE_ASSETS.angles.forEach(ang => {
      addProjectAsset('angles', ang);
    });

    setSmartTopic(DEMO_SAMPLE_ASSETS.topic);
    setSmartImages([
      DEMO_SAMPLE_ASSETS.floorPlan,
      DEMO_SAMPLE_ASSETS.hero,
      ...DEMO_SAMPLE_ASSETS.angles.map(a => a.url)
    ]);
  };


  const handleGetAISuggestion = async () => {
    const activeSlide = customSlides[activeSlideIndex];
    if (!activeSlide) return;
    setIsSuggesting(true);
    try {
      const response = await fetch('/api/generate-slide-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layout: activeSlide.layout,
          title: activeSlide.title,
          subtitle: activeSlide.subtitle,
          projectName: activeProject?.name || 'Untitled Project',
          activeProjectConfig: activeProject?.config || {}
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.suggestion) {
          updateActiveSlide({ body: data.suggestion });
        }
      }
    } catch (err) {
      console.error('AISuggestion error', err);
    } finally {
      setIsSuggesting(false);
    }
  };

  // Custom slides state
  const [customSlides, setCustomSlides] = useState<Slide[]>([
    {
      id: 'slide-cover',
      layout: 'cover',
      title: activeProject?.name || 'ARCHITECTURAL PROPOSAL',
      subtitle: 'PROJECT SPECIFICATIONS & DESIGNS',
      body: 'Pinnacle Studios',
      imageUrls: []
    }
  ]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  // Get project assets
  const primaryFp = activeProject?.assets.floorPlans.find(fp => fp.isPrimary) || activeProject?.assets.floorPlans[0];
  const heroRender = activeProject?.assets.hero || null;
  const angles = activeProject?.assets.angles || [];
  const uploads = activeProject?.assets.uploads || [];

  // Check if AUTO mode can export
  // Auto mode requires a plan + a render
  const canExportAuto = !!primaryFp && !!heroRender;

  // Sync title slide default name on project load
  useEffect(() => {
    if (activeProject) {
      setCustomSlides(prev => prev.map(s => s.id === 'slide-cover' ? {
        ...s,
        title: s.title === 'ARCHITECTURAL PROPOSAL' ? activeProject.name : s.title
      } : s));
    }
  }, [activeProject?.id]);

  // Clean up any slide image urls if they are deleted from the project spine
  useEffect(() => {
    if (activeProject) {
      const validUrls = new Set([
        ...(primaryFp ? [primaryFp.url] : []),
        ...(heroRender ? [heroRender] : []),
        ...angles.map(a => a.url),
        ...uploads.map(u => u.url)
      ]);
      
      setCustomSlides(prev => prev.map(slide => ({
        ...slide,
        imageUrls: slide.imageUrls.filter(url => validUrls.has(url))
      })));
    }
  }, [activeProject?.updatedAt]);

  const handleExport = async (format: 'pptx' | 'pdf') => {
    setIsExporting(true);
    setExportError(null);
    try {
      let exportBody: any = {};
      if (mode === 'auto') {
        exportBody = {
          format,
          mode: 'auto',
          theme,
          projectData: {
            projectName: activeProject?.name || 'Untitled Project',
            collectedParameters: useArchitectStore.getState().collectedParameters
          },
          assets: {
            floorPlan: primaryFp?.url || null,
            hero: heroRender,
            angles: angles.map(a => a.url),
            uploads: uploads.map(u => u.url)
          }
        };
      } else if (mode === 'ai-smart') {
        exportBody = {
          format,
          mode: 'custom',
          theme,
          projectData: {
            projectName: activeProject?.name || 'Untitled Project'
          },
          slides: smartSlides
        };
      } else {
        // Custom deck mode
        exportBody = {
          format,
          mode: 'custom',
          theme,
          projectData: {
            projectName: activeProject?.name || 'Untitled Project'
          },
          slides: customSlides
        };
      }

      const response = await fetch('/api/export-presentation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportBody),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Export failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeProject?.name || 'Project'}_Presentation.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Add Custom Slide
  const addSlide = () => {
    const newSlide: Slide = {
      id: crypto.randomUUID(),
      layout: 'image+text',
      title: 'NEW SLIDE',
      subtitle: 'SUBTITLE',
      body: 'Add details here...',
      imageUrls: []
    };
    setCustomSlides([...customSlides, newSlide]);
    setActiveSlideIndex(customSlides.length);
  };

  // Remove Slide
  const removeSlide = (index: number) => {
    if (customSlides.length <= 1) return;
    const newSlides = customSlides.filter((_, i) => i !== index);
    setCustomSlides(newSlides);
    setActiveSlideIndex(Math.max(0, index - 1));
  };

  // Reorder slides
  const moveSlide = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === customSlides.length - 1) return;
    const newSlides = [...customSlides];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const temp = newSlides[index];
    newSlides[index] = newSlides[targetIdx];
    newSlides[targetIdx] = temp;
    setCustomSlides(newSlides);
    setActiveSlideIndex(targetIdx);
  };

  // Update active slide fields
  const updateActiveSlide = (fields: Partial<Slide>) => {
    const newSlides = [...customSlides];
    newSlides[activeSlideIndex] = {
      ...newSlides[activeSlideIndex],
      ...fields
    };
    setCustomSlides(newSlides);
  };

  // AI Smart Slide mutations
  const updateActiveSmartSlide = (updates: Partial<Slide>) => {
    setSmartSlides(prev => prev.map((s, idx) => idx === smartActiveSlideIndex ? { ...s, ...updates } : s));
  };

  const addSmartSlide = () => {
    const newSlide: Slide = {
      id: `smart-slide-${Date.now()}`,
      layout: 'image+text',
      title: 'NEW SLIDE',
      subtitle: 'SUBTITLE',
      body: 'Add details here...',
      imageUrls: []
    };
    setSmartSlides(prev => [...prev, newSlide]);
    setSmartActiveSlideIndex(smartSlides.length);
  };

  const removeSmartSlide = (index: number) => {
    if (smartSlides.length <= 1) return;
    setSmartSlides(prev => prev.filter((_, idx) => idx !== index));
    setSmartActiveSlideIndex(prev => Math.max(0, Math.min(prev, smartSlides.length - 2)));
  };

  const moveSmartSlide = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === smartSlides.length - 1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    setSmartSlides(prev => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
    setSmartActiveSlideIndex(targetIndex);
  };

  // Upload external images for Smart Deck
  const handleSmartImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const readPromises = files.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises).then(base64s => {
      setSmartImages(prev => {
        const merged = [...prev, ...base64s];
        return merged.slice(0, 12);
      });
    });
    e.target.value = '';
  };

  // Generate Deck using OpenRouter AI call
  const handleGenerateSmartDeck = async () => {
    if (smartImages.length < 3) return;
    if (!smartTopic.trim()) return;
    setIsGeneratingSmartDeck(true);
    setExportError(null);
    try {
      const response = await fetch('/api/generate-smart-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: smartImages,
          topic: smartTopic
        }),
      });

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      const generatedSlides = (data.slides || []).map((slide: any, idx: number) => {
        const urls = (slide.imageUrls || []).map((imgUrl: string) => {
          if (imgUrl.startsWith('image_')) {
            const indexStr = imgUrl.split('_')[1];
            const index = parseInt(indexStr, 10);
            if (!isNaN(index) && smartImages[index]) {
              return smartImages[index];
            }
          }
          return imgUrl;
        });

        return {
          id: `smart-slide-${idx}-${Date.now()}`,
          layout: slide.layout || 'image+text',
          title: slide.title || 'ARCHITECTURAL CONCEPT',
          subtitle: slide.subtitle || '',
          body: slide.body || '',
          imageUrls: urls
        };
      });

      if (data.theme) {
        setTheme(data.theme === 'dark' ? 'dark' : 'cream');
      }

      setSmartSlides(generatedSlides);
      setSmartActiveSlideIndex(0);
    } catch (err: any) {
      console.error('Smart Deck generation error:', err);
      setExportError(err.message || 'AI generation failed. Please try again.');
    } finally {
      setIsGeneratingSmartDeck(false);
    }
  };

  const handlePlayAnimatedDeck = async () => {
    setIsGeneratingStoryboard(true);
    setExportError(null);

    let playlist: any[] = [];
    let currentTopic = projectName || 'Architectural Concept';

    if (mode === 'auto') {
      playlist = [
        ...(primaryFp ? [{ imageId: primaryFp.id, type: 'floorPlan', url: primaryFp.url }] : []),
        ...(heroRender ? [{ imageId: 'hero', type: 'hero', url: heroRender }] : []),
        ...angles.map(a => ({ imageId: a.id, type: 'angle', url: a.url })),
        ...uploads.map(u => ({ imageId: u.id, type: 'upload', url: u.url }))
      ];
    } else if (mode === 'custom') {
      // Find all unique images from slides
      const urls = new Set<string>();
      customSlides.forEach(s => s.imageUrls.forEach(url => urls.add(url)));
      playlist = Array.from(urls).map((url, idx) => {
        let type = 'angle';
        if (primaryFp && url === primaryFp.url) type = 'floorPlan';
        else if (heroRender && url === heroRender) type = 'hero';
        return { imageId: `img_${idx}`, type, url };
      });
    } else {
      // ai-smart
      currentTopic = smartTopic || 'AI Smart Deck';
      playlist = smartImages.map((url, idx) => {
        let type = 'angle';
        if (idx === 0) type = 'hero';
        return { imageId: `smart_${idx}`, type, url };
      });
    }

    if (playlist.length === 0) {
      setExportError('Add at least one image to play the Animated Cinematic presentation.');
      setIsGeneratingStoryboard(false);
      return;
    }

    try {
      const response = await fetch('/api/generate-storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: playlist.map(item => ({ imageId: item.imageId, type: item.type, url: item.url })),
          topic: currentTopic
        })
      });

      if (!response.ok) throw new Error('Storyboard generation failed');
      const data = await response.json();
      setStoryboardData(data);
      setShowAnimatedPlayer(true);
    } catch (err: any) {
      console.warn('Storyboard generation error, playing fallback:', err.message);
      // Generate offline safe default storyboard structure
      const defaultStoryboard = {
        title: currentTopic,
        audioMood: 'ambient-cinematic',
        scenes: [
          {
            sceneType: 'open',
            imageIds: [],
            title: currentTopic.toUpperCase(),
            caption: 'CINEMATIC DESIGN TIMELINE PROPOSAL',
            transitionIn: 'fade',
            motion: 'still',
            durationMs: 3000
          },
          ...playlist.map((item, idx) => ({
            sceneType: item.type === 'floorPlan' ? 'plan' : item.type === 'hero' ? 'morph' : 'angle',
            imageIds: [item.imageId],
            title: item.type === 'floorPlan' ? 'SITE DEVELOPMENT BLUEPRINT' : `CINEMATIC DETAIL SCENE ${idx + 1}`,
            caption: 'High fidelity model elevation outlining premium facade profiles.',
            transitionIn: idx === 0 ? 'fade' : item.type === 'hero' ? 'scaleMorph' : 'whipPan',
            motion: idx % 2 === 0 ? 'kenBurnsIn' : 'panRight',
            durationMs: 3200
          })),
          {
            sceneType: 'closing',
            imageIds: [],
            title: 'PINNACLE DESIGN GROUP',
            caption: 'All conceptual layouts subject to professional site verification.',
            transitionIn: 'fade',
            motion: 'still',
            durationMs: 3000
          }
        ]
      };
      setStoryboardData(defaultStoryboard);
      setShowAnimatedPlayer(true);
    } finally {
      setIsGeneratingStoryboard(false);
    }
  };

  // Handle local image upload for Custom deck
  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const url = reader.result as string;
      addProjectAsset('uploads', { url });
      
      // Auto-assign to current slide
      if (activeSlide) {
        if (activeSlide.layout === 'cover' || activeSlide.layout === 'image-full' || activeSlide.layout === 'image+text') {
          updateActiveSlide({ imageUrls: [url] });
        } else {
          updateActiveSlide({ imageUrls: [...activeSlide.imageUrls, url] });
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const renderEditorialSlide = (slide: Slide, index: number, totalSlides: number) => {
    const isCream = theme === 'cream';
    const bgClass = isCream ? 'bg-[#FAF7F0] text-[#1A1712]' : 'bg-[#0B0B0D] text-[#F4F1EB]';
    const displayFont = isCream ? 'font-fraunces font-medium' : 'font-archivo font-bold';
    const bodyFont = isCream ? 'font-space-grotesk' : 'font-inter';
    const eyebrowColor = isCream ? 'text-[#243D2C]' : 'text-[#C9A96A]';
    const mutedColor = isCream ? 'text-[#6B6357]' : 'text-[#8A867E]';
    const borderClass = isCream ? 'border-[#DAD2C4]' : 'border-white/10';

    return (
      <div className={`w-full h-full flex flex-col justify-between p-12 relative overflow-hidden transition-all duration-300 ${bgClass} select-none`}>
        {/* Slide Top: Eyebrow + Hairline (Except Cover) */}
        {slide.layout !== 'cover' && (
          <div className="w-full flex flex-col gap-2 shrink-0">
            <div className="flex justify-between items-baseline font-mono text-[9px] uppercase tracking-[0.15em]">
              <span className={`${eyebrowColor} font-bold`}>
                {(index + 1).toString().padStart(2, '0')} // {slide.subtitle || 'SECTION PROFILE'}
              </span>
              <span className={mutedColor}>
                {projectName || 'ARCHINOVA'}
              </span>
            </div>
            <div className={`w-full border-b ${borderClass}`} />
          </div>
        )}

        {/* Slide Body: Layouts */}
        <div className="flex-1 flex gap-6 my-4 overflow-hidden relative items-stretch">
          {slide.layout === 'cover' && (
            <div className="w-full h-full flex flex-col justify-between text-left relative z-10">
              {slide.imageUrls[0] ? (
                <>
                  <div className="absolute inset-0 -m-12 bg-black">
                    <img src={slide.imageUrls[0]} className="w-full h-full object-cover opacity-85" alt="Cover Image" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
                  </div>
                  <div className="mt-auto relative z-10 p-2">
                    <span className="text-[10px] text-[#C9A96A] tracking-[0.2em] font-mono uppercase block mb-1">PROJECT PORTFOLIO</span>
                    <h2 className="text-4xl md:text-5xl font-archivo font-bold leading-none text-white uppercase tracking-wider mb-2">
                      {slide.title || 'ARCHITECTURAL BRIEF'}
                    </h2>
                    <div className="h-[1px] w-24 bg-[#C9A96A]/60 my-3" />
                    <p className="text-[11px] font-inter text-zinc-300 uppercase tracking-widest max-w-xl">{slide.subtitle}</p>
                    <p className="text-[9px] font-inter text-zinc-400 mt-2 max-w-2xl">{slide.body}</p>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col justify-center items-start pr-12">
                  <span className={`text-[10px] tracking-[0.2em] font-bold ${eyebrowColor} ${bodyFont} uppercase mb-2`}>PROJECT BRIEFING</span>
                  <h2 className={`text-4xl md:text-5xl leading-[1.05] tracking-tight uppercase mb-4 ${displayFont}`}>
                    {slide.title || 'ARCHITECTURAL CONCEPT'}
                  </h2>
                  <div className={`w-32 border-b-2 ${isCream ? 'border-[#243D2C]' : 'border-[#C9A96A]'} mb-6`} />
                  <p className={`text-xs tracking-widest uppercase mb-4 opacity-75 ${bodyFont}`}>{slide.subtitle}</p>
                  <p className={`text-[10px] leading-relaxed max-w-xl opacity-60 ${bodyFont}`}>{slide.body}</p>
                </div>
              )}
            </div>
          )}

          {slide.layout === 'image-full' && (
            <div className="w-full h-full relative -mx-12 -my-4 flex items-center justify-center bg-black">
              {slide.imageUrls[0] ? (
                <>
                  <img src={slide.imageUrls[0]} className="w-full h-full object-cover opacity-85" alt="Slide Full Image" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-6 left-12 right-12 z-10 text-left font-mono">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">{slide.title || 'SITE PERSPECTIVE'}</h3>
                    <p className="text-[10px] text-zinc-300 mt-1 uppercase max-w-xl leading-relaxed">{slide.body}</p>
                  </div>
                </>
              ) : (
                <div className="text-[9px] uppercase tracking-widest opacity-35 font-mono text-white">No Image Placed</div>
              )}
            </div>
          )}

          {slide.layout === 'image+text' && (
            <div className="w-full h-full flex flex-col md:flex-row gap-8 items-stretch">
              <div className="flex-[5] flex flex-col justify-center pr-4">
                <h3 className={`text-2xl md:text-3xl leading-tight uppercase mb-2 ${displayFont}`}>
                  {slide.title || 'CONCEPT SPECIFICATION'}
                </h3>
                <div className={`w-16 border-b mb-4 ${borderClass}`} />
                <p className={`text-[11px] leading-relaxed opacity-85 whitespace-pre-line max-w-md ${bodyFont}`}>
                  {slide.body}
                </p>
              </div>
              <div className="flex-[7] h-full flex items-center justify-center shrink-0 border border-blue-900/5 bg-black/5 relative overflow-hidden rounded">
                {slide.imageUrls[0] ? (
                  <img src={slide.imageUrls[0]} className="w-full h-full object-cover" alt="Placed Image" />
                ) : (
                  <div className={`text-[8px] uppercase tracking-widest opacity-25 ${bodyFont}`}>No Image Placed</div>
                )}
              </div>
            </div>
          )}

          {slide.layout === 'grid' && (
            <div className="w-full h-full flex flex-col justify-between">
              <div className="mb-2 shrink-0">
                <h3 className={`text-xl uppercase tracking-wide ${displayFont}`}>{slide.title || 'VISUAL MATRIX'}</h3>
                <p className={`text-[9px] uppercase tracking-widest opacity-75 ${bodyFont}`}>{slide.subtitle}</p>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-3 my-1 overflow-hidden shrink-0">
                {Array.from({ length: 3 }).map((_, i) => {
                  const url = slide.imageUrls[i];
                  return (
                    <div key={i} className={`border ${borderClass} rounded overflow-hidden aspect-[4/5] bg-black/5 flex items-center justify-center`}>
                      {url ? (
                        <img src={url} className="w-full h-full object-cover" alt="Grid item" />
                      ) : (
                        <span className={`text-[7px] uppercase tracking-widest opacity-20 ${bodyFont}`}>FRAME {i + 1}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {slide.body && (
                <p className={`text-[8.5px] leading-relaxed opacity-70 mt-2 max-w-2xl truncate ${bodyFont}`}>{slide.body}</p>
              )}
            </div>
          )}

          {slide.layout === 'table' && (
            <div className="w-full h-full flex flex-col justify-between">
              <div className="mb-2 shrink-0">
                <h3 className={`text-xl uppercase tracking-wide ${displayFont}`}>{slide.title || 'SPECIFICATION MATRIX'}</h3>
                <p className={`text-[9px] uppercase tracking-widest opacity-75 ${bodyFont}`}>{slide.subtitle}</p>
              </div>
              <div className={`flex-1 flex flex-col justify-center gap-1.5 max-w-xl text-[9px] uppercase ${bodyFont}`}>
                <div className={`grid grid-cols-2 border-b ${borderClass} py-1.5`}><span className={mutedColor}>DESIGN CLASSIFICATION</span><span className="font-bold">RESIDENTIAL DWELLING</span></div>
                <div className={`grid grid-cols-2 border-b ${borderClass} py-1.5`}><span className={mutedColor}>LEVEL CONSTELLATION</span><span className="font-bold">3 FLOORS CONFIG</span></div>
                <div className={`grid grid-cols-2 border-b ${borderClass} py-1.5`}><span className={mutedColor}>ZONING COMPLIANCE</span><span className="font-bold">STANDARD CIVIL CODES</span></div>
              </div>
              {slide.body && (
                <p className={`text-[9px] leading-relaxed opacity-70 mt-2 max-w-xl truncate ${bodyFont}`}>{slide.body}</p>
              )}
            </div>
          )}

          {slide.layout === 'contact' && (
            <div className="w-full h-full flex flex-col justify-center items-center text-center px-12">
              <span className={`text-[9px] tracking-[0.25em] font-bold ${eyebrowColor} ${bodyFont} uppercase mb-2`}>PROJECT DISCUSSION</span>
              <h2 className={`text-3xl md:text-4xl leading-tight uppercase mb-2 ${displayFont}`}>
                {slide.title || 'GET IN TOUCH'}
              </h2>
              <p className={`text-[10px] tracking-widest uppercase opacity-75 mb-6 ${bodyFont}`}>{slide.subtitle}</p>
              <div className={`w-12 border-b mb-6 ${borderClass}`} />
              <div className={`text-[10px] font-mono leading-relaxed space-y-1 ${mutedColor}`}>
                <div>OFFICE: PINNACLE STUDIOS INTL.</div>
                <div>EMAIL: PARTNERS@PINNACLESTUDIOS.COM</div>
                <div>ADDRESS: METROPOLIS TOWER SUITE 401</div>
              </div>
            </div>
          )}
        </div>

        {/* Slide Footer: Page Number (Except Cover) */}
        {slide.layout !== 'cover' && (
          <div className="w-full flex justify-between items-baseline shrink-0 font-mono text-[8.5px] uppercase tracking-widest">
            <span className={mutedColor}>All conceptual layouts subject to professional site verification.</span>
            <span className={`${eyebrowColor} font-bold`}>
              {(index + 1).toString().padStart(2, '0')} / {totalSlides.toString().padStart(2, '0')}
            </span>
          </div>
        )}
      </div>
    );
  };

  const activeSlide = customSlides[activeSlideIndex];

  // Helper list of all available images (vault + uploads + smart + demo)
  const allImages = [
    ...(primaryFp ? [{ id: primaryFp.id, type: 'floor_plan', label: 'Primary Floor Plan', url: primaryFp.url }] : []),
    ...(heroRender ? [{ id: 'hero', type: 'hero_render', label: 'Locked Hero Render', url: heroRender }] : []),
    ...angles.map(a => ({ id: a.id, type: 'angle', label: `Angle: ${a.label}`, url: a.url })),
    ...uploads.map(u => ({ id: u.id, type: 'upload', label: 'User Upload', url: u.url })),
    ...smartImages.map((url, i) => ({ id: `smart_${i}`, type: i === 0 ? 'hero' : 'angle', label: `Smart Image ${i+1}`, url })),
    { id: 'demo_fp', type: 'floor_plan', label: 'Demo Floor Plan', url: DEMO_SAMPLE_ASSETS.floorPlan },
    { id: 'demo_hero', type: 'hero_render', label: 'Demo Hero Render', url: DEMO_SAMPLE_ASSETS.hero },
    ...DEMO_SAMPLE_ASSETS.angles.map((ang, i) => ({ id: `demo_ang_${i}`, type: 'angle', label: ang.label, url: ang.url }))
  ];

  return (
    <div className="min-h-screen bg-[#02050c] text-white font-sans flex flex-col relative overflow-x-hidden">
      {/* Background gradients */}
      <div className="absolute top-0 left-0 w-full h-[50vh] bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none" />
      
      <header className="relative z-10 flex justify-between items-center px-8 py-6 border-b border-blue-900/30 bg-[#02050c]/80 backdrop-blur glass-panel">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => router.push('/vault')}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-blue-500/30 hover:border-blue-500 hover:bg-blue-500/10 transition-all cursor-pointer glass-card group"
          >
            <ArrowLeft className="text-blue-400 group-hover:text-blue-300" size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-[4px] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] flex items-center gap-2">
              <Presentation className="text-cyan-400" /> Deck Builder
            </h1>
            <span className="text-[10px] tracking-[3px] text-blue-400/60 uppercase font-mono">
              {projectName || 'Presentation Generator'}
            </span>
          </div>
          <button
            onClick={handleLoadDemoAssets}
            className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-950/80 to-blue-950/80 border border-cyan-400/60 text-cyan-300 hover:text-white rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,240,255,0.25)] animate-pulse"
            title="Preview two examples of how the PPT looks (Minimal Editorial & Animated Cinematic)"
          >
            <Sparkles size={12} className="text-cyan-400" />
            ✨ DEMO PPT EXAMPLES
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Mode Switcher — CUSTOM DECK and AI SMART DECK gated behind feature flags */}
          <div className="flex bg-black/40 border border-blue-900/30 rounded-lg p-0.5 font-mono text-[9px] font-bold">
            <button
              onClick={() => setMode('auto')}
              className={`px-3 py-1.5 rounded uppercase tracking-wider transition-all ${
                mode === 'auto' ? 'bg-cyan-500 text-black' : 'text-cyan-400 hover:text-white'
              }`}
            >
              Auto from Vault
            </button>
            {FLAGS.CUSTOM_DECK && (
              <button
                onClick={() => setMode('custom')}
                className={`px-3 py-1.5 rounded uppercase tracking-wider transition-all ${
                  mode === 'custom' ? 'bg-cyan-500 text-black' : 'text-cyan-400 hover:text-white'
                }`}
              >
                Custom Deck
              </button>
            )}
            {FLAGS.AI_SMART_DECK && (
              <button
                onClick={() => setMode('ai-smart')}
                className={`px-3 py-1.5 rounded uppercase tracking-wider transition-all ${
                  mode === 'ai-smart' ? 'bg-cyan-500 text-black' : 'text-cyan-400 hover:text-white'
                }`}
              >
                AI Smart Deck
              </button>
            )}
          </div>

          {/* Theme Selector */}
          <div className="flex bg-black/40 border border-blue-900/30 rounded-lg p-0.5 font-mono text-[9px] font-bold">
            <button
              onClick={() => setTheme('cream')}
              className={`px-3 py-1.5 rounded uppercase tracking-wider transition-all cursor-pointer ${
                theme === 'cream' ? 'bg-amber-100 text-black' : 'text-amber-100/60 hover:text-white'
              }`}
            >
              UKA Cream
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`px-3 py-1.5 rounded uppercase tracking-wider transition-all cursor-pointer ${
                theme === 'dark' ? 'bg-zinc-800 text-cyan-400' : 'text-zinc-500 hover:text-white'
              }`}
            >
              Premium Dark
            </button>
          </div>

          {/* Style Selector — ANIMATED gated behind FLAGS.ANIMATED_DECK */}
          {FLAGS.ANIMATED_DECK && (
            <div className="flex bg-black/40 border border-blue-900/30 rounded-lg p-0.5 font-mono text-[9px] font-bold">
              <button
                onClick={() => setPresentationStyle('minimal')}
                className={`px-3 py-1.5 rounded uppercase tracking-wider transition-all cursor-pointer ${
                  presentationStyle === 'minimal' ? 'bg-zinc-800 text-cyan-400' : 'text-zinc-500 hover:text-white'
                }`}
              >
                MINIMAL
              </button>
              <button
                onClick={() => setPresentationStyle('animated')}
                className={`px-3 py-1.5 rounded uppercase tracking-wider transition-all cursor-pointer ${
                  presentationStyle === 'animated' ? 'bg-zinc-800 text-cyan-400' : 'text-zinc-500 hover:text-white'
                }`}
              >
                ANIMATED
              </button>
            </div>
          )}

          {/* Export Controls — adapt to style when ANIMATED_DECK flag is on */}
          {(!FLAGS.ANIMATED_DECK || presentationStyle === 'minimal') ? (
            <>
              <button
                onClick={() => handleExport('pdf')}
                disabled={isExporting || (mode === 'auto' && !canExportAuto) || (mode === 'ai-smart' && smartSlides.length === 0)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-950/40 border border-blue-500/30 text-blue-300 hover:bg-blue-900/40 hover:border-blue-400 rounded-lg text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
              >
                {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                PDF
              </button>
              <button
                onClick={() => handleExport('pptx')}
                disabled={isExporting || (mode === 'auto' && !canExportAuto) || (mode === 'ai-smart' && smartSlides.length === 0)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white border border-cyan-400/50 hover:from-cyan-500 hover:to-blue-500 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)] disabled:opacity-50 cursor-pointer"
              >
                {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Presentation size={14} />}
                PPTX
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handlePlayAnimatedDeck}
                disabled={isGeneratingStoryboard || (mode === 'auto' && !canExportAuto) || (mode === 'ai-smart' && smartImages.length === 0)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white border border-cyan-400/50 hover:from-cyan-500 hover:to-blue-500 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)] disabled:opacity-50 cursor-pointer"
              >
                {isGeneratingStoryboard ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                ▶ PLAY
              </button>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/presentation/share?id=${activeProject?.id || ''}`;
                  navigator.clipboard.writeText(url);
                  setExportError('Share link copied to clipboard!');
                  setTimeout(() => setExportError(null), 3000);
                }}
                disabled={(mode === 'auto' && !canExportAuto) || (mode === 'ai-smart' && smartImages.length === 0)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-950/40 border border-blue-500/30 text-blue-300 hover:bg-blue-900/40 hover:border-blue-400 rounded-lg text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer animate-pulse"
              >
                <LinkIcon size={14} />
                SHARE LINK
              </button>
            </>
          )}
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-7xl mx-auto w-full p-8 flex flex-col gap-6">
        {exportError && (
          <div className="p-4 rounded-lg bg-red-950/40 border border-red-900/50 text-red-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle size={14} /> {exportError}
          </div>
        )}

        {mode === 'auto' && (
          /* AUTO MODE VIEW */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-black/20 border border-blue-900/20 rounded-xl glass-panel relative min-h-[400px]">
            {!canExportAuto ? (
              <div className="max-w-md space-y-4">
                <AlertTriangle size={48} className="text-amber-500 mx-auto animate-bounce" />
                <h3 className="text-lg font-bold uppercase tracking-widest text-amber-400">Vault Assets Insufficient</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Auto Presentation mode requires at least <strong className="text-white">one Floor Plan</strong> and <strong className="text-white">one Hero Render</strong> inside the project vault to synthesize slides.
                </p>
                <div className="flex flex-wrap justify-center gap-3 font-mono text-[9px]">
                  <button 
                    onClick={handleLoadDemoAssets} 
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white border border-cyan-400/50 hover:from-cyan-500 hover:to-blue-500 rounded font-bold uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(0,240,255,0.35)] cursor-pointer flex items-center gap-2 text-xs"
                  >
                    <Sparkles size={14} />
                    ✨ DEMO PPT EXAMPLES (PREVIEW BOTH)
                  </button>
                  <button 
                    onClick={() => router.push('/concept-generator')} 
                    className="px-4 py-2 bg-blue-950/60 border border-blue-900 text-blue-400 hover:text-white rounded cursor-pointer"
                  >
                    Generate Floor Plan
                  </button>
                  <button 
                    onClick={() => router.push('/idea-generation')} 
                    className="px-4 py-2 bg-blue-950/60 border border-blue-900 text-blue-400 hover:text-white rounded cursor-pointer"
                  >
                    Generate Hero Render
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-md space-y-6">
                <Sparkles size={48} className="text-cyan-400 mx-auto" />
                <h3 className="text-xl font-bold uppercase tracking-widest">Auto deck generator ready</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Generates a consistent 10-slide architectural proposal deck matching your **{theme.toUpperCase()}** brand theme.
                </p>
                <div className="text-[10px] text-cyan-400/80 font-mono space-y-1 bg-cyan-950/20 border border-cyan-800/20 rounded p-4 text-left">
                  <div>• Primary Floor Plan: Found ✓</div>
                  <div>• Hero Exterior Render: Found ✓</div>
                  <div>• Angles: {angles.length} found</div>
                  <div>• Specifications: Configured ✓</div>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'custom' && (
          /* CUSTOM MODE DECK BUILDER */
          <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-[500px]">
            {/* Sidebar Slide list */}
            <div className="w-full md:w-[260px] bg-black/40 border border-blue-900/30 rounded-xl p-4 flex flex-col gap-4 glass-panel shrink-0">
              <div className="flex justify-between items-center border-b border-blue-900/20 pb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 font-mono">Slides ({customSlides.length})</span>
                <button
                  onClick={addSlide}
                  className="p-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:text-white transition-colors cursor-pointer"
                  title="Add Slide"
                >
                  <Plus size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 max-h-[400px] md:max-h-none pr-1">
                {customSlides.map((slide, idx) => (
                  <div 
                    key={slide.id}
                    onClick={() => setActiveSlideIndex(idx)}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all flex justify-between items-center ${
                      idx === activeSlideIndex 
                        ? 'border-cyan-400 bg-cyan-950/25' 
                        : 'border-blue-900/20 bg-black/20 hover:border-blue-800'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="text-[8px] text-zinc-500 uppercase font-mono">Slide {idx + 1}</div>
                      <div className="text-xs font-bold uppercase truncate text-white">{slide.title || 'Untitled'}</div>
                      <div className="text-[8.5px] text-cyan-400/60 uppercase truncate font-mono">{slide.layout}</div>
                    </div>

                    <div className="flex flex-col gap-1 shrink-0 opacity-40 hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); moveSlide(idx, 'up'); }} className="hover:text-cyan-400"><ArrowUp size={10} /></button>
                      <button onClick={(e) => { e.stopPropagation(); moveSlide(idx, 'down'); }} className="hover:text-cyan-400"><ArrowDown size={10} /></button>
                      <button onClick={(e) => { e.stopPropagation(); removeSlide(idx); }} className="hover:text-red-400"><Trash2 size={10} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Slide Editor Panel */}
            <div className="flex-1 bg-black/40 border border-blue-900/30 rounded-xl p-6 flex flex-col gap-6 glass-panel">
              {activeSlide && (
                <>
                  <div className="flex justify-between items-center border-b border-blue-900/20 pb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">Edit Slide {activeSlideIndex + 1}</h3>
                    <div className="flex items-center gap-2">
                      <Layout size={14} className="text-cyan-400" />
                      <select
                        value={activeSlide.layout}
                        onChange={(e: any) => updateActiveSlide({ layout: e.target.value })}
                        className="bg-black text-xs border border-blue-900/30 rounded px-2 py-1 text-white font-mono cursor-pointer focus:outline-none"
                      >
                        <option value="cover">Cover Layout</option>
                        <option value="image-full">Full Image</option>
                        <option value="image+text">Image + Text</option>
                        <option value="grid">Grid (Images Only)</option>
                        <option value="table">Table Specs</option>
                        <option value="contact">Contact Details</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Inputs panel */}
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-cyan-500/60 uppercase font-mono">Title</label>
                        <input
                          type="text"
                          value={activeSlide.title}
                          onChange={(e) => updateActiveSlide({ title: e.target.value })}
                          className="bg-black/60 border border-blue-900/30 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-cyan-500/60 uppercase font-mono">Subtitle</label>
                        <input
                          type="text"
                          value={activeSlide.subtitle}
                          onChange={(e) => updateActiveSlide({ subtitle: e.target.value })}
                          className="bg-black/60 border border-blue-900/30 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] text-cyan-500/60 uppercase font-mono">Slide Body Details</label>
                          <button
                            type="button"
                            onClick={handleGetAISuggestion}
                            disabled={isSuggesting}
                            className="flex items-center gap-1 text-[8px] font-bold text-cyan-400 border border-cyan-500/30 hover:border-cyan-400 bg-cyan-950/20 hover:bg-cyan-900/30 px-2 py-0.5 rounded transition-all cursor-pointer disabled:opacity-50 font-mono"
                          >
                            {isSuggesting ? <Loader2 size={8} className="animate-spin" /> : '★ AI Suggestion'}
                          </button>
                        </div>
                        <textarea
                          rows={4}
                          value={activeSlide.body}
                          onChange={(e) => updateActiveSlide({ body: e.target.value })}
                          className="bg-black/60 border border-blue-900/30 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      {/* Image Placement Section */}
                      <div className="border border-blue-900/20 bg-black/20 rounded p-4">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-400 mb-2 block font-mono">Select Slide Image</span>
                        <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-y-auto pr-1">
                          {allImages.map(img => {
                            const isSelected = activeSlide.imageUrls.includes(img.url);
                            return (
                              <div
                                key={img.id}
                                onClick={() => {
                                  if (isSelected) {
                                    updateActiveSlide({ imageUrls: activeSlide.imageUrls.filter(u => u !== img.url) });
                                  } else {
                                    // Limit images based on layout
                                    if (activeSlide.layout === 'cover' || activeSlide.layout === 'image-full' || activeSlide.layout === 'image+text') {
                                      updateActiveSlide({ imageUrls: [img.url] });
                                    } else {
                                      updateActiveSlide({ imageUrls: [...activeSlide.imageUrls, img.url] });
                                    }
                                  }
                                }}
                                className={`p-1.5 border rounded cursor-pointer transition-all text-left flex gap-2 items-center ${
                                  isSelected ? 'border-cyan-400 bg-cyan-950/20' : 'border-blue-900/20 bg-black/30'
                                }`}
                              >
                                <img src={img.url} className="w-8 h-8 object-cover rounded" alt="Thumb" />
                                <div className="truncate">
                                  <div className="text-[9px] font-bold text-white truncate">{img.label}</div>
                                  <div className="text-[7.5px] text-zinc-500 font-mono uppercase">{img.type}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-3">
                          <label className="flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-blue-900/40 text-[9px] font-bold uppercase tracking-wider hover:border-cyan-400 hover:text-white transition-all rounded cursor-pointer">
                            <UploadCloud size={12} />
                            Upload Deck Asset
                            <input type="file" accept="image/*" onChange={handleUploadImage} className="hidden" />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Preview Panel */}
                    <div className="flex flex-col border border-blue-900/20 bg-black/35 rounded-xl overflow-hidden aspect-video relative">
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 border border-white/10 rounded text-[7.5px] font-mono text-zinc-400 uppercase tracking-widest z-10">
                        Layout Preview
                      </div>

                      {/* Slide Layout Display */}
                      {renderEditorialSlide(activeSlide, activeSlideIndex, customSlides.length)}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {mode === 'ai-smart' && (
          <div className="flex-1 flex flex-col gap-6">
            {smartSlides.length === 0 ? (
              /* CONFIGURATION / INTAKE VIEW */
              <div className="max-w-2xl mx-auto w-full bg-black/20 border border-blue-900/30 rounded-xl p-8 flex flex-col gap-6 glass-panel font-mono">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-cyan-400">AI Smart Presentation Generator</h3>
                  <p className="text-[10px] text-zinc-500 uppercase mt-1">Upload files and input a topic to formulate a complete slide pitch deck via Vision AI</p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] text-cyan-500/60 uppercase font-mono">Deck Topic / Focus</label>
                    <button
                      type="button"
                      onClick={handleLoadDemoAssets}
                      className="text-[9px] text-cyan-400 hover:text-cyan-200 font-mono underline uppercase tracking-wider cursor-pointer flex items-center gap-1"
                    >
                      <Sparkles size={10} /> Load Sample Images & Topic
                    </button>
                  </div>
                  <input
                    type="text"
                    value={smartTopic}
                    onChange={(e) => setSmartTopic(e.target.value)}
                    placeholder="e.g. Modern beach house — Goa"
                    className="bg-black/60 border border-blue-900/30 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 uppercase placeholder-zinc-700 font-mono"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] text-cyan-500/60 uppercase font-mono">
                    Upload Images (3 to 12 files)
                  </label>
                  
                  <div className="border border-dashed border-blue-900/40 bg-black/10 hover:bg-black/35 rounded-xl p-6 transition-all text-center relative flex flex-col items-center justify-center min-h-[140px]">
                    <ImageIcon size={32} className="text-zinc-500 mb-2" />
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Drag & drop or click to select files</span>
                    <span className="text-[8px] text-zinc-600 uppercase mt-1">PNG, JPG or WEBP formats supported</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleSmartImagesUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>

                  {smartImages.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <span className="text-[9px] font-bold text-cyan-400/80 uppercase">Selected Images ({smartImages.length})</span>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                        {smartImages.map((img, idx) => (
                          <div key={idx} className="relative aspect-video border border-blue-900/30 rounded overflow-hidden group">
                            <img src={img} className="w-full h-full object-cover" alt="Source" />
                            <button
                              onClick={() => setSmartImages(prev => prev.filter((_, i) => i !== idx))}
                              className="absolute top-1 right-1 p-1 bg-red-950/80 text-red-400 border border-red-900/40 rounded opacity-0 group-hover:opacity-100 hover:bg-red-900 hover:text-white transition-opacity"
                            >
                              <Trash2 size={8} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {smartImages.length > 0 && (smartImages.length < 3 || smartImages.length > 12) && (
                    <span className="text-[8.5px] text-amber-500 font-bold uppercase tracking-wider mt-1">
                      ⚠️ Current count: {smartImages.length} images. Vision AI requires 3 to 12 files to proceed.
                    </span>
                  )}
                </div>

                <button
                  onClick={handleGenerateSmartDeck}
                  disabled={isGeneratingSmartDeck || smartImages.length < 3 || smartImages.length > 12 || !smartTopic.trim()}
                  className="w-full mt-4 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg border border-cyan-400/30 text-xs font-bold uppercase tracking-widest hover:from-cyan-500 hover:to-blue-500 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,217,255,0.25)] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {isGeneratingSmartDeck ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      SYNTHESIZING PRESENTATION DECK LAYOUT...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      GENERATE SMART DECK
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* PREVIEW & EDITOR VIEW */
              <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-[500px]">
                {/* Sidebar Slide list */}
                <div className="w-full md:w-[260px] bg-black/40 border border-blue-900/30 rounded-xl p-4 flex flex-col gap-4 glass-panel shrink-0">
                  <div className="flex justify-between items-center border-b border-blue-900/20 pb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 font-mono">Slides ({smartSlides.length})</span>
                    <div className="flex gap-2">
                      <button
                        onClick={addSmartSlide}
                        className="p-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:text-white transition-colors cursor-pointer"
                        title="Add Slide"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        onClick={() => {
                          setSmartSlides([]);
                          setSmartActiveSlideIndex(0);
                        }}
                        className="p-1 rounded bg-red-950/20 border border-red-900/40 text-red-400 hover:text-white transition-colors cursor-pointer text-[8px] uppercase tracking-wider font-mono px-2"
                        title="Start Over"
                      >
                        Start Over
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 max-h-[400px] md:max-h-none pr-1">
                    {smartSlides.map((slide, idx) => (
                      <div 
                        key={slide.id}
                        onClick={() => setSmartActiveSlideIndex(idx)}
                        className={`p-3 rounded-lg border text-left cursor-pointer transition-all flex justify-between items-center ${
                          idx === smartActiveSlideIndex 
                            ? 'border-cyan-400 bg-cyan-950/25' 
                            : 'border-blue-900/20 bg-black/20 hover:border-blue-800'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <div className="text-[8px] text-zinc-500 uppercase font-mono">Slide {idx + 1}</div>
                          <div className="text-xs font-bold uppercase truncate text-white">{slide.title || 'Untitled'}</div>
                          <div className="text-[8.5px] text-cyan-400/60 uppercase truncate font-mono">{slide.layout}</div>
                        </div>

                        <div className="flex flex-col gap-1 shrink-0 opacity-40 hover:opacity-100 transition-opacity font-mono">
                          <button onClick={(e) => { e.stopPropagation(); moveSmartSlide(idx, 'up'); }} className="hover:text-cyan-400"><ArrowUp size={10} /></button>
                          <button onClick={(e) => { e.stopPropagation(); moveSmartSlide(idx, 'down'); }} className="hover:text-cyan-400"><ArrowDown size={10} /></button>
                          <button onClick={(e) => { e.stopPropagation(); removeSmartSlide(idx); }} className="hover:text-red-400"><Trash2 size={10} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Slide Editor Panel */}
                <div className="flex-1 bg-black/40 border border-blue-900/30 rounded-xl p-6 flex flex-col gap-6 glass-panel">
                  {smartSlides[smartActiveSlideIndex] && (() => {
                    const activeSlide = smartSlides[smartActiveSlideIndex];
                    return (
                      <>
                        <div className="flex justify-between items-center border-b border-blue-900/20 pb-3 font-mono">
                          <h3 className="text-sm font-bold uppercase tracking-wider text-white">Edit Smart Slide {smartActiveSlideIndex + 1}</h3>
                          <div className="flex items-center gap-2">
                            <Layout size={14} className="text-cyan-400" />
                            <select
                              value={activeSlide.layout}
                              onChange={(e: any) => updateActiveSmartSlide({ layout: e.target.value })}
                              className="bg-black text-xs border border-blue-900/30 rounded px-2 py-1 text-white font-mono cursor-pointer focus:outline-none"
                            >
                              <option value="cover">Cover Layout</option>
                              <option value="image-full">Full Image</option>
                              <option value="image+text">Image + Text</option>
                              <option value="grid">Grid (Images Only)</option>
                              <option value="table">Table Specs</option>
                              <option value="contact">Contact Details</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Inputs panel */}
                          <div className="space-y-4 font-mono">
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] text-cyan-500/60 uppercase font-mono">Title</label>
                              <input
                                type="text"
                                value={activeSlide.title}
                                onChange={(e) => updateActiveSmartSlide({ title: e.target.value })}
                                className="bg-black/60 border border-blue-900/30 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] text-cyan-500/60 uppercase font-mono">Subtitle</label>
                              <input
                                type="text"
                                value={activeSlide.subtitle}
                                onChange={(e) => updateActiveSmartSlide({ subtitle: e.target.value })}
                                className="bg-black/60 border border-blue-900/30 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] text-cyan-500/60 uppercase font-mono">Slide Body Details</label>
                              <textarea
                                rows={4}
                                value={activeSlide.body}
                                onChange={(e) => updateActiveSmartSlide({ body: e.target.value })}
                                className="bg-black/60 border border-blue-900/30 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                              />
                            </div>

                            {/* Image Placement Selection */}
                            <div className="border border-blue-900/20 bg-black/20 rounded p-4">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-400 mb-2 block font-mono">Select Slide Image</span>
                              <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-y-auto pr-1">
                                {smartImages.map((img, idx) => {
                                  const isSelected = activeSlide.imageUrls.includes(img);
                                  return (
                                    <div
                                      key={idx}
                                      onClick={() => {
                                        if (isSelected) {
                                          updateActiveSmartSlide({ imageUrls: activeSlide.imageUrls.filter(url => url !== img) });
                                        } else {
                                          if (activeSlide.layout === 'image+text' || activeSlide.layout === 'image-full') {
                                            updateActiveSmartSlide({ imageUrls: [img] });
                                          } else {
                                            updateActiveSmartSlide({ imageUrls: [...activeSlide.imageUrls, img] });
                                          }
                                        }
                                      }}
                                      className={`relative aspect-video rounded overflow-hidden cursor-pointer border-2 transition-all ${
                                        isSelected ? 'border-cyan-400 scale-[0.97]' : 'border-transparent opacity-60 hover:opacity-100'
                                      }`}
                                    >
                                      <img src={img} className="w-full h-full object-cover" alt="Smart Option" />
                                      {isSelected && (
                                        <div className="absolute inset-0 bg-cyan-500/25 flex items-center justify-center">
                                          <span className="text-[8px] bg-black px-1.5 py-0.5 rounded font-mono font-bold text-cyan-400 uppercase tracking-widest">ACTIVE</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Preview panel */}
                          <div className="flex flex-col gap-2 font-mono">
                            <span className="text-[9px] text-cyan-500/60 uppercase font-mono">Interactive Frame Preview</span>
                            <div className="aspect-video rounded-xl overflow-hidden relative border border-blue-900/10">
                              {renderEditorialSlide(activeSlide, smartActiveSlideIndex, smartSlides.length)}
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      {showAnimatedPlayer && storyboardData && (
        <AnimatedPlayer
          storyboard={storyboardData}
          images={allImages}
          onClose={() => setShowAnimatedPlayer(false)}
        />
      )}
    </div>
  );
}
