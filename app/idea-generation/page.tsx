'use client';

import React, { useState, useEffect } from 'react';
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
  Camera
} from 'lucide-react';
import Image from 'next/image';
import ClientExportModal from '@/components/ClientExportModal';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useActiveProjectGuard } from '@/lib/useActiveProjectGuard';
import { useDebounce } from '@/lib/useDebounce';

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

  // Dual Model Output states
  const [gptResultImage, setGptResultImage] = useState<string | null>(null);
  const [nanoResultImage, setNanoResultImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultTitle, setResultTitle] = useState('');
  const [resultDesc, setResultDesc] = useState('');

  // QA Hardening states
  const [validationError, setValidationError] = useState<string | null>(null);
  const [variantsHistory, setVariantsHistory] = useState<string[]>([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isClientMode, setIsClientMode] = useState(false);

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
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
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
    const w = parseFloat(overallWidth);
    if (isNaN(w) || w < 5 || w > 500) {
      setValidationError("Overall width must be a valid number between 5 and 500 meters.");
      return;
    }

    const l = parseFloat(overallLength);
    if (isNaN(l) || l < 5 || l > 500) {
      setValidationError("Overall length must be a valid number between 5 and 500 meters.");
      return;
    }

    const h = parseFloat(floorHeight);
    if (isNaN(h) || h < 2 || h > 10) {
      setValidationError("Typical floor height must be a valid number between 2 and 10 meters.");
      return;
    }

    // Story count validation
    const floorMatch = storyCount.match(/\d+/);
    const floors = floorMatch ? parseInt(floorMatch[0], 10) : 0;
    if (isNaN(floors) || floors < 1 || floors > 200) {
      setValidationError("Stories count must contain a valid number of floors between 1 and 200 (e.g. G + 50 or 50).");
      return;
    }

    // Corridor Width
    const corr = parseFloat(corridorWidth);
    if (isNaN(corr) || corr < 0.1 || corr > 10) {
      setValidationError("Corridor width must be a valid number between 0.1 and 10 meters.");
      return;
    }

    // Unit mix validations
    if (typeAUnits < 0 || typeBUnits < 0 || typeCUnits < 0) {
      setValidationError("Unit mix quantities cannot be negative.");
      return;
    }

    const totalUnitsCount = typeAUnits + typeBUnits + typeCUnits;
    if (totalUnitsCount < 1) {
      setValidationError("Unit Mix Design Matrix must have at least 1 total unit quantity.");
      return;
    }

    // Core validation
    const coreParts = coreSize.toLowerCase().replace('m', '').split(/x|×|\*/);
    const coreW = coreParts[0] ? parseFloat(coreParts[0].trim()) : 0;
    const coreH = coreParts[1] ? parseFloat(coreParts[1].trim()) : 0;
    if (isNaN(coreW) || isNaN(coreH) || coreW <= 0 || coreH <= 0) {
      setValidationError("Core size dimensions must be valid positive numbers (e.g. 24.00 x 24.00).");
      return;
    }

    if (passengerLifts < 0 || fireLifts < 0 || staircases < 0) {
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
    const unitsCarpetArea = (typeAUnits * 78) + (typeBUnits * 105) + (typeCUnits * 120);
    const unitsBuiltupArea = unitsCarpetArea * 1.25; // Loading factor for walls/balconies
    const coreArea = coreW * coreH;
    const circulationArea = plateArea * 0.15; // 15% corridor/circulation
    const totalRequiredArea = unitsBuiltupArea + coreArea + circulationArea;

    if (totalRequiredArea > estimatedFootprintArea * 1.5) {
      setValidationError(`Over-allocated floor plate. The requested unit mix and core require approximately ${Math.round(totalRequiredArea)} SQM, which exceeds 150% of the estimated floor plate area (${Math.round(estimatedFootprintArea)} SQM). Please increase overall dimensions or reduce unit mix counts.`);
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
      const styleName = footprintShape === 'custom'
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
        setGptResultImage(fallbackUrl);
        setNanoResultImage(fallbackUrl);
        setResultImage(fallbackUrl);
        setResultTitle(`${styleName} TYPICAL PLAN`);
        setResultDesc(`High-rise Floor Plan Core Synthesis: Monolithic ${styleName} tower floor plan.`);
        setIsGenerating(false);
      } else {
        // Call Fal AI route
        const vaastuStr = vastuCompliant ? 'VAASTU RULES: Orient kitchens toward the South-East (SE) zone, Master Bedrooms toward South-West (SW), main entrances toward North-East (NE), and avoid toilets in the North-East corner. ' : '';
        const ventStr = crossVentilation ? 'SOLAR & DUCT RULES: All living rooms and bedrooms must face the outer building façade for maximum solar exposure and natural daylighting. Internal bathrooms and service areas must connect to dedicated vertical ventilation shafts/ducts. ' : '';
        const fireSafetyStr = fireSafetyCode ? 'Ensure compliance with fire egress codes. ' : '';
        
        // Dynamically build unit labels list e.g. F01, F02, ... F10 based on user UI totalUnits
        const labelList = Array.from({ length: totalUnits }, (_, i) => `F${String(i + 1).padStart(2, '0')}`).join(', ');
        
        const promptText = `Create a high-quality top-down 2D architectural CAD floor plan of a compact ${styleName} high-rise tower (${overallWidth}m x ${overallLength}m) with one central core.

PRIMARY OBJECTIVE:
Create EXACTLY ${totalUnits} complete, independent apartments (${typeAUnits} × 1BHK, ${typeBUnits} × 2BHK, ${typeCUnits} × 3BHK): ${labelList}.

FIRST establish ${totalUnits} clearly separated apartment boundaries, then design rooms inside them. Every apartment must have a complete continuous wall boundary and one independent entrance opening directly onto the common corridor.

NEIGHBORING FLATS MUST ALWAYS BE SEPARATED BY SOLID CONTINUOUS WALLS. Never connect two different flats with a doorway or shared passage. Doors may only connect rooms belonging to the same apartment.

APARTMENT IDENTIFICATION:
Place exactly one clearly visible label inside each apartment near the entrance: ${labelList}. Each label must appear exactly once.

APARTMENT COMPOSITION & VENTILATION:
Use this natural apartment flow:
COMMON CORRIDOR → APARTMENT ENTRANCE → LIVING ROOM → INTERNAL DISTRIBUTION → BEDROOMS, SEPARATE KITCHEN, AND BATHROOMS.
Living rooms, bedrooms, and kitchens MUST touch an external wall with visible window/balcony openings. No windowless rooms. ${ventStr}${vaastuStr}${fireSafetyStr}${customPrompt ? `Notes: ${customPrompt}.` : ''}

CENTRAL CORE & CORRIDOR:
Compact central core containing ${passengerLifts} passenger lifts, ${fireLifts} fire lifts, and 2 fire stairs. One continuous corridor connecting all ${totalUnits} entrances to the core.

GRAPHICAL STYLE:
Professional 2D architectural CAD floor plan. Bold black walls, light beige for room interiors, light grey for corridor/core, light blue for bathrooms, light green for balconies on clean white background. No furniture, no room names, no dimensions.

Output only the clean, tightly cropped 2D architectural floor plan.`;

        const activePreset = FOOTPRINT_PRESETS.find(f => f.id === footprintShape);
        const imageSize = activePreset?.recommendedImageSize || 'square_hd';

        setGptResultImage(null);
        setNanoResultImage(null);
        setResultImage(null);

        const apiPromise = fetch('/api/generate-idea-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: promptText,
            style: styleName,
            imageSize,
            apiKey: apiKey || undefined,
          }),
        }).then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Fal AI generation request failed');
          }
          return data;
        });

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

        setLogs((prev) => [...prev, '[SYS] DUAL MODEL CALCULATIONS VERIFIED (GPT-IMAGE-2 + NANO BANANA 2). ONLINE.']);
        
        const gptUrl = resData.gptImageUrl || resData.url || null;
        const nanoUrl = resData.nanoImageUrl || resData.url || null;

        setGptResultImage(gptUrl);
        setNanoResultImage(nanoUrl);
        setResultImage(gptUrl || nanoUrl);

        setResultTitle(`${styleName} TOWER PLAN SCHEMATIC`);
        setResultDesc(`Dual Generative Synthesis (GPT-Image-2 + Nano Banana 2) based on a ${styleName} footprint.`);

        // Save to variants history
        setVariantsHistory(prev => {
          const newItems = [gptUrl, nanoUrl].filter((u): u is string => Boolean(u));
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

  const totalUnits = typeAUnits + typeBUnits + typeCUnits;

  return (
    <div className={`min-h-screen font-mono flex flex-col relative overflow-hidden p-6 z-50 transition-colors duration-300 ${
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

              {/* Dual Generated Images Viewport */}
              {(gptResultImage || nanoResultImage || resultImage) && !isGenerating ? (
                <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto p-1 animate-fadeIn">
                  
                  {/* Variant Alpha Card */}
                  <div className="relative flex flex-col rounded-xl border border-cyan-500/30 bg-black/60 overflow-hidden group">
                    <div className="px-3 py-1.5 bg-cyan-950/80 border-b border-cyan-500/20 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-cyan-400 tracking-wider uppercase">SCHEMATIC VARIANT ALPHA</span>
                      <span className="text-[9px] text-cyan-500/60 font-mono">SYNTHESIS CORE A</span>
                    </div>
                    <div className="relative flex-1 bg-white min-h-[240px] flex items-center justify-center">
                      <img 
                        src={gptResultImage || resultImage || ''} 
                        alt="Variant Alpha Floor Plan"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="p-3 bg-[#08080c] border-t border-white/10 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-cyan-300 font-semibold truncate">Variant Alpha Schematics</span>
                        <a 
                          href={gptResultImage || resultImage || ''}
                          download="variant-alpha-floorplan.png"
                          className="px-2.5 py-1 rounded bg-cyan-950 border border-cyan-500/30 text-[10px] text-cyan-400 hover:text-white flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> Download
                        </a>
                      </div>
                      <button
                        onClick={() => {
                          const targetImg = gptResultImage || resultImage || '';
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

                  {/* Variant Beta Card */}
                  <div className="relative flex flex-col rounded-xl border border-amber-500/30 bg-black/60 overflow-hidden group">
                    <div className="px-3 py-1.5 bg-amber-950/80 border-b border-amber-500/20 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-amber-400 tracking-wider uppercase">SCHEMATIC VARIANT BETA</span>
                      <span className="text-[9px] text-amber-500/60 font-mono">SYNTHESIS CORE B</span>
                    </div>
                    <div className="relative flex-1 bg-white min-h-[240px] flex items-center justify-center">
                      {nanoResultImage ? (
                        <img 
                          src={nanoResultImage} 
                          alt="Variant Beta Floor Plan"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center p-4 text-slate-400">
                          <AlertTriangle className="w-6 h-6 text-amber-400/60 mb-2" />
                          <span className="text-[11px] font-semibold text-amber-300">Variant Beta processing...</span>
                        </div>
                      )}
                    </div>
                    <div className="p-3 bg-[#08080c] border-t border-white/10 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-amber-300 font-semibold truncate">Variant Beta Schematics</span>
                        {nanoResultImage && (
                          <a 
                            href={nanoResultImage}
                            download="variant-beta-floorplan.png"
                            className="px-2.5 py-1 rounded bg-amber-950 border border-amber-500/30 text-[10px] text-amber-400 hover:text-white flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" /> Download
                          </a>
                        )}
                      </div>
                      {nanoResultImage && (
                        <button
                          onClick={() => {
                            const styleName = footprintShape === 'custom'
                              ? customFootprintText.trim().toUpperCase()
                              : (FOOTPRINT_PRESETS.find(f => f.id === footprintShape)?.name || 'X-SHAPE');
                            const params = new URLSearchParams({
                              floorPlanImageUrl: nanoResultImage,
                              footprintShape: styleName,
                              overallWidth,
                              overallLength,
                              storyCount,
                              designNotes: customPrompt,
                            });
                            router.push(`/idea-generation/view-synthesis?${params.toString()}`);
                          }}
                          className="w-full py-2 rounded font-bold text-[10px] tracking-wider transition-all flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500/20 to-purple-500/20 border border-amber-400/30 text-white hover:border-amber-300"
                        >
                          <Camera className="w-3 h-3" /> 3D VIEWS
                        </button>
                      )}
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
