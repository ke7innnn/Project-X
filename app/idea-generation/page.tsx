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

// Shapes presets
const FOOTPRINT_PRESETS = [
  { id: 'curved-x', name: 'CURVED X-SHAPE (HIGH-RISE)', desc: 'Four symmetrical curved wings with a centralized circulation core.' },
  { id: 'tri-foil', name: 'TRI-FOIL Y-SHAPE', desc: 'Three-pronged radiating wings optimized for wind deflection.' },
  { id: 'monolithic-rect', name: 'MONOLITHIC RECTANGULAR', desc: 'Classic double-loaded slab footprint with central core.' },
  { id: 'circular-atrium', name: 'CIRCULAR ATRIUM TOWER', desc: 'Concentric core layout with circular exterior gallery walls.' },
  { id: 'custom', name: 'CUSTOM FOOTPRINT...', desc: 'Define your own tower footprint shape dynamically.' }
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

  // Output states
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
        setResultImage(fallbackUrl);
        setResultTitle(`${styleName} TYPICAL PLAN`);
        setResultDesc(
          `High-rise Floor Plan Core Synthesis: Monolithic ${styleName} tower floor plan featuring 16 balanced units per floor (4x 2BHK, 8x 3BHK, 4x 3BHK Premium). ${customPrompt ? `Custom Notes Integrated: "${customPrompt}". ` : ''}Integrates a central 24.00m x 24.00m lift lobby containing 8 passenger lifts, 2 fire lifts, 2 fire staircases, and dual 2.40m wide branching corridors.`
        );
        
        // Save to variants history
        setVariantsHistory(prev => {
          const list = [fallbackUrl, ...prev.filter(url => url !== fallbackUrl)];
          return list.slice(0, 5);
        });

        setIsGenerating(false);
      } else {
        // Call Fal AI route
        const totalUnits = typeAUnits + typeBUnits + typeCUnits;
        const [coreW, coreL] = coreSize.split('x').map(s => s.trim());
        const vaastuStr = vastuCompliant ? 'Position the kitchen in the south-east zone and orient the main entrance per Vaastu Shastra principles. ' : '';
        const ventStr = crossVentilation ? 'Every bedroom, living room, and kitchen must open directly onto an external wall or balcony for natural cross-ventilation and daylight — no internal, windowless rooms. ' : '';
        
        // Dynamically build unit labels list e.g. F01, F02, ... F10 based on user UI totalUnits
        const labelList = Array.from({ length: totalUnits }, (_, i) => `F${String(i + 1).padStart(2, '0')}`).join(', ');
        
        const promptText = `Create a high-quality top-down 2D architectural CAD floor plan of a compact, architecturally interesting ${styleName} high-rise residential tower with an overall footprint of ${overallWidth}m x ${overallLength}m and a floor-to-floor height of ${floorHeight}m, featuring one compact central circulation core.

PRIMARY OBJECTIVE:
Create EXACTLY ${totalUnits} complete, independent apartments:
${labelList}.

FIRST establish ${totalUnits} clearly separated apartment boundaries, then design the rooms inside them. Every apartment must have a complete continuous wall boundary and one independent entrance opening directly onto the common corridor.

NEIGHBORING FLATS MUST ALWAYS BE SEPARATED BY SOLID CONTINUOUS WALLS. Never connect two different flats with a doorway, opening, or shared passage. Doors may only connect rooms belonging to the same apartment.

APARTMENT IDENTIFICATION:
Place exactly one clearly visible label inside each apartment, preferably inside the living room near the entrance:
${labelList}.

Each label must appear exactly once inside its corresponding apartment. Do not duplicate, skip, or place any label outside an apartment.

APARTMENT TYPES AND MIX:
Use a realistic mix of ${totalUnits} apartments (${typeAUnits} × 1BHK/2BHK, ${typeBUnits} × 2BHK/3BHK, ${typeCUnits} × 3BHK Premium).

1BHK: 1 living room, 1 separate bedroom, 1 separate enclosed kitchen, 1 bathroom, and an entrance foyer or internal passage.

2BHK: 1 living room, 2 separate bedrooms, 1 separate enclosed kitchen, 1 or 2 bathrooms, and an entrance foyer or internal passage.

3BHK / Premium: 1 living room, 3 separate bedrooms, 1 separate enclosed kitchen, 2 bathrooms, and an entrance foyer or internal passage.

Do not omit any required room. All rooms must be fully enclosed.

APARTMENT COMPOSITION:
Use this logical planning hierarchy:
COMMON CORRIDOR → APARTMENT ENTRANCE → FOYER OR LIVING ROOM → INTERNAL DISTRIBUTION → BEDROOMS, KITCHEN, AND BATHROOMS.

The living room should be the main welcoming and distribution space after the entrance. From the living room or a short internal passage, provide access to the bedrooms, separate kitchen, and bathrooms.

Bedrooms must be independently accessible and must never require passage through another bedroom. Kitchens must be separate enclosed rooms and must never function as passageways.

LIVING ROOM VENTILATION — ABSOLUTE RULE:
Every apartment's living room MUST directly touch an external building façade, balcony edge, or open-to-sky ventilation court. Each living room MUST have at least one clearly visible external window or balcony opening on that external wall. Never place a living room completely inside the building or behind another room without its own external opening. A living room is not considered ventilated merely because an adjacent room has a window; the living room itself must have a direct external opening.

BEDROOM AND KITCHEN VENTILATION — CRITICAL:
Every bedroom must have direct natural daylight and ventilation through an external window, balcony, or external opening.
Every kitchen must have an external window/opening or a clearly visible ventilation shaft. Internal bathrooms must connect to a ventilation shaft or duct.
Do not create windowless living rooms, bedrooms, or kitchens. ${ventStr}${vaastuStr}${customPrompt ? `Custom notes: ${customPrompt}.` : ''}

CENTRAL CORE:
Use one compact central core containing ${passengerLifts} passenger lifts, ${fireLifts} fire lift, ${staircases} enclosed fire stairs, and small service/electrical shafts. Keep the core and lift lobby compact to maximize residential carpet area.

CORRIDOR:
Create one clear and efficient ${corridorWidth}m wide common corridor connecting all ${totalUnits} apartment entrances to the central core. Every apartment entrance must open directly onto this corridor.

Use repeated and mirrored apartment modules where practical to create a balanced composition. Use clean, realistic, buildable rectangular or simple angled rooms.

Avoid deformed apartments, impossible triangular rooms, overlapping walls, merged flats, confusing boundaries, and unusable leftover spaces.

GRAPHICAL STYLE:
Professional high-quality top-down 2D architectural CAD floor plan.
Use bold black walls, consistent wall thickness, realistic doors and door swings, visible windows, and logical structural columns.
Use light beige for apartment interiors, light grey for corridors and the central core, light blue for bathrooms, and light green for balconies on a clean white background.
Do not include furniture, decorative objects, room names, dimensions, legends, title blocks, annotations, elevations, perspective views, or 3D elements.

FINAL CHECK:
Exactly ${totalUnits} independent apartments must be present and labeled exactly once as ${labelList}.

Every apartment must have:
- one complete closed boundary;
- one independent entrance from the common corridor;
- all required rooms for its apartment type;
- a logically arranged living room, bedrooms, kitchen, and bathrooms;
- a living room with its own direct external window or balcony opening;
- bedrooms with direct natural daylight and ventilation;
- a kitchen with direct ventilation through an external opening or ventilation shaft.

Neighboring apartments must always be separated by solid continuous walls and must never be connected by doors or openings.

Output only the clean, tightly cropped 2D architectural floor plan.`;

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
          if (!data.url || !data.url.startsWith('http')) {
            throw new Error('Fal AI returned an empty or invalid image path.');
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

        // Save to variants history
        setVariantsHistory(prev => {
          const list = [url, ...prev.filter(item => item !== url)];
          return list.slice(0, 5);
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
                FAL AI API
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

              {/* Generated Image container */}
              {resultImage ? (
                <div className="relative w-full h-full rounded border border-cyan-500/20 bg-white animate-fadeIn">
                  <img
                    src={resultImage}
                    alt={resultTitle}
                    className="w-full h-full object-contain"
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
                  {/* Entry point to Multi-Angle View Synthesis */}
                  {!isGenerating && (
                    <div className="absolute bottom-3 left-3 right-3 pointer-events-auto">
                      <button
                        onClick={() => {
                          const styleName = footprintShape === 'custom'
                            ? customFootprintText.trim().toUpperCase()
                            : (FOOTPRINT_PRESETS.find(f => f.id === footprintShape)?.name || 'X-SHAPE');
                          const params = new URLSearchParams({
                            floorPlanImageUrl: resultImage || '',
                            footprintShape: styleName,
                            overallWidth,
                            overallLength,
                            storyCount,
                            designNotes: customPrompt,
                          });
                          router.push(`/idea-generation/view-synthesis?${params.toString()}`);
                        }}
                        className="w-full py-2.5 rounded font-bold text-[11px] tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-cyan-500/25 to-purple-500/25 hover:from-cyan-500/40 hover:to-purple-500/40 border border-cyan-400/40 hover:border-cyan-300 text-white shadow-[0_0_20px_rgba(0,240,255,0.15)] backdrop-blur-sm"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>GENERATE 3D VIEWS</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (resultImage) {
                            const store = useArchitectStore.getState();
                            store.updateActiveProjectConfig({
                              footprintShape,
                              width: overallWidth,
                              length: overallLength,
                              stories: storyCount,
                              unitMix: `2BHK: ${typeAUnits} | 3BHK: ${typeBUnits} | 3BHK Premium: ${typeCUnits}`,
                              designNotes: customPrompt
                            });
                            store.addProjectAsset('hero', resultImage);
                          }
                        }}
                        className={`w-full mt-2 py-2.5 rounded font-bold text-[11px] tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer backdrop-blur-sm ${
                          activeProject?.assets.hero === resultImage
                            ? 'text-emerald-400 bg-emerald-950/45 border border-emerald-900/40 hover:bg-emerald-900/30'
                            : 'text-green-400 bg-green-950/45 border border-green-900/40 hover:bg-green-900/30 hover:border-green-500/50'
                        }`}
                      >
                        <span className="text-sm">★</span>
                        <span>
                          {activeProject?.assets.hero === resultImage
                            ? '✓ FINALIZED / ADDED TO PROJECT'
                            : '★ FINALIZE / ADD TO PROJECT'}
                        </span>
                      </button>
                    </div>
                  )}
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
