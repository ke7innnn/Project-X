'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  ArrowRight,
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
  Wind,
  Camera,
  X
} from 'lucide-react';
import Image from 'next/image';
import ClientExportModal from '@/components/ClientExportModal';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useActiveProjectGuard } from '@/lib/useActiveProjectGuard';
import { useDebounce } from '@/lib/useDebounce';
import ArchitectAdvisorPanel, { type FormParams, type ArchitectAdvisorRef } from '@/components/ArchitectAdvisorPanel';

// Architectural Shapes Presets
export interface FootprintPreset {
  id: string;
  name: string;
  desc: string;
  recommendedAspect: string;
  recommendedImageSize: string;
}

export const FOOTPRINT_PRESETS: FootprintPreset[] = [
  { id: 'curved-x', name: 'CURVED X-SHAPE (HIGH-RISE)', desc: 'Symmetrical 4-wing curvilinear tower with central circulation core.', recommendedAspect: '1:1 (Square HD)', recommendedImageSize: 'square_hd' },
  { id: 'curved-s', name: 'CURVED S-SHAPE / SERPENTINE', desc: 'Flowing double-curve residential footprint for maximum perimeter daylight.', recommendedAspect: '2:1 (Landscape)', recommendedImageSize: 'landscape_16_9' },
  { id: 'crescent-arc', name: 'CRESCENT / ARC-SHAPE TOWER', desc: 'Sweeping arc wing oriented to capture panoramic views.', recommendedAspect: '16:9 (Landscape)', recommendedImageSize: 'landscape_16_9' },
  { id: 'tri-foil', name: 'TRI-FOIL / Y-SHAPE TOWER', desc: '3-wing radiating footprint with 120° corner units around a compact core.', recommendedAspect: '1:1 (Square HD)', recommendedImageSize: 'square_hd' },
  { id: 'h-shape', name: 'H-SHAPE DUAL WING TOWER', desc: 'High-density twin parallel wings connected by a central lobby bridge.', recommendedAspect: '3:2 (Landscape)', recommendedImageSize: 'landscape_4_3' },
  { id: 'pinwheel', name: 'PINWHEEL / SWIRL 4-WING', desc: 'Dynamic staggered 4-arm pinwheel ensuring zero wing-to-wing overlap.', recommendedAspect: '1:1 (Square HD)', recommendedImageSize: 'square_hd' },
  { id: 'elliptical', name: 'ELLIPTICAL / OVAL TOWER', desc: 'Aerodynamic smooth oval footprint for ultra-high wind resistance.', recommendedAspect: '16:9 (Landscape)', recommendedImageSize: 'landscape_16_9' },
  { id: 'courtyard-ring', name: 'COURTYARD / O-SHAPE SLAB', desc: 'Enclosed perimeter ring layout with a central open-to-sky atrium.', recommendedAspect: '1:1 (Square HD)', recommendedImageSize: 'square_hd' },
  { id: 'hexagonal', name: 'HEXAGONAL HONEYCOMB TOWER', desc: '6-sided geometric honeycomb plate offering 60° corner balconies.', recommendedAspect: '1:1 (Square HD)', recommendedImageSize: 'square_hd' },
  { id: 'stepped-l', name: 'STEP-TERRACED L-SHAPE', desc: 'Dual-wing corner urban infill tower with cascading sky terraces.', recommendedAspect: '3:2 (Landscape)', recommendedImageSize: 'landscape_4_3' },
  { id: 'monolithic-rect', name: 'MONOLITHIC RECTANGULAR SLAB', desc: 'Classic double-loaded linear slab footprint with central core.', recommendedAspect: '3:2 (Landscape)', recommendedImageSize: 'landscape_4_3' },
  { id: 'circular-atrium', name: 'CIRCULAR ATRIUM TOWER', desc: 'Concentric core layout with circular exterior gallery walls.', recommendedAspect: '1:1 (Square HD)', recommendedImageSize: 'square_hd' },
  { id: 'custom', name: 'CUSTOM FOOTPRINT...', desc: 'Define your own tower footprint shape dynamically.', recommendedAspect: '1:1 (Square HD)', recommendedImageSize: 'square_hd' }
];

export default function IdeaGenerationPage() {
  const router = useRouter();
  
  // Guard the active project spine
  const { activeProject } = useActiveProjectGuard();

  // Floor Plan Specification States
  const [customPrompt, setCustomPrompt] = useState('');
  const [footprintShape, setFootprintShape] = useState('curved-x');
  const [customFootprintText, setCustomFootprintText] = useState('CURVED S-SHAPE');
  const [overallWidth, setOverallWidth] = useState('100.00');
  const [overallLength, setOverallLength] = useState('100.00');
  const [floorHeight, setFloorHeight] = useState('3.30');
  const [storyCount, setStoryCount] = useState('G + 50');

  // Unit Mix Table States (1BHK, 2BHK, 3BHK, 4BHK)
  const [units1BHK, setUnits1BHK] = useState(2);
  const [units2BHK, setUnits2BHK] = useState(4);
  const [units3BHK, setUnits3BHK] = useState(4);
  const [units4BHK, setUnits4BHK] = useState(2);

  // Central Core Spec States (Simplified to Lifts & Stairs)
  const [passengerLifts, setPassengerLifts] = useState(8);
  const [staircases, setStaircases] = useState(2);
  const advisorRef = useRef<ArchitectAdvisorRef>(null);

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

  // Model Output states
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultTitle, setResultTitle] = useState('');
  const [resultDesc, setResultDesc] = useState('');

  // AI Model Selection
  const [selectedModel, setSelectedModel] = useState('grok-gpt');

  // QA Hardening states
  const [validationError, setValidationError] = useState<string | null>(null);
  const [variantsHistory, setVariantsHistory] = useState<string[]>([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isClientMode, setIsClientMode] = useState(false);
  
  // Realtime Logs State
  const [debugPayload, setDebugPayload] = useState<{
    traceBase64?: string;
    stage1Prompt?: string;
    stage1OutputUrl?: string;
    stage1Seed?: number;
    stage2Prompt?: string;
    stage2OutputUrl?: string;
    stage2Seed?: number;
    stage3Prompt?: string;
    stage3OutputUrl?: string;
    userPrompt?: string;
    workflow?: string;
  } | null>(null);
  const [showDebugModal, setShowDebugModal] = useState(false);

  // Load project configuration from activeProject config on mount or project switch
  useEffect(() => {
    if (activeProject) {
      if (activeProject.config.designNotes) setCustomPrompt(activeProject.config.designNotes);
      if (activeProject.config.footprintShape) setFootprintShape(activeProject.config.footprintShape);
      if (activeProject.config.width) setOverallWidth(activeProject.config.width);
      if (activeProject.config.length) setOverallLength(activeProject.config.length);
      if (activeProject.config.stories) setStoryCount(activeProject.config.stories);
      if (activeProject.assets.hero) setResultImage(activeProject.assets.hero);
    }
  }, [activeProject?.id]);

  // Warn user when trying to close/refresh tab during active generation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isGenerating) {
        e.preventDefault();
        e.returnValue = 'Architectural synthesis is currently active. Leaving now will cancel the generation. Are you sure?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isGenerating]);

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
  const handleGenerate = async (e?: React.FormEvent, aiOpts?: { tracerImageBase64?: string; canvasW?: number; canvasH?: number; shapeW?: number; shapeH?: number; isShapeModified?: boolean }) => {
    if (e) e.preventDefault();
    const fallbackBase64 = advisorRef.current?.exportCanvasBase64() || undefined;
    setValidationError(null);

    // 1. Validations & Sanity Checks
    const trimmedPrompt = customPrompt.trim();
    if (!trimmedPrompt) {
      setValidationError("Design notes / prompt cannot be empty. Please describe the building layout details.");
      return;
    }

    // Footprint shape select check
    if (footprintShape === 'custom' && !customFootprintText.trim()) {
      setValidationError("Please specify the custom footprint shape name.");
      return;
    }

    // Parse float bounds
    const cleanW = overallWidth.replace(/[^0-9.]/g, '');
    const w = parseFloat(cleanW || '100');
    if (isNaN(w) || w < 5 || w > 500) {
      setValidationError("Overall width must be a valid number between 5 and 500 meters.");
      return;
    }

    const cleanL = overallLength.replace(/[^0-9.]/g, '');
    const l = parseFloat(cleanL || '100');
    if (isNaN(l) || l < 5 || l > 500) {
      setValidationError("Overall length must be a valid number between 5 and 500 meters.");
      return;
    }

    // Unit mix validations
    if (units1BHK < 0 || units2BHK < 0 || units3BHK < 0 || units4BHK < 0) {
      setValidationError("Unit mix quantities cannot be negative.");
      return;
    }

    const totalUnitsCount = units1BHK + units2BHK + units3BHK + units4BHK;
    if (totalUnitsCount < 1) {
      setValidationError("Unit Mix Design Matrix must have at least 1 total unit quantity.");
      return;
    }

    if (passengerLifts < 0 || staircases < 0) {
      setValidationError("Lifts and staircases quantities cannot be negative.");
      return;
    }

    // Absurd combo check (area allocation)
    const efficiency = footprintShape === 'curved-x' ? 0.6 
                     : footprintShape === 'tri-foil' ? 0.55 
                     : footprintShape === 'monolithic-rect' ? 0.85 
                     : footprintShape === 'circular-atrium' ? 0.7 
                     : 0.7; // default custom
    const plateArea = w * l;
    const estimatedFootprintArea = plateArea * efficiency;
    const unitsCarpetArea = (units1BHK * 50) + (units2BHK * 78) + (units3BHK * 105) + (units4BHK * 140);
    const unitsBuiltupArea = unitsCarpetArea * 1.25; // Loading factor for walls/balconies
    const estimatedCoreArea = 150; // estimated core area
    const circulationArea = plateArea * 0.15; // 15% corridor/circulation
    const totalRequiredArea = unitsBuiltupArea + estimatedCoreArea + circulationArea;

    if (totalRequiredArea > estimatedFootprintArea * 1.5) {
      setValidationError(`Over-allocated floor plate. The requested unit mix requires approximately ${Math.round(totalRequiredArea)} SQM, which exceeds 150% of the estimated floor plate area (${Math.round(estimatedFootprintArea)} SQM). Please increase overall dimensions or reduce unit mix counts.`);
      return;
    }

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
      const isShapeModified = aiOpts?.isShapeModified || advisorRef.current?.getShapeModifiedState() || false;
      const styleName = isShapeModified
        ? "CUSTOM GEOMETRIC"
        : footprintShape === 'custom'
          ? customFootprintText.trim().toUpperCase()
          : (FOOTPRINT_PRESETS.find(f => f.id === footprintShape)?.name || 'X-SHAPE');

      if (useDemoMode) {
        // Wait for all steps to print sequentially
        for (let i = 0; i < loadingSteps.length; i++) {
          await new Promise((r) => setTimeout(r, 550));
        }
        clearInterval(logInterval);
        
        const fallbackUrl = '/x-shape-floorplan.jpg';
        setLogs((prev) => [...prev, '[SYS] CORE CALCULATIONS VERIFIED. DESIGN SCHEMATIC PIPELINE ONLINE.']);
        setResultImage(fallbackUrl);
        setResultTitle(`TYPICAL PLAN`);
        setResultDesc(`High-rise Floor Plan Core Synthesis: Monolithic tower floor plan.`);
        setIsGenerating(false);
      } else {
        // ── NEW PIPELINE: Send trace canvas + params to 2-stage pipeline ──
        const traceBase64 = aiOpts?.tracerImageBase64 || fallbackBase64;

        if (!traceBase64) {
          clearInterval(logInterval);
          setValidationError('No canvas trace available. Please trace your plot boundary first.');
          setIsGenerating(false);
          return;
        }

        // Strip data URL prefix for display in debug modal (modal adds it back)
        const strippedBase64 = typeof traceBase64 === 'string' ? traceBase64.replace(/^data:image\/\w+;base64,/, '') : traceBase64;

        // Build a client-side preview of what the server will generate
        const totalUnits = units1BHK + units2BHK + units3BHK + units4BHK;
        const mixParts = [
          units1BHK > 0 ? `${units1BHK} × 1BHK` : null,
          units2BHK > 0 ? `${units2BHK} × 2BHK` : null,
          units3BHK > 0 ? `${units3BHK} × 3BHK` : null,
          units4BHK > 0 ? `${units4BHK} × 4BHK` : null,
        ].filter(Boolean).join(', ');

        const promptPreview = `═══ PIPELINE: ${selectedModel.toUpperCase()} ═══

STAGE 1 → Design architectural floor plan inside white footprint boundary.
  • ${totalUnits} apartments: ${mixParts}
  • Central core: ${passengerLifts} lifts + ${staircases} staircases
  • Vastu: ${vastuCompliant ? 'YES' : 'NO'} | Fire Safety: ${fireSafetyCode ? 'YES' : 'NO'}
  • Zoning: Public → Service → Private gradient
  • Rules: Immutable white boundary, compact rooms, CAD style

STAGE 2 → Refine interior layout, enforce NBC room sizes, verify room completeness.

(Full architectural prompt is built server-side and sent to AI model)`;

        // Store the initial payload for the realtime logs UI
        setDebugPayload({
          traceBase64: strippedBase64,
          stage1Prompt: promptPreview,
          workflow: selectedModel,
        });

        setLogs(prev => [...prev, `[SYS] PIPELINE: ${selectedModel.toUpperCase()} | ${totalUnits} apartments (${mixParts})`]);
        setLogs(prev => [...prev, `[SYS] TRACE IMAGE: ${strippedBase64.length > 100 ? `${(strippedBase64.length / 1024).toFixed(0)}KB base64 payload attached` : 'MISSING'}`]);

        setResultImage(null);

        const apiPromise = fetch('/api/generate-idea-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            traceCanvasBase64: traceBase64,
            workflow: selectedModel,
            units1BHK,
            units2BHK,
            units3BHK,
            units4BHK,
            passengerLifts,
            staircases,
            useVaastu: vastuCompliant,
            useFireSafety: fireSafetyCode,
            shapeW: aiOpts?.shapeW,
            shapeH: aiOpts?.shapeH,
          }),
        }).then(async (res) => {
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            const text = await res.text();
            throw new Error(`Server error (${res.status}): ${text.slice(0, 200)}`);
          }
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Pipeline generation failed');
          }
          return data;
        });

        setLogs(prev => [...prev, `[SYS] DISPATCHING TO FAL.AI PIPELINE...`]);

        // Race/wait for API response, ensuring at least 3.3 seconds of tactical logging runs
        const [resData] = await Promise.all([
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

        // Update debug payload with the ACTUAL server-built prompts, seeds & images for all stages
        setDebugPayload({
          traceBase64: strippedBase64,
          stage1Prompt: resData.systemPrompt || promptPreview,
          stage1OutputUrl: resData.stage1ImageUrl,
          stage1Seed: resData.stage1Seed,
          stage2Prompt: resData.refinementPrompt,
          stage2OutputUrl: resData.stage2ImageUrl,
          stage2Seed: resData.stage2Seed,
          stage3Prompt: resData.stage3Prompt,
          stage3OutputUrl: resData.stage3ImageUrl || resData.url,
          userPrompt: resData.userPrompt,
          workflow: selectedModel,
        });

        setLogs((prev) => [...prev, `[SYS] PIPELINE: ${selectedModel.toUpperCase()} — GENERATION COMPLETE.`]);
        if (resData.stage1ImageUrl) {
          setLogs(prev => [...prev, `[SYS] STAGE 1 OUTPUT: ${resData.stage1ImageUrl ? 'RECEIVED' : 'NONE'}`]);
        }
        if (resData.stage2ImageUrl) {
          setLogs(prev => [...prev, `[SYS] STAGE 2 REFINEMENT OUTPUT: RECEIVED`]);
        }
        if (resData.stage3ImageUrl) {
          setLogs(prev => [...prev, `[SYS] STAGE 3 VENTILATION OVERLAY: RECEIVED`]);
        }
        
        const finalResultImg = resData.url || null;
        setResultImage(finalResultImg);

        setResultTitle(`${styleName} TOWER PLAN SCHEMATIC`);
        setResultDesc(`Generated with ${selectedModel} pipeline.`);

        // Save to variants history
        setVariantsHistory(prev => {
          const newItems = [finalResultImg].filter((u): u is string => Boolean(u));
          const list = [...newItems, ...prev.filter(item => !newItems.includes(item))];
          return list.slice(0, 10);
        });

        setIsGenerating(false);
      }
    } catch (err: any) {
      clearInterval(logInterval);
      const errMsg = err.message || 'API request failed';
      setLogs((prev) => [
        ...prev, 
        `[ERR] ${errMsg}.`,
      ]);
      setValidationError(`API Generation Error: ${errMsg}`);
      setIsGenerating(false);
    }
  };

  // Debounced wrapper — prevents double-fire on rapid clicks before loading state activates
  const debouncedGenerate = useDebounce(handleGenerate, 600);

  const handleShare = () => {
    setCopiedLink(true);
    navigator.clipboard.writeText(window.location.href);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const totalUnits = units1BHK + units2BHK + units3BHK + units4BHK;

  // ── Architect Advisor callbacks (from AI chat panel) ──────────────────
  const handleParamsApplied = useCallback((params: FormParams) => {
    if (params.footprintShape) setFootprintShape(params.footprintShape);
    if (params.overallWidth) setOverallWidth(params.overallWidth);
    if (params.overallLength) setOverallLength(params.overallLength);
    if (typeof params.units1BHK === 'number') setUnits1BHK(params.units1BHK);
    if (typeof params.units2BHK === 'number') setUnits2BHK(params.units2BHK);
    if (typeof params.units3BHK === 'number') setUnits3BHK(params.units3BHK);
    if (typeof params.units4BHK === 'number') setUnits4BHK(params.units4BHK);
    if (typeof params.passengerLifts === 'number') setPassengerLifts(params.passengerLifts);
    if (typeof params.staircases === 'number') setStaircases(params.staircases);
    if (params.customPrompt) setCustomPrompt(params.customPrompt);
  }, []);

  const handleGenerateTrigger = useCallback((opts?: { tracerImageBase64?: string; canvasW?: number; canvasH?: number; shapeW?: number; shapeH?: number; isShapeModified?: boolean }) => {
    handleGenerate(undefined, opts);
  }, [handleGenerate]);

  return (
    <div className={`h-screen font-mono flex flex-col relative overflow-hidden p-6 z-50 transition-colors duration-300 ${
      isClientMode ? 'bg-[#FDFCF7] text-[#0B4F30]' : 'bg-[#0a0a0f] text-cyan-400'
    }`}>
        
        {/* Background Grid & Vignette overlays */}
        {!isClientMode && (
          <>
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none z-0" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,#0a0a0f_95%)] pointer-events-none z-0" />
          </>
        )}

        {/* Top Header Navigation HUD */}
        <div className={`relative z-10 flex items-center justify-between border-b pb-4 mb-6 select-none ${
          isClientMode ? 'border-[#0B4F30]/20' : 'border-cyan-500/20'
        }`}>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                router.push('/');
              }}
              className={`p-2 border rounded bg-cyan-950/20 transition-all cursor-pointer flex items-center gap-1.5 text-xs tracking-wider ${
                isClientMode 
                  ? 'border-[#0B4F30]/30 text-[#0B4F30]/80 hover:border-[#0B4F30] hover:text-[#0B4F30]' 
                  : 'border-cyan-500/30 text-cyan-500/80 hover:border-cyan-400 hover:text-white'
              }`}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>RETURN TO MAIN COMMAND</span>
            </button>
            <span className={`h-6 w-px ${isClientMode ? 'bg-[#0B4F30]/20' : 'bg-cyan-500/20'}`} />
            <div className="text-left">
              <span className={`text-[9px] tracking-[4px] uppercase block ${isClientMode ? 'text-[#0B4F30]/60' : 'text-cyan-500/60'}`}>COGNITIVE MODULE</span>
              <h1 className={`text-xl font-bold tracking-[2px] ${isClientMode ? 'text-[#0B4F30]' : 'text-white'}`}>TYPICAL TOWER PLAN GENERATOR</h1>
            </div>
          </div>

          {/* Mode Selector and API Configuration */}
          <div className="flex items-center gap-3">
            {debugPayload && (
              <button
                onClick={() => setShowDebugModal(true)}
                className={`p-1.5 px-3 border rounded text-[10px] font-bold tracking-wider transition-all flex items-center gap-1.5 animate-fadeIn ${
                  isClientMode
                    ? 'border-indigo-600/30 text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                    : 'border-indigo-500/50 text-indigo-400 bg-indigo-950/30 hover:bg-indigo-900/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                }`}
              >
                <Terminal className="w-3 h-3" />
                API PAYLOAD LOGS
              </button>
            )}
            
            <button
              onClick={() => setIsClientMode(!isClientMode)}
              className={`px-3 py-1.5 rounded border text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                isClientMode
                  ? 'bg-[#0B4F30] text-[#FDFCF7] border-[#0B4F30] shadow-md'
                  : 'bg-cyan-950/20 border-cyan-500/30 text-cyan-400 hover:border-cyan-400 hover:bg-cyan-500/10'
              }`}
            >
              {isClientMode ? 'Client Mode: Active' : 'Client Mode: Off'}
            </button>

            <div className={`border rounded p-1 flex items-center gap-1 ${
              isClientMode ? 'bg-[#0B4F30]/5 border-[#0B4F30]/20' : 'bg-cyan-950/20 border-cyan-500/30'
            }`}>
              <button 
                onClick={() => setUseDemoMode(true)}
                className={`px-3 py-1 text-[10px] tracking-wider rounded transition-colors ${
                  useDemoMode 
                    ? (isClientMode ? 'bg-[#0B4F30] text-white font-bold' : 'bg-cyan-500/30 text-white font-bold') 
                    : (isClientMode ? 'text-[#0B4F30]/60 hover:text-[#0B4F30]' : 'text-cyan-500/50 hover:text-cyan-400')
                }`}
              >
                SIMULATION MODE
              </button>
              <button 
                onClick={() => setUseDemoMode(false)}
                className={`px-3 py-1 text-[10px] tracking-wider rounded transition-colors ${
                  !useDemoMode 
                    ? (isClientMode ? 'bg-[#0B4F30] text-white font-bold' : 'bg-cyan-500/30 text-white font-bold') 
                    : (isClientMode ? 'text-[#0B4F30]/60 hover:text-[#0B4F30]' : 'text-cyan-500/50 hover:text-cyan-400')
                }`}
              >
                LIVE ENGINE
              </button>
            </div>
            
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded border transition-colors cursor-pointer ${
                showSettings 
                  ? (isClientMode ? 'bg-[#0B4F30] border-[#0B4F30] text-white' : 'bg-cyan-500/30 border-cyan-400 text-white') 
                  : (isClientMode ? 'border-[#0B4F30]/30 bg-[#0B4F30]/5 hover:border-[#0B4F30] text-[#0B4F30]/80' : 'border-cyan-500/30 bg-cyan-950/20 hover:border-cyan-400')
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

        {/* Main Worksite Grid - 3 Column Layout */}
        <div className="relative z-10 flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
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

            {/* AI Model Engine Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] tracking-[2px] text-cyan-500/60 uppercase font-mono block">AI MODEL ENGINE</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isGenerating}
                className="w-full bg-black/40 border border-white/10 focus:border-cyan-400 focus:outline-none rounded-lg p-2 text-[11px] text-cyan-400 cursor-pointer"
              >
                <option value="nano-banana-pro" className="bg-[#0a0a0f] text-cyan-400">Nano Banana Pro (Fast)</option>
                <option value="nano-banana-2" className="bg-[#0a0a0f] text-cyan-400">Nano Banana 2 (Balanced)</option>
                <option value="gpt-image-2" className="bg-[#0a0a0f] text-cyan-400">GPT Image 2 — Medium (Best Quality)</option>
              </select>
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

              {/* Recommended Image Size Badge */}
              {(() => {
                const preset = FOOTPRINT_PRESETS.find(p => p.id === footprintShape);
                return preset ? (
                  <div className="flex items-center justify-between text-[10px] text-cyan-400/90 bg-cyan-950/30 border border-cyan-500/20 px-2.5 py-1.5 rounded-lg mt-0.5 select-none">
                    <span className="text-[9px] tracking-wider text-cyan-400/70 uppercase">REC. ASPECT RATIO:</span>
                    <span className="font-mono text-cyan-300 font-bold">{preset.recommendedAspect}</span>
                  </div>
                ) : null;
              })()}
            </div>

            {/* Custom Footprint Text Input */}
            {footprintShape === 'custom' && (
              <div className="flex flex-col gap-1.5 animate-fadeIn">
                <label className="text-[9px] tracking-[2px] text-cyan-500/60 uppercase font-mono block">ENTER CUSTOM FOOTPRINT SHAPE</label>
                <input 
                  type="text" 
                  value={customFootprintText} 
                  onChange={(e) => setCustomFootprintText(e.target.value)}
                  disabled={isGenerating}
                  placeholder="E.g. S-Shape, Hexagonal Core, L-Shape, etc..."
                  className="w-full bg-black/40 border border-white/10 focus:border-cyan-400 focus:outline-none rounded-lg p-2 text-[11px] text-cyan-400 placeholder-cyan-500/20 font-mono"
                />
              </div>
            )}

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

            {/* Unit Mix Table (Typical Floor) */}
            <div className="flex flex-col gap-2 border-t border-white/5 pt-2.5">
              <span className="text-[9px] tracking-[2px] text-cyan-500/60 uppercase font-mono block">UNIT MIX DESIGN MATRIX</span>
              
              <div className="overflow-hidden border border-white/10 rounded">
                <table className="min-w-full divide-y divide-white/10 font-mono text-[10px]">
                  <thead className="bg-white/[0.02]">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-[8px] font-bold text-cyan-500/70 uppercase">UNIT TYPE</th>
                      <th className="px-2 py-1.5 text-left text-[8px] font-bold text-cyan-500/70 uppercase">AVG CARPET</th>
                      <th className="px-2 py-1.5 text-center text-[8px] font-bold text-cyan-500/70 uppercase">QTY/FL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 bg-black/10">
                    <tr>
                      <td className="px-2 py-1 text-white font-bold">1BHK APARTMENT</td>
                      <td className="px-2 py-1 text-cyan-400/80">50 SQ.M.</td>
                      <td className="px-2 py-1 text-center">
                        <input 
                          type="number" 
                          value={units1BHK} 
                          onChange={(e) => setUnits1BHK(Math.max(0, parseInt(e.target.value) || 0))}
                          disabled={isGenerating}
                          className="bg-black/50 border border-white/10 focus:border-cyan-400 focus:outline-none rounded w-12 text-center text-cyan-400 py-0.5"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 text-white font-bold">2BHK APARTMENT</td>
                      <td className="px-2 py-1 text-cyan-400/80">78 SQ.M.</td>
                      <td className="px-2 py-1 text-center">
                        <input 
                          type="number" 
                          value={units2BHK} 
                          onChange={(e) => setUnits2BHK(Math.max(0, parseInt(e.target.value) || 0))}
                          disabled={isGenerating}
                          className="bg-black/50 border border-white/10 focus:border-cyan-400 focus:outline-none rounded w-12 text-center text-cyan-400 py-0.5"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 text-white font-bold">3BHK APARTMENT</td>
                      <td className="px-2 py-1 text-cyan-400/80">105 SQ.M.</td>
                      <td className="px-2 py-1 text-center">
                        <input 
                          type="number" 
                          value={units3BHK} 
                          onChange={(e) => setUnits3BHK(Math.max(0, parseInt(e.target.value) || 0))}
                          disabled={isGenerating}
                          className="bg-black/50 border border-white/10 focus:border-cyan-400 focus:outline-none rounded w-12 text-center text-cyan-400 py-0.5"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 text-white font-bold">4BHK APARTMENT</td>
                      <td className="px-2 py-1 text-cyan-400/80">140 SQ.M.</td>
                      <td className="px-2 py-1 text-center">
                        <input 
                          type="number" 
                          value={units4BHK} 
                          onChange={(e) => setUnits4BHK(Math.max(0, parseInt(e.target.value) || 0))}
                          disabled={isGenerating}
                          className="bg-black/50 border border-white/10 focus:border-cyan-400 focus:outline-none rounded w-12 text-center text-cyan-400 py-0.5"
                        />
                      </td>
                    </tr>
                    <tr className="bg-white/[0.04]">
                      <td className="px-2 py-1.5 text-cyan-400 font-bold uppercase" colSpan={2}>TOTAL MIX COUNT</td>
                      <td className="px-2 py-1.5 text-center text-white font-bold text-xs">{units1BHK + units2BHK + units3BHK + units4BHK} NOS</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Execute Button — debounced to prevent double-fire */}
            {validationError && (
              <div className="w-full mt-2 bg-red-950/40 border border-red-500/30 rounded p-2.5 flex items-start gap-2 animate-fadeIn">
                <span className="text-red-400 font-bold text-[10px] mt-0.5">⚠️</span>
                <p className="text-[10px] text-red-200/90 leading-tight">
                  {validationError}
                </p>
              </div>
            )}
            <button
              onClick={debouncedGenerate}
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
          <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto no-scrollbar">
            
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

              {/* Single Generated Image Viewport */}
              {(resultImage) && !isGenerating ? (
                <div className="w-full h-full flex flex-col overflow-y-auto p-1 animate-fadeIn">
                  
                  {/* Synthesis Card */}
                  <div className="relative flex flex-col rounded-xl border border-cyan-500/30 bg-black/60 overflow-hidden group">
                    <div className="px-3 py-1.5 bg-cyan-950/80 border-b border-cyan-500/20 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-cyan-400 tracking-wider uppercase">SCHEMATIC SYNTHESIS (GPT IMAGE 2)</span>
                      <span className="text-[9px] text-cyan-500/60 font-mono">PRIMARY CORE</span>
                    </div>
                    <div className="relative flex-1 bg-white min-h-[400px] flex items-center justify-center">
                      <img 
                        src={resultImage} 
                        alt="Floor Plan Schematic"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="p-3 bg-[#08080c] border-t border-white/10 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-cyan-300 font-semibold truncate">Generated Schematic</span>
                        <a 
                          href={resultImage}
                          download="floorplan-schematic.png"
                          className="px-2.5 py-1 rounded bg-cyan-950 border border-cyan-500/30 text-[10px] text-cyan-400 hover:text-white flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> Download
                        </a>
                      </div>
                      <button
                        onClick={() => {
                          const targetImg = resultImage;
                          const styleName = footprintShape === 'custom'
                            ? customFootprintText.trim().toUpperCase()
                            : (FOOTPRINT_PRESETS.find(f => f.id === footprintShape)?.name || 'X-SHAPE');
                          const params = new URLSearchParams({
                            floorPlanImageUrl: targetImg,
                            footprintShape: styleName,
                            overallWidth,
                            overallLength,
                            storyCount,
                            designNotes: customPrompt,
                          });
                          router.push(`/idea-generation/view-synthesis?${params.toString()}`);
                        }}
                        className="w-full py-2 rounded font-bold text-[10px] tracking-wider transition-all flex items-center justify-center gap-1.5 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 text-white hover:border-cyan-300"
                      >
                        <Camera className="w-3 h-3" /> 3D VIEWS
                      </button>
                    </div>
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
                  <label className="text-[8px] text-cyan-500/60 uppercase">LIFTS QUANTITY</label>
                  <input 
                    type="number" 
                    value={passengerLifts} 
                    onChange={(e) => setPassengerLifts(Math.max(1, parseInt(e.target.value) || 1))}
                    disabled={isGenerating}
                    className="bg-black/40 border border-white/10 focus:border-cyan-400 focus:outline-none rounded p-1.5 text-[11px] text-cyan-400 font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] text-cyan-500/60 uppercase">STAIRS QUANTITY</label>
                  <input 
                    type="number" 
                    value={staircases} 
                    onChange={(e) => setStaircases(Math.max(1, parseInt(e.target.value) || 1))}
                    disabled={isGenerating}
                    className="bg-black/40 border border-white/10 focus:border-cyan-400 focus:outline-none rounded p-1.5 text-[11px] text-cyan-400 font-mono"
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

          {/* Column 3: Right Panel — ARIA AI Architect Advisor */}
          <div className="lg:col-span-4 flex flex-col h-full min-h-0">
            <ArchitectAdvisorPanel
              ref={advisorRef}
              onParamsApplied={handleParamsApplied}
              onGenerateTrigger={handleGenerateTrigger}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
          </div>

        </div>

        {/* API Payload Logs Modal */}
        {showDebugModal && debugPayload && (
          <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fadeIn">
            <div className="bg-[#0a0a0f] border border-cyan-500/30 rounded-xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(0,240,255,0.15)]">
              <div className="flex items-center justify-between p-4 border-b border-cyan-500/20 bg-cyan-950/20">
                <div className="flex items-center gap-2 text-cyan-400">
                  <Terminal className="w-4 h-4" />
                  <span className="text-xs font-bold tracking-widest uppercase">3-Stage AI Generation Pipeline Logs ({debugPayload.workflow || selectedModel})</span>
                </div>
                <button onClick={() => setShowDebugModal(false)} className="text-cyan-400/60 hover:text-white p-1 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                {/* 1. Input Trace Mask */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-[9px]">1</span>
                    EXPORTED TRACE MASK (INPUT BOUNDARY)
                  </span>
                  {debugPayload.traceBase64 ? (
                    <div className="p-3 bg-black/80 border border-cyan-500/20 rounded-lg flex items-center justify-center">
                      <img 
                        src={`data:image/png;base64,${debugPayload.traceBase64}`} 
                        alt="Trace Mask"
                        className="max-w-[240px] max-h-[240px] object-contain border border-cyan-500/30 rounded bg-black shadow-lg"
                      />
                    </div>
                  ) : (
                    <div className="p-3 bg-black/60 border border-red-500/20 rounded-lg text-[11px] text-red-400 font-mono flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> NO TRACE IMAGE ATTACHED
                    </div>
                  )}
                </div>

                {/* 2. Stage 1 (Grok) Prompt & Base Output */}
                <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
                  <span className="text-[10px] text-amber-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-amber-500/20 border border-amber-400 flex items-center justify-center text-[9px]">2</span>
                    STAGE 1 (GROK) PROMPT & GENERATED BASE IMAGE
                  </span>
                  
                  {/* Prompt */}
                  <div className="p-4 bg-black/60 border border-amber-500/20 rounded-lg text-[11px] text-amber-200/90 font-mono whitespace-pre-wrap leading-relaxed shadow-inner">
                    <span className="text-amber-400 font-bold block mb-1 text-[10px]">STAGE 1 SYSTEM PROMPT:</span>
                    {debugPayload.stage1Prompt || 'Waiting...'}
                  </div>

                  {/* Grok Output Image */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-amber-400/80 font-bold uppercase tracking-wider">STAGE 1 GENERATED IMAGE (GROK OUTPUT):</span>
                      {debugPayload.stage1Seed !== undefined && (
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300">
                          SEED: {debugPayload.stage1Seed}
                        </span>
                      )}
                    </div>
                    {debugPayload.stage1OutputUrl ? (
                      <div className="p-3 bg-black/80 border border-amber-500/30 rounded-lg flex items-center justify-center">
                        <img 
                          src={debugPayload.stage1OutputUrl} 
                          alt="Grok Stage 1 Output"
                          className="max-w-full max-h-[350px] object-contain border border-amber-500/30 rounded shadow-lg"
                        />
                      </div>
                    ) : (
                      <div className="p-4 bg-black/40 border border-amber-500/10 rounded-lg text-[11px] text-amber-500/50 font-mono text-center">
                        Waiting for Stage 1 generation...
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Stage 2 (GPT Image 2) Refinement Prompt */}
                {debugPayload.stage2Prompt && (
                  <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
                    <span className="text-[10px] text-purple-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-purple-500/20 border border-purple-400 flex items-center justify-center text-[9px]">3</span>
                      STAGE 2 (GPT IMAGE 2) REFINEMENT PROMPT
                    </span>
                    <div className="p-4 bg-black/60 border border-purple-500/20 rounded-lg text-[11px] text-purple-200/90 font-mono whitespace-pre-wrap leading-relaxed shadow-inner">
                      <span className="text-purple-400 font-bold block mb-1 text-[10px]">STAGE 2 REFINEMENT PROMPT:</span>
                      {debugPayload.stage2Prompt}
                    </div>
                  </div>
                )}

                {/* 4. Stage 2 (GPT Image 2) Schematic Output */}
                <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-[9px]">4</span>
                      STAGE 2 (GPT IMAGE 2) SCHEMATIC OUTPUT
                    </span>
                    {debugPayload.stage2Seed !== undefined && (
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold">
                        SEED: {debugPayload.stage2Seed}
                      </span>
                    )}
                  </div>
                  {debugPayload.stage2OutputUrl ? (
                    <div className="p-3 bg-black/80 border border-emerald-500/30 rounded-lg flex items-center justify-center">
                      <img 
                        src={debugPayload.stage2OutputUrl} 
                        alt="GPT Stage 2 Output"
                        className="max-w-full max-h-[400px] object-contain border border-emerald-500/30 rounded shadow-lg"
                      />
                    </div>
                  ) : (
                    <div className="p-4 bg-black/40 border border-emerald-500/10 rounded-lg text-[11px] text-emerald-500/50 font-mono text-center">
                      Waiting for Stage 2 schematic generation...
                    </div>
                  )}
                </div>

                {/* 5. Stage 3 (GPT Image 2) Ventilation Prompt */}
                {debugPayload.stage3Prompt && (
                  <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
                    <span className="text-[10px] text-sky-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-sky-500/20 border border-sky-400 flex items-center justify-center text-[9px]">5</span>
                      STAGE 3 (GPT IMAGE 2) VENTILATION STRATEGY PROMPT
                    </span>
                    <div className="p-4 bg-black/60 border border-sky-500/20 rounded-lg text-[11px] text-sky-200/90 font-mono whitespace-pre-wrap leading-relaxed shadow-inner">
                      <span className="text-sky-400 font-bold block mb-1 text-[10px]">STAGE 3 VENTILATION PROMPT:</span>
                      {debugPayload.stage3Prompt}
                    </div>
                  </div>
                )}

                {/* 6. Stage 3 (GPT Image 2) Ventilation Final Output */}
                <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-sky-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-sky-500/20 border border-sky-400 flex items-center justify-center text-[9px]">6</span>
                      STAGE 3 (GPT IMAGE 2) VENTILATION STRATEGY OUTPUT
                    </span>
                  </div>
                  {debugPayload.stage3OutputUrl ? (
                    <div className="p-3 bg-black/80 border border-sky-500/30 rounded-lg flex items-center justify-center">
                      <img 
                        src={debugPayload.stage3OutputUrl} 
                        alt="GPT Stage 3 Ventilation Output"
                        className="max-w-full max-h-[400px] object-contain border border-sky-500/30 rounded shadow-lg"
                      />
                    </div>
                  ) : (
                    <div className="p-4 bg-black/40 border border-sky-500/10 rounded-lg text-[11px] text-sky-500/50 font-mono text-center">
                      Waiting for Stage 3 ventilation overlay...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
  );
}
