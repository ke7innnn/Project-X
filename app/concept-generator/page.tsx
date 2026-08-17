'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Sparkles, 
  Loader2, 
  Download, 
  Maximize2, 
  Upload, 
  RotateCcw, 
  Copy, 
  Check, 
  Sliders, 
  Layers, 
  Compass, 
  Building,
  Image as ImageIcon,
  CheckCircle2,
  FileCode,
  Info
} from 'lucide-react';

const CONCEPT_PRESETS = [
  {
    title: '💧 Water Droplet Tower',
    prompt: 'Water droplet shaped luxury residential floor plan with 4x 1BHK and 2x 2BHK units, central staircase and double elevator core, and wide curved facade balconies with planters.',
    widthM: 80,
    lengthM: 80,
    stories: 12,
    roomConfig: '2bhk',
  },
  {
    title: '🌿 Biophilic Ginkgo Fan',
    prompt: 'Biophilic Ginkgo fan leaf residential floor plan with 6 spacious luxury apartments, radial structural columns, central service core, and panoramic curved glass terraces.',
    widthM: 85,
    lengthM: 75,
    stories: 16,
    roomConfig: '3bhk',
  },
  {
    title: '📐 Stepped L-Shape Tower',
    prompt: 'Stepped L-shape high-rise residential floor plan with 4 corner bedroom suites, central circulation corridor, dual elevators, and cascading corner terraces.',
    widthM: 70,
    lengthM: 70,
    stories: 14,
    roomConfig: '2bhk',
  },
  {
    title: '🏛️ 4-Wing Luxury Penthouse',
    prompt: 'Symmetrical 4-wing cross luxury residential floor plan with 4 master suites, open-concept living/dining halls, central fire egress core, and wrap-around balconies.',
    widthM: 90,
    lengthM: 90,
    stories: 20,
    roomConfig: '3bhk',
  },
  {
    title: '💎 Double Diamond Suite',
    prompt: 'Double diamond residential floor plan with angled wing units, central bridging service core, en-suite bathrooms along external facade, and modern modular kitchens.',
    widthM: 85,
    lengthM: 85,
    stories: 15,
    roomConfig: '2bhk',
  },
];

export default function ConceptGeneratorPage() {
  const router = useRouter();

  // Input states
  const [prompt, setPrompt] = useState<string>(
    'Water droplet shaped luxury residential floor plan with 4x 1BHK and 2x 2BHK units, central staircase and double elevator core, and wide curved facade balconies with planters.'
  );
  const [widthM, setWidthM] = useState<number>(80);
  const [lengthM, setLengthM] = useState<number>(80);
  const [stories, setStories] = useState<number>(12);
  const [roomConfig, setRoomConfig] = useState<'1bhk' | '2bhk' | '3bhk' | '4bhk' | 'auto'>('2bhk');
  
  // Custom Reference Upload state
  const [customRefBase64, setCustomRefBase64] = useState<string | null>(null);
  const [customRefPreview, setCustomRefPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Generation & Output states
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  // Handle custom image upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const b64 = event.target?.result as string;
      setCustomRefBase64(b64);
      setCustomRefPreview(b64);
    };
    reader.readAsDataURL(file);
  };

  // Generate Concept Presentation Board
  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setProgressStep('Analyzing Architectural Brief & Spatial Metrics...');

    try {
      setTimeout(() => setProgressStep('Structuring 2D Master Floor Plan Layout...'), 2000);
      setTimeout(() => setProgressStep('Synthesizing 3D Building Form & Massing Top View...'), 5000);
      setTimeout(() => setProgressStep('Rendering 3D Isometric Elevation Perspective...'), 8000);
      setTimeout(() => setProgressStep('Compiling Master Architectural Presentation Board...'), 12000);

      const res = await fetch('/api/generate-concept-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrompt: prompt,
          widthM,
          lengthM,
          stories,
          roomConfig,
          referenceImageBase64: customRefBase64,
          workflow: 'gpt-solo',
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to generate concept floor plan');
      }

      const img = data.imageUrls?.[0] || data.stage1ImageUrl;
      setGeneratedImage(img);
    } catch (err: any) {
      alert(err.message || 'Generation failed. Please try again.');
    } finally {
      setIsGenerating(false);
      setProgressStep('');
    }
  };

  // Download High-Res Image
  const handleDownload = () => {
    if (!generatedImage) return;
    const a = document.createElement('a');
    a.href = generatedImage;
    a.download = `Master_Concept_Board_${Date.now()}.png`;
    a.click();
  };

  // Copy Image to Clipboard
  const handleCopy = async () => {
    if (!generatedImage) return;
    try {
      const res = await fetch(generatedImage);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Unable to copy image directly to clipboard. Please use the Download button.');
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#070b14] text-white overflow-hidden font-sans select-none">
      
      {/* ── Top Navigation Bar ──────────────────────────────────────────────── */}
      <header className="h-14 border-b border-cyan-500/20 bg-slate-950/80 backdrop-blur-md px-6 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-mono text-cyan-400 hover:text-cyan-200 transition-colors px-2.5 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 hover:border-cyan-400"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>BACK TO WORKSPACE</span>
          </Link>

          <div className="h-4 w-px bg-white/10" />

          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/50 shadow-[0_0_12px_rgba(0,240,255,0.3)]">
              <Sparkles className="w-4 h-4 text-cyan-300 animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-cyan-400 uppercase font-mono">
                CONCEPT GENERATOR STUDIO
              </h1>
              <p className="text-[10px] text-cyan-400/70 font-mono">
                Prompt-to-Presentation-Board Floor Plan Engine
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-black/50 border border-white/10 text-[10px] font-mono text-slate-400">
            <Building className="w-3.5 h-3.5 text-cyan-400" />
            <span>BOARD FORMAT: 2D FLOOR PLAN + 3D MASSING + 3D ELEVATION</span>
          </div>
        </div>
      </header>

      {/* ── Main 2-Column Studio Layout ─────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ── Left Inspector Panel: Prompt & Parameters (380px) ──────────────── */}
        <aside className="w-[420px] border-r border-white/10 bg-[#090e1a] flex flex-col overflow-y-auto p-5 gap-5 shrink-0 no-scrollbar">
          
          {/* Quick Concept Presets */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-mono font-bold text-cyan-400 tracking-wider uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              QUICK CONCEPT TEMPLATES
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {CONCEPT_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setPrompt(preset.prompt);
                    setWidthM(preset.widthM);
                    setLengthM(preset.lengthM);
                    setStories(preset.stories);
                    setRoomConfig(preset.roomConfig as any);
                  }}
                  className="px-2.5 py-2 rounded-lg bg-slate-900/80 hover:bg-cyan-950/40 border border-white/10 hover:border-cyan-500/50 text-left transition-all group"
                >
                  <span className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 transition-colors block truncate">
                    {preset.title}
                  </span>
                  <span className="text-[9px] font-mono text-slate-500 block">
                    {preset.widthM}m × {preset.lengthM}m • {preset.stories}F
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Architectural Brief / Text Prompt Area */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-mono font-bold text-cyan-400 tracking-wider uppercase flex items-center justify-between">
              <span>ARCHITECTURAL PROMPT BRIEF</span>
              <span className="text-[9px] text-slate-500 font-normal">Describe shape, units & amenities</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="e.g. Water droplet shaped luxury residential floor plan with 4x 1BHK and 2x 2BHK units, central staircase and double elevator core, and wide curved facade balconies with planters."
              className="w-full p-3 rounded-xl bg-black/60 border border-cyan-500/30 text-xs text-cyan-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-sans leading-relaxed resize-none shadow-inner"
            />
          </div>

          {/* Plot & Building Dimensions */}
          <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-black/40 border border-white/10">
            <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              BUILDING DIMENSIONS & HEIGHT
            </span>

            <div className="grid grid-cols-3 gap-2">
              {/* Width */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-mono text-slate-400">WIDTH (M)</span>
                <input
                  type="number"
                  min={30}
                  max={200}
                  step={5}
                  value={widthM}
                  onChange={(e) => setWidthM(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs font-mono font-bold text-cyan-300 text-center focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Length */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-mono text-slate-400">LENGTH (M)</span>
                <input
                  type="number"
                  min={30}
                  max={200}
                  step={5}
                  value={lengthM}
                  onChange={(e) => setLengthM(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs font-mono font-bold text-cyan-300 text-center focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Stories */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-mono text-slate-400">STORIES</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={stories}
                  onChange={(e) => setStories(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs font-mono font-bold text-cyan-300 text-center focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* Unit Mix / Room Configuration */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              UNIT MIX DENSITY
            </span>

            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: '1bhk', label: '1 BHK' },
                { id: '2bhk', label: '2 BHK' },
                { id: '3bhk', label: '3 BHK' },
                { id: '4bhk', label: '4 BHK' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setRoomConfig(item.id as any)}
                  className={`py-2 rounded-lg text-xs font-mono font-bold uppercase transition-all ${
                    roomConfig === item.id
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-black shadow-md shadow-cyan-500/30 scale-105'
                      : 'bg-slate-900/80 text-slate-400 hover:text-white border border-white/10'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Reference Image Upload (Optional) */}
          <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-black/40 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                REFERENCE SKETCH / IMAGE (OPTIONAL)
              </span>
              {customRefBase64 && (
                <button
                  onClick={() => {
                    setCustomRefBase64(null);
                    setCustomRefPreview(null);
                  }}
                  className="text-[9px] font-mono text-red-400 hover:underline cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>

            {customRefBase64 ? (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-900 border border-cyan-500/40">
                <div className="w-16 h-16 rounded-md overflow-hidden bg-black shrink-0 border border-white/10">
                  <img src={customRefPreview!} alt="Custom Reference" className="w-full h-full object-cover" />
                </div>
                <div className="flex flex-col flex-1">
                  <span className="text-xs font-bold text-cyan-300">Custom Reference Active</span>
                  <span className="text-[9px] text-slate-400">AI will use your sketch to guide the design</span>
                </div>
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-white/15 hover:border-cyan-400/50 bg-slate-900/40 hover:bg-cyan-950/20 text-slate-400 hover:text-cyan-300 transition-all cursor-pointer"
              >
                <Upload className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] font-mono font-medium">Add Reference Sketch / Elevation (Optional)</span>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {/* Action Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className={`w-full py-3.5 rounded-xl font-mono font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer ${
              isGenerating || !prompt.trim()
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 text-black hover:opacity-95 hover:shadow-cyan-500/30 hover:scale-[1.01]'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>RENDERING PRESENTATION BOARD...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>GENERATE MASTER CONCEPT BOARD</span>
              </>
            )}
          </button>
        </aside>

        {/* ── Right Main Viewport: Presentation Board Canvas ────────────────── */}
        <main className="flex-1 flex flex-col bg-[#040407] relative overflow-hidden">
          
          {/* Main Top Header Controls */}
          <div className="h-12 border-b border-white/10 bg-black/40 backdrop-blur px-5 flex items-center justify-between z-10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-200">
                PRESENTATION BOARD VIEWPORT
              </span>
              {generatedImage && (
                <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  READY
                </span>
              )}
            </div>

            {generatedImage && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-[10px] font-mono flex items-center gap-1.5 transition-colors"
                  title="Copy to Clipboard"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'COPIED!' : 'COPY'}</span>
                </button>

                <button
                  onClick={handleDownload}
                  className="px-3 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/60 text-cyan-200 text-[10px] font-mono font-bold flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(0,240,255,0.2)]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>DOWNLOAD BOARD (PNG)</span>
                </button>
              </div>
            )}
          </div>

          {/* Viewport Content */}
          <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-[#030712]">
            
            {/* Loading Overlay */}
            {isGenerating && (
              <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center gap-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_40px_rgba(0,240,255,0.25)]">
                    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                  </div>
                </div>

                <div className="flex flex-col items-center gap-1 text-center">
                  <span className="text-sm font-mono font-bold text-white tracking-wider uppercase">
                    AI CONCEPT ENGINE RUNNING
                  </span>
                  <span className="text-xs font-mono text-cyan-400 animate-pulse">
                    {progressStep}
                  </span>
                </div>
              </div>
            )}

            {/* Generated Image Presentation Display */}
            {generatedImage ? (
              <div className="relative max-w-full max-h-full flex items-center justify-center rounded-xl overflow-hidden border border-cyan-500/30 shadow-2xl shadow-black/80">
                <img
                  src={generatedImage}
                  alt="Master Architectural Presentation Board"
                  className="max-w-full max-h-[calc(100vh-140px)] object-contain rounded-lg"
                />
              </div>
            ) : (
              /* Empty Placeholder State */
              <div className="flex flex-col items-center justify-center text-center max-w-md p-8 rounded-2xl bg-slate-900/40 border border-white/5 shadow-2xl">
                <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center mb-4 text-cyan-300">
                  <Compass className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-white font-mono uppercase mb-1">
                  Ready to Generate Concept Board
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4 font-sans">
                  Select a template or type your architectural brief on the left. The engine will synthesize a high-resolution presentation board with a 2D floor plan, 3D roof massing, and 3D perspective elevation.
                </p>
                <button
                  onClick={handleGenerate}
                  className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/60 text-cyan-300 text-xs font-mono font-bold transition-all shadow-[0_0_15px_rgba(0,240,255,0.2)] cursor-pointer"
                >
                  ⚡ Try Default Water Droplet Concept
                </button>
              </div>
            )}
          </div>

        </main>
      </div>

    </div>
  );
}
