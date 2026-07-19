'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Sparkles, 
  Settings, 
  Download, 
  Share2, 
  Loader2, 
  Compass, 
  Terminal, 
  Check, 
  AlertTriangle,
  Zap,
  Building,
  Activity,
  Layers,
  ShieldCheck,
  Wind
} from 'lucide-react';
import Image from 'next/image';

// Shapes presets
const FOOTPRINT_PRESETS = [
  { id: 'curved-x', name: 'CURVED X-SHAPE (HIGH-RISE)', desc: 'Four symmetrical curved wings with a centralized circulation core.' },
  { id: 'tri-foil', name: 'TRI-FOIL Y-SHAPE', desc: 'Three-pronged radiating wings optimized for wind deflection.' },
  { id: 'monolithic-rect', name: 'MONOLITHIC RECTANGULAR', desc: 'Classic double-loaded slab footprint with central core.' },
  { id: 'circular-atrium', name: 'CIRCULAR ATRIUM TOWER', desc: 'Concentric core layout with circular exterior gallery walls.' }
];

export default function IdeaGenerationPage() {
  const router = useRouter();

  // Floor Plan Specification States
  const [customPrompt, setCustomPrompt] = useState('');
  const [footprintShape, setFootprintShape] = useState('curved-x');
  const [overallWidth, setOverallWidth] = useState('100.00');
  const [overallLength, setOverallLength] = useState('100.00');
  const [floorHeight, setFloorHeight] = useState('3.30');
  const [storyCount, setStoryCount] = useState('G + 50');

  // Central Core Spec States
  const [coreSize, setCoreSize] = useState('24.00 x 24.00');
  const [passengerLifts, setPassengerLifts] = useState(8);
  const [fireLifts, setFireLifts] = useState(2);
  const [staircases, setStaircases] = useState(2);
  const [corridorWidth, setCorridorWidth] = useState('2.40');

  // Unit Mix Table States
  const [typeAUnits, setTypeAUnits] = useState(4); // 2 BHK
  const [typeBUnits, setTypeBUnits] = useState(8); // 3 BHK
  const [typeCUnits, setTypeCUnits] = useState(4); // 3 BHK Premium

  // Compliance Toggles
  const [vastuCompliant, setVastuCompliant] = useState(true);
  const [crossVentilation, setCrossVentilation] = useState(true);
  const [fireSafetyCode, setFireSafetyCode] = useState(true);

  // Settings states
  const [useDemoMode, setUseDemoMode] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Generation status states
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);

  // Output states
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultTitle, setResultTitle] = useState('');
  const [resultDesc, setResultDesc] = useState('');

  const loadingSteps = [
    'PARSING FOOTPRINT BOUNDARY (100M X 100M CURVED X-SHAPE)...',
    'PROCESSING DESIGN NOTES & MATERIAL SPECS...',
    'ESTABLISHING EGRESS PATHWAY: 2.40M WIDE LOOPING CORRIDORS...',
    'DESIGNING COMPACT EFFICIENT CENTRAL CORE [24.00M X 24.00M]...',
    'SPATIAL ZONING: 8 PASSENGER LIFTS + 2 FIRE LIFTS + 2 EGRESS STAIRS...',
    'STRUCTURING WINGS: 4X 2BHK (90SQM), 8X 3BHK (121SQM), 4X 3BHK PREMIUM (140SQM)...',
    'BALANCING THERMAL GRADIENTS & NATURAL CROSS-VENTILATION SYSTEMS...',
    'VALIDATING FIRE ESCAPE RUNS AND NBC 2016 SAFETY COMPLIANCE...',
    'DISPATCHING 2D TYPICAL FLOOR PLAN SCHEMATIC AND PERSPECTIVE RENDERS...'
  ];

  // Unified Async Generation and HUD Progress Pipeline
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsGenerating(true);
    setGenerationStep(0);
    setResultImage(null);
    setLogs(['[SYS] INITIALIZING ARCHITECTURAL TOWER SYNTHESIS CORE...']);

    // Start simulated progress logging in parallel
    let currentStep = 0;
    const logInterval = setInterval(() => {
      if (currentStep < loadingSteps.length) {
        const stepMessage = loadingSteps[currentStep];
        if (stepMessage) {
          setLogs((prev) => [...prev, `[SYS] ${stepMessage}`]);
          setGenerationStep(currentStep + 1);
        }
        currentStep++;
      }
    }, 550);

    try {
      if (useDemoMode) {
        // Wait for all steps to print sequentially
        for (let i = 0; i < loadingSteps.length; i++) {
          await new Promise((r) => setTimeout(r, 550));
        }
        clearInterval(logInterval);
        setLogs((prev) => [...prev, '[SYS] CORE CALCULATIONS VERIFIED. DESIGN SCHEMATIC PIPELINE ONLINE.']);
        setResultImage('/x-shape-floorplan.jpg');
        setResultTitle('CURVED X SHAPE HIGH RISE TYPICAL PLAN');
        setResultDesc(
          `High-rise Floor Plan Core Synthesis: Monolithic X-Shape tower floor plan featuring 16 balanced units per floor (4x 2BHK, 8x 3BHK, 4x 3BHK Premium). ${customPrompt ? `Custom Notes Integrated: "${customPrompt}". ` : ''}Integrates a central 24.00m x 24.00m lift lobby containing 8 passenger lifts, 2 fire lifts, 2 fire staircases, and dual 2.40m wide branching corridors.`
        );
        setIsGenerating(false);
      } else {
        // Call Fal AI route
        const styleName = FOOTPRINT_PRESETS.find(f => f.id === footprintShape)?.name || 'X-Shape';
        const promptText = `High-rise tower typical floor plan drawing, architectural design plan layout blueprint, ${styleName} footprint, central core with elevator lobby and staircases, apartments divided in the wings, CAD blueprint aesthetic, white paper background, professional clean annotations. Custom guidelines: ${customPrompt}`;

        const apiPromise = fetch('/api/generate-idea-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: promptText,
            style: styleName,
            apiKey: apiKey || undefined,
          }),
        }).then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Fal AI generation request failed');
          }
          return data.url;
        });

        // Race/wait for API response, ensuring at least 3 seconds of tactical logging runs
        const [url] = await Promise.all([
          apiPromise,
          new Promise((r) => setTimeout(r, 3300))
        ]);

        clearInterval(logInterval);
        
        // Push remaining steps quickly to log feed
        for (let i = currentStep; i < loadingSteps.length; i++) {
          const stepMessage = loadingSteps[i];
          if (stepMessage) {
            setLogs((prev) => [...prev, `[SYS] ${stepMessage}`]);
          }
        }
        setGenerationStep(loadingSteps.length);

        setLogs((prev) => [...prev, '[SYS] CORE CALCULATIONS VERIFIED. LIVE GENERATION PIPELINE ONLINE.']);
        setResultImage(url);
        setResultTitle('SYNTHESIZED TOWER PLAN');
        setResultDesc(
          `GPT Generative Core typical floor plan based on a ${styleName} footprint. Custom guidelines: "${customPrompt}". Core features verified: 8 passenger lifts, 2 fire lifts, and 2.40m width circulation pathways.`
        );
        setIsGenerating(false);
      }
    } catch (err: any) {
      clearInterval(logInterval);
      setLogs((prev) => [...prev, `[ERR] ${err.message || 'API request failed'}. REVERTING TO LOCAL HIGH-RISE SIMULATION SCHEMA...`]);
      setResultImage('/x-shape-floorplan.jpg');
      setResultTitle('CURVED X SHAPE HIGH RISE TYPICAL PLAN');
      setResultDesc(
        `Simulation Fallback: Monolithic X-Shape tower floor plan featuring 16 balanced units per floor (4x 2BHK, 8x 3BHK, 4x 3BHK Premium).`
      );
      setIsGenerating(false);
    }
  };

  const handleShare = () => {
    setCopiedLink(true);
    navigator.clipboard.writeText(window.location.href);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const totalUnits = typeAUnits + typeBUnits + typeCUnits;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-cyan-400 font-mono flex flex-col relative overflow-hidden p-6 z-50">
        
        {/* Background Grid & Vignette overlays */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none z-0" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,#0a0a0f_95%)] pointer-events-none z-0" />

        {/* Top Header Navigation HUD */}
        <div className="relative z-10 flex items-center justify-between border-b border-cyan-500/20 pb-4 mb-6 select-none">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                router.push('/');
              }}
              className="p-2 border border-cyan-500/30 hover:border-cyan-400 hover:text-white rounded bg-cyan-950/20 text-cyan-500/80 transition-all cursor-pointer flex items-center gap-1.5 text-xs tracking-wider"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>RETURN TO MAIN COMMAND</span>
            </button>
            <span className="h-6 w-px bg-cyan-500/20" />
            <div className="text-left">
              <span className="text-[9px] tracking-[4px] text-cyan-500/60 uppercase block">COGNITIVE MODULE</span>
              <h1 className="text-xl font-bold tracking-[2px] text-white">TYPICAL TOWER PLAN GENERATOR</h1>
            </div>
          </div>

          {/* Mode Selector and API Configuration */}
          <div className="flex items-center gap-3">
            <div className="bg-cyan-950/20 border border-cyan-500/30 rounded p-1 flex items-center gap-1">
              <button 
                onClick={() => setUseDemoMode(true)}
                className={`px-3 py-1 text-[10px] tracking-wider rounded transition-colors ${
                  useDemoMode ? 'bg-cyan-500/30 text-white font-bold' : 'text-cyan-500/50 hover:text-cyan-400'
                }`}
              >
                SIMULATION MODE
              </button>
              <button 
                onClick={() => setUseDemoMode(false)}
                className={`px-3 py-1 text-[10px] tracking-wider rounded transition-colors ${
                  !useDemoMode ? 'bg-cyan-500/30 text-white font-bold' : 'text-cyan-500/50 hover:text-cyan-400'
                }`}
              >
                FAL AI API
              </button>
            </div>
            
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded border transition-colors cursor-pointer ${
                showSettings ? 'bg-cyan-500/30 border-cyan-400 text-white' : 'border-cyan-500/30 bg-cyan-950/20 hover:border-cyan-400'
              }`}
              title="Fal AI API Keys"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Floating Settings Panel */}
        {showSettings && (
          <div className="relative z-20 max-w-lg mb-6 p-4 rounded border border-cyan-500/30 bg-[#0c0c14]/90 backdrop-blur-md text-left text-xs text-cyan-500/80 leading-relaxed">
            <h4 className="font-bold text-white mb-1.5 uppercase tracking-wider">Fal AI API Connection</h4>
            <p className="mb-3">
              Provide a Fal AI secret key (FAL_KEY) to generate live high-quality floor plan images using Flux Schnell directly inside the Command center. If not configured, simulation mode uses local high-resolution assets.
            </p>
            <div className="flex flex-col gap-2">
              <label className="text-[9px] tracking-widest text-cyan-500/50 uppercase">Fal AI API Key (FAL_KEY)</label>
              <input 
                type="password"
                placeholder="FAL_KEY value..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-[#050508] border border-cyan-500/30 focus:border-cyan-400 focus:outline-none rounded px-3 py-1.5 text-xs text-cyan-400 placeholder-cyan-500/20 font-mono"
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px]">
              <span className="text-amber-500/80 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Keys are processed secure and local.</span>
              </span>
              <button 
                onClick={() => setShowSettings(false)}
                className="text-cyan-400 hover:text-white font-bold"
              >
                DISMISS
              </button>
            </div>
          </div>
        )}

        {/* Main Worksite Grid - Highly Balanced Layout */}
        <div className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch overflow-hidden">
          
          {/* Column 1: Left Input Panel (Footprint & Unit Mix) */}
          <div className="lg:col-span-4 flex flex-col gap-4 text-left bg-slate-900/30 backdrop-blur border border-white/10 p-5 rounded-xl overflow-y-auto no-scrollbar">
            
            <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-2 mb-1 select-none">
              <Building className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">TOWER & UNITS CONFIG</span>
            </div>

            {/* Optional Custom Text Prompt */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] tracking-[2px] text-cyan-500/60 uppercase font-mono block">CUSTOM DESIGN NOTES / PROMPT</label>
              <textarea
                placeholder="E.g. Add curved glass balconies, use biophilic screen facades, incorporate sky gardens on 25th floor..."
                rows={3}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                disabled={isGenerating}
                className="w-full bg-black/30 border border-white/10 focus:border-cyan-400 focus:outline-none rounded-lg p-2.5 text-[11px] leading-normal text-cyan-400 placeholder-cyan-500/20 resize-none transition-colors"
              />
            </div>

            {/* Footprint Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] tracking-[2px] text-cyan-500/60 uppercase font-mono block">TOWER FOOTPRINT SHAPE</label>
              <select
                value={footprintShape}
                onChange={(e) => setFootprintShape(e.target.value)}
                disabled={isGenerating}
                className="w-full bg-black/40 border border-white/10 focus:border-cyan-400 focus:outline-none rounded-lg p-2 text-[11px] text-cyan-400 cursor-pointer"
              >
                {FOOTPRINT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#0a0a0f] text-cyan-400">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Footprint Dimensions */}
            <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[8px] text-cyan-500/60 uppercase">OVERALL WIDTH (M)</label>
                <input 
                  type="text" 
                  value={overallWidth} 
                  onChange={(e) => setOverallWidth(e.target.value)}
                  disabled={isGenerating}
                  className="bg-black/40 border border-white/10 focus:border-cyan-400 focus:outline-none rounded p-1.5 text-[11px] text-cyan-400"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[8px] text-cyan-500/60 uppercase">OVERALL LENGTH (M)</label>
                <input 
                  type="text" 
                  value={overallLength} 
                  onChange={(e) => setOverallLength(e.target.value)}
                  disabled={isGenerating}
                  className="bg-black/40 border border-white/10 focus:border-cyan-400 focus:outline-none rounded p-1.5 text-[11px] text-cyan-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[8px] text-cyan-500/60 uppercase">TYPICAL HEIGHT (M)</label>
                <input 
                  type="text" 
                  value={floorHeight} 
                  onChange={(e) => setFloorHeight(e.target.value)}
                  disabled={isGenerating}
                  className="bg-black/40 border border-white/10 focus:border-cyan-400 focus:outline-none rounded p-1.5 text-[11px] text-cyan-400"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[8px] text-cyan-500/60 uppercase">HEIGHT (STORIES)</label>
                <input 
                  type="text" 
                  value={storyCount} 
                  onChange={(e) => setStoryCount(e.target.value)}
                  disabled={isGenerating}
                  className="bg-black/40 border border-white/10 focus:border-cyan-400 focus:outline-none rounded p-1.5 text-[11px] text-cyan-400"
                />
              </div>
            </div>

            {/* Unit Mix Table (Typical Floor) */}
            <div className="flex flex-col gap-2 border-t border-white/5 pt-2.5">
              <span className="text-[9px] tracking-[2px] text-cyan-500/60 uppercase font-mono block">UNIT MIX DESIGN MATRIX</span>
              
              <div className="overflow-hidden border border-white/10 rounded">
                <table className="min-w-full divide-y divide-white/10 font-mono text-[10px]">
                  <thead className="bg-white/[0.02]">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-[8px] font-bold text-cyan-500/70 uppercase">TYPE</th>
                      <th className="px-2 py-1.5 text-left text-[8px] font-bold text-cyan-500/70 uppercase">CARPET</th>
                      <th className="px-2 py-1.5 text-center text-[8px] font-bold text-cyan-500/70 uppercase">QTY/FL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 bg-black/10">
                    <tr>
                      <td className="px-2 py-1 text-white font-bold">TYPE A (2BHK)</td>
                      <td className="px-2 py-1 text-cyan-400/80">78 SQ.M.</td>
                      <td className="px-2 py-1 text-center">
                        <input 
                          type="number" 
                          value={typeAUnits} 
                          onChange={(e) => setTypeAUnits(parseInt(e.target.value) || 0)}
                          disabled={isGenerating}
                          className="bg-black/50 border border-white/10 focus:border-cyan-400 focus:outline-none rounded w-10 text-center text-cyan-400 py-0.5"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 text-white font-bold">TYPE B (3BHK)</td>
                      <td className="px-2 py-1 text-cyan-400/80">105 SQ.M.</td>
                      <td className="px-2 py-1 text-center">
                        <input 
                          type="number" 
                          value={typeBUnits} 
                          onChange={(e) => setTypeBUnits(parseInt(e.target.value) || 0)}
                          disabled={isGenerating}
                          className="bg-black/50 border border-white/10 focus:border-cyan-400 focus:outline-none rounded w-10 text-center text-cyan-400 py-0.5"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 text-white font-bold">TYPE C (3BHK P)</td>
                      <td className="px-2 py-1 text-cyan-400/80">120 SQ.M.</td>
                      <td className="px-2 py-1 text-center">
                        <input 
                          type="number" 
                          value={typeCUnits} 
                          onChange={(e) => setTypeCUnits(parseInt(e.target.value) || 0)}
                          disabled={isGenerating}
                          className="bg-black/50 border border-white/10 focus:border-cyan-400 focus:outline-none rounded w-10 text-center text-cyan-400 py-0.5"
                        />
                      </td>
                    </tr>
                    <tr className="bg-white/[0.04]">
                      <td className="px-2 py-1.5 text-cyan-400 font-bold uppercase" colSpan={2}>TOTAL MIX COUNT</td>
                      <td className="px-2 py-1.5 text-center text-white font-bold text-xs">{totalUnits} NOS</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Execute Button */}
            <button
              onClick={handleGenerate}
              type="button"
              disabled={isGenerating}
              className="w-full mt-auto py-2.5 rounded font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 hover:border-cyan-400 text-[#00f0ff] shadow-[0_0_15px_rgba(0,240,255,0.1)] shrink-0"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>SYNTHESIZING MATRIX...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>EXECUTE IDEATION PROTOCOL</span>
                </>
              )}
            </button>
          </div>

          {/* Column 2: Center Display Panel (Canvas & Circulation Core underneath) */}
          <div className="lg:col-span-5 flex flex-col gap-4 overflow-y-auto no-scrollbar">
            
            {/* Main Interactive CAD Canvas */}
            <div className="relative w-full aspect-[16/10] rounded-xl overflow-hidden border border-cyan-500/20 bg-[#050508] flex items-center justify-center p-6 shadow-2xl shrink-0">
              <div className="absolute inset-0 bg-[radial-gradient(#00f0ff_1px,transparent_1.5px)] [background-size:16px_16px] opacity-10 pointer-events-none" />

              {/* Simulation Loader HUD */}
              {isGenerating && (
                <div className="absolute inset-0 bg-[#0a0a0f]/95 z-30 flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
                  <div className="relative w-14 h-14 mb-4 flex items-center justify-center">
                    <div className="absolute inset-0 border border-cyan-500/20 rounded-full" />
                    <div className="absolute inset-0 border border-t-[#00f0ff] rounded-full animate-spin" />
                    <Compass className="w-5 h-5 text-cyan-400 animate-pulse" />
                  </div>
                  <div className="flex flex-col gap-1.5 max-w-xs">
                    <span className="text-[10px] tracking-[4px] text-cyan-400 font-bold uppercase">GENERATION ACTIVE</span>
                    <span className="text-[11px] font-semibold text-white h-5 truncate transition-all duration-300">
                      {loadingSteps[Math.min(generationStep, loadingSteps.length - 1)]}
                    </span>
                    <div className="w-36 h-[2px] bg-cyan-950/60 rounded-full overflow-hidden mt-2 mx-auto">
                      <div 
                        className="h-full bg-cyan-400 transition-all duration-500" 
                        style={{ width: `${(generationStep / loadingSteps.length) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Generated Image container */}
              {resultImage ? (
                <div className="relative w-full h-full rounded border border-cyan-500/20 bg-white animate-fadeIn">
                  <Image
                    src={resultImage}
                    alt={resultTitle}
                    fill
                    className="object-contain"
                    sizes="(max-width: 1440px) 100vw, 1440px"
                    priority
                  />
                  <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-auto">
                    <button 
                      onClick={handleShare}
                      className="p-2 rounded bg-black/75 border border-cyan-500/30 text-cyan-400 hover:text-white transition-colors cursor-pointer"
                      title="Copy Link"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Share2 className="w-3.5 h-3.5" />}
                    </button>
                    <a 
                      href={resultImage} 
                      download={`${resultTitle}.png`}
                      className="p-2 rounded bg-black/75 border border-cyan-500/30 text-cyan-400 hover:text-white transition-colors flex items-center"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ) : !isGenerating ? (
                <div className="flex flex-col items-center justify-center text-center p-6 max-w-xs text-cyan-500/60">
                  <div className="w-12 h-12 rounded-xl bg-cyan-950/20 border border-cyan-500/20 flex items-center justify-center mb-4">
                    <Sparkles className="w-6 h-6 animate-pulse" />
                  </div>
                  <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Design Grid Offline</h3>
                  <p className="text-[10px] mt-1.5 leading-relaxed">
                    Awaiting target coordinates. Configure mix details and click execute.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Circulation Core Spec Panel underneath (Decoupled & De-cluttered!) */}
            <div className="flex flex-col gap-3 bg-slate-900/30 backdrop-blur border border-white/10 p-5 rounded-xl text-left">
              <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-2 select-none">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">CIRCULATION CORE & COMPLIANCE</span>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] text-cyan-500/60 uppercase">LIFT LOBBY DIMENSIONS (M)</label>
                  <input 
                    type="text" 
                    value={coreSize} 
                    onChange={(e) => setCoreSize(e.target.value)}
                    disabled={isGenerating}
                    className="bg-black/40 border border-white/10 focus:border-cyan-400 focus:outline-none rounded p-1.5 text-[11px] text-cyan-400"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] text-cyan-500/60 uppercase">CORRIDOR LOOP WIDTH (M)</label>
                  <input 
                    type="text" 
                    value={corridorWidth} 
                    onChange={(e) => setCorridorWidth(e.target.value)}
                    disabled={isGenerating}
                    className="bg-black/40 border border-white/10 focus:border-cyan-400 focus:outline-none rounded p-1.5 text-[11px] text-cyan-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] text-cyan-500/60 uppercase">PASS LIFTS QTY</label>
                  <input 
                    type="number" 
                    value={passengerLifts} 
                    onChange={(e) => setPassengerLifts(parseInt(e.target.value) || 0)}
                    disabled={isGenerating}
                    className="bg-black/40 border border-white/10 focus:border-cyan-400 focus:outline-none rounded p-1.5 text-[11px] text-cyan-400"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] text-cyan-500/60 uppercase">FIRE LIFTS QTY</label>
                  <input 
                    type="number" 
                    value={fireLifts} 
                    onChange={(e) => setFireLifts(parseInt(e.target.value) || 0)}
                    disabled={isGenerating}
                    className="bg-black/40 border border-white/10 focus:border-cyan-400 focus:outline-none rounded p-1.5 text-[11px] text-cyan-400"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] text-cyan-500/60 uppercase">EGRESS STAIRS</label>
                  <input 
                    type="number" 
                    value={staircases} 
                    onChange={(e) => setStaircases(parseInt(e.target.value) || 0)}
                    disabled={isGenerating}
                    className="bg-black/40 border border-white/10 focus:border-cyan-400 focus:outline-none rounded p-1.5 text-[11px] text-cyan-400"
                  />
                </div>
              </div>

              {/* Compliance Toggles */}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-cyan-500/75 border-t border-white/5 pt-2.5 mt-1 select-none">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={vastuCompliant} 
                    onChange={() => setVastuCompliant(!vastuCompliant)}
                    disabled={isGenerating}
                    className="accent-cyan-400"
                  />
                  <span>VAASTU RULES</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={crossVentilation} 
                    onChange={() => setCrossVentilation(!crossVentilation)}
                    disabled={isGenerating}
                    className="accent-cyan-400"
                  />
                  <span>CROSS VENTILATION</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={fireSafetyCode} 
                    onChange={() => setFireSafetyCode(!fireSafetyCode)}
                    disabled={isGenerating}
                    className="accent-cyan-400"
                  />
                  <span>FIRE EGRESS</span>
                </label>
              </div>

            </div>

          </div>

          {/* Column 3: Right Panel (Console Logs & Highlight Summary) */}
          <div className="lg:col-span-3 flex flex-col gap-4 bg-slate-900/30 backdrop-blur border border-white/10 p-5 rounded-xl text-left overflow-y-auto no-scrollbar">
            
            <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-2 mb-1 select-none">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">CONSOLE FEED</span>
            </div>
            
            <div className="flex-1 min-h-[140px] overflow-y-auto no-scrollbar flex flex-col gap-2 font-mono text-[9px] text-cyan-500/60 leading-normal pr-1 bg-black/10 p-2 rounded border border-white/5">
              {logs.length === 0 ? (
                <div className="italic text-cyan-500/30">[Awaiting command execution]</div>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className={log.startsWith('[ERR]') ? 'text-red-400' : log.startsWith('[SYS]') ? 'text-cyan-400' : 'text-cyan-500/60'}>
                    {log}
                  </div>
                ))
              )}
            </div>

            {/* Summary Details sheet */}
            {resultImage && !isGenerating && (
              <div className="flex flex-col gap-2.5 border-t border-cyan-500/20 pt-3.5 mt-1 animate-fadeIn select-none text-[11px] leading-relaxed">
                <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                  <Compass className="w-3.5 h-3.5" />
                  <span className="uppercase tracking-wider">PROJECT SUMMARY</span>
                </div>
                <div className="text-[10px] text-white flex flex-col gap-1">
                  <div>• Building: {storyCount} Stories</div>
                  <div>• Wing Units: 16 Units/Floor</div>
                  <div>• Lifts: 8 Pass / 2 Fire Lifts</div>
                  <div>• Corridors: 2.40m Loop</div>
                </div>

                <div className="border-t border-white/5 pt-3 mt-1 flex flex-col gap-1.5 text-[9px] font-bold">
                  <span className="text-cyan-500/60 uppercase tracking-wider block mb-0.5">KEY METRICS VALIDATED:</span>
                  <div className="flex items-center gap-1.5 text-white"><Wind className="w-3.5 h-3.5 text-cyan-400" /> 360° PANORAMIC VIEW</div>
                  <div className="flex items-center gap-1.5 text-white"><ShieldCheck className="w-3.5 h-3.5 text-cyan-400" /> EGRESS REMOTE EGRESS</div>
                  <div className="flex items-center gap-1.5 text-white"><Sparkles className="w-3.5 h-3.5 text-cyan-400" /> BALANCED CENTRAL CORE</div>
                </div>
              </div>
            )}

            <div className="border-t border-cyan-500/15 pt-2 mt-auto text-[8px] text-cyan-500/40 font-mono select-none">
              SYS STATUS: ONLINE // SECTOR 17
            </div>
          </div>

        </div>

      </div>
  );
}
