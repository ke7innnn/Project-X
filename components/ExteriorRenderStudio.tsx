'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud, Sparkles, Download, RefreshCw, Loader2, Building2,
  Sun, Moon, Camera, Settings2, Eye, Trash2, Send, Layers, Plus, Star, X,
  Bot, MessageSquare, Wand2, Check, ArrowRight, CornerDownLeft
} from 'lucide-react';

interface ModelAngleInput {
  id: string;
  base64: string;
  fileName: string;
}

interface ExteriorRenderHistoryItem {
  id: string;
  renderBase64: string;
  primaryModelBase64: string;
  allModelImages?: string[];
  floorCount?: string;
  modelCount: number;
  timeOfDay: 'day' | 'night';
  timestamp: number;
}

interface MultiAngleResult {
  id: string;
  label: string;
  shortDesc: string;
  render: string;
  seed?: number | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  suggestedDirectives?: string;
  themeName?: string;
  suggestedTimeOfDay?: 'day' | 'night' | null;
  timestamp: number;
}

const THEME_PRESETS = [
  {
    id: 'biophilic',
    title: '🌴 Biophilic Oasis',
    badge: 'Greenery',
    desc: 'Vertical gardens & bougainvillea',
    directives: 'Parametric curved bronze louvers, vertical green living walls with cascading bougainvillea, fluted limestone podium with warm ambient cove lighting, infinity cantilever pool with water caustics, and low-iron Starphire curtain wall glass.',
    timeOfDay: 'day' as const,
  },
  {
    id: 'cyberpunk',
    title: '🌆 Cyberpunk Neo-Tokyo',
    badge: 'Neon Glow',
    desc: 'Titanium & neon accents',
    directives: 'Dark brushed titanium facade panels, subtle glowing neon amber and cyan horizontal LED slab accents, wet rain-slicked asphalt street with high-contrast mirror reflections, atmospheric volumetric haze, and futuristic rooftop architectural beacon.',
    timeOfDay: 'night' as const,
  },
  {
    id: 'nordic',
    title: '🏛️ Nordic Travertine',
    badge: 'Minimalist',
    desc: 'Italian stone & pale oak',
    directives: 'Honed Italian Roman travertine facade slabs, natural pale oak wood balcony soffits, slim dark bronze window profiles, minimalist fountain courtyard, Scandinavian soft morning fog atmosphere, and lush pine landscaping.',
    timeOfDay: 'day' as const,
  },
  {
    id: 'dubai_gold',
    title: '💎 Dubai Gold Luxury',
    badge: 'Luxury',
    desc: 'Champagne gold & palm promenade',
    directives: 'Polished champagne-gold aluminum trim fins, high-contrast mirror Starphire curtain wall glass, illuminated Royal Palm promenade with dancing fountains, valet drop-off with luxury supercars, and glowing crown beacon.',
    timeOfDay: 'night' as const,
  },
  {
    id: 'obsidian',
    title: '🖤 Dark Obsidian',
    badge: 'Stealth',
    desc: 'Matte black & smoked glass',
    directives: 'Matte black architectural composite panels, deep smoked low-iron glass, continuous warm 2700K golden LED ribbon under each curved balcony slab, fluted basalt stone podium, and minimalist zen water mirrors.',
    timeOfDay: 'night' as const,
  },
  {
    id: 'coastal',
    title: '🌊 Coastal Wave',
    badge: 'Resort',
    desc: 'White ribbons & turquoise water',
    directives: 'Curved sculptural white fiber-reinforced concrete balcony ribbons, aquamarine-tinted low-iron glass balustrades, cantilevered glass sky pool with crystalline turquoise water, specimen Date Palms, and polished white marble plaza.',
    timeOfDay: 'day' as const,
  },
];

export default function ExteriorRenderStudio() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendFileInputRef = useRef<HTMLInputElement>(null);

  // Multiple Model inputs state
  const [modelImages, setModelImages] = useState<ModelAngleInput[]>([]);
  const [primaryAngleId, setPrimaryAngleId] = useState<string | null>(null);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);

  // Strict Floor Count Parameter
  const [floorCount, setFloorCount] = useState<string>('');

  // Minimal Controls (Day / Night, Custom Notes, Quality)
  const [timeOfDay, setTimeOfDay] = useState<'day' | 'night'>('night');
  const [extraDirectives, setExtraDirectives] = useState('');
  const [quality, setQuality] = useState<'medium' | 'high'>('medium');

  // AI Architect Agent & Themes Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Output & history state
  const [isRendering, setIsRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<ExteriorRenderHistoryItem[]>([]);
  const [viewingId, setViewingId] = useState<string | null>(null);

  // Multi-Angle Parallel State
  const [isGeneratingAngles, setIsGeneratingAngles] = useState(false);
  const [multiAngles, setMultiAngles] = useState<MultiAngleResult[]>([]);
  const [angleError, setAngleError] = useState<string | null>(null);

  const processFiles = (files: FileList | null, isAppend = false) => {
    if (!files || files.length === 0) return;

    const readPromises: Promise<ModelAngleInput>[] = Array.from(files).map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const b64 = ev.target?.result as string;
          resolve({
            id: Math.random().toString(36).slice(2),
            base64: b64,
            fileName: file.name,
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises).then((newItems) => {
      if (isAppend) {
        setModelImages((prev) => [...prev, ...newItems]);
      } else {
        setModelImages(newItems);
        if (newItems.length > 0) {
          setPrimaryAngleId(newItems[0].id);
          setActivePreviewId(newItems[0].id);
        }
        setRenderResult(null);
        setMultiAngles([]);
        setErrorMsg(null);
        setAngleError(null);
      }
    });
  };

  const handleInitialUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files, false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAppendUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files, true);
    if (appendFileInputRef.current) appendFileInputRef.current.value = '';
  };

  const handleRemoveImage = (idToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setModelImages((prev) => {
      const filtered = prev.filter((img) => img.id !== idToRemove);
      if (primaryAngleId === idToRemove && filtered.length > 0) {
        setPrimaryAngleId(filtered[0].id);
      }
      if (activePreviewId === idToRemove && filtered.length > 0) {
        setActivePreviewId(filtered[0].id);
      }
      return filtered;
    });
  };

  const handleSendMessage = async (overridePrompt?: string) => {
    const promptToSend = overridePrompt || chatInput;
    if (!promptToSend.trim() || isChatLoading) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      role: 'user',
      text: promptToSend.trim(),
      timestamp: Date.now(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!overridePrompt) setChatInput('');
    setIsChatLoading(true);

    try {
      const historyPayload = [...chatMessages, userMsg].map((m) => ({
        role: m.role,
        content: m.text,
      }));

      const res = await fetch('/api/exterior-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyPayload,
          currentDirectives: extraDirectives,
          timeOfDay,
          floorCount,
        }),
      });

      const data = await res.json();
      if (data.reply) {
        const assistantMsg: ChatMessage = {
          id: Math.random().toString(36).slice(2),
          role: 'assistant',
          text: data.reply,
          suggestedDirectives: data.suggestedDirectives,
          themeName: data.themeName,
          suggestedTimeOfDay: data.suggestedTimeOfDay,
          timestamp: Date.now(),
        };
        setChatMessages((prev) => [...prev, assistantMsg]);

        // Auto-apply directives to render prompt
        if (data.suggestedDirectives) {
          setExtraDirectives(data.suggestedDirectives);
          setActiveThemeId(data.themeName || 'AI Custom');
        }
        if (data.suggestedTimeOfDay === 'day' || data.suggestedTimeOfDay === 'night') {
          setTimeOfDay(data.suggestedTimeOfDay);
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setIsChatLoading(false);
    }
  };

  const applyThemePreset = (preset: typeof THEME_PRESETS[0]) => {
    setExtraDirectives(preset.directives);
    setTimeOfDay(preset.timeOfDay);
    setActiveThemeId(preset.id);
  };

  const handleRender = async () => {
    if (modelImages.length === 0 || isRendering) return;
    setIsRendering(true);
    setErrorMsg(null);
    setRenderResult(null);
    setMultiAngles([]);
    setAngleError(null);

    // Reorder images so primaryAngleId is first in the array
    const primaryImg = modelImages.find((img) => img.id === primaryAngleId) || modelImages[0];
    const otherImgs = modelImages.filter((img) => img.id !== primaryImg.id);
    const orderedBase64s = [primaryImg.base64, ...otherImgs.map((img) => img.base64)];

    try {
      const res = await fetch('/api/exterior-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelImages: orderedBase64s,
          floorCount: floorCount.trim() ? floorCount.trim() : undefined,
          timeOfDay,
          extraDirectives,
          quality,
        }),
      });
      const data = await res.json();
      if (data.render) {
        setRenderResult(data.render);
        const item: ExteriorRenderHistoryItem = {
          id: Math.random().toString(36).slice(2),
          renderBase64: data.render,
          primaryModelBase64: primaryImg.base64,
          allModelImages: orderedBase64s,
          floorCount: floorCount.trim() || undefined,
          modelCount: orderedBase64s.length,
          timeOfDay,
          timestamp: Date.now(),
        };
        setHistory((prev) => [item, ...prev]);
        setViewingId(item.id);
      } else {
        setErrorMsg(data.error || 'Render failed. Please try again.');
      }
    } catch (err) {
      setErrorMsg('Network error. Please check connection and retry.');
    } finally {
      setIsRendering(false);
    }
  };

  const handleGenerate3Angles = async () => {
    const activeRender = viewingItem?.renderBase64 || renderResult;
    if (!activeRender || isGeneratingAngles) return;
    setIsGeneratingAngles(true);
    setAngleError(null);

    // Provide the original SketchUp model angle screenshots as Shape/Geometry references
    const shapeImages = viewingItem?.allModelImages || (modelImages.length > 0 ? modelImages.map((m) => m.base64) : []);
    const activeFloorCount = viewingItem?.floorCount || (floorCount.trim() ? floorCount.trim() : undefined);

    try {
      const res = await fetch('/api/exterior-angles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          renderedBase64: activeRender,
          modelImages: shapeImages,
          floorCount: activeFloorCount,
          timeOfDay,
          extraDirectives,
          quality,
        }),
      });
      const data = await res.json();
      if (data.success && data.angles) {
        setMultiAngles(data.angles);
      } else {
        setAngleError(data.error || 'Failed to generate 3 professional angles.');
      }
    } catch (err) {
      setAngleError('Network error generating multi-angle views.');
    } finally {
      setIsGeneratingAngles(false);
    }
  };

  const downloadRender = (base64: string, label?: string) => {
    const a = document.createElement('a');
    a.href = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
    a.download = `exterior-${label || timeOfDay}-${Date.now()}.png`;
    a.click();
  };

  const downloadAllAngles = () => {
    multiAngles.forEach((a, i) => {
      setTimeout(() => {
        downloadRender(a.render, `${a.id}-${timeOfDay}`);
      }, i * 400);
    });
  };

  const viewingItem = viewingId ? history.find((h) => h.id === viewingId) : null;
  const displayRender = viewingItem?.renderBase64 || renderResult;
  const currentPreviewImage = modelImages.find((img) => img.id === activePreviewId) || modelImages[0];

  return (
    <div className="flex-1 flex flex-col xl:flex-row bg-[#08070b] text-white min-h-[calc(100vh-4rem)]">

      {/* ── LEFT / MAIN CONTENT AREA ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col p-4 lg:p-6 gap-6 overflow-y-auto max-w-7xl mx-auto w-full custom-scrollbar">

        {/* Top Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-orange-950/60 pb-4">
          <div>
            <h1 className="text-lg lg:text-xl font-black uppercase tracking-[3px] text-white flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-black shadow-[0_0_20px_rgba(245,158,11,0.4)]">
                <Building2 size={20} />
              </span>
              Exterior 3D Architectural CGI Studio
            </h1>
            <p className="text-[10px] text-amber-400/60 font-mono mt-1">
              Multi-Angle 3D Comprehension · Hyper-Realistic Lighting &amp; Glass · AI Theme Director
            </p>
          </div>

          {modelImages.length > 0 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-[9px] text-orange-400 hover:text-orange-200 uppercase font-bold cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-950/30 border border-orange-500/30"
            >
              <RefreshCw size={11} /> Replace Model Images
            </button>
          )}
        </div>

        {modelImages.length > 0 ? (
          <div className="flex flex-col gap-6">

            {/* Split View: Model Input + Primary Render Output */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Input Model Panel */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 font-mono flex items-center gap-1.5">
                    📐 1. Input 3D Model ({modelImages.length} {modelImages.length === 1 ? 'Angle' : 'Angles'} Uploaded)
                  </span>
                  <button
                    onClick={() => appendFileInputRef.current?.click()}
                    className="text-[9px] text-amber-300 hover:text-white uppercase font-bold cursor-pointer flex items-center gap-1 bg-amber-950/50 border border-amber-500/40 px-2.5 py-1 rounded-md"
                  >
                    <Plus size={11} /> Add Another Angle
                  </button>
                </div>

                {/* Main Active Preview Card */}
                <div className="relative rounded-xl overflow-hidden border border-amber-500/30 bg-black/60 shadow-lg flex items-center justify-center p-2 min-h-[380px]">
                  {currentPreviewImage && (
                    <img
                      src={currentPreviewImage.base64}
                      alt="SketchUp Model View"
                      className="w-full max-h-[440px] object-contain rounded-lg"
                    />
                  )}
                  <div className="absolute bottom-3 left-3 bg-black/85 backdrop-blur px-2.5 py-1 rounded-md text-[9px] font-mono text-amber-300 border border-amber-500/30 truncate max-w-[70%]">
                    📁 {currentPreviewImage?.fileName || '3D Model View'}
                  </div>

                  {/* Primary Target Badge */}
                  {currentPreviewImage?.id === primaryAngleId ? (
                    <div className="absolute top-3 left-3 bg-gradient-to-r from-amber-500 to-orange-500 text-black px-2.5 py-1 rounded-full text-[9px] font-bold font-mono uppercase tracking-wider flex items-center gap-1 shadow-[0_0_15px_rgba(245,158,11,0.5)]">
                      <Star size={11} className="fill-black" /> Primary Target View
                    </div>
                  ) : (
                    <button
                      onClick={() => currentPreviewImage && setPrimaryAngleId(currentPreviewImage.id)}
                      className="absolute top-3 left-3 bg-black/80 hover:bg-amber-500 hover:text-black text-amber-300 px-2.5 py-1 rounded-full text-[8px] font-mono uppercase tracking-wider border border-amber-500/40 transition-all cursor-pointer"
                    >
                      Set as Primary Target View
                    </button>
                  )}
                </div>

                {/* Multi-Image Thumbnail Gallery Selector */}
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                  {modelImages.map((img, idx) => {
                    const isSelected = img.id === activePreviewId;
                    const isPrimary = img.id === primaryAngleId;
                    return (
                      <div
                        key={img.id}
                        onClick={() => setActivePreviewId(img.id)}
                        className={`group/thumb relative rounded-lg overflow-hidden border cursor-pointer shrink-0 transition-all w-24 aspect-[4/3] ${
                          isSelected
                            ? 'border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                            : 'border-orange-950/60 hover:border-amber-500/50 bg-black/60'
                        }`}
                      >
                        <img
                          src={img.base64}
                          alt={`Angle ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {/* Primary Star Indicator */}
                        {isPrimary && (
                          <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-amber-400 text-black flex items-center justify-center shadow">
                            <Star size={9} className="fill-black" />
                          </div>
                        )}
                        {/* Remove Image Button */}
                        {modelImages.length > 1 && (
                          <button
                            onClick={(e) => handleRemoveImage(img.id, e)}
                            className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/80 hover:bg-red-500 text-gray-300 hover:text-white flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                            title="Remove angle"
                          >
                            <X size={10} />
                          </button>
                        )}
                        <div className="absolute bottom-0 inset-x-0 bg-black/80 px-1 py-0.5 text-[7px] text-gray-300 font-mono truncate">
                          Angle #{idx + 1}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Render Output Panel */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 font-mono flex items-center gap-1.5">
                    ✨ 2. Photorealistic Architectural CGI
                  </span>
                  {displayRender && !isRendering && (
                    <button
                      onClick={() => downloadRender(displayRender)}
                      className="text-[9px] text-amber-400 hover:text-white uppercase font-bold cursor-pointer flex items-center gap-1 bg-amber-950/50 border border-amber-500/40 px-2.5 py-1 rounded-md"
                    >
                      <Download size={11} /> Download High-Res
                    </button>
                  )}
                </div>

                <div className="relative rounded-xl overflow-hidden border border-amber-500/40 bg-black/80 shadow-2xl flex items-center justify-center p-2 min-h-[380px]">
                  {isRendering ? (
                    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center animate-pulse">
                      <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                        <Loader2 size={30} className="animate-spin text-amber-400" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-amber-300 uppercase tracking-widest font-mono">
                          Transforming into Architectural CGI...
                        </span>
                        <span className="text-[9px] text-gray-400 font-mono max-w-xs">
                          {modelImages.length > 1 ? `Cross-referencing ${modelImages.length} 3D viewpoints · ` : ''}
                          {floorCount ? `Locking ${floorCount} Floors · ` : ''}
                          Synthesizing Starphire glass optics &amp; {timeOfDay === 'night' ? 'dusk sky' : 'sunlight'}
                        </span>
                      </div>
                    </div>
                  ) : displayRender ? (
                    <img
                      src={displayRender.startsWith('data:') ? displayRender : `data:image/jpeg;base64,${displayRender}`}
                      alt="Rendered Architectural CGI"
                      className="w-full max-h-[440px] object-contain rounded-lg shadow-inner"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                      <Sparkles size={32} className="text-amber-500/40" />
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">
                        Ready to Generate First Render
                      </span>
                      <p className="text-[9px] text-gray-600 font-mono max-w-xs">
                        Configure Time of Day, optional Floor Count &amp; Theme in the sidebar, then click Generate below!
                      </p>
                    </div>
                  )}

                  {displayRender && !isRendering && (
                    <div className="absolute bottom-3 left-3 bg-black/85 backdrop-blur px-2.5 py-1 rounded-md text-[9px] font-mono text-emerald-400 border border-emerald-500/30">
                      ✓ 8K Octane Quality · {timeOfDay === 'night' ? '🌙 Night' : '☀️ Day'} {floorCount ? `· ${floorCount}F` : ''}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-300 font-mono">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* ── STEP 2: GENERATE 3 PROFESSIONAL ANGLES CARD ───────────────────── */}
            {displayRender && !isRendering && (
              <div className="rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-[#0c0903] via-[#050409] to-[#020512] p-5 shadow-[0_0_35px_rgba(245,158,11,0.2)] flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.5)] shrink-0">
                      <Camera size={20} className="text-black" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-[2.5px] text-amber-300 flex items-center gap-2">
                        ✨ Synthesize 3 Professional Architectural Angles
                      </h3>
                      <p className="text-[9px] text-gray-400 font-mono mt-0.5">
                        Uses Render #1 as ⭐ <span className="text-amber-300 font-bold">Design Authority</span> + 3D screenshots as 📐 <span className="text-amber-300 font-bold">Shape References</span> to render <span className="text-amber-300 font-bold">Hero 45°</span>, <span className="text-amber-300 font-bold">Street Level</span>, and <span className="text-amber-300 font-bold">Worm&apos;s Eye</span> in parallel!
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerate3Angles}
                    disabled={isGeneratingAngles}
                    className={`px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shrink-0 cursor-pointer ${
                      isGeneratingAngles
                        ? 'bg-gray-800 text-gray-400 cursor-not-allowed border border-gray-700'
                        : 'bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 hover:from-amber-300 hover:to-orange-400 text-black shadow-[0_0_25px_rgba(245,158,11,0.5)] hover:scale-[1.02]'
                    }`}
                  >
                    {isGeneratingAngles ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Generating 3 Angles in Parallel...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        Generate 3 Angles
                      </>
                    )}
                  </button>
                </div>

                {/* Angle Error Message */}
                {angleError && (
                  <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/40 text-[10px] text-red-300 font-mono">
                    ⚠️ {angleError}
                  </div>
                )}

                {/* 3 Angles Parallel Loading / Gallery Grid */}
                {(isGeneratingAngles || multiAngles.length > 0) && (
                  <div className="flex flex-col gap-3 pt-3 border-t border-amber-500/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 font-mono flex items-center gap-1.5">
                        <Layers size={13} /> 3 Architectural Viewpoints Portfolio
                      </span>
                      {multiAngles.length > 0 && !isGeneratingAngles && (
                        <button
                          type="button"
                          onClick={downloadAllAngles}
                          className="text-[9px] text-amber-400 hover:text-amber-200 uppercase font-bold cursor-pointer flex items-center gap-1 bg-amber-950/40 border border-amber-500/40 px-3 py-1 rounded-lg"
                        >
                          <Download size={11} /> Download All 3 Angles
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                      {/* Hero Angle Card */}
                      {(() => {
                        const heroResult = multiAngles.find((a) => a.id === 'hero_angle');
                        return (
                          <div className="rounded-xl border border-amber-500/30 bg-black/60 overflow-hidden flex flex-col shadow-lg">
                            <div className="p-2.5 bg-black/80 flex items-center justify-between border-b border-white/5 font-mono">
                              <span className="text-[9px] font-bold text-amber-300 uppercase flex items-center gap-1.5">
                                📸 Hero View (45°)
                              </span>
                              {heroResult && (
                                <button
                                  onClick={() => downloadRender(heroResult.render, 'hero-45')}
                                  className="text-gray-400 hover:text-white"
                                  title="Download"
                                >
                                  <Download size={11} />
                                </button>
                              )}
                            </div>

                            <div className="aspect-[4/3] relative flex items-center justify-center p-1 bg-black/90">
                              {isGeneratingAngles && !heroResult ? (
                                <div className="flex flex-col items-center gap-2 p-4 text-center animate-pulse">
                                  <Loader2 size={22} className="animate-spin text-amber-400" />
                                  <span className="text-[9px] text-amber-300 font-mono">Rendering Hero 45°...</span>
                                </div>
                              ) : heroResult ? (
                                <img
                                  src={heroResult.render.startsWith('data:') ? heroResult.render : `data:image/jpeg;base64,${heroResult.render}`}
                                  alt="Hero View"
                                  className="w-full h-full object-cover rounded-lg"
                                />
                              ) : (
                                <span className="text-[9px] text-gray-500 font-mono">Ready to render</span>
                              )}
                            </div>
                            <div className="p-2 bg-black/90 text-[8px] text-gray-400 font-mono truncate border-t border-white/5">
                              Dramatic elevated 3/4 perspective
                            </div>
                          </div>
                        );
                      })()}

                      {/* Street Level Card */}
                      {(() => {
                        const streetResult = multiAngles.find((a) => a.id === 'street_level');
                        return (
                          <div className="rounded-xl border border-amber-500/30 bg-black/60 overflow-hidden flex flex-col shadow-lg">
                            <div className="p-2.5 bg-black/80 flex items-center justify-between border-b border-white/5 font-mono">
                              <span className="text-[9px] font-bold text-amber-300 uppercase flex items-center gap-1.5">
                                🚶 Street Level
                              </span>
                              {streetResult && (
                                <button
                                  onClick={() => downloadRender(streetResult.render, 'street-level')}
                                  className="text-gray-400 hover:text-white"
                                  title="Download"
                                >
                                  <Download size={11} />
                                </button>
                              )}
                            </div>

                            <div className="aspect-[4/3] relative flex items-center justify-center p-1 bg-black/90">
                              {isGeneratingAngles && !streetResult ? (
                                <div className="flex flex-col items-center gap-2 p-4 text-center animate-pulse">
                                  <Loader2 size={22} className="animate-spin text-amber-400" />
                                  <span className="text-[9px] text-amber-300 font-mono">Rendering Street Level...</span>
                                </div>
                              ) : streetResult ? (
                                <img
                                  src={streetResult.render.startsWith('data:') ? streetResult.render : `data:image/jpeg;base64,${streetResult.render}`}
                                  alt="Street Level"
                                  className="w-full h-full object-cover rounded-lg"
                                />
                              ) : (
                                <span className="text-[9px] text-gray-500 font-mono">Ready to render</span>
                              )}
                            </div>
                            <div className="p-2 bg-black/90 text-[8px] text-gray-400 font-mono truncate border-t border-white/5">
                              Pedestrian eye-level upward view
                            </div>
                          </div>
                        );
                      })()}

                      {/* Worm's Eye Card */}
                      {(() => {
                        const wormResult = multiAngles.find((a) => a.id === 'worm_eye');
                        return (
                          <div className="rounded-xl border border-amber-500/30 bg-black/60 overflow-hidden flex flex-col shadow-lg">
                            <div className="p-2.5 bg-black/80 flex items-center justify-between border-b border-white/5 font-mono">
                              <span className="text-[9px] font-bold text-amber-300 uppercase flex items-center gap-1.5">
                                👁️ Worm&apos;s Eye
                              </span>
                              {wormResult && (
                                <button
                                  onClick={() => downloadRender(wormResult.render, 'worm-eye')}
                                  className="text-gray-400 hover:text-white"
                                  title="Download"
                                >
                                  <Download size={11} />
                                </button>
                              )}
                            </div>

                            <div className="aspect-[4/3] relative flex items-center justify-center p-1 bg-black/90">
                              {isGeneratingAngles && !wormResult ? (
                                <div className="flex flex-col items-center gap-2 p-4 text-center animate-pulse">
                                  <Loader2 size={22} className="animate-spin text-amber-400" />
                                  <span className="text-[9px] text-amber-300 font-mono">Rendering Worm&apos;s Eye...</span>
                                </div>
                              ) : wormResult ? (
                                <img
                                  src={wormResult.render.startsWith('data:') ? wormResult.render : `data:image/jpeg;base64,${wormResult.render}`}
                                  alt="Worm's Eye"
                                  className="w-full h-full object-cover rounded-lg"
                                />
                              ) : (
                                <span className="text-[9px] text-gray-500 font-mono">Ready to render</span>
                              )}
                            </div>
                            <div className="p-2 bg-black/90 text-[8px] text-gray-400 font-mono truncate border-t border-white/5">
                              Extreme upward shot from base to zenith
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Render Iterations History */}
            {history.length > 0 && (
              <div className="flex flex-col gap-3 pt-4 border-t border-orange-950/60">
                <h4 className="text-xs font-bold uppercase tracking-[2px] text-white flex items-center gap-2">
                  <Eye size={12} className="text-amber-400" />
                  Render Iterations History ({history.length})
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {history.map((h, idx) => {
                    return (
                      <div
                        key={h.id}
                        onClick={() => {
                          setViewingId(h.id);
                          setMultiAngles([]);
                        }}
                        className={`group/card relative rounded-xl overflow-hidden border cursor-pointer transition-all ${
                          viewingId === h.id
                            ? 'border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.4)]'
                            : 'border-orange-950/60 hover:border-amber-500/50 bg-black/60'
                        }`}
                      >
                        <img
                          src={h.renderBase64.startsWith('data:') ? h.renderBase64 : `data:image/jpeg;base64,${h.renderBase64}`}
                          alt={`Iteration #${history.length - idx}`}
                          className="w-full aspect-video object-cover group-hover/card:scale-105 transition-transform duration-300"
                        />
                        <div className="p-2 bg-black/90 flex items-center justify-between gap-1 text-[8px] font-mono border-t border-white/5">
                          <span className="text-amber-300 font-bold uppercase truncate">
                            {h.timeOfDay === 'night' ? '🌙 Night' : '☀️ Day'}{h.floorCount ? ` • ${h.floorCount}F` : ''} ({h.modelCount}v)
                          </span>
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); downloadRender(h.renderBase64, h.timeOfDay); }}
                              className="text-gray-400 hover:text-white"
                              title="Download"
                            >
                              <Download size={10} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setHistory((prev) => prev.filter((x) => x.id !== h.id));
                                if (viewingId === h.id) setViewingId(null);
                              }}
                              className="text-gray-500 hover:text-red-400"
                              title="Delete"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Empty State: Multi-Image Upload */
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-lg mx-auto py-16">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-950/60 to-orange-950/40 border border-amber-500/30 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
              <Building2 size={36} className="text-amber-400" />
            </div>
            <h2 className="text-base font-black uppercase tracking-[3px] text-white mb-2">
              Upload 1 to 4 SketchUp Model Angles
            </h2>
            <p className="text-xs text-amber-400/60 uppercase tracking-wider leading-relaxed mb-8 font-mono">
              Upload multiple screenshots (e.g. 3/4 perspective, side elevation, podium detail) so the AI comprehends the <strong>complete 3D architectural massing</strong> before generating your render!
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-3 px-8 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black uppercase tracking-widest text-xs rounded-xl transition-all shadow-[0_0_25px_rgba(245,158,11,0.4)] cursor-pointer"
            >
              <UploadCloud size={16} /> Choose Model Screenshots (Select 1-4)
            </button>
            <p className="text-[9px] text-gray-500 font-mono mt-3">
              Hold Shift/Ctrl or drag to select multiple image files at once.
            </p>
          </div>
        )}

        {/* Hidden File Inputs */}
        <input
          type="file"
          accept="image/*"
          multiple
          ref={fileInputRef}
          onChange={handleInitialUpload}
          className="hidden"
        />
        <input
          type="file"
          accept="image/*"
          multiple
          ref={appendFileInputRef}
          onChange={handleAppendUpload}
          className="hidden"
        />
      </div>

      {/* ── RIGHT / SIDEBAR CONTROLS ────────────────────────────────────────── */}
      <div className="w-full xl:w-96 border-t xl:border-t-0 xl:border-l border-orange-950/60 bg-[#060509]/95 backdrop-blur flex flex-col shrink-0">

        {/* Sidebar Header */}
        <div className="p-5 border-b border-orange-950/60 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[2.5px] text-white flex items-center gap-2">
              <Settings2 size={13} className="text-amber-400" /> Render Controls
            </h3>
            <p className="text-[9px] text-amber-400/50 mt-0.5">Lighting · Floors · Themes &amp; Chat</p>
          </div>
        </div>

        <div className="p-5 flex-1 flex flex-col gap-5 overflow-y-auto custom-scrollbar">

          {/* 1. Time of Day (Day / Night) */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5 font-mono">
              ☀️ 1. Time of Day
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTimeOfDay('day')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                  timeOfDay === 'day'
                    ? 'bg-amber-500/20 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)] text-amber-200'
                    : 'bg-black/40 border-white/10 text-gray-400 hover:border-amber-500/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sun size={15} className={timeOfDay === 'day' ? 'text-amber-400' : 'text-gray-400'} />
                  <span className="text-[11px] font-bold uppercase">☀️ Day</span>
                </div>
                <span className="text-[8px] text-amber-400/70 leading-tight font-bold">
                  ☀️ Crisp 5200K sun, clean Starphire glass, angled shadows &amp; palm plaza
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTimeOfDay('night')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                  timeOfDay === 'night'
                    ? 'bg-gradient-to-br from-amber-500/25 to-orange-500/20 border-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.35)] text-amber-200'
                    : 'bg-black/40 border-white/10 text-gray-400 hover:border-amber-500/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Moon size={15} className={timeOfDay === 'night' ? 'text-amber-400' : 'text-gray-400'} />
                  <span className="text-[11px] font-bold uppercase">🌙 Night / Sunset</span>
                </div>
                <span className="text-[8px] text-amber-400/70 leading-tight font-bold">
                  🔥 Fiery sunset sky, glowing LED ribbons, wet reflections
                </span>
              </button>
            </div>
          </div>

          {/* 2. Total Number of Floors (Strict Parameter) */}
          <div className="flex flex-col gap-2.5 border-t border-orange-950/60 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5 font-mono">
                <Building2 size={13} /> 2. Total Floors / Storeys (Strict)
              </span>
              {floorCount && (
                <button
                  type="button"
                  onClick={() => setFloorCount('')}
                  className="text-[8px] font-mono text-gray-500 hover:text-amber-300 underline cursor-pointer"
                >
                  Reset Auto
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={floorCount}
                  onChange={(e) => setFloorCount(e.target.value)}
                  placeholder="e.g. 35 (Auto if empty)"
                  className="w-full bg-black/60 border border-white/10 focus:border-amber-400 rounded-xl px-3 py-2 text-[10px] text-amber-200 focus:outline-none font-mono"
                />
              </div>
            </div>

            {/* Quick Floor Count Preset Chips */}
            <div className="flex flex-wrap gap-1.5">
              {['12', '24', '35', '45', '60', '80'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFloorCount(preset)}
                  className={`px-2 py-1 rounded-md text-[8px] font-mono font-bold transition-all cursor-pointer ${
                    floorCount === preset
                      ? 'bg-amber-400 text-black shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                      : 'bg-black/60 border border-white/10 text-gray-400 hover:border-amber-500/40 hover:text-amber-300'
                  }`}
                >
                  {preset} Fl
                </button>
              ))}
            </div>

            <p className="text-[8px] text-gray-400 font-mono leading-tight">
              {floorCount
                ? `🔒 Strict Mandate: AI will count & render EXACTLY ${floorCount} storeys from podium to crown.`
                : '💡 Leave empty to match the 3D model automatically, or enter a number to strictly lock the floor count.'}
            </p>
          </div>

          {/* 3. AI Design Agent & Themes (Interactive Chat Assistant) */}
          <div className="flex flex-col gap-3 border-t border-orange-950/60 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5 font-mono">
                <Bot size={13} className="text-amber-400" /> 3. AI Design Agent &amp; Themes
              </span>
              <button
                type="button"
                onClick={() => setIsChatOpen(!isChatOpen)}
                className="text-[9px] font-mono text-amber-400 hover:text-amber-200 flex items-center gap-1 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded cursor-pointer"
              >
                <MessageSquare size={10} />
                {isChatOpen ? 'Hide Chat' : 'Open Chat Agent'}
              </button>
            </div>

            {/* Quick Architectural Theme Presets */}
            <div className="grid grid-cols-2 gap-1.5">
              {THEME_PRESETS.map((preset) => {
                const isSelected = activeThemeId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyThemePreset(preset)}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                      isSelected
                        ? 'bg-gradient-to-r from-amber-500/25 to-orange-500/20 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)] text-amber-200'
                        : 'bg-black/40 border-white/10 text-gray-400 hover:border-amber-500/40 hover:text-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold truncate">{preset.title}</span>
                      {isSelected && <Check size={10} className="text-amber-400 shrink-0" />}
                    </div>
                    <span className="text-[7px] text-gray-400 font-mono truncate">{preset.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* Interactive Chat Drawer */}
            {isChatOpen && (
              <div className="rounded-xl border border-amber-500/30 bg-black/80 p-3 flex flex-col gap-2.5 shadow-lg">
                <div className="flex items-center justify-between border-b border-white/5 pb-1.5 font-mono text-[8px] text-gray-400">
                  <span className="flex items-center gap-1 text-amber-300 font-bold">
                    <Sparkles size={10} /> Senior Visualizer AI Agent
                  </span>
                  <span>Tell me your vibe, style or theme</span>
                </div>

                {/* Chat Messages Log */}
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {chatMessages.length === 0 ? (
                    <div className="text-[8px] text-gray-500 font-mono text-center py-3">
                      Ask anything! e.g. <em>&quot;I want a warm Mediterranean stone look with bougainvillea&quot;</em> or <em>&quot;Add dark obsidian glass and bronze fin accents&quot;</em>.
                    </div>
                  ) : (
                    chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col gap-1 text-[9px] font-mono rounded-lg p-2 ${
                          msg.role === 'user'
                            ? 'bg-amber-500/10 border border-amber-500/20 text-amber-200 self-end max-w-[90%]'
                            : 'bg-white/5 border border-white/10 text-gray-200 self-start max-w-[95%]'
                        }`}
                      >
                        <span className="text-[7px] font-bold uppercase text-gray-500">
                          {msg.role === 'user' ? '👤 You' : '🤖 AI Visualizer'}
                        </span>
                        <p className="leading-relaxed">{msg.text}</p>
                        {msg.suggestedDirectives && (
                          <div className="mt-1 p-1.5 rounded bg-black/60 border border-amber-500/30 flex items-center justify-between gap-1 text-[8px] text-amber-300">
                            <span className="truncate">⚡ Applied: {msg.themeName || 'Custom Theme'}</span>
                            <span className="text-emerald-400 font-bold shrink-0">✓ Injected</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {isChatLoading && (
                    <div className="flex items-center gap-1.5 text-[9px] text-amber-400 font-mono animate-pulse p-1">
                      <Loader2 size={11} className="animate-spin" />
                      Formulating architectural directives...
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Suggest ideas, materials, styles..."
                    className="flex-1 bg-black/60 border border-white/10 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-[9px] text-amber-200 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    disabled={isChatLoading || !chatInput.trim()}
                    className="p-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-gray-800 text-black cursor-pointer shrink-0 transition-all"
                    title="Send to AI Agent"
                  >
                    <Send size={11} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 4. Architect Directives (Synced Text) */}
          <div className="flex flex-col gap-2 border-t border-orange-950/60 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5 font-mono">
                <Send size={12} /> 4. Custom Directives (Injected in Prompt)
              </span>
              {extraDirectives && (
                <button
                  type="button"
                  onClick={() => {
                    setExtraDirectives('');
                    setActiveThemeId(null);
                  }}
                  className="text-[8px] font-mono text-gray-500 hover:text-amber-300 underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            <textarea
              value={extraDirectives}
              onChange={(e) => {
                setExtraDirectives(e.target.value);
                setActiveThemeId(null);
              }}
              placeholder="e.g. Add an infinity sky pool on the podium, champagne gold vertical fins, and palm trees."
              rows={3}
              className="w-full bg-black/60 border border-white/10 focus:border-amber-400 rounded-xl p-2.5 text-[10px] text-amber-200 resize-none focus:outline-none leading-relaxed font-mono"
            />
          </div>

          {/* 5. Quality Settings */}
          <div className="flex items-center justify-between border-t border-orange-950/60 pt-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5 font-mono">
              <Sparkles size={12} /> 5. Quality
            </span>
            <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => setQuality('medium')}
                className={`px-2.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                  quality === 'medium' ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                Medium
              </button>
              <button
                type="button"
                onClick={() => setQuality('high')}
                className={`px-2.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                  quality === 'high' ? 'bg-emerald-400 text-black shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                High
              </button>
            </div>
          </div>

        </div>

        {/* Generate Button (Sticky Bottom) */}
        <div className="p-5 border-t border-orange-950/60 shrink-0">
          <button
            type="button"
            onClick={handleRender}
            disabled={modelImages.length === 0 || isRendering}
            className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 transition-all ${
              modelImages.length === 0 || isRendering
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700'
                : 'bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 hover:from-amber-300 hover:to-orange-400 text-black cursor-pointer shadow-[0_0_30px_rgba(245,158,11,0.5)]'
            }`}
          >
            {isRendering ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Rendering {modelImages.length > 1 ? `(${modelImages.length} Views)` : ''}...
              </>
            ) : (
              <>
                <Sparkles size={15} />
                Generate {timeOfDay === 'night' ? 'Night' : 'Day'} Render {modelImages.length > 1 ? `(${modelImages.length} Views)` : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
