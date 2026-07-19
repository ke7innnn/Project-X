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
  Zap
} from 'lucide-react';
import Image from 'next/image';

// Style presets
const STYLE_PRESETS = [
  { id: 'modernist', name: 'MODERNIST GLASS & STEEL', desc: 'Clean orthogonal lines, floor-to-ceiling glass grids.' },
  { id: 'brutalist', name: 'MONOLITHIC BRUTALIST', desc: 'Raw concrete volumes, deep shadow recesses.' },
  { id: 'biophilic', name: 'BIOPHILIC ORGANIC', desc: 'Integrated vegetation layers, fluid timber arches.' },
  { id: 'minimalist', name: 'MINIMALIST CONCRETE', desc: 'Stripped monolithic geometry, dramatic shadows.' },
  { id: 'vernacular', name: 'MODERN INDIAN VERNACULAR', desc: 'Intricate jali screens, terracotta tiles, open courtyards.' }
];

// Lighting presets
const LIGHT_PRESETS = [
  { id: 'dusk', name: 'DUSK / BLUE HOUR', icon: '🌙' },
  { id: 'golden', name: 'GOLDEN HOUR', icon: '☀️' },
  { id: 'overcast', name: 'MOODY OVERCAST', icon: '☁️' },
  { id: 'morning', name: 'CLEAR MORNING', icon: '🌅' }
];

// Local fallback demo assets matching keywords
const LOCAL_DEMO_IMAGES = [
  {
    keywords: ['interior', 'living', 'room', 'furniture', 'inside'],
    src: '/images/render-interior-living.png',
    title: 'BIOPHILIC RESIDENTIAL ATRIUM',
    desc: 'Dual-height architectural interior featuring exposed concrete columns, live planter walls, and custom timber furniture lit by high skylights.'
  },
  {
    keywords: ['panorama', 'vr', '360', 'immersive'],
    src: '/images/vr-panorama.png',
    title: 'PARAMETRIC EXHIBITION COWL',
    desc: 'Wide-angle interior perspective showcasing curved roof joists, modular concrete panels, and integrated accent cove lighting.'
  },
  {
    keywords: ['flythrough', 'walkthrough', 'drone', 'video'],
    src: '/images/flythrough-still.png',
    title: 'TERRACED HILLSIDE RETREAT',
    desc: 'Exterior aerial concept showing stepped concrete slabs integrated into a steep lush hillside overlooking an infinity pool.'
  },
  {
    keywords: ['exterior', 'facade', 'house', 'villa', 'dusk'],
    src: '/images/render-exterior-dusk.png',
    title: 'CANTILEVERED DUSK VILLA',
    desc: 'Exterior low-light rendering featuring bold concrete cantilevers, linear glazing, and reflecting pools casting warm illumination.'
  }
];

export default function IdeaGenerationPage() {
  const router = useRouter();

  // Form states
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState(STYLE_PRESETS[0].id);
  const [selectedLight, setSelectedLight] = useState(LIGHT_PRESETS[0].id);
  const [useDemoMode, setUseDemoMode] = useState(true);
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
    'PARSING TACTICAL CONCEPT BRIEF...',
    'GPT-4 ELABORATING FORM AND MATERIAL PROFILE...',
    'STRUCTURING FORM COMPOSITION GRIDS...',
    'RAYTRACING GLOBAL DUSK ILLUMINATION...',
    'FINALIZING VOLUMETRIC SHADER MATRIX...'
  ];

  // Log update effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isGenerating && generationStep < loadingSteps.length) {
      const currentStepMessage = loadingSteps[generationStep];
      setLogs((prev) => [...prev, `[SYS] ${currentStepMessage}`]);
      timer = setTimeout(() => {
        setGenerationStep((prev) => prev + 1);
      }, 900);
    } else if (isGenerating && generationStep === loadingSteps.length) {
      setIsGenerating(false);
      setLogs((prev) => [...prev, '[SYS] RENDERING PIPELINE COMPLETE. READY.']);
      
      // Load image
      if (useDemoMode) {
        const promptLower = prompt.toLowerCase();
        const matched = LOCAL_DEMO_IMAGES.find((img) =>
          img.keywords.some((keyword) => promptLower.includes(keyword))
        ) || LOCAL_DEMO_IMAGES[3];

        setResultImage(matched.src);
        setResultTitle(matched.title);
        setResultDesc(
          `Concept Render: "${prompt || 'Concept Residence'}" - Structured as ${
            STYLE_PRESETS.find(s => s.id === selectedStyle)?.name
          } in ${
            LIGHT_PRESETS.find(l => l.id === selectedLight)?.name
          }. ${matched.desc}`
        );
      }
    }
    return () => clearTimeout(timer);
  }, [isGenerating, generationStep]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setGenerationStep(0);
    setResultImage(null);
    setLogs(['[SYS] INITIALIZING COGNITIVE IMAGE SYNTHESIS...']);

    if (!useDemoMode) {
      try {
        const styleName = STYLE_PRESETS.find((s) => s.id === selectedStyle)?.name || '';
        const lightingName = LIGHT_PRESETS.find((l) => l.id === selectedLight)?.name || '';

        const response = await fetch('/api/generate-idea-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: `${prompt}. Styled in ${styleName} architecture, capturing a ${lightingName} environment`,
            style: styleName,
            apiKey: apiKey || undefined,
          }),
        });

        const data = await response.json();

        // Wait to finish simulated loading logs for HUD feel
        while (isGenerating) {
          await new Promise((r) => setTimeout(r, 100));
        }

        if (!response.ok) {
          throw new Error(data.error || 'DALL-E Generation request failed');
        }

        setResultImage(data.url);
        setResultTitle('AI RENDERED CONCEPT');
        setResultDesc(`DALL-E 3 Output: "${prompt}" - Styled as ${styleName} under ${lightingName} lighting.`);
      } catch (err: any) {
        setLogs((prev) => [...prev, `[ERR] ${err.message || 'API request failed'}. REVERTING TO SIMULATION MODE...`]);
        setUseDemoMode(true);
        
        const promptLower = prompt.toLowerCase();
        const matched = LOCAL_DEMO_IMAGES.find((img) =>
          img.keywords.some((keyword) => promptLower.includes(keyword))
        ) || LOCAL_DEMO_IMAGES[3];

        setResultImage(matched.src);
        setResultTitle(`${matched.title} (SIMULATION)`);
        setResultDesc(`Simulation Fallback: "${prompt}" - ${matched.desc}`);
      }
    }
  };

  const handleShare = () => {
    setCopiedLink(true);
    navigator.clipboard.writeText(window.location.href);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-cyan-400 font-mono flex flex-col relative overflow-hidden p-6 z-50">
        
        {/* Background Grid & Vignette overlays */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none z-0" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,#0a0a0f_95%)] pointer-events-none z-0" />

        {/* Top Header Navigation HUD */}
        <div className="relative z-10 flex items-center justify-between border-b border-cyan-500/20 pb-4 mb-6">
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
              <h1 className="text-xl font-bold tracking-[2px] text-white">IDEA GENERATION PANEL</h1>
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
                OPENAI API
              </button>
            </div>
            
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded border transition-colors cursor-pointer ${
                showSettings ? 'bg-cyan-500/30 border-cyan-400 text-white' : 'border-cyan-500/30 bg-cyan-950/20 hover:border-cyan-400'
              }`}
              title="OpenAI API Keys"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Floating Settings Panel */}
        {showSettings && (
          <div className="relative z-20 max-w-lg mb-6 p-4 rounded border border-cyan-500/30 bg-[#0c0c14]/90 backdrop-blur-md text-left text-xs text-cyan-500/80 leading-relaxed">
            <h4 className="font-bold text-white mb-1.5 uppercase tracking-wider">OpenAI API Connection</h4>
            <p className="mb-3">
              Provide an OpenAI secret key to generate live high-quality DALL-E 3 images directly inside the Command center. If not configured, simulation mode uses local high-resolution assets.
            </p>
            <div className="flex flex-col gap-2">
              <label className="text-[9px] tracking-widest text-cyan-500/50 uppercase">API Secret Key</label>
              <input 
                type="password"
                placeholder="sk-proj-..."
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

        {/* Main Grid Workspace */}
        <div className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Controls Column */}
          <div className="lg:col-span-4 flex flex-col gap-5 text-left bg-slate-900/30 backdrop-blur border border-white/10 p-5 rounded-xl">
            <form onSubmit={handleGenerate} className="flex flex-col gap-5">
              
              {/* Concept Input */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] tracking-[3px] text-cyan-500/60 uppercase font-mono block">CONCEPT BRIEF INPUT</span>
                <textarea
                  placeholder="E.g. Modernist modular villa, timber facade panels, double volume glazing, morning light..."
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isGenerating}
                  className="w-full bg-black/40 border border-cyan-500/30 focus:border-cyan-400 focus:outline-none rounded-lg p-3.5 text-xs leading-relaxed text-cyan-400 placeholder-cyan-500/20 resize-none transition-colors"
                />
              </div>

              {/* Architectural Presets */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] tracking-[3px] text-cyan-500/60 uppercase font-mono block">STYLE SELECTOR</span>
                <div className="flex flex-col gap-2 max-h-56 overflow-y-auto no-scrollbar pr-1">
                  {STYLE_PRESETS.map((style) => (
                    <div
                      key={style.id}
                      onClick={() => !isGenerating && setSelectedStyle(style.id)}
                      className={`p-2.5 rounded border cursor-pointer select-none transition-all ${
                        selectedStyle === style.id
                          ? 'bg-cyan-500/10 border-cyan-400 text-white shadow-[0_0_8px_rgba(0,240,255,0.15)]'
                          : 'border-cyan-500/10 bg-black/20 text-cyan-500/50 hover:text-cyan-400 hover:border-cyan-500/30'
                      }`}
                    >
                      <div className="text-[11px] font-bold tracking-wider">{style.name}</div>
                      <div className="text-[9px] mt-0.5 opacity-60 leading-normal">{style.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lighting Presets */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] tracking-[3px] text-cyan-500/60 uppercase font-mono block">LIGHTING PROTOCOL</span>
                <div className="grid grid-cols-2 gap-2">
                  {LIGHT_PRESETS.map((light) => (
                    <div
                      key={light.id}
                      onClick={() => !isGenerating && setSelectedLight(light.id)}
                      className={`p-2 rounded border text-center cursor-pointer select-none transition-all flex items-center justify-center gap-1.5 ${
                        selectedLight === light.id
                          ? 'bg-cyan-500/10 border-cyan-400 text-white shadow-[0_0_8px_rgba(0,240,255,0.15)]'
                          : 'border-cyan-500/10 bg-black/20 text-cyan-500/50 hover:text-cyan-400 hover:border-cyan-500/30'
                      }`}
                    >
                      <span className="text-xs">{light.icon}</span>
                      <span className="text-[10px] font-bold">{light.name.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Generate button */}
              <button
                type="submit"
                disabled={isGenerating || !prompt.trim()}
                className={`w-full py-2.5 rounded font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  isGenerating || !prompt.trim()
                    ? 'bg-cyan-950/10 border border-cyan-500/10 text-cyan-500/30'
                    : 'bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 hover:border-cyan-400 text-[#00f0ff] shadow-[0_0_15px_rgba(0,240,255,0.1)]'
                }`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>SYNTHESIZING MATRIX...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>EXECUTE IDEATION</span>
                  </>
                )}
              </button>

            </form>
          </div>

          {/* Render Area Column */}
          <div className="lg:col-span-5 flex flex-col gap-4 text-left">
            <div className="relative w-full aspect-[16/10] rounded-xl overflow-hidden border border-cyan-500/20 bg-[#050508] flex items-center justify-center p-6 shadow-2xl">
              
              {/* Grid elements */}
              <div className="absolute inset-0 bg-[radial-gradient(#00f0ff_1px,transparent_1.5px)] [background-size:16px_16px] opacity-10 pointer-events-none" />

              {/* Simulation Loader HUD overlay */}
              {isGenerating && (
                <div className="absolute inset-0 bg-[#0a0a0f]/95 z-30 flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
                  <div className="relative w-16 h-16 mb-4 flex items-center justify-center">
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

              {/* Render Image output */}
              {resultImage ? (
                <div className="relative w-full h-full rounded border border-cyan-500/20 bg-black animate-fadeIn">
                  <Image
                    src={resultImage}
                    alt={resultTitle}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1440px) 100vw, 1440px"
                    priority
                  />
                  
                  {/* Action overlays */}
                  <div className="absolute top-3 right-3 flex items-center gap-2">
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
                    Awaiting target coordinates. Input prompt and execute ideation program.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Design Sheet Brief */}
            {resultImage && !isGenerating && (
              <div className="p-4 rounded border border-cyan-500/20 bg-slate-900/30 backdrop-blur flex flex-col gap-2.5 shadow-lg animate-fadeIn text-xs leading-relaxed text-cyan-500/80">
                <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                  <Compass className="w-4 h-4" />
                  <h4 className="uppercase tracking-wider">{resultTitle}</h4>
                </div>
                <p className="text-[11px] leading-relaxed text-white">
                  {resultDesc}
                </p>
                <div className="border-t border-cyan-500/10 pt-3 mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-[9px] font-mono text-cyan-500/40">
                  <div>STYLE: {STYLE_PRESETS.find(s => s.id === selectedStyle)?.name}</div>
                  <div>LIGHTING: {LIGHT_PRESETS.find(l => l.id === selectedLight)?.name}</div>
                  <div>CORE: DALL-E-3 PIPELINE</div>
                </div>
              </div>
            )}
          </div>

          {/* Console / Terminal Log Column */}
          <div className="lg:col-span-3 flex flex-col gap-3 bg-slate-900/30 backdrop-blur border border-white/10 p-4 rounded-xl text-left h-full min-h-[360px] lg:min-h-[480px]">
            <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-2 mb-1">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">CONSOLE FEED</span>
            </div>
            
            <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-2 font-mono text-[9px] text-cyan-500/60 leading-normal max-h-96 pr-1">
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

            <div className="border-t border-cyan-500/15 pt-2 mt-auto text-[8px] text-cyan-500/40 font-mono">
              SYS STATUS: ONLINE // SECTOR 17
            </div>
          </div>

        </div>

      </div>
  );
}
