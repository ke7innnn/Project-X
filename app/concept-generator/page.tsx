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
  Palette
} from 'lucide-react';
import ConceptMoodboard from '@/components/ConceptMoodboard';

const CONCEPT_PRESETS = [
  {
    title: '💧 Water Droplet Tower',
    prompt: 'Water droplet shaped luxury residential floor plan with 6x apartment units, central staircase and double elevator core, and wide curved facade balconies with planters.',
    widthM: 80,
    lengthM: 80,
    numFlats: 6,
  },
  {
    title: '🌿 Biophilic Ginkgo Fan',
    prompt: 'Biophilic Ginkgo fan leaf residential floor plan with 6x apartment units, radial structural columns, central service core, and panoramic curved glass terraces.',
    widthM: 85,
    lengthM: 75,
    numFlats: 6,
  },
  {
    title: '📐 Stepped L-Shape Tower',
    prompt: 'Stepped L-shape high-rise residential floor plan with 6x apartment units, central circulation corridor, dual elevators, and cascading corner terraces.',
    widthM: 70,
    lengthM: 70,
    numFlats: 6,
  },
  {
    title: '🏛️ 4-Wing Luxury Cross',
    prompt: 'Symmetrical 4-wing cross luxury residential floor plan with 8x apartment units, open-concept living/dining halls, central fire egress core, and wrap-around balconies.',
    widthM: 90,
    lengthM: 90,
    numFlats: 8,
  },
  {
    title: '💎 Double Diamond Suite',
    prompt: 'Double diamond residential floor plan with 8x apartment units, central bridging service core, en-suite bathrooms along external facade, and modern modular kitchens.',
    widthM: 85,
    lengthM: 85,
    numFlats: 8,
  },
];

export default function ConceptGeneratorPage() {
  const router = useRouter();

  // Mode Tab: Generator vs Moodboard
  const [activeTab, setActiveTab] = useState<'generator' | 'moodboard'>('generator');

  // Input states
  const [prompt, setPrompt] = useState<string>(
    'Arc shaped luxury residential floor plan with 6x apartment units, central staircase and double elevator core, and wide curved facade balconies with planters.'
  );
  const [widthM, setWidthM] = useState<number>(80);
  const [lengthM, setLengthM] = useState<number>(80);
  const [numFlats, setNumFlats] = useState<number>(6);

  // Generation & Output states
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [candidateImages, setCandidateImages] = useState<string[]>([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);

  const activeImage = candidateImages[selectedCandidateIndex] || null;

  // Generate Concept Presentation Board
  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setProgressStep('Analyzing Architectural Brief & Geometry...');

    try {
      setTimeout(() => setProgressStep('Structuring 2D Master Floor Plan Layouts...'), 1500);
      setTimeout(() => setProgressStep('Synthesizing 3D Building Form & Massing Top Views...'), 3500);
      setTimeout(() => setProgressStep('Rendering 3D Isometric Elevation Perspectives...'), 6000);
      setTimeout(() => setProgressStep('Generating 4 Parallel Master Presentation Boards...'), 9000);

      const res = await fetch('/api/generate-concept-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrompt: prompt,
          widthM,
          lengthM,
          numFlats,
          workflow: 'gpt-solo',
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to generate concept floor plan');
      }

      const imgs: string[] = Array.isArray(data.imageUrls) && data.imageUrls.length > 0
        ? data.imageUrls
        : (data.stage1ImageUrl ? [data.stage1ImageUrl] : []);

      setCandidateImages(imgs);
      setSelectedCandidateIndex(0);
    } catch (err: any) {
      alert(err.message || 'Generation failed. Please try again.');
    } finally {
      setIsGenerating(false);
      setProgressStep('');
    }
  };

  // Download High-Res Image
  const handleDownload = () => {
    if (!activeImage) return;
    const a = document.createElement('a');
    a.href = activeImage;
    a.download = `Master_Concept_Board_Option_${selectedCandidateIndex + 1}_${Date.now()}.png`;
    a.click();
  };

  // Copy Image to Clipboard
  const handleCopy = async () => {
    if (!activeImage) return;
    try {
      const res = await fetch(activeImage);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden">
      {/* ── Header ── */}
      <header className="h-14 border-b border-white/10 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-5 shrink-0 z-30">
        <div className="flex items-center gap-4">
          <Link
            href="/workspace/default"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-mono transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            BACK TO WORKSPACE
          </Link>
          <div className="h-4 w-[1px] bg-white/10" />
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 text-cyan-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xs font-bold font-mono tracking-wider text-white uppercase">
                CONCEPT GENERATOR STUDIO
              </h1>
              <p className="text-[10px] text-slate-400 font-mono">
                Presentation Board Engine & Architectural Moodboard Studio
              </p>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="hidden sm:flex items-center bg-black/60 border border-white/10 rounded-xl p-1 shadow-inner ml-3">
            <button
              onClick={() => setActiveTab('generator')}
              className={`px-3 py-1 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'generator'
                  ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" /> Concept Generator
            </button>

            <button
              onClick={() => setActiveTab('moodboard')}
              className={`px-3 py-1 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'moodboard'
                  ? 'bg-gradient-to-r from-emerald-400 to-teal-400 text-black shadow-md shadow-emerald-500/30 font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Palette className="w-3.5 h-3.5" /> Moodboard & Inspiration
              <span className="px-1 py-0.2 bg-emerald-950 text-emerald-300 rounded text-[8px] border border-emerald-500/40 font-mono">NEW</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 flex items-center gap-1.5">
            <FileCode className="w-3 h-3" />
            BOARD FORMAT: 2D FLOOR PLAN + 3D MASSING + 3D ELEVATION
          </span>
        </div>
      </header>

      {/* ── Main Body: Conditional Tab Rendering ── */}
      {activeTab === 'moodboard' ? (
        <ConceptMoodboard 
          onApplyToPrompt={(inspirationText) => {
            setPrompt(prev => `${prev} ${inspirationText}`.trim());
            setActiveTab('generator');
          }} 
        />
      ) : (
        <div className="flex-1 flex overflow-hidden">
        {/* Left Control Panel */}
        <aside className="w-[420px] shrink-0 border-r border-white/10 bg-slate-900/50 backdrop-blur-md flex flex-col overflow-y-auto p-4 gap-4">
          {/* Presets Bar */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              INSPIRATION SHAPE PRESETS
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CONCEPT_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setPrompt(preset.prompt);
                    setWidthM(preset.widthM);
                    setLengthM(preset.lengthM);
                    setNumFlats(preset.numFlats);
                  }}
                  className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/40 text-[10px] font-mono text-slate-300 hover:text-cyan-300 transition-all cursor-pointer"
                >
                  {preset.title}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt Brief */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                ARCHITECTURAL PROMPT BRIEF
              </label>
              <span className="text-[9px] font-mono text-slate-500">DESCRIBE SHAPE & AMENITIES</span>
            </div>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Arc shaped luxury residential floor plan with 6x 2BHK units, central staircase and double elevator core, and wide curved facade balconies with planters."
              className="w-full p-3 bg-black/60 border border-white/10 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400/80 focus:ring-1 focus:ring-cyan-400/40 resize-none transition-all placeholder:text-slate-600"
            />
          </div>

          {/* Plot & Building Dimensions */}
          <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-black/40 border border-white/10">
            <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              BUILDING FOOTPRINT DIMENSIONS
            </span>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Width */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-mono text-slate-400">WIDTH (M)</span>
                <input
                  type="number"
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
                  value={lengthM}
                  onChange={(e) => setLengthM(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs font-mono font-bold text-cyan-300 text-center focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* Number of Flats (Max 10) */}
          <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-black/40 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-cyan-400" />
                NUMBER OF FLATS (PER FLOOR)
              </span>
              <span className="text-xs font-mono font-bold text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30">
                {numFlats} FLATS
              </span>
            </div>

            {/* Quick 1 to 10 Button Grid */}
            <div className="grid grid-cols-5 gap-1.5 mt-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  onClick={() => setNumFlats(num)}
                  className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                    numFlats === num
                      ? 'bg-cyan-400 text-black shadow-md shadow-cyan-500/30 scale-105'
                      : 'bg-slate-900/80 text-slate-400 hover:text-white border border-white/10'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
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
                <span>RENDERING BOARD...</span>
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
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-slate-200">
                PRESENTATION BOARD VIEWPORT
              </span>
              {candidateImages.length > 0 && (
                <div className="flex items-center gap-1.5 ml-2 p-1 rounded-lg bg-slate-900/80 border border-white/10">
                  {candidateImages.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedCandidateIndex(idx)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold transition-all cursor-pointer ${
                        selectedCandidateIndex === idx
                          ? 'bg-gradient-to-r from-cyan-500 to-emerald-400 text-black shadow-md shadow-cyan-500/30 scale-105'
                          : 'bg-black/40 text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      OPTION {idx + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {activeImage && (
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
                  className="px-3 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/60 text-cyan-200 text-[10px] font-mono font-bold flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(0,240,255,0.2)] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>DOWNLOAD OPTION {selectedCandidateIndex + 1} (PNG)</span>
                </button>
              </div>
            )}
          </div>

          {/* Viewport Content */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden bg-[#030712]">
            
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
                    AI CONCEPT ENGINE GENERATING 4 CANDIDATES
                  </span>
                  <span className="text-xs font-mono text-cyan-400 animate-pulse">
                    {progressStep}
                  </span>
                </div>
              </div>
            )}

            {/* Generated Image Presentation Display */}
            {activeImage ? (
              <div className="flex-1 w-full flex flex-col items-center justify-center relative overflow-hidden gap-3">
                <div className="relative max-w-full max-h-[calc(100vh-210px)] flex items-center justify-center rounded-xl overflow-hidden border border-cyan-500/30 shadow-2xl shadow-black/80">
                  <img
                    src={activeImage}
                    alt={`Master Architectural Presentation Board - Option ${selectedCandidateIndex + 1}`}
                    className="max-w-full max-h-[calc(100vh-210px)] object-contain rounded-lg"
                  />
                </div>

                {/* 4-Candidate Thumbnail Selector Filmstrip */}
                {candidateImages.length > 1 && (
                  <div className="flex items-center gap-2 p-1.5 rounded-xl bg-black/60 border border-white/10 backdrop-blur z-20">
                    {candidateImages.map((img, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedCandidateIndex(idx)}
                        className={`w-16 h-12 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                          selectedCandidateIndex === idx
                            ? 'border-cyan-400 scale-105 shadow-md shadow-cyan-500/40'
                            : 'border-white/10 hover:border-white/40 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={img} alt={`Candidate ${idx + 1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Empty Placeholder State */
              <div className="flex flex-col items-center justify-center text-center max-w-md p-8 rounded-2xl bg-slate-900/40 border border-white/5 shadow-2xl">
                <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center mb-4 text-cyan-300">
                  <Compass className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-white font-mono uppercase mb-1">
                  Ready to Generate 4 Concept Options
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4 font-sans">
                  Select a template or type your architectural brief on the left. The engine will synthesize 4 distinct presentation boards in parallel with 2D floor plans, 3D roof massing, and 3D perspective elevations.
                </p>
                <button
                  onClick={handleGenerate}
                  className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/60 text-cyan-300 text-xs font-mono font-bold transition-all shadow-[0_0_15px_rgba(0,240,255,0.2)] cursor-pointer"
                >
                  ⚡ Generate 4 Parallel Concept Boards
                </button>
              </div>
            )}
          </div>

        </main>
      </div>
      )}

    </div>
  );
}
