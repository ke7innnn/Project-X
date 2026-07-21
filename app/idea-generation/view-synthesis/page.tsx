'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Lock,
  Unlock,
  Download,
  Share2,
  Loader2,
  Terminal,
  Check,
  RefreshCw,
  Zap,
  Eye,
  Camera,
  Compass,
  Sparkles,
  AlertTriangle,
  Box,
  Settings,
} from 'lucide-react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useActiveProjectGuard } from '@/lib/useActiveProjectGuard';

// ── Angle Presets ──────────────────────────────────────────────────────────────
const ANGLE_PRESETS = [
  {
    id: 'front-elevation',
    title: 'FRONT ELEVATION',
    desc: 'Straight-on front view, eye level',
    angleLine: 'Straight-on front elevation, eye level, building centered and symmetric.',
  },
  {
    id: 'hero-3q',
    title: '3/4 HERO VIEW',
    desc: 'Front-left corner, slight low angle',
    angleLine: 'Three-quarter hero view from the front-left corner, slight low angle looking up from ground level.',
  },
  {
    id: 'rear-3q',
    title: 'REAR 3/4 VIEW',
    desc: 'Opposite rear corner view',
    angleLine: 'Three-quarter view from the opposite rear corner.',
  },
  {
    id: 'aerial',
    title: 'AERIAL DRONE',
    desc: '45° from above, roof and massing',
    angleLine: 'Aerial drone view, roughly 45 degrees from above, showing the roof and full massing.',
  },
  {
    id: 'worms-eye',
    title: "WORM'S EYE",
    desc: 'Street level, looking straight up',
    angleLine: 'Dramatic worm\'s-eye view from street level looking straight up the facade, emphasizing height.',
  },
  {
    id: 'dusk-wide',
    title: 'DUSK WIDE SHOT',
    desc: 'Establishing shot at dusk, warm lights',
    angleLine: 'Wide establishing shot at dusk with warm interior lights on, minimal surrounding context.',
  },
];

// ── Types ──────────────────────────────────────────────────────────────────────
type ModuleState = 'idle' | 'generatingHero' | 'heroReady' | 'heroLocked' | 'generatingAngles' | 'done';

interface AngleResult {
  id: string;
  url: string | null;
  loading: boolean;
  error: string | null;
}

// ── Prompt Builders ────────────────────────────────────────────────────────────
function buildHeroPrompt(footprintShape: string, stories: string, designNotes: string): string {
  return `You are given a top-down architectural floor plan of one typical floor of a high-rise residential tower. Generate a single photorealistic exterior render of the complete finished building this floor belongs to.

The building footprint and massing must follow the shape of this plan: ${footprintShape}. It is a ${stories} high-rise tower. Design intent: ${designNotes}.

Premium real-estate architectural visualization. Three-quarter hero angle from ground level, golden-hour lighting, clean sky, modern materials (glass, concrete, metal cladding), high detail, no text, no watermark.`;
}

function buildAnglePrompt(angleLine: string): string {
  return `Using the attached image as the exact reference, render the SAME building — identical facade design, materials, colour palette, number of floors, window and balcony pattern, roofline, and overall massing. Do not add, remove, or redesign any architectural element. Change the camera only:

${angleLine}

Photorealistic architectural visualization, consistent daytime lighting, clean sky, high detail, premium real-estate render quality. Same building, new viewpoint only. No text, no watermark.`;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function ViewSynthesisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Guard the active project spine
  const { activeProject } = useActiveProjectGuard();

  // Read config from URL params
  const floorPlanImageUrl = searchParams.get('floorPlanImageUrl') || '';
  const footprintShape = searchParams.get('footprintShape') || 'CURVED X-SHAPE';
  const overallWidth = searchParams.get('overallWidth') || '100.00';
  const overallLength = searchParams.get('overallLength') || '100.00';
  const storyCount = searchParams.get('storyCount') || 'G + 50';
  const initialDesignNotes = searchParams.get('designNotes') || '';

  // State machine
  const [moduleState, setModuleState] = useState<ModuleState>('idle');
  const [designNotes, setDesignNotes] = useState(initialDesignNotes);

  // Hero state
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [heroLoading, setHeroLoading] = useState(false);
  const [heroError, setHeroError] = useState<string | null>(null);

  // Angle state — one entry per preset
  const [angleResults, setAngleResults] = useState<AngleResult[]>(
    ANGLE_PRESETS.map((a) => ({ id: a.id, url: null, loading: false, error: null }))
  );
  const [anglesGenerated, setAnglesGenerated] = useState(0);

  // Settings
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Auto-scroll console
  const [logs, setLogs] = useState<string[]>([]);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Sync state with active project
  useEffect(() => {
    if (activeProject) {
      if (activeProject.assets.hero) {
        setHeroImageUrl(activeProject.assets.hero);
        setModuleState('heroLocked');
      }
      if (activeProject.assets.angles.length > 0) {
        setAngleResults(prev => prev.map(a => {
          const match = activeProject.assets.angles.find(
            pa => pa.label === a.id || 
                  pa.label === ANGLE_PRESETS.find(ap => ap.id === a.id)?.title
          );
          return match ? { ...a, url: match.url, error: null } : a;
        }));
      }
    }
  }, [activeProject?.id]);
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Initial log on mount
  useEffect(() => {
    if (floorPlanImageUrl) {
      addLog('REFERENCE FLOOR PLAN LOADED. AWAITING HERO SYNTHESIS...');
    } else {
      addLog('NO FLOOR PLAN URL DETECTED. RETURN TO IDEATION AND GENERATE A PLAN FIRST.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLog = useCallback((msg: string, isError = false) => {
    setLogs((prev) => [...prev, isError ? `[ERR] ${msg}` : `[SYS] ${msg}`]);
  }, []);

  // ── Hero Generation ────────────────────────────────────────────────────────
  const handleGenerateHero = async () => {
    if (!floorPlanImageUrl) {
      addLog('CANNOT GENERATE — NO FLOOR PLAN IMAGE URL.', true);
      return;
    }

    setModuleState('generatingHero');
    setHeroLoading(true);
    setHeroError(null);
    setHeroImageUrl(null);
    addLog('SYNTHESIZING EXTERIOR MASSING FROM FLOOR PLAN...');

    try {
      const prompt = buildHeroPrompt(footprintShape, storyCount, designNotes);
      const res = await fetch('/api/generate-view-synthesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'hero',
          floorPlanImageUrl,
          prompt,
          apiKey: apiKey || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Hero generation failed');

      setHeroImageUrl(data.url);
      setModuleState('heroReady');
      addLog('HERO VIEW READY. REVIEW AND LOCK THE DESIGN TO PROCEED.');
    } catch (err: any) {
      setHeroError(err.message || 'Hero generation failed');
      setModuleState('idle');
      addLog(`HERO GENERATION FAILED: ${err.message}`, true);
    } finally {
      setHeroLoading(false);
    }
  };

  // ── Lock Hero ──────────────────────────────────────────────────────────────
  const handleLockHero = () => {
    if (!heroImageUrl) return;

    // Warn if angles already exist
    const existingAngles = angleResults.filter((a) => a.url !== null).length;
    if (existingAngles > 0) {
      const confirmed = window.confirm(
        `You have ${existingAngles} angle view(s) already generated. Re-locking will NOT clear them, but they were generated from the previous hero. Continue?`
      );
      if (!confirmed) return;
    }

    setModuleState('heroLocked');
    addLog('DESIGN LOCKED. ANGLE GENERATION PIPELINE ONLINE.');
    // Lock hero writes to assets.hero
    useArchitectStore.getState().addProjectAsset('hero', heroImageUrl);
  };

  // ── Unlock Hero (re-enter editing) ─────────────────────────────────────────
  const handleUnlockHero = () => {
    setModuleState('heroReady');
    addLog('DESIGN UNLOCKED. YOU MAY REGENERATE THE HERO VIEW.');
  };

  // ── Single Angle Generation ────────────────────────────────────────────────
  const generateSingleAngle = async (angleIndex: number) => {
    if (moduleState !== 'heroLocked' && moduleState !== 'generatingAngles' && moduleState !== 'done') return;
    if (!heroImageUrl) return;

    const preset = ANGLE_PRESETS[angleIndex];
    if (!preset) return;

    // Update individual card loading state
    setAngleResults((prev) =>
      prev.map((a, i) => (i === angleIndex ? { ...a, loading: true, error: null, url: null } : a))
    );
    addLog(`GENERATING ${preset.title} VIEW...`);

    try {
      const prompt = buildAnglePrompt(preset.angleLine);

      // GUARDRAIL: Only heroImageUrl is sent. floorPlanImageUrl is never referenced here.
      const res = await fetch('/api/generate-view-synthesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'angle',
          heroImageUrl,
          prompt,
          apiKey: apiKey || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${preset.title} generation failed`);

      setAngleResults((prev) =>
        prev.map((a, i) => (i === angleIndex ? { ...a, url: data.url, loading: false } : a))
      );
      setAnglesGenerated((prev) => prev + 1);
      addLog(`${preset.title} COMPLETE.`);
      
      // Auto-save generated angle to active project
      useArchitectStore.getState().addProjectAsset('angles', {
        label: preset.title,
        url: data.url
      });
    } catch (err: any) {
      setAngleResults((prev) =>
        prev.map((a, i) =>
          i === angleIndex ? { ...a, loading: false, error: err.message || 'Failed' } : a
        )
      );
      addLog(`${preset.title} FAILED: ${err.message}`, true);
    }
  };

  // ── Generate All Angles ────────────────────────────────────────────────────
  const handleGenerateAllAngles = async () => {
    if (moduleState !== 'heroLocked') return;
    setModuleState('generatingAngles');
    addLog('INITIATING FULL ANGLE SYNTHESIS — 6 CONCURRENT VIEWS...');

    // Fire all in parallel — each updates its own card independently
    const promises = ANGLE_PRESETS.map((_, idx) => generateSingleAngle(idx));
    await Promise.allSettled(promises);

    setModuleState('done');
    addLog('ALL ANGLE VIEWS GENERATED. SYNTHESIS COMPLETE.');
  };

  // ── Share / Download helpers ───────────────────────────────────────────────
  const handleShareImage = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const completedAngles = angleResults.filter((a) => a.url !== null).length;
  const isStep2Enabled = moduleState === 'heroLocked' || moduleState === 'generatingAngles' || moduleState === 'done';
  const isAnyAngleLoading = angleResults.some((a) => a.loading);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-cyan-400 font-mono flex flex-col relative overflow-hidden p-6 z-50">
      {/* Background Grid & Vignette */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,#0a0a0f_95%)] pointer-events-none z-0" />

      {/* ── Header Bar ──────────────────────────────────────────────────── */}
      <div className="relative z-10 flex items-center justify-between border-b border-cyan-500/20 pb-4 mb-6 select-none">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/idea-generation')}
            className="p-2 border border-cyan-500/30 hover:border-cyan-400 hover:text-white rounded bg-cyan-950/20 text-cyan-500/80 transition-all cursor-pointer flex items-center gap-1.5 text-xs tracking-wider"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>RETURN TO IDEATION</span>
          </button>
          <span className="h-6 w-px bg-cyan-500/20" />
          <div className="text-left">
            <span className="text-[9px] tracking-[4px] text-cyan-500/60 uppercase block">COGNITIVE MODULE</span>
            <h1 className="text-xl font-bold tracking-[2px] text-white">MULTI-ANGLE VIEW SYNTHESIS</h1>
          </div>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded border transition-colors cursor-pointer ${
            showSettings ? 'bg-cyan-500/30 border-cyan-400 text-white' : 'border-cyan-500/30 bg-cyan-950/20 hover:border-cyan-400'
          }`}
          title="API Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="relative z-20 max-w-lg mb-6 p-4 rounded border border-cyan-500/30 bg-[#0c0c14]/90 backdrop-blur-md text-left text-xs text-cyan-500/80 leading-relaxed">
          <h4 className="font-bold text-white mb-1.5 uppercase tracking-wider">Fal AI API Connection</h4>
          <p className="mb-3">Override the server-side FAL_KEY with a custom key for this session.</p>
          <div className="flex flex-col gap-2">
            <label className="text-[9px] tracking-widest text-cyan-500/50 uppercase">Fal AI API Key</label>
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
            <button onClick={() => setShowSettings(false)} className="text-cyan-400 hover:text-white font-bold cursor-pointer">DISMISS</button>
          </div>
        </div>
      )}

      {/* ── Main Grid ───────────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch overflow-hidden">

        {/* ── Left Column: Steps ──────────────────────────────────────── */}
        <div className="lg:col-span-9 flex flex-col gap-6 overflow-y-auto no-scrollbar pr-2">

          {/* ════ STEP 1 — LOCK THE LOOK ════════════════════════════════ */}
          <div className="bg-slate-900/30 backdrop-blur border border-white/10 p-5 rounded-xl">
            <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-2 mb-4 select-none">
              <Eye className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">STEP 1 · LOCK THE LOOK</span>
              {moduleState === 'heroLocked' && (
                <span className="ml-auto flex items-center gap-1 text-[9px] text-green-400 font-bold tracking-wider">
                  <Lock className="w-3 h-3" /> LOCKED
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Floor Plan + Design Notes */}
              <div className="flex flex-col gap-3">
                <div className="relative aspect-square rounded-lg overflow-hidden border border-cyan-500/20 bg-[#050508] flex items-center justify-center">
                  <div className="absolute inset-0 bg-[radial-gradient(#00f0ff_1px,transparent_1.5px)] [background-size:12px_12px] opacity-5 pointer-events-none" />
                  {floorPlanImageUrl ? (
                    <img src={floorPlanImageUrl} alt="Floor Plan" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-center p-4 text-cyan-500/40 text-[10px]">
                      <Compass className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      NO FLOOR PLAN LOADED
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-0.5 rounded text-[8px] text-cyan-500/70 tracking-wider uppercase">
                    SOURCE FLOOR PLAN
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] tracking-[2px] text-cyan-500/60 uppercase font-mono block">DESIGN NOTES / INTENT</label>
                  <textarea
                    rows={3}
                    value={designNotes}
                    onChange={(e) => setDesignNotes(e.target.value)}
                    disabled={moduleState === 'heroLocked' || heroLoading}
                    placeholder="E.g. Modern glass facade, sky gardens on every 10th floor, warm-toned stone cladding..."
                    className="w-full bg-black/30 border border-white/10 focus:border-cyan-400 focus:outline-none rounded-lg p-2.5 text-[11px] leading-normal text-cyan-400 placeholder-cyan-500/20 resize-none transition-colors disabled:opacity-40"
                  />
                </div>
              </div>

              {/* Hero Preview */}
              <div className="flex flex-col gap-3">
                <div className="relative aspect-square rounded-lg overflow-hidden border border-cyan-500/20 bg-[#050508] flex items-center justify-center">
                  <div className="absolute inset-0 bg-[radial-gradient(#00f0ff_1px,transparent_1.5px)] [background-size:12px_12px] opacity-5 pointer-events-none" />

                  {heroLoading && (
                    <div className="absolute inset-0 bg-[#0a0a0f]/95 z-30 flex flex-col items-center justify-center animate-fadeIn">
                      <div className="relative w-14 h-14 mb-4 flex items-center justify-center">
                        <div className="absolute inset-0 border border-cyan-500/20 rounded-full" />
                        <div className="absolute inset-0 border border-t-[#00f0ff] rounded-full animate-spin" />
                        <Camera className="w-5 h-5 text-cyan-400 animate-pulse" />
                      </div>
                      <span className="text-[10px] tracking-[3px] text-cyan-400 font-bold uppercase">SYNTHESIZING HERO</span>
                    </div>
                  )}

                  {heroImageUrl && !heroLoading ? (
                    <>
                      <img src={heroImageUrl} alt="Hero Render" className="w-full h-full object-contain" />
                      <div className="absolute top-2 right-2 flex items-center gap-1.5">
                        <button
                          onClick={() => handleShareImage(heroImageUrl, 'hero')}
                          className="p-1.5 rounded bg-black/75 border border-cyan-500/30 text-cyan-400 hover:text-white transition-colors cursor-pointer"
                          title="Copy Link"
                        >
                          {copiedLink === 'hero' ? <Check className="w-3 h-3 text-green-400" /> : <Share2 className="w-3 h-3" />}
                        </button>
                        <a
                          href={heroImageUrl}
                          download="hero-render.png"
                          className="p-1.5 rounded bg-black/75 border border-cyan-500/30 text-cyan-400 hover:text-white transition-colors flex items-center"
                          title="Download"
                        >
                          <Download className="w-3 h-3" />
                        </a>
                      </div>
                      {moduleState === 'heroLocked' && (
                        <div className="absolute bottom-2 left-2 bg-green-500/20 border border-green-400/30 px-2 py-0.5 rounded text-[8px] text-green-400 tracking-wider uppercase flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> DESIGN LOCKED
                        </div>
                      )}
                    </>
                  ) : !heroLoading ? (
                    <div className="text-center p-4 text-cyan-500/40 text-[10px]">
                      <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30 animate-pulse" />
                      HERO RENDER PREVIEW
                    </div>
                  ) : null}

                  {heroError && (
                    <div className="absolute bottom-2 left-2 right-2 bg-red-500/10 border border-red-400/30 px-2 py-1 rounded text-[9px] text-red-400">
                      {heroError}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  {moduleState !== 'heroLocked' ? (
                    <>
                      <button
                        onClick={handleGenerateHero}
                        disabled={heroLoading || !floorPlanImageUrl}
                        className="flex-1 py-2.5 rounded font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 hover:border-cyan-400 text-[#00f0ff] shadow-[0_0_15px_rgba(0,240,255,0.1)] disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {heroLoading ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>SYNTHESIZING...</span></>
                        ) : heroImageUrl ? (
                          <><RefreshCw className="w-3.5 h-3.5" /><span>REGENERATE HERO</span></>
                        ) : (
                          <><Zap className="w-3.5 h-3.5" /><span>GENERATE HERO VIEW</span></>
                        )}
                      </button>
                      {heroImageUrl && !heroLoading && (
                        <button
                          onClick={handleLockHero}
                          className="px-5 py-2.5 rounded font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 hover:border-green-400 text-green-400"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>LOCK THIS DESIGN</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={handleUnlockHero}
                      disabled={isAnyAngleLoading}
                      className="flex-1 py-2.5 rounded font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-400 text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>UNLOCK & MODIFY</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ════ STEP 2 — GENERATE ANGLES ══════════════════════════════ */}
          <div
            className={`bg-slate-900/30 backdrop-blur border border-white/10 p-5 rounded-xl transition-all duration-300 ${
              !isStep2Enabled ? 'opacity-30 pointer-events-none' : ''
            }`}
          >
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2 mb-4 select-none">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">
                  STEP 2 · GENERATE ANGLES
                </span>
              </div>
              {!isStep2Enabled && (
                <span className="text-[9px] text-cyan-500/40 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> LOCK HERO TO UNLOCK
                </span>
              )}
            </div>

            {/* Locked Hero Reference */}
            {heroImageUrl && isStep2Enabled && (
              <div className="flex items-center gap-3 mb-4 p-2.5 rounded-lg border border-cyan-500/20 bg-[#050508]/50">
                <div className="w-16 h-16 rounded border border-green-400/30 overflow-hidden shrink-0 relative">
                  <img src={heroImageUrl} alt="Locked Hero" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Lock className="w-3.5 h-3.5 text-green-400" />
                  </div>
                </div>
                <div>
                  <span className="text-[9px] text-green-400 font-bold tracking-wider uppercase block">REFERENCE IMAGE — LOCKED</span>
                  <span className="text-[9px] text-cyan-500/50">All angles are generated from this hero render</span>
                </div>
              </div>
            )}

            {/* Generate All Button */}
            <button
              onClick={handleGenerateAllAngles}
              disabled={!isStep2Enabled || isAnyAngleLoading}
              className="w-full mb-4 py-2.5 rounded font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 hover:border-cyan-400 text-[#00f0ff] shadow-[0_0_15px_rgba(0,240,255,0.1)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isAnyAngleLoading ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>GENERATING ANGLES...</span></>
              ) : (
                <><Zap className="w-3.5 h-3.5" /><span>GENERATE ALL ANGLES</span></>
              )}
            </button>

            {/* Angle Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ANGLE_PRESETS.map((preset, idx) => {
                const result = angleResults[idx];
                if (!result) return null;
                return (
                  <div
                    key={preset.id}
                    className={`rounded-xl border overflow-hidden transition-all ${
                      result.error
                        ? 'border-red-400/40 bg-red-500/5'
                        : result.url
                        ? 'border-cyan-500/30 bg-[#050508]'
                        : 'border-white/10 bg-[#050508]'
                    }`}
                  >
                    {/* Card Image Area */}
                    <div className="relative aspect-[4/3] flex items-center justify-center bg-[#050508]">
                      <div className="absolute inset-0 bg-[radial-gradient(#00f0ff_1px,transparent_1.5px)] [background-size:10px_10px] opacity-5 pointer-events-none" />

                      {result.loading && (
                        <div className="absolute inset-0 bg-[#0a0a0f]/90 z-20 flex flex-col items-center justify-center animate-fadeIn">
                          <div className="relative w-10 h-10 mb-2 flex items-center justify-center">
                            <div className="absolute inset-0 border border-cyan-500/20 rounded-full" />
                            <div className="absolute inset-0 border border-t-[#00f0ff] rounded-full animate-spin" />
                            <Camera className="w-4 h-4 text-cyan-400 animate-pulse" />
                          </div>
                          <span className="text-[8px] tracking-[2px] text-cyan-400 font-bold uppercase">RENDERING</span>
                        </div>
                      )}

                      {result.url && !result.loading ? (
                        <>
                          <img src={result.url} alt={preset.title} className="w-full h-full object-cover" />
                          <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                            <button
                              onClick={() => handleShareImage(result.url!, preset.id)}
                              className="p-1 rounded bg-black/75 border border-cyan-500/30 text-cyan-400 hover:text-white transition-colors cursor-pointer"
                              title="Copy Link"
                            >
                              {copiedLink === preset.id ? <Check className="w-2.5 h-2.5 text-green-400" /> : <Share2 className="w-2.5 h-2.5" />}
                            </button>
                            <a
                              href={result.url}
                              download={`${preset.id}.png`}
                              className="p-1 rounded bg-black/75 border border-cyan-500/30 text-cyan-400 hover:text-white transition-colors flex items-center"
                              title="Download"
                            >
                              <Download className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </>
                      ) : !result.loading ? (
                        <div className="text-center p-3 text-cyan-500/30 text-[9px]">
                          <Camera className="w-6 h-6 mx-auto mb-1 opacity-30" />
                          AWAITING
                        </div>
                      ) : null}

                      {result.error && !result.loading && (
                        <div className="absolute inset-0 bg-red-500/5 flex flex-col items-center justify-center p-2">
                          <AlertTriangle className="w-5 h-5 text-red-400 mb-1" />
                          <span className="text-[8px] text-red-400 text-center mb-2">{result.error}</span>
                          <button
                            onClick={() => generateSingleAngle(idx)}
                            className="px-2.5 py-1 rounded text-[9px] font-bold tracking-wider bg-red-500/20 border border-red-400/30 text-red-400 hover:text-white transition-colors cursor-pointer"
                          >
                            RETRY
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="p-2.5 border-t border-white/5">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-bold text-cyan-400 tracking-wider uppercase block">{preset.title}</span>
                          <span className="text-[8px] text-cyan-500/40">{preset.desc}</span>
                        </div>
                        {!result.url && !result.loading && !result.error && isStep2Enabled && (
                          <button
                            onClick={() => generateSingleAngle(idx)}
                            className="p-1.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:text-white transition-colors cursor-pointer"
                            title="Generate this angle"
                          >
                            <Zap className="w-3 h-3" />
                          </button>
                        )}
                        {result.url && (
                          <button
                            onClick={() => {
                              useArchitectStore.getState().addProjectAsset('angles', { label: preset.title, url: result.url! });
                            }}
                            className={`px-2 py-1.5 rounded text-[8px] font-bold tracking-wider border transition-colors cursor-pointer flex items-center gap-1 ${
                              activeProject?.assets.angles.some(a => a.url === result.url)
                                ? 'text-emerald-400 bg-emerald-950/45 border-emerald-900/40 hover:bg-emerald-900/30'
                                : 'text-green-400 bg-green-950/45 border-green-900/40 hover:bg-green-900/30'
                            }`}
                            title="Finalize Angle"
                          >
                            ★ {activeProject?.assets.angles.some(a => a.url === result.url) ? '✓ FINALIZED' : '★ FINALIZE'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ════ PHASE 2 — 3D ORBIT (COMING SOON) ═════════════════════ */}
          <div className="bg-slate-900/30 backdrop-blur border border-white/10 p-5 rounded-xl opacity-40 pointer-events-none select-none">
            <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-2 mb-3">
              <Box className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">
                PHASE 2 · 3D ORBIT VIEWER
              </span>
              <span className="ml-auto text-[8px] bg-cyan-500/10 border border-cyan-500/20 rounded px-2 py-0.5 text-cyan-500/60 tracking-wider">
                COMING SOON
              </span>
            </div>
            <div className="flex items-center justify-center py-10 text-cyan-500/30 text-[10px] text-center">
              <div>
                <Box className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p>Interactive 3D model generation from hero render.</p>
                <p className="mt-1 text-[9px]">Drag to orbit • Pinch to zoom • VR-ready export</p>
              </div>
            </div>
          </div>

        </div>

        {/* ── Right Column: Console Feed + Summary ────────────────────── */}
        <div className="lg:col-span-3 flex flex-col gap-4 bg-slate-900/30 backdrop-blur border border-white/10 p-5 rounded-xl text-left overflow-y-auto no-scrollbar">
          <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-2 mb-1 select-none">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">CONSOLE FEED</span>
          </div>

          <div className="flex-1 min-h-[200px] overflow-y-auto no-scrollbar flex flex-col gap-2 font-mono text-[9px] text-cyan-500/60 leading-normal pr-1 bg-black/10 p-2 rounded border border-white/5">
            {logs.length === 0 ? (
              <div className="italic text-cyan-500/30">[Awaiting command execution]</div>
            ) : (
              logs.map((log, idx) => (
                <div
                  key={idx}
                  className={
                    log.startsWith('[ERR]')
                      ? 'text-red-400'
                      : log.startsWith('[SYS]')
                      ? 'text-cyan-400'
                      : 'text-cyan-500/60'
                  }
                >
                  {log}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>

          {/* Project Summary */}
          <div className="flex flex-col gap-2.5 border-t border-cyan-500/20 pt-3.5 mt-1 select-none text-[11px] leading-relaxed">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <Compass className="w-3.5 h-3.5" />
              <span className="uppercase tracking-wider">PROJECT SUMMARY</span>
            </div>
            <div className="text-[10px] text-white flex flex-col gap-1">
              <div>• Footprint: {footprintShape}</div>
              <div>• Dimensions: {overallWidth}m × {overallLength}m</div>
              <div>• Height: {storyCount}</div>
              <div>• Hero: {heroImageUrl ? (moduleState === 'heroLocked' ? '✅ LOCKED' : '⏳ READY') : '—'}</div>
              <div>• Views generated: {completedAngles}/6</div>
            </div>
          </div>

          <div className="border-t border-cyan-500/15 pt-2 mt-auto text-[8px] text-cyan-500/40 font-mono select-none">
            SYS STATUS: {isAnyAngleLoading || heroLoading ? 'RENDERING' : 'ONLINE'} // VIEW SYNTHESIS
          </div>
        </div>

      </div>
    </div>
  );
}
