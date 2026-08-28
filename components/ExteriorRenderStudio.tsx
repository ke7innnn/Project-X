'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud, Sparkles, Download, RefreshCw, Loader2, Building2,
  Sun, Moon, Camera, Settings2, Eye, Trash2, Send, Layers, Plus, Star, X
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

export default function ExteriorRenderStudio() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendFileInputRef = useRef<HTMLInputElement>(null);

  // Multiple Model inputs state
  const [modelImages, setModelImages] = useState<ModelAngleInput[]>([]);
  const [primaryAngleId, setPrimaryAngleId] = useState<string | null>(null);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);

  // Minimal Controls (Day / Night, Custom Notes, Quality)
  const [timeOfDay, setTimeOfDay] = useState<'day' | 'night'>('night');
  const [extraDirectives, setExtraDirectives] = useState('');
  const [quality, setQuality] = useState<'medium' | 'high'>('medium');

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

    try {
      const res = await fetch('/api/exterior-angles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          renderedBase64: activeRender,
          modelImages: shapeImages,
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
    <div className="flex flex-1 overflow-hidden bg-[#020510] text-white font-sans">
      {/* ── Left: Viewport & Outputs ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-6 gap-6">

        {/* Section Header */}
        <div className="flex items-center justify-between pb-4 border-b border-orange-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.5)]">
              <Building2 size={18} className="text-black" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-[3px] text-white">Exterior 3D Render Studio</h2>
              <p className="text-[9px] text-amber-400/60 font-mono uppercase tracking-wider">
                Multi-Angle SketchUp Comprehension → Ultra-Luxury CGI → 3-Angle Synthesis
              </p>
            </div>
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
                        <div className="absolute bottom-0 inset-x-0 bg-black/80 text-[7px] text-amber-200 font-mono text-center py-0.5 truncate px-1">
                          Angle #{idx + 1}
                        </div>
                      </div>
                    );
                  })}

                  {/* Add Angle Thumbnail Button */}
                  <button
                    onClick={() => appendFileInputRef.current?.click()}
                    className="w-24 aspect-[4/3] rounded-lg border border-dashed border-amber-500/40 hover:border-amber-400 bg-black/40 hover:bg-amber-950/20 text-amber-300 flex flex-col items-center justify-center gap-1 cursor-pointer shrink-0 transition-all text-center p-1"
                  >
                    <Plus size={14} />
                    <span className="text-[8px] font-mono font-bold uppercase">+ Add Angle</span>
                  </button>
                </div>
              </div>

              {/* Output Render Panel */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 font-mono flex items-center gap-1.5">
                    ✨ 2. Primary 3D Render Output
                  </span>
                  {displayRender && (
                    <button
                      onClick={() => downloadRender(displayRender, timeOfDay)}
                      className="text-[9px] text-emerald-400 hover:text-emerald-200 uppercase font-bold cursor-pointer flex items-center gap-1 bg-emerald-950/40 border border-emerald-500/40 px-2.5 py-1 rounded-md"
                    >
                      <Download size={11} /> Download 8K
                    </button>
                  )}
                </div>

                {isRendering ? (
                  <div className="rounded-xl border-2 border-orange-500/50 bg-[#020512]/90 shadow-[0_0_40px_rgba(245,158,11,0.25)] flex flex-col items-center justify-center gap-3.5 min-h-[380px] p-6 text-center animate-pulse">
                    <div className="relative">
                      <div className="w-14 h-14 rounded-full border-2 border-orange-500/30 border-t-amber-400 animate-spin" />
                      <Building2 className="absolute inset-0 m-auto text-amber-400 animate-pulse" size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[3px] text-white mb-1">
                        SYNTHESIZING 3D MULTI-ANGLE EXTERIOR...
                      </p>
                      <p className="text-[9px] font-mono text-amber-400 tracking-wider">
                        {timeOfDay === 'night'
                          ? `Comprehending ${modelImages.length} angles → applying fiery sunset sky, 3000K interior glows & LED balcony ribbons...`
                          : `Comprehending ${modelImages.length} angles → applying angled golden sunlight, glass reflections & sky gardens...`}
                      </p>
                    </div>
                  </div>
                ) : displayRender ? (
                  <div className="relative rounded-xl overflow-hidden border border-emerald-500/40 bg-black shadow-[0_0_35px_rgba(16,185,129,0.15)] flex items-center justify-center p-2 min-h-[380px]">
                    <img
                      src={displayRender.startsWith('data:') ? displayRender : `data:image/jpeg;base64,${displayRender}`}
                      alt="Photorealistic Exterior Render"
                      className="w-full max-h-[440px] object-contain rounded-lg"
                    />
                    <div className="absolute top-4 right-4 flex items-center gap-1.5">
                      <span className="px-2.5 py-1 bg-black/85 backdrop-blur text-amber-300 text-[8px] font-mono font-bold uppercase tracking-wider rounded-full border border-amber-500/40">
                        {timeOfDay === 'night' ? '🌙 Night / Sunset Glow' : '☀️ Brilliant Day'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-orange-950/60 bg-black/40 flex flex-col items-center justify-center min-h-[380px] text-center p-6">
                    <Building2 size={36} className="text-orange-900/60 mb-3" />
                    <p className="text-xs font-bold uppercase tracking-[2px] text-white/80 mb-1">
                      Ready to Render ({modelImages.length} {modelImages.length === 1 ? 'Angle' : 'Angles'} Loaded)
                    </p>
                    <p className="text-[9px] text-amber-400/50 font-mono uppercase tracking-wider">
                      Select Day or Night &amp; hit Generate Render
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/40 text-[10px] text-red-300 font-mono">
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
                        Locks 100% of this design, materials &amp; lighting, then renders <span className="text-amber-300 font-bold">Hero 45°</span>, <span className="text-amber-300 font-bold">Street Level</span>, and <span className="text-amber-300 font-bold">Worm&apos;s Eye</span> in parallel!
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
                              Pedestrian human eye-level looking up
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
                          <span className="text-amber-300 font-bold uppercase">
                            {h.timeOfDay === 'night' ? '🌙 Night' : '☀️ Day'} ({h.modelCount} {h.modelCount === 1 ? 'view' : 'views'})
                          </span>
                          <div className="flex gap-1.5">
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

      {/* ── Right: Clean Sidebar Controls ─────────────────────────────────── */}
      <div className="w-[340px] border-l border-orange-950/70 bg-[#030611]/95 backdrop-blur-md flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.6)] z-10 font-mono">

        {/* Sidebar Header */}
        <div className="p-5 border-b border-orange-950/60 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[2.5px] text-white flex items-center gap-2">
              <Settings2 size={13} className="text-amber-400" /> Render Controls
            </h3>
            <p className="text-[9px] text-amber-400/50 mt-0.5">Lighting · Directives · Quality</p>
          </div>
        </div>

        <div className="p-5 flex-1 flex flex-col gap-5 overflow-y-auto custom-scrollbar">

          {/* 1. Time of Day (Day / Night) */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
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
                  ☀️ Golden angled sun, champagne gold glints, mirror sky reflections &amp; sky gardens
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

          {/* 2. Architect Directives (Optional Text) */}
          <div className="flex flex-col gap-2 border-t border-orange-950/60 pt-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
              <Send size={12} /> 2. Architect Directives (Optional)
            </span>
            <textarea
              value={extraDirectives}
              onChange={(e) => setExtraDirectives(e.target.value)}
              placeholder="e.g. Add an infinity sky pool on the podium, champagne gold vertical fins, and palm trees."
              rows={3}
              className="w-full bg-black/60 border border-white/10 focus:border-amber-400 rounded-xl p-2.5 text-[10px] text-amber-200 resize-none focus:outline-none leading-relaxed"
            />
          </div>

          {/* 3. Quality Settings */}
          <div className="flex items-center justify-between border-t border-orange-950/60 pt-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
              <Sparkles size={12} /> Quality
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
