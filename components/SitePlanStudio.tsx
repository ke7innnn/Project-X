'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, 
  Sparkles, 
  Loader2, 
  Download, 
  Maximize2, 
  Trash2, 
  Plus, 
  MapPin, 
  Sun, 
  Moon, 
  Palette, 
  Sliders, 
  Eye, 
  Layers, 
  RotateCcw, 
  Send, 
  Terminal, 
  Check, 
  ChevronRight,
  Info,
  Compass,
  Building2,
  TreePine,
  Waves
} from 'lucide-react';

export interface ColorLegendItem {
  id: string;
  color: string;
  colorName: string;
  label: string;
}

export interface TextPinItem {
  id: string;
  x: number; // 0 - 100 percentage
  y: number; // 0 - 100 percentage
  text: string;
}

export interface SitePlanHistoryItem {
  id: string;
  renderUrl: string;
  originalUrl: string;
  prompt: string;
  lighting: string;
  timestamp: string;
}

const DEFAULT_COLOR_LEGEND: ColorLegendItem[] = [
  { id: '1', color: '#eab308', colorName: 'Yellow', label: 'High-Rise Residential Towers (Luxury Glass & Terraces)' },
  { id: '2', color: '#f472b6', colorName: 'Pink Pattern', label: 'Pedestrian Walkway Network & Podium Promenade' },
  { id: '3', color: '#22c55e', colorName: 'Green', label: 'Lush Botanical Landscaping, Tree Canopies & Central Park' },
  { id: '4', color: '#6b7280', colorName: 'Grey', label: 'Asphalt Access Roads, Driveways & Drop-off Roundabouts' },
  { id: '5', color: '#3b82f6', colorName: 'Blue', label: 'Crystalline Resort Infinity Swimming Pools & Water Features' },
  { id: '6', color: '#f97316', colorName: 'Orange', label: 'Recreational Clubhouse & Lifestyle Wellness Pavilion' },
  { id: '7', color: '#94a3b8', colorName: 'Striped Grey', label: 'Podium Deck, Deck Lounges & Outdoor Amenity Terrace' }
];

const PRESET_PINS = [
  'SWIMMING POOL',
  'TOWER A',
  'TOWER B',
  'CLUBHOUSE',
  'BOTANICAL GARDEN',
  'KIDS PLAY AREA',
  'TENNIS COURT',
  'DROP-OFF FOYER',
  'ROOFTOP HELIPAD'
];

export default function SitePlanStudio() {
  const [sitePlanImage, setSitePlanImage] = useState<string | null>(null);
  const [colorLegend, setColorLegend] = useState<ColorLegendItem[]>(DEFAULT_COLOR_LEGEND);
  const [textPins, setTextPins] = useState<TextPinItem[]>([]);
  const [isPinMode, setIsPinMode] = useState(false);
  const [isEyedropperMode, setIsEyedropperMode] = useState(false);
  const [activePinDraft, setActivePinDraft] = useState<{ x: number; y: number } | null>(null);
  const [pinInputText, setPinInputText] = useState('SWIMMING POOL');
  
  // Lighting, Camera & Quality
  const [lightingMode, setLightingMode] = useState<'day' | 'night' | 'custom'>('day');
  const [customTheme, setCustomTheme] = useState('Sunset Golden Hour with warm architectural highlights & soft horizon glow');
  const [quality, setQuality] = useState<'medium' | 'high'>('medium');
  const [chatPrompt, setChatPrompt] = useState('Render this masterplan with insane ultra-luxurious realism, glass facade towers, crystal blue swimming pools with water reflections, and lush tropical landscaping.');
  
  // Custom Color Key Modal / Input
  const [newColorHex, setNewColorHex] = useState('#a855f7');
  const [newColorName, setNewColorName] = useState('Purple');
  const [newColorLabel, setNewColorLabel] = useState('Sports Courts & Outdoor Fitness Plaza');
  const [showAddColorModal, setShowAddColorModal] = useState(false);

  // Generation & Output
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMilestone, setProgressMilestone] = useState('');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [masterPromptUsed, setMasterPromptUsed] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<SitePlanHistoryItem[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [showPromptInspector, setShowPromptInspector] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sitePlanImgRef = useRef<HTMLImageElement>(null);

  const getColorNameFromRgb = (r: number, g: number, b: number): string => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    
    if (max < 45) return 'Dark Grey / Asphalt';
    if (min > 225) return 'White / Paved Plaza';
    if (d < 25) return 'Grey / Roadway';
    
    if (r > 180 && g > 180 && b < 110) return 'Yellow / Tower Zone';
    if (r > 200 && g > 110 && b < 100) return 'Orange / Amenities';
    if (r > 200 && g < 150 && b > 130) return 'Pink / Promenade';
    if (r > 180 && g < 100 && b < 100) return 'Red / Special Zone';
    if (r < 110 && g > 150 && b < 130) return 'Green / Garden Park';
    if (r > 130 && g > 180 && b < 130) return 'Light Green / Lawn';
    if (r < 110 && g < 150 && b > 180) return 'Blue / Water Pool';
    if (r < 110 && g > 180 && b > 180) return 'Turquoise / Pool';
    if (r > 130 && g < 110 && b > 180) return 'Purple / Sports Deck';
    if (r > 130 && g > 90 && b < 70) return 'Brown / Boardwalk';
    return 'Site Zone';
  };

  const sampleColorFromCanvasPoint = (clientX: number, clientY: number) => {
    const imgEl = sitePlanImgRef.current;
    if (!imgEl) return;

    const rect = imgEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

    try {
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = imgEl.naturalWidth || rect.width;
      offscreenCanvas.height = imgEl.naturalHeight || rect.height;
      const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(imgEl, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
      const scaleX = offscreenCanvas.width / rect.width;
      const scaleY = offscreenCanvas.height / rect.height;
      const pixel = ctx.getImageData(Math.floor(x * scaleX), Math.floor(y * scaleY), 1, 1).data;
      const [r, g, b] = pixel;
      const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
      const inferredName = getColorNameFromRgb(r, g, b);

      setNewColorHex(hex);
      setNewColorName(inferredName);
      setNewColorLabel('');
      setShowAddColorModal(true);
      setIsEyedropperMode(false);
    } catch (err) {
      console.warn('Eyedropper color sampling error:', err);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setSitePlanImage(base64);
        setResultImage(null);
        setTextPins([]);
        setErrorMessage(null);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEyedropperMode) {
      sampleColorFromCanvasPoint(e.clientX, e.clientY);
      return;
    }

    if (!isPinMode || !canvasContainerRef.current) return;

    const rect = canvasContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setActivePinDraft({ x, y });
  };

  const handleConfirmPin = () => {
    if (!activePinDraft || !pinInputText.trim()) return;

    const newPin: TextPinItem = {
      id: Math.random().toString(),
      x: activePinDraft.x,
      y: activePinDraft.y,
      text: pinInputText.trim().toUpperCase()
    };

    setTextPins(prev => [...prev, newPin]);
    setActivePinDraft(null);
  };

  const handleDeletePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTextPins(prev => prev.filter(p => p.id !== id));
  };

  const handleAddColorKey = () => {
    if (!newColorLabel.trim()) return;

    const newItem: ColorLegendItem = {
      id: Math.random().toString(),
      color: newColorHex,
      colorName: newColorName.trim() || 'Custom Color',
      label: newColorLabel.trim()
    };

    setColorLegend(prev => [...prev, newItem]);
    setShowAddColorModal(false);
    setNewColorLabel('');
  };

  const handleDeleteColorKey = (id: string) => {
    setColorLegend(prev => prev.filter(c => c.id !== id));
  };

  const handleUpdateColorKey = (id: string, field: 'colorName' | 'label', value: string) => {
    setColorLegend(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  // Generate 3D Site Plan Render
  const handleGenerate3DSitePlan = async () => {
    if (!sitePlanImage || isGenerating) return;

    setIsGenerating(true);
    setErrorMessage(null);
    setProgressMilestone('Uploading Master Site Plan to Fal AI...');

    try {
      setTimeout(() => setProgressMilestone('AI Master Agent Synthesizing Realism Prompt...'), 1200);
      setTimeout(() => setProgressMilestone('Deploying OpenAI GPT Image 2 (Edit) Engine...'), 3500);
      setTimeout(() => setProgressMilestone('Simulating Raytraced Daylight & Landscape Volumetrics...'), 7500);
      setTimeout(() => setProgressMilestone('Finalizing High-Fidelity 3D Aerial Masterplan...'), 12000);

      const res = await fetch('/api/siteplan-to-3d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sitePlanBase64: sitePlanImage,
          colorLegend,
          textPins,
          chatPrompt,
          lightingMode,
          customTheme,
          quality
        })
      });

      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || '3D Site Plan generation failed');
      }

      setResultImage(data.url);
      setMasterPromptUsed(data.masterPrompt);

      const newHistoryItem: SitePlanHistoryItem = {
        id: Math.random().toString(),
        renderUrl: data.url,
        originalUrl: sitePlanImage,
        prompt: data.masterPrompt || chatPrompt,
        lighting: lightingMode === 'custom' ? customTheme : lightingMode.toUpperCase(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setHistory(prev => [newHistoryItem, ...prev]);
    } catch (err: any) {
      console.error('[SitePlanStudio] Error:', err);
      setErrorMessage(err.message || 'Error communicating with generation engine.');
    } finally {
      setIsGenerating(false);
      setProgressMilestone('');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden text-cyan-300 font-sans">
      
      {/* Top Studio Sub-Header */}
      <div className="px-8 py-3.5 border-b border-cyan-950/80 bg-[#060814]/90 backdrop-blur-md flex items-center justify-between z-20 select-none">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Compass size={16} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[2px] text-white flex items-center gap-2">
              <span>3D SITE PLAN & MASTERPLAN STUDIO</span>
              <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[9px] font-mono">GPT IMAGE 2 EDIT</span>
            </div>
            <p className="text-[10px] text-cyan-400/50 font-mono tracking-wide">
              Color Legend Mapping • Canvas Text Annotations • AI Master Prompt Agent • Day/Night Lighting
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
            className="hidden" 
          />

          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-1.5 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow"
          >
            <UploadCloud size={13} /> {sitePlanImage ? 'Replace Site Plan' : 'Upload Site Plan'}
          </button>

          {sitePlanImage && (
            <button
              onClick={() => {
                setSitePlanImage(null);
                setResultImage(null);
                setTextPins([]);
              }}
              className="px-2.5 py-1.5 bg-red-950/20 hover:bg-red-900/40 border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer"
              title="Clear Canvas"
            >
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Main Studio Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left / Center Viewport: Interactive Site Plan Canvas & 3D Render Output */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar relative bg-[#04060f]">
          
          {sitePlanImage ? (
            <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
              
              {/* Canvas Controls Bar */}
              <div className="flex items-center justify-between bg-black/60 border border-cyan-900/40 rounded-xl p-3 shadow-lg flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Pin Tool Button */}
                  <button
                    onClick={() => {
                      setIsPinMode(!isPinMode);
                      if (isEyedropperMode) setIsEyedropperMode(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                      isPinMode 
                        ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.5)] animate-pulse font-extrabold' 
                        : 'bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400'
                    }`}
                  >
                    <MapPin size={14} />
                    {isPinMode ? '📍 Click on Image to Place Pin' : '+ Place Text Pin Tool'}
                  </button>

                  {/* Eyedropper / Color Picker Tool Button */}
                  <button
                    onClick={() => {
                      setIsEyedropperMode(!isEyedropperMode);
                      if (isPinMode) setIsPinMode(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                      isEyedropperMode 
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-[0_0_18px_rgba(236,72,153,0.6)] animate-pulse font-extrabold' 
                        : 'bg-purple-950/40 text-purple-300 border border-purple-500/30 hover:border-purple-400'
                    }`}
                  >
                    <Palette size={14} />
                    {isEyedropperMode ? '🎯 Tap Zone to Sample Color' : '🎨 Pick Color from Image'}
                  </button>

                  {textPins.length > 0 && (
                    <span className="text-[10px] font-mono text-cyan-400/70 bg-cyan-950/30 px-2 py-1 rounded border border-cyan-900/40">
                      {textPins.length} Pin{textPins.length > 1 ? 's' : ''} Placed
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-400/60">
                  <span>{isEyedropperMode ? 'Tap anywhere on the site plan to extract its exact color code' : 'Click zone to add text pin or pick color'}</span>
                </div>
              </div>

              {/* Interactive Canvas Container with Pin Overlay */}
              <div className="relative w-full rounded-2xl border border-cyan-500/30 bg-black/90 shadow-2xl p-4 flex items-center justify-center min-h-[380px] overflow-hidden group">
                <div 
                  ref={canvasContainerRef}
                  onClick={handleCanvasClick}
                  className={`relative max-w-full max-h-[500px] inline-block select-none rounded-xl overflow-hidden ${
                    isEyedropperMode 
                      ? 'cursor-crosshair ring-2 ring-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.4)]' 
                      : isPinMode 
                      ? 'cursor-crosshair ring-2 ring-amber-400/50' 
                      : 'cursor-default'
                  }`}
                >
                  <img 
                    ref={sitePlanImgRef}
                    src={sitePlanImage} 
                    alt="Master Site Plan" 
                    crossOrigin="anonymous"
                    className="w-full h-auto max-h-[480px] object-contain rounded-xl pointer-events-auto"
                  />

                  {/* Rendered Text Pin Markers */}
                  {textPins.map((pin) => (
                    <div
                      key={pin.id}
                      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 z-30 group/pin pointer-events-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1 bg-amber-500 text-black text-[9px] font-black font-mono px-2 py-0.5 rounded-full shadow-[0_0_12px_rgba(245,158,11,0.9)] border border-amber-200 uppercase tracking-tighter whitespace-nowrap animate-bounce-subtle">
                        <MapPin size={10} className="shrink-0" />
                        <span>{pin.text}</span>
                        <button
                          onClick={(e) => handleDeletePin(pin.id, e)}
                          className="w-3.5 h-3.5 rounded-full bg-black/30 hover:bg-red-600 text-white flex items-center justify-center ml-0.5 transition-colors cursor-pointer text-[8px]"
                          title="Delete pin"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Active Draft Pin Popover */}
                  {activePinDraft && (
                    <div 
                      style={{ left: `${activePinDraft.x}%`, top: `${activePinDraft.y}%` }}
                      className="absolute -translate-x-1/2 -translate-y-full z-40 mb-2 p-3 bg-black/95 border border-amber-400 rounded-xl shadow-[0_0_25px_rgba(245,158,11,0.6)] flex flex-col gap-2 min-w-[220px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 font-mono flex items-center gap-1">
                        <MapPin size={11} /> Label This Location
                      </span>
                      
                      <input 
                        type="text" 
                        value={pinInputText}
                        onChange={(e) => setPinInputText(e.target.value)}
                        placeholder="e.g. SWIMMING POOL, CLUBHOUSE"
                        className="w-full bg-black border border-amber-500/40 rounded px-2 py-1 text-xs text-amber-200 font-mono focus:outline-none focus:border-amber-400"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleConfirmPin();
                          if (e.key === 'Escape') setActivePinDraft(null);
                        }}
                      />

                      {/* Quick Presets */}
                      <div className="flex flex-wrap gap-1 max-w-[210px]">
                        {PRESET_PINS.slice(0, 4).map(preset => (
                          <button
                            key={preset}
                            onClick={() => setPinInputText(preset)}
                            className="px-1.5 py-0.5 bg-amber-500/10 hover:bg-amber-500/30 text-amber-300 text-[8px] font-mono rounded border border-amber-500/20"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-amber-500/20">
                        <button
                          onClick={() => setActivePinDraft(null)}
                          className="px-2 py-1 text-[9px] text-gray-400 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleConfirmPin}
                          className="px-3 py-1 bg-amber-500 text-black text-[9px] font-bold uppercase rounded font-mono hover:bg-amber-400 shadow"
                        >
                          Place Pin
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Generated 3D Masterplan Output Card */}
              {resultImage && (
                <div className="rounded-2xl border border-cyan-400/50 bg-[#020512] shadow-[0_0_30px_rgba(0,240,255,0.2)] p-5 flex flex-col gap-4 animate-fadeIn">
                  <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                      <h3 className="text-sm font-black uppercase tracking-[3px] text-white">
                        SYNTHESIZED 3D MASTERPLAN AERIAL RENDER
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowPromptInspector(!showPromptInspector)}
                        className="px-2.5 py-1 bg-cyan-950/40 hover:bg-cyan-900 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold rounded flex items-center gap-1 font-mono"
                      >
                        <Terminal size={12} /> {showPromptInspector ? 'Hide Prompt' : 'View AI Prompt'}
                      </button>

                      <button
                        onClick={() => setLightboxImage(resultImage)}
                        className="px-2.5 py-1 bg-black hover:bg-cyan-950 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold rounded flex items-center gap-1"
                      >
                        <Maximize2 size={12} /> Fullscreen
                      </button>

                      <a
                        href={resultImage}
                        download="3d-site-masterplan.png"
                        className="px-3 py-1 bg-cyan-500 text-black text-[10px] font-black uppercase rounded tracking-wider flex items-center gap-1 shadow hover:bg-cyan-400 font-mono"
                      >
                        <Download size={12} /> Download 3D Render
                      </a>
                    </div>
                  </div>

                  {/* AI Synthesized Prompt Inspector */}
                  {showPromptInspector && masterPromptUsed && (
                    <div className="p-3.5 bg-black/80 border border-cyan-500/30 rounded-xl text-[11px] font-mono text-cyan-200/90 whitespace-pre-wrap leading-relaxed shadow-inner">
                      <div className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <Terminal size={11} /> AI Prompt Agent Output (Fed into GPT Image 2 Edit)
                      </div>
                      {masterPromptUsed}
                    </div>
                  )}

                  {/* Result Image Frame */}
                  <div className="relative rounded-xl overflow-hidden bg-black p-2 border border-white/10 flex items-center justify-center">
                    <img 
                      src={resultImage} 
                      alt="3D Masterplan Render" 
                      className="w-full max-h-[550px] object-contain rounded-lg shadow-2xl"
                    />
                  </div>
                </div>
              )}

              {/* Generation Loading State Card */}
              {isGenerating && (
                <div className="p-8 rounded-2xl border border-cyan-400/50 bg-[#020512]/90 shadow-[0_0_30px_rgba(0,240,255,0.25)] flex flex-col items-center justify-center gap-4 text-center animate-pulse">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
                    <Compass className="absolute inset-0 m-auto text-cyan-400 animate-pulse" size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-[3px] text-white mb-1">
                      SYNTHESIZING PHOTOREALISTIC 3D MASTERPLAN...
                    </h3>
                    <p className="text-xs font-mono text-cyan-400 tracking-wider">
                      {progressMilestone || 'Processing zoning geometries and landscape volumetrics...'}
                    </p>
                  </div>
                </div>
              )}

              {/* Site Plan Render History Gallery */}
              {history.length > 0 && (
                <div className="flex flex-col gap-3 pt-4 border-t border-cyan-950/60">
                  <h4 className="text-xs font-bold uppercase tracking-[2px] text-white">
                    Masterplan Iterations History ({history.length})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {history.map((h, i) => (
                      <div 
                        key={h.id}
                        className="group/card relative rounded-xl border border-cyan-900/40 bg-black/60 overflow-hidden hover:border-cyan-400 transition-all cursor-pointer"
                        onClick={() => setResultImage(h.renderUrl)}
                      >
                        <img 
                          src={h.renderUrl} 
                          alt={`Iteration #${i + 1}`} 
                          className="w-full aspect-video object-cover group-hover/card:scale-105 transition-transform duration-300"
                        />
                        <div className="p-2 flex items-center justify-between text-[9px] font-mono text-cyan-400/70 bg-black/90">
                          <span>Option #{history.length - i}</span>
                          <span className="uppercase text-amber-400">{h.lighting}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : (
            /* Empty State: Prompt user to upload a site plan */
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center max-w-md mx-auto">
              <div className="w-20 h-20 rounded-3xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center mb-6 text-cyan-400 shadow-[0_0_30px_rgba(0,240,255,0.15)]">
                <Compass size={36} />
              </div>
              <h2 className="text-lg font-bold tracking-[3px] uppercase text-white mb-2">
                UPLOAD MASTER SITE PLAN / ZONING DIAGRAM
              </h2>
              <p className="text-xs text-cyan-400/60 uppercase tracking-wider mb-8 leading-relaxed">
                Upload your 2D colored site plan (with building footprints, roads, gardens, and amenities). 
                The AI Prompt Agent will map every color zone & text pin to synthesize a crazy realistic 3D aerial masterplan render!
              </p>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3 px-8 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-[0_0_25px_rgba(0,240,255,0.3)] cursor-pointer"
              >
                <UploadCloud size={16} /> Choose Site Plan Image
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Zoning Color Legend, Atmosphere & AI Prompt Agent Controls */}
        <div className="w-[380px] border-l border-cyan-950/80 bg-[#030612]/95 backdrop-blur-md flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-10">
          
          <div className="p-5 border-b border-cyan-950/80 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[2.5px] text-white flex items-center gap-2">
                <Sliders size={14} className="text-cyan-400" /> ZONING & ATMOSPHERE ENGINE
              </h3>
              <p className="text-[9px] text-cyan-400/50 font-mono mt-0.5">Configure color rules, lighting & directives</p>
            </div>
          </div>

          <div className="flex-1 p-5 flex flex-col gap-5 overflow-y-auto custom-scrollbar font-mono">
            
            {errorMessage && (
              <div className="p-3 bg-red-950/30 border border-red-500/40 rounded-lg text-[10px] text-red-300">
                ⚠️ {errorMessage}
              </div>
            )}

            {/* 1. Zoning Color Legend Key-Value Mapping Table */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                  <Palette size={12} /> 1. Zoning Color Key-Values
                </span>
                <button
                  onClick={() => setShowAddColorModal(true)}
                  className="text-[9px] text-cyan-400 hover:text-cyan-200 flex items-center gap-1 uppercase font-bold cursor-pointer"
                >
                  <Plus size={11} /> Add Key
                </button>
              </div>

              <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                {colorLegend.map((item) => (
                  <div 
                    key={item.id}
                    className="p-2 rounded-lg bg-black/60 border border-white/10 hover:border-cyan-500/30 flex items-center justify-between gap-2 text-[10px]"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div 
                        className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/30 shadow"
                        style={{ backgroundColor: item.color }} 
                      />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-bold text-white uppercase text-[9px] truncate">
                          {item.colorName}
                        </span>
                        <input
                          type="text"
                          value={item.label}
                          onChange={(e) => handleUpdateColorKey(item.id, 'label', e.target.value)}
                          className="bg-transparent border-b border-transparent hover:border-cyan-500/30 focus:border-cyan-400 text-[9px] text-cyan-300 truncate focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteColorKey(item.id)}
                      className="text-gray-500 hover:text-red-400 text-[10px] p-1 cursor-pointer"
                      title="Delete key"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Custom Color Key Modal / Inline Form */}
              {showAddColorModal && (
                <div className="p-3 bg-black/95 border-2 border-amber-400/80 rounded-xl flex flex-col gap-2 shadow-[0_0_25px_rgba(245,158,11,0.3)] animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-amber-300 flex items-center gap-1.5 font-mono">
                      <Palette size={12} /> Color Key (Tapped/Selected)
                    </span>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {newColorHex.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input 
                      type="color" 
                      value={newColorHex} 
                      onChange={(e) => setNewColorHex(e.target.value)}
                      className="w-8 h-8 rounded border border-white/30 cursor-pointer bg-transparent shrink-0"
                    />
                    <input 
                      type="text"
                      placeholder="Color Name (e.g. Yellow, Olive Green)"
                      value={newColorName}
                      onChange={(e) => setNewColorName(e.target.value)}
                      className="flex-1 bg-black border border-white/20 rounded px-2.5 py-1 text-[10px] text-white font-mono focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <input 
                    type="text"
                    placeholder="3D Architectural Meaning (e.g. Swimming Pool / Plaza)"
                    value={newColorLabel}
                    onChange={(e) => setNewColorLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddColorKey();
                      if (e.key === 'Escape') setShowAddColorModal(false);
                    }}
                    autoFocus
                    className="w-full bg-black border border-amber-500/50 rounded px-2.5 py-1.5 text-[10px] text-amber-200 font-mono focus:border-amber-400 focus:outline-none placeholder:text-gray-600"
                  />

                  <div className="flex justify-end gap-1.5 pt-1 border-t border-white/10">
                    <button 
                      onClick={() => setShowAddColorModal(false)}
                      className="px-2.5 py-1 text-[9px] text-gray-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleAddColorKey}
                      className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black text-[9px] font-bold uppercase rounded font-mono shadow"
                    >
                      Save Color Key
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Lighting & Atmosphere Engine */}
            <div className="flex flex-col gap-2.5 border-t border-cyan-950/80 pt-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                <Sun size={12} /> 2. Lighting & Atmosphere
              </span>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => setLightingMode('day')}
                  className={`p-2 rounded-lg border text-[9px] font-bold uppercase flex flex-col items-center gap-1 transition-all cursor-pointer ${
                    lightingMode === 'day'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                      : 'bg-black/40 border-white/10 text-gray-400 hover:border-cyan-500/30'
                  }`}
                >
                  <Sun size={14} className={lightingMode === 'day' ? 'text-amber-400' : 'text-gray-400'} />
                  <span>☀️ Day</span>
                </button>

                <button
                  onClick={() => setLightingMode('night')}
                  className={`p-2 rounded-lg border text-[9px] font-bold uppercase flex flex-col items-center gap-1 transition-all cursor-pointer ${
                    lightingMode === 'night'
                      ? 'bg-indigo-500/20 border-indigo-400 text-indigo-200 shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                      : 'bg-black/40 border-white/10 text-gray-400 hover:border-cyan-500/30'
                  }`}
                >
                  <Moon size={14} className={lightingMode === 'night' ? 'text-indigo-400' : 'text-gray-400'} />
                  <span>🌙 Night</span>
                </button>

                <button
                  onClick={() => setLightingMode('custom')}
                  className={`p-2 rounded-lg border text-[9px] font-bold uppercase flex flex-col items-center gap-1 transition-all cursor-pointer ${
                    lightingMode === 'custom'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(0,240,255,0.3)]'
                      : 'bg-black/40 border-white/10 text-gray-400 hover:border-cyan-500/30'
                  }`}
                >
                  <Sparkles size={14} className={lightingMode === 'custom' ? 'text-cyan-400' : 'text-gray-400'} />
                  <span>🌅 Custom</span>
                </button>
              </div>

              {lightingMode === 'custom' && (
                <input 
                  type="text"
                  value={customTheme}
                  onChange={(e) => setCustomTheme(e.target.value)}
                  placeholder="e.g. Sunset Golden Hour with long cinematic shadows"
                  className="w-full bg-black/60 border border-cyan-500/40 rounded-lg p-2 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400"
                />
              )}
            </div>

            {/* 3. Natural Language Chat & Design Directives */}
            <div className="flex flex-col gap-2 border-t border-cyan-950/80 pt-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                <Send size={12} /> 3. Architect Chat & Directives
              </span>
              <textarea
                value={chatPrompt}
                onChange={(e) => setChatPrompt(e.target.value)}
                placeholder="Instruct the AI: e.g. Add an infinity swimming pool in the garden where POOL is written, with palm trees and glass towers."
                rows={3}
                className="w-full bg-black/60 border border-white/10 focus:border-cyan-400 rounded-lg p-2.5 text-[10px] text-cyan-200 font-mono resize-none focus:outline-none leading-relaxed"
              />
            </div>

            {/* 4. Camera Angle & Quality Settings */}
            <div className="flex flex-col gap-2 border-t border-cyan-950/80 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                  <Compass size={12} /> Camera Angle
                </span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-bold">
                  90° Direct Top View Only
                </span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                  <Sparkles size={12} /> GPT Image 2 Quality
                </span>
                <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded-lg border border-white/10">
                  <button
                    onClick={() => setQuality('medium')}
                    className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all cursor-pointer ${
                      quality === 'medium' 
                        ? 'bg-cyan-500 text-black shadow' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Medium
                  </button>
                  <button
                    onClick={() => setQuality('high')}
                    className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all cursor-pointer ${
                      quality === 'high' 
                        ? 'bg-emerald-400 text-black shadow' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    High
                  </button>
                </div>
              </div>
            </div>

            {/* Execute Generation Button */}
            <div className="pt-2">
              <button
                onClick={handleGenerate3DSitePlan}
                disabled={!sitePlanImage || isGenerating}
                className={`w-full py-3.5 rounded-xl font-mono text-xs font-black uppercase tracking-[2px] flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  !sitePlanImage || isGenerating
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                    : 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-black shadow-[0_0_25px_rgba(16,185,129,0.4)] hover:shadow-[0_0_35px_rgba(0,240,255,0.6)] hover:scale-[1.01]'
                }`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>SYNTHESIZING 3D MASTERPLAN...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>SYNTHESIZE 3D MASTERPLAN</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>

      </div>

      {/* Fullscreen Lightbox Modal */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-6 animate-fadeIn select-none cursor-zoom-out"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-6xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img 
              src={lightboxImage} 
              alt="3D Masterplan Fullscreen Inspection" 
              className="max-w-full max-h-[82vh] object-contain rounded-xl shadow-2xl border border-cyan-400/40 bg-black"
            />
            <div className="mt-4 flex items-center gap-4">
              <a
                href={lightboxImage}
                download="3d-site-masterplan.png"
                className="px-4 py-2 bg-cyan-500 text-black font-bold uppercase text-xs rounded-lg flex items-center gap-2 shadow"
              >
                <Download size={14} /> Download Full-Res
              </a>
              <button
                onClick={() => setLightboxImage(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold uppercase text-xs rounded-lg"
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
