'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  Maximize2,
  X
} from 'lucide-react';
import Image from 'next/image';
import ClientExportModal from '@/components/ClientExportModal';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useActiveProjectGuard } from '@/lib/useActiveProjectGuard';
import { useDebounce } from '@/lib/useDebounce';
import ArchitectAdvisorPanel, { type FormParams, type ArchitectAdvisorRef } from '@/components/ArchitectAdvisorPanel';
import { MASTER_SHAPES_50 } from '@/lib/shapeLibrary50';

// Architectural Shapes Presets
export interface FootprintPreset {
  id: string;
  name: string;
  desc: string;
  recommendedAspect: string;
  recommendedImageSize: string;
}

export const FOOTPRINT_PRESETS: FootprintPreset[] = [
  ...MASTER_SHAPES_50.map(s => ({
    id: s.id,
    name: s.name,
    desc: s.description,
    recommendedAspect: s.defaultAspect,
    recommendedImageSize: s.defaultAspect.includes('Landscape') ? 'landscape_16_9' : 'square_hd',
  })),
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
  const [selectedModel, setSelectedModel] = useState('gpt-low-gpt-medium');

  // QA Hardening states
  const [validationError, setValidationError] = useState<string | null>(null);
  const [variantsHistory, setVariantsHistory] = useState<string[]>([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isClientMode, setIsClientMode] = useState(false);
  const [selectedViewTab, setSelectedViewTab] = useState<'both' | 'pro' | 'nano' | 'zoning'>('both');
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);
  const [debugPayload, setDebugPayload] = useState<{
    traceBase64?: string;
    stage1Prompt?: string;
    stage1OutputUrl?: string;
    stage1Candidates?: string[];
    winnerIndex?: number;
    winnerScore?: number;
    evaluatorReasoning?: string;
    candidateCritiques?: string[];
    stage1Seed?: number;
    stage2Prompt?: string;
    stage2ProOutputUrl?: string;
    stage2GptOutputUrl?: string;
    stage2NanoOutputUrl?: string;
    stage2OutputUrl?: string;
    stage2Seed?: number;
    userPrompt?: string;
    workflow?: string;
  } | null>(null);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [enhancingCandidateIdx, setEnhancingCandidateIdx] = useState<number | null>(null);
  const [enhancedCandidates, setEnhancedCandidates] = useState<Record<number, { url: string; seed?: number; prompt?: string }>>({});
  const [selectedStage2View, setSelectedStage2View] = useState<'winner' | number>('winner');

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
  const handleGenerate = async (e?: React.FormEvent, aiOpts?: { tracerImageBase64?: string; canvasW?: number; canvasH?: number; shapeW?: number; shapeH?: number; isShapeModified?: boolean; hasDividers?: boolean; numDividers?: number; customLabels?: string[]; roomBlocks?: Array<{ type: string; label: string; xM: number; yM: number; wM: number; hM: number }>; hasRoomSketch?: boolean; numRoomSketchLines?: number }) => {
    if (e) e.preventDefault();
    const fallbackBase64 = advisorRef.current?.exportCanvasBase64() || undefined;
    setValidationError(null);

    // 1. Validations & Sanity Checks
    const trimmedPrompt = customPrompt.trim() || 'Residential floor plan';

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

        const hasSketch = aiOpts?.hasRoomSketch ?? advisorRef.current?.getRoomSketchState()?.hasRoomSketch ?? false;
        const numSketchLines = aiOpts?.numRoomSketchLines ?? advisorRef.current?.getRoomSketchState()?.numRoomSketchLines ?? 0;
        const hasDivs = aiOpts?.hasDividers ?? advisorRef.current?.getDividersState()?.hasDividers ?? false;
        const numDivs = aiOpts?.numDividers ?? advisorRef.current?.getDividersState()?.numDividers ?? 0;
        const cLabels = aiOpts?.customLabels ?? advisorRef.current?.getCustomLabels() ?? [];
        const rBlocks = aiOpts?.roomBlocks ?? advisorRef.current?.getRoomBlocks() ?? [];

        // ── ROUGH SKETCH → CAD SINGLE-STEP WORKFLOW ──────────────────────────────
        if (hasSketch) {
          setLogs(prev => [...prev, `[SYS] ROUGH SKETCH MODE DETECTED — ${numSketchLines} room partition line(s) found`]);
          setLogs(prev => [...prev, `[SYS] BYPASSING MULTI-STAGE PIPELINE — Running Sketch→CAD (1-Step) via GPT Image 2 Medium`]);
          setLogs(prev => [...prev, `[SYS] UPLOADING SKETCH CANVAS TO FAL STORAGE...`]);

          const sketchRes = await fetch('/api/rough-sketch-to-cad', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              traceCanvasBase64: traceBase64,
            }),
          });

          clearInterval(logInterval);

          const sketchContentType = sketchRes.headers.get('content-type') || '';
          if (!sketchContentType.includes('application/json')) {
            const text = await sketchRes.text();
            throw new Error(`Sketch-to-CAD server error (${sketchRes.status}): ${text.slice(0, 200)}`);
          }
          const sketchData = await sketchRes.json();
          if (!sketchRes.ok) {
            throw new Error(sketchData.error || 'Rough sketch to CAD conversion failed');
          }

          setDebugPayload({
            traceBase64: strippedBase64,
            stage1Prompt: `ROUGH SKETCH → CAD CONVERSION (1-STEP)\n\n• Reference sketch mask with ${numSketchLines} orange room partition wall(s)\n• Engine: GPT Image 2 [Medium]\n• Strict geometric preservation of footprint & room layout\n• CAD linework output: Crisp black walls on white background, empty rooms`,
            stage2ProOutputUrl: sketchData.url,
            stage2GptOutputUrl: sketchData.url,
            stage2OutputUrl: sketchData.url,
            stage2Seed: sketchData.seed,
            workflow: 'rough-sketch-to-cad',
          });

          setResultImage(sketchData.url || null);
          setResultTitle(`ROUGH SKETCH → CAD FLOOR PLAN`);
          setResultDesc(`1-Step geometric CAD conversion from user freeform sketch.`);

          setVariantsHistory(prev => {
            const list = [sketchData.url, ...prev.filter((item: string) => item !== sketchData.url)];
            return list.filter(Boolean).slice(0, 10);
          });

          setIsGenerating(false);
          return;
        }

        // ── NORMAL 2-STAGE PIPELINE (unchanged when no room sketch lines) ─────

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
            hasDividers: hasDivs,
            numDividers: numDivs,
            customLabels: cLabels,
            roomBlocks: rBlocks,
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
          stage1Candidates: resData.stage1Candidates || (resData.stage1ImageUrl ? [resData.stage1ImageUrl] : []),
          winnerIndex: resData.winnerIndex ?? resData.evaluation?.winnerIndex ?? 0,
          winnerScore: resData.evaluation?.winnerScore,
          evaluatorReasoning: resData.evaluation?.reasoning,
          candidateCritiques: resData.evaluation?.critiques || [],
          stage1Seed: resData.stage1Seed,
          stage2Prompt: resData.refinementPrompt,
          stage2ProOutputUrl: resData.stage2ProImageUrl || resData.stage2ImageUrl,
          stage2GptOutputUrl: resData.stage2ProImageUrl || resData.stage2ImageUrl,
          stage2NanoOutputUrl: resData.stage2NanoImageUrl,
          stage2OutputUrl: resData.stage2ProImageUrl || resData.stage2ImageUrl || resData.url,
          stage2Seed: resData.stage2Seed,
          userPrompt: resData.userPrompt,
          workflow: selectedModel,
        });

        setLogs((prev) => [...prev, `[SYS] PIPELINE COMPLETE: ${selectedModel.toUpperCase()}`]);
        if (resData.stage1Candidates && resData.stage1Candidates.length > 0) {
          setLogs(prev => [
            ...prev,
            `[STAGE 1] ⚡ Generated ${resData.stage1Candidates.length} candidate zoning layouts in parallel (GPT Image 2 Low)`
          ]);
        }
        if (resData.evaluation) {
          const critiques: string[] = resData.evaluation.critiques || [];
          setLogs(prev => [
            ...prev,
            `[EVALUATOR AGENT] ── AI AGENT EVALUATION (4 CANDIDATES) ──`,
            ...critiques.map((c: string) => `[EVALUATOR AGENT] 🔍 ${c}`),
            `[EVALUATOR AGENT] 🏆 WINNER: Candidate #${resData.evaluation.winnerIndex + 1} (Score: ${resData.evaluation.winnerScore}/100)`,
            `[EVALUATOR AGENT] 📝 ${resData.evaluation.reasoning}`
          ]);
        }
        if (resData.stage1ImageUrl) {
          setLogs(prev => [...prev, `[STAGE 1] 🚀 Sent Winner Candidate #${(resData.winnerIndex ?? 0) + 1} to Stage 2`]);
        }
        if (resData.stage2ImageUrl) {
          setLogs(prev => [...prev, `[STAGE 2] ✨ Final CAD Blueprint enhanced with furniture, doors & windows (GPT Image 2 Medium)`]);
        }
        
        const finalResultImg = resData.url || null;
        setResultImage(finalResultImg);

        setResultTitle(`${styleName} TOWER PLAN SCHEMATIC`);
        setResultDesc(`Generated with ${selectedModel} pipeline.`);

        // Save all generated images to variants history so user can toggle between them
        const generatedImages: string[] = (resData.imageUrls && resData.imageUrls.length > 0)
          ? resData.imageUrls
          : [finalResultImg].filter(Boolean);

        setVariantsHistory(prev => {
          const list = [...generatedImages, ...prev.filter(item => !generatedImages.includes(item))];
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

  // Enhance any alternative / rejected Stage 1 Candidate in Step 2 (GPT Image 2 Medium)
  const handleEnhanceCandidate = async (candidateBase64: string, candidateIndex: number) => {
    if (enhancingCandidateIdx !== null) return;
    setEnhancingCandidateIdx(candidateIndex);
    setValidationError(null);
    setLogs(prev => [
      ...prev,
      `[SYS] ENHANCING CANDIDATE #${candidateIndex + 1} IN STEP 2 (GPT IMAGE 2 MEDIUM)...`,
      `[SYS] Applying architectural CAD linework & furniture detailing on Candidate #${candidateIndex + 1}...`,
    ]);

    try {
      const res = await fetch('/api/enhance-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateBase64,
          candidateIndex,
          units1BHK,
          units2BHK,
          units3BHK,
          units4BHK,
          passengerLifts,
          staircases,
          apiKey: apiKey || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to enhance candidate in Step 2');
      }

      setEnhancedCandidates(prev => ({
        ...prev,
        [candidateIndex]: {
          url: data.stage2ImageUrl,
          seed: data.stage2Seed,
          prompt: data.refinementPrompt,
        },
      }));
      setSelectedStage2View(candidateIndex);

      setLogs(prev => [
        ...prev,
        `[SYS] ✓ CANDIDATE #${candidateIndex + 1} ENHANCED BLUEPRINT GENERATED SUCCESSFULLY!`,
      ]);

      if (data.stage2ImageUrl) {
        setVariantsHistory(prev => [data.stage2ImageUrl, ...prev.filter(item => item !== data.stage2ImageUrl)]);
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to enhance candidate';
      setValidationError(`Candidate Enhancement Error: ${msg}`);
      setLogs(prev => [...prev, `[ERR] Candidate #${candidateIndex + 1} enhancement failed: ${msg}`]);
    } finally {
      setEnhancingCandidateIdx(null);
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

  const handleGenerateTrigger = useCallback((opts?: { tracerImageBase64?: string; canvasW?: number; canvasH?: number; shapeW?: number; shapeH?: number; isShapeModified?: boolean; hasDividers?: boolean; numDividers?: number; customLabels?: string[]; roomBlocks?: Array<{ type: string; label: string; xM: number; yM: number; wM: number; hM: number }>; hasRoomSketch?: boolean; numRoomSketchLines?: number }) => {
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
            <Link
              href="/shape-studio"
              className="p-1.5 px-3 border border-emerald-500/40 text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/60 rounded text-[10px] font-bold tracking-wider transition-all flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
            >
              <Layers className="w-3 h-3" />
              📐 SHAPE STUDIO (50 SHAPES)
            </Link>

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

          {/* Column 2: Center Display Panel (Dual Schematics & Circulation Core underneath) */}
          <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto no-scrollbar">
            
            {/* Main Interactive CAD Canvas & Dual Schematic Viewer */}
            <div className="relative w-full rounded-xl overflow-hidden border border-cyan-500/20 bg-[#050508] flex flex-col p-4 shadow-2xl shrink-0">
              <div className="absolute inset-0 bg-[radial-gradient(#00f0ff_1px,transparent_1.5px)] [background-size:16px_16px] opacity-10 pointer-events-none" />

              {/* Simulation Loader HUD */}
              {isGenerating && (
                <div className="w-full min-h-[380px] bg-[#0a0a0f]/95 z-30 flex flex-col items-center justify-center p-6 text-center animate-fadeIn rounded-lg">
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

              {/* Generated Schematics Viewport (Both Variants + Tabs) */}
              {(resultImage || debugPayload?.stage2GptOutputUrl || debugPayload?.stage2NanoOutputUrl) && !isGenerating ? (
                <div className="w-full flex flex-col gap-3 animate-fadeIn">
                  
                  {/* Variant Navigation Tabs */}
                  <div className="flex items-center justify-between gap-1 bg-black/60 p-1 rounded-lg border border-white/10">
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                      {(debugPayload?.stage2ProOutputUrl || debugPayload?.stage2GptOutputUrl) && debugPayload?.stage2NanoOutputUrl && (
                        <button
                          onClick={() => setSelectedViewTab('both')}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold tracking-wider uppercase transition-all ${
                            selectedViewTab === 'both'
                              ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300 shadow-sm'
                              : 'text-gray-400 hover:text-white border border-transparent'
                          }`}
                        >
                          ⊞ Both Types
                        </button>
                      )}
                      {(debugPayload?.stage2ProOutputUrl || debugPayload?.stage2GptOutputUrl || resultImage) && (
                        <button
                          onClick={() => setSelectedViewTab('pro')}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold tracking-wider uppercase transition-all ${
                            selectedViewTab === 'pro'
                              ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-300 shadow-sm'
                              : 'text-gray-400 hover:text-white border border-transparent'
                          }`}
                        >
                          ★ Type 1 Image
                        </button>
                      )}
                      {debugPayload?.stage2NanoOutputUrl && (
                        <button
                          onClick={() => setSelectedViewTab('nano')}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold tracking-wider uppercase transition-all ${
                            selectedViewTab === 'nano'
                              ? 'bg-purple-500/20 border border-purple-400 text-purple-300 shadow-sm'
                              : 'text-gray-400 hover:text-white border border-transparent'
                          }`}
                        >
                          ★ Type 2 Image
                        </button>
                      )}
                      {debugPayload?.stage1OutputUrl && (
                        <button
                          onClick={() => setSelectedViewTab('zoning')}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold tracking-wider uppercase transition-all ${
                            selectedViewTab === 'zoning'
                              ? 'bg-amber-500/20 border border-amber-400 text-amber-300 shadow-sm'
                              : 'text-gray-400 hover:text-white border border-transparent'
                          }`}
                        >
                          📐 Zoning Plan (Stage 1)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Schema Display Cards Container */}
                  <div className="flex flex-col gap-4">
                    
                    {/* 1. Type 1 Floor Plan Card */}
                    {(selectedViewTab === 'both' || selectedViewTab === 'pro') && (debugPayload?.stage2ProOutputUrl || debugPayload?.stage2GptOutputUrl || resultImage) && (
                      <div className="relative flex flex-col rounded-xl border border-emerald-500/30 bg-black/60 overflow-hidden group shadow-lg">
                        <div className="px-3 py-1.5 bg-emerald-950/80 border-b border-emerald-500/20 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            TYPE 1 FLOOR PLAN SCHEMATIC
                          </span>
                          <span className="text-[9px] text-emerald-500/60 font-mono">
                            {debugPayload?.stage2Seed !== undefined ? `SEED: ${debugPayload.stage2Seed}` : 'SCHEME 1'}
                          </span>
                        </div>
                        <div 
                          className="relative bg-white p-2 flex items-center justify-center cursor-pointer group/img min-h-[350px]"
                          onClick={() => setLightboxImage({ 
                            url: debugPayload?.stage2ProOutputUrl || debugPayload?.stage2GptOutputUrl || resultImage!, 
                            title: 'Type 1 Floor Plan Schematic' 
                          })}
                        >
                          <img 
                            src={debugPayload?.stage2ProOutputUrl || debugPayload?.stage2GptOutputUrl || resultImage!} 
                            alt="Type 1 Floor Plan"
                            className="w-full h-auto max-h-[550px] object-contain rounded transition-transform group-hover/img:scale-[1.01]"
                          />
                          <div className="absolute top-3 right-3 p-1.5 bg-black/70 rounded-lg text-white opacity-0 group-hover/img:opacity-100 transition-opacity border border-white/20 flex items-center gap-1 text-[9px] font-mono pointer-events-none">
                            <Maximize2 className="w-3 h-3" /> Full View
                          </div>
                        </div>
                        <div className="p-3 bg-[#08080c] border-t border-white/10 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-emerald-300 font-semibold truncate">Type 1 Schematic</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setLightboxImage({ 
                                url: debugPayload?.stage2ProOutputUrl || debugPayload?.stage2GptOutputUrl || resultImage!, 
                                title: 'Type 1 Floor Plan Schematic' 
                              })}
                              className="px-2.5 py-1 rounded bg-black/40 border border-white/10 hover:border-emerald-400 text-[10px] text-gray-300 hover:text-white flex items-center gap-1 transition-colors"
                            >
                              <Maximize2 className="w-3 h-3" /> Zoom
                            </button>
                            <a 
                              href={debugPayload?.stage2ProOutputUrl || debugPayload?.stage2GptOutputUrl || resultImage!}
                              download="type-1-floorplan-schematic.png"
                              className="px-2.5 py-1 rounded bg-emerald-950 border border-emerald-500/30 text-[10px] text-emerald-400 hover:text-white flex items-center gap-1 transition-colors"
                            >
                              <Download className="w-3 h-3" /> Download
                            </a>
                            <button
                              onClick={() => {
                                const targetImg = debugPayload?.stage2ProOutputUrl || debugPayload?.stage2GptOutputUrl || resultImage!;
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
                              className="px-3 py-1 rounded font-bold text-[10px] tracking-wider transition-all flex items-center gap-1 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-400/30 text-white hover:border-emerald-300"
                            >
                              <Camera className="w-3 h-3" /> 3D View
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. Type 2 Floor Plan Card */}
                    {(selectedViewTab === 'both' || selectedViewTab === 'nano') && debugPayload?.stage2NanoOutputUrl && (
                      <div className="relative flex flex-col rounded-xl border border-cyan-500/30 bg-black/60 overflow-hidden group shadow-lg">
                        <div className="px-3 py-1.5 bg-cyan-950/80 border-b border-cyan-500/20 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-cyan-400 tracking-wider uppercase flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                            TYPE 2 FLOOR PLAN SCHEMATIC
                          </span>
                          <span className="text-[9px] text-cyan-500/60 font-mono">SCHEME 2</span>
                        </div>
                        <div 
                          className="relative bg-white p-2 flex items-center justify-center cursor-pointer group/img min-h-[350px]"
                          onClick={() => setLightboxImage({ 
                            url: debugPayload.stage2NanoOutputUrl!, 
                            title: 'Type 2 Floor Plan Schematic' 
                          })}
                        >
                          <img 
                            src={debugPayload.stage2NanoOutputUrl} 
                            alt="Type 2 Floor Plan"
                            className="w-full h-auto max-h-[550px] object-contain rounded transition-transform group-hover/img:scale-[1.01]"
                          />
                          <div className="absolute top-3 right-3 p-1.5 bg-black/70 rounded-lg text-white opacity-0 group-hover/img:opacity-100 transition-opacity border border-white/20 flex items-center gap-1 text-[9px] font-mono pointer-events-none">
                            <Maximize2 className="w-3 h-3" /> Full View
                          </div>
                        </div>
                        <div className="p-3 bg-[#08080c] border-t border-white/10 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-cyan-300 font-semibold truncate">Type 2 Schematic</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setLightboxImage({ 
                                url: debugPayload.stage2NanoOutputUrl!, 
                                title: 'Type 2 Floor Plan Schematic' 
                              })}
                              className="px-2.5 py-1 rounded bg-black/40 border border-white/10 hover:border-cyan-400 text-[10px] text-gray-300 hover:text-white flex items-center gap-1 transition-colors"
                            >
                              <Maximize2 className="w-3 h-3" /> Zoom
                            </button>
                            <a 
                              href={debugPayload.stage2NanoOutputUrl}
                              download="type-2-floorplan-schematic.png"
                              className="px-2.5 py-1 rounded bg-cyan-950 border border-cyan-500/30 text-[10px] text-cyan-400 hover:text-white flex items-center gap-1 transition-colors"
                            >
                              <Download className="w-3 h-3" /> Download
                            </a>
                            <button
                              onClick={() => {
                                const targetImg = debugPayload.stage2NanoOutputUrl!;
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
                              className="px-3 py-1 rounded font-bold text-[10px] tracking-wider transition-all flex items-center gap-1 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 text-white hover:border-cyan-300"
                            >
                              <Camera className="w-3 h-3" /> 3D View
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 3. Stage 1 Zoning Card */}
                    {selectedViewTab === 'zoning' && debugPayload?.stage1OutputUrl && (
                      <div className="relative flex flex-col rounded-xl border border-amber-500/30 bg-black/60 overflow-hidden group shadow-lg">
                        <div className="px-3 py-1.5 bg-amber-950/80 border-b border-amber-500/20 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-amber-400 tracking-wider uppercase">STAGE 1: 90° ORTHOGONAL ZONING</span>
                          <span className="text-[9px] text-amber-500/60 font-mono">COLOR BOUNDARIES</span>
                        </div>
                        <div 
                          className="relative bg-white p-2 flex items-center justify-center cursor-pointer group/img min-h-[350px]"
                          onClick={() => setLightboxImage({ 
                            url: debugPayload.stage1OutputUrl!, 
                            title: 'Stage 1: 90° Zoning Diagram' 
                          })}
                        >
                          <img 
                            src={debugPayload.stage1OutputUrl} 
                            alt="Stage 1 Zoning Output"
                            className="w-full h-auto max-h-[550px] object-contain rounded"
                          />
                        </div>
                      </div>
                    )}

                  </div>

                </div>
              ) : !isGenerating ? (
                <div className="flex flex-col items-center justify-center text-center p-8 min-h-[320px] text-cyan-500/60">
                  <div className="w-12 h-12 rounded-xl bg-cyan-950/20 border border-cyan-500/20 flex items-center justify-center mb-4">
                    <Sparkles className="w-6 h-6 animate-pulse" />
                  </div>
                  <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Design Grid Offline</h3>
                  <p className="text-[10px] mt-1.5 leading-relaxed">
                    Awaiting target coordinates. Configure unit mix details and click execute.
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

                {/* 2. Stage 1: 4 Parallel Candidate Zoning Layouts */}
                <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-amber-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-amber-500/20 border border-amber-400 flex items-center justify-center text-[9px]">2</span>
                      STAGE 1: 4 PARALLEL GENERATED CANDIDATE ZONING LAYOUTS (GPT IMAGE 2 LOW)
                    </span>
                    {debugPayload.stage1Candidates && debugPayload.stage1Candidates.length > 0 && (
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold">
                        {debugPayload.stage1Candidates.length} CANDIDATES GENERATED
                      </span>
                    )}
                  </div>
                  
                  {/* Stage 1 System Prompt */}
                  <div className="p-4 bg-black/60 border border-amber-500/20 rounded-lg text-[11px] text-amber-200/90 font-mono whitespace-pre-wrap leading-relaxed shadow-inner">
                    <span className="text-amber-400 font-bold block mb-1 text-[10px]">STAGE 1 SYSTEM PROMPT:</span>
                    {debugPayload.stage1Prompt || 'Waiting...'}
                  </div>

                  {/* 4 Candidates Visual Grid */}
                  {debugPayload.stage1Candidates && debugPayload.stage1Candidates.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {debugPayload.stage1Candidates.map((candUrl, idx) => {
                        const isWinner = idx === (debugPayload.winnerIndex ?? 0);
                        const critique = debugPayload.candidateCritiques?.[idx] || (isWinner ? 'Selected as best candidate.' : '');
                        const isEnhanced = !!enhancedCandidates[idx];
                        const isCurrentlyEnhancing = enhancingCandidateIdx === idx;

                        return (
                          <div 
                            key={idx}
                            className={`flex flex-col rounded-xl overflow-hidden border transition-all ${
                              isWinner 
                                ? 'border-emerald-500 bg-emerald-950/20 shadow-[0_0_20px_rgba(16,185,129,0.3)] ring-1 ring-emerald-400'
                                : isEnhanced
                                ? 'border-cyan-500/80 bg-cyan-950/20 shadow-[0_0_15px_rgba(0,240,255,0.2)] ring-1 ring-cyan-400/50'
                                : 'border-white/10 bg-black/60 hover:border-white/20'
                            }`}
                          >
                            <div className={`px-2.5 py-1.5 flex items-center justify-between border-b ${
                              isWinner ? 'bg-emerald-950/80 border-emerald-500/30' : isEnhanced ? 'bg-cyan-950/80 border-cyan-500/30' : 'bg-black/80 border-white/10'
                            }`}>
                              <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                                isWinner ? 'text-emerald-300' : isEnhanced ? 'text-cyan-300' : 'text-gray-400'
                              }`}>
                                {isWinner && <span className="text-xs">🏆</span>}
                                {isEnhanced && !isWinner && <span className="text-xs">⚡</span>}
                                CANDIDATE #{idx + 1}
                              </span>
                              {isWinner ? (
                                <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 animate-pulse">
                                  WINNER {debugPayload.winnerScore ? `(${debugPayload.winnerScore}/100)` : ''}
                                </span>
                              ) : isEnhanced ? (
                                <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
                                  ENHANCED IN STEP 2
                                </span>
                              ) : (
                                <span className="text-[8px] font-mono text-gray-500">OPTION {idx + 1}</span>
                              )}
                            </div>

                            <div 
                              className="relative bg-white p-2 flex items-center justify-center cursor-pointer group/img min-h-[180px]"
                              onClick={() => setLightboxImage({ 
                                url: candUrl, 
                                title: `Stage 1: Candidate #${idx + 1}${isWinner ? ' (AI Selected Winner)' : ''}` 
                              })}
                            >
                              <img 
                                src={candUrl} 
                                alt={`Candidate ${idx + 1}`}
                                className="w-full h-auto max-h-[220px] object-contain rounded"
                              />
                              <div className="absolute top-2 right-2 p-1 bg-black/70 rounded text-white opacity-0 group-hover/img:opacity-100 transition-opacity border border-white/20 flex items-center gap-1 text-[8px] font-mono pointer-events-none">
                                <Maximize2 className="w-2.5 h-2.5" /> View
                              </div>
                            </div>

                            {critique && (
                              <div className={`p-2 text-[9px] font-mono border-t leading-tight ${
                                isWinner ? 'bg-emerald-950/40 text-emerald-200 border-emerald-500/20' : 'bg-black/40 text-gray-400 border-white/5'
                              }`}>
                                {critique}
                              </div>
                            )}

                            {/* Action Button: Send to Step 2 for CAD Detailing */}
                            <div className="p-2 bg-black/80 border-t border-white/10 mt-auto">
                              {isWinner ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedStage2View('winner')}
                                  className={`w-full py-1 px-2 rounded text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-1 cursor-pointer border ${
                                    selectedStage2View === 'winner'
                                      ? 'bg-emerald-500/30 border-emerald-400 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                                      : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40'
                                  }`}
                                >
                                  🏆 Winner (Default Step 2)
                                </button>
                              ) : isEnhanced ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedStage2View(idx)}
                                  className={`w-full py-1 px-2 rounded text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-1 cursor-pointer border ${
                                    selectedStage2View === idx
                                      ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(0,240,255,0.3)]'
                                      : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/40'
                                  }`}
                                >
                                  <Check className="w-2.5 h-2.5 text-cyan-400" />
                                  <span>View Step 2 Result</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleEnhanceCandidate(candUrl, idx)}
                                  disabled={enhancingCandidateIdx !== null}
                                  className="w-full py-1 px-2 rounded bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-400/40 hover:border-amber-400 text-amber-300 hover:text-white text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 shadow-[0_0_8px_rgba(245,158,11,0.15)]"
                                  title="Send this alternative layout to Step 2 for architectural CAD detailing"
                                >
                                  {isCurrentlyEnhancing ? (
                                    <>
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                      <span>Enhancing in Step 2...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Zap className="w-2.5 h-2.5 text-amber-400" />
                                      <span>⚡ Send to Step 2</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : debugPayload.stage1OutputUrl ? (
                    <div className="p-3 bg-black/80 border border-amber-500/30 rounded-lg flex items-center justify-center">
                      <img 
                        src={debugPayload.stage1OutputUrl} 
                        alt="Stage 1 Output"
                        className="max-w-full max-h-[350px] object-contain border border-amber-500/30 rounded shadow-lg"
                      />
                    </div>
                  ) : (
                    <div className="p-4 bg-black/40 border border-amber-500/10 rounded-lg text-[11px] text-amber-500/50 font-mono text-center">
                      Waiting for Stage 1 generation...
                    </div>
                  )}
                </div>

                {/* 3. AI Vision Evaluator Agent Verdict */}
                {debugPayload.evaluatorReasoning && (
                  <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
                    <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-[9px]">3</span>
                      🤖 AI ARCHITECTURAL EVALUATOR AGENT DECISION
                    </span>
                    <div className="p-4 bg-gradient-to-r from-emerald-950/40 to-cyan-950/30 border border-emerald-500/30 rounded-lg text-[11px] font-mono leading-relaxed shadow-lg flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-300 font-bold flex items-center gap-1.5 text-xs">
                          🏆 CHOSEN WINNER: CANDIDATE #{(debugPayload.winnerIndex ?? 0) + 1}
                        </span>
                        {debugPayload.winnerScore && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold text-[10px]">
                            QUALITY SCORE: {debugPayload.winnerScore}/100
                          </span>
                        )}
                      </div>
                      <p className="text-emerald-100/90 text-[10px] whitespace-pre-wrap">
                        {debugPayload.evaluatorReasoning}
                      </p>
                    </div>
                  </div>
                )}

                {/* 4. Stage 2 (GPT Image 2 Medium) Refinement Prompt */}
                {(debugPayload.stage2Prompt || (typeof selectedStage2View === 'number' && enhancedCandidates[selectedStage2View]?.prompt)) && (
                  <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
                    <span className="text-[10px] text-purple-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-purple-500/20 border border-purple-400 flex items-center justify-center text-[9px]">4</span>
                      STAGE 2 (GPT IMAGE 2 MEDIUM) CAD DETAILING PROMPT {typeof selectedStage2View === 'number' ? `(FOR CANDIDATE #${selectedStage2View + 1})` : '(FOR WINNER)'}
                    </span>
                    <div className="p-4 bg-black/60 border border-purple-500/20 rounded-lg text-[11px] text-purple-200/90 font-mono whitespace-pre-wrap leading-relaxed shadow-inner">
                      <span className="text-purple-400 font-bold block mb-1 text-[10px]">STAGE 2 REFINEMENT PROMPT:</span>
                      {typeof selectedStage2View === 'number' && enhancedCandidates[selectedStage2View]?.prompt
                        ? enhancedCandidates[selectedStage2View]?.prompt
                        : debugPayload.stage2Prompt}
                    </div>
                  </div>
                )}

                {/* 5. Stage 2 Final Enhanced Architectural Blueprint & Alternative Candidate Switcher */}
                <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-[9px]">5</span>
                      STAGE 2: FINAL ENHANCED 2D CAD ARCHITECTURAL BLUEPRINT
                    </span>

                    {/* Layout Switcher Tabs if any candidate was enhanced */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1 bg-black/80 p-0.5 rounded-lg border border-white/10">
                        <button
                          type="button"
                          onClick={() => setSelectedStage2View('winner')}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all cursor-pointer ${
                            selectedStage2View === 'winner'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shadow-sm'
                              : 'text-gray-400 hover:text-white border border-transparent'
                          }`}
                        >
                          🏆 Winner #{((debugPayload.winnerIndex ?? 0) + 1)}
                        </button>
                        {Object.keys(enhancedCandidates).map((k) => {
                          const cIdx = parseInt(k);
                          return (
                            <button
                              key={cIdx}
                              type="button"
                              onClick={() => setSelectedStage2View(cIdx)}
                              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all cursor-pointer flex items-center gap-1 ${
                                selectedStage2View === cIdx
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm'
                                  : 'text-gray-400 hover:text-white border border-transparent'
                              }`}
                            >
                              <Zap className="w-2.5 h-2.5 text-amber-400" />
                              <span>Candidate #{cIdx + 1}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Active Blueprint Seed */}
                      {(() => {
                        const seed = typeof selectedStage2View === 'number'
                          ? enhancedCandidates[selectedStage2View]?.seed
                          : debugPayload.stage2Seed;
                        return seed !== undefined ? (
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-bold">
                            SEED: {seed}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>

                  {/* Active Blueprint Output Image Display */}
                  {(() => {
                    const activeUrl = typeof selectedStage2View === 'number'
                      ? enhancedCandidates[selectedStage2View]?.url
                      : (debugPayload.stage2ProOutputUrl || debugPayload.stage2GptOutputUrl || debugPayload.stage2OutputUrl);

                    const title = typeof selectedStage2View === 'number'
                      ? `Candidate #${selectedStage2View + 1} (Step 2 Enhanced CAD Blueprint)`
                      : `Winner (Candidate #${(debugPayload.winnerIndex ?? 0) + 1} - Step 2 Enhanced CAD Blueprint)`;

                    return activeUrl ? (
                      <div className="relative p-3 bg-black/80 border border-cyan-500/30 rounded-lg flex flex-col items-center justify-center group/stage2 shadow-lg">
                        <img 
                          src={activeUrl} 
                          alt="Stage 2 Enhanced Output"
                          className="max-w-full max-h-[440px] object-contain border border-cyan-500/30 rounded shadow-lg cursor-pointer"
                          onClick={() => setLightboxImage({ url: activeUrl, title })}
                        />
                        <div className="absolute bottom-5 right-5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setLightboxImage({ url: activeUrl, title })}
                            className="px-2.5 py-1 bg-black/80 hover:bg-black text-cyan-300 text-[10px] font-bold rounded border border-cyan-500/40 flex items-center gap-1 cursor-pointer shadow"
                          >
                            <Maximize2 className="w-3 h-3" /> Fullscreen
                          </button>
                          <a
                            href={activeUrl}
                            download={`enhanced-blueprint-${typeof selectedStage2View === 'number' ? `candidate-${selectedStage2View + 1}` : 'winner'}.png`}
                            className="px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-[10px] font-bold rounded border border-cyan-400/40 flex items-center gap-1 cursor-pointer shadow"
                          >
                            <Download className="w-3 h-3" /> Download
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-black/40 border border-cyan-500/10 rounded-lg text-[11px] text-cyan-500/50 font-mono text-center">
                        Waiting for Stage 2 generation...
                      </div>
                    );
                  })()}

                  {/* Informational Callout */}
                  <div className="p-2.5 bg-gradient-to-r from-amber-950/20 to-cyan-950/20 border border-amber-500/20 rounded-lg flex items-center gap-2 text-[10px] font-mono text-amber-200/80">
                    <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>
                      <strong>Alternative Layout Tip:</strong> You can click <strong>"⚡ Send to Step 2"</strong> on any candidate in the grid above to generate its publication-grade CAD detailed blueprint without regenerating Step 1!
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fullscreen Lightbox Modal for Uncropped Floor Plan Inspection */}
        {lightboxImage && (
          <div 
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8 animate-fadeIn select-none"
            onClick={() => setLightboxImage(null)}
          >
            <div 
              className="relative max-w-5xl w-full max-h-[90vh] bg-[#0c0c14] border border-cyan-500/30 rounded-2xl overflow-hidden flex flex-col shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Lightbox Header */}
              <div className="px-5 py-3.5 bg-black/60 border-b border-white/10 flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-400 tracking-wider uppercase flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  {lightboxImage.title}
                </span>
                <div className="flex items-center gap-3">
                  <a
                    href={lightboxImage.url}
                    download="floorplan-full.png"
                    className="px-3 py-1 rounded bg-cyan-950/80 border border-cyan-500/40 text-[11px] text-cyan-300 hover:text-white flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Original
                  </a>
                  <button
                    onClick={() => setLightboxImage(null)}
                    className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Lightbox Image Container (Pure uncropped view) */}
              <div className="flex-1 bg-white p-4 flex items-center justify-center overflow-auto">
                <img 
                  src={lightboxImage.url} 
                  alt={lightboxImage.title}
                  className="max-w-full max-h-[75vh] object-contain rounded shadow-lg"
                />
              </div>
            </div>
          </div>
        )}

      </div>
  );
}
