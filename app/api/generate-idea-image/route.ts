import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import fs from 'fs';
import path from 'path';

export const maxDuration = 300; // 5 min — needed for 2-stage pipeline (Grok ~60s + GPT ~90s + uploads)

fal.config({ credentials: process.env.FAL_KEY });

// ── Helpers ───────────────────────────────────────────────────────────────────

async function runModel(falModel: string, input: Record<string, any>): Promise<string> {
  const result = await fal.subscribe(falModel, { input });
  const images = (result as any)?.images || (result.data as any)?.images;
  if (!images || images.length === 0) throw new Error(`${falModel} returned no images`);
  return images[0].url;
}

async function fetchToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`);
  const ct = res.headers.get('content-type') || 'image/png';
  const buf = await res.arrayBuffer();
  return `data:${ct};base64,${Buffer.from(buf).toString('base64')}`;
}

async function urlToFalStorage(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const blob = new Blob([buf], { type: 'image/png' });
  const file = new File([blob], 'stage1.png', { type: 'image/png' });
  return fal.storage.upload(file);
}

/** Load a local reference image from /public/references/ and upload to fal storage */
async function loadReferenceToFalStorage(bhkType: string): Promise<string | null> {
  try {
    let refPath = path.join(process.cwd(), 'public', 'references', `${bhkType}.png`);
    if (!fs.existsSync(refPath)) {
      refPath = path.join(process.cwd(), 'public', 'references', `ref-${bhkType}.png`);
    }
    if (!fs.existsSync(refPath)) {
      console.warn(`[IdeaGenerator] Reference image not found: ${refPath}`);
      return null;
    }
    const buffer = fs.readFileSync(refPath);
    const blob = new Blob([buffer], { type: 'image/png' });
    const file = new File([blob], `ref-${bhkType}.png`, { type: 'image/png' });
    const url = await fal.storage.upload(file);
    console.log(`[IdeaGenerator] Uploaded ${bhkType} reference to fal storage: ${url}`);
    return url;
  } catch (err: any) {
    console.warn(`[IdeaGenerator] Failed to load reference image for ${bhkType}:`, err.message);
    return null;
  }
}

// ── Workflow model mapping ────────────────────────────────────────────────────

const WORKFLOWS: Record<string, { stage1: string; stage2?: string; label: string }> = {
  'grok-gpt':         { stage1: 'xai/grok-imagine-image/edit',                   stage2: 'openai/gpt-image-2/edit', label: 'Grok -> GPT Image 2' },
  'grok-nano':        { stage1: 'xai/grok-imagine-image/edit',                   stage2: 'fal-ai/nano-banana-pro/edit', label: 'Grok -> Nano Banana Pro' },
  'grok-kontext':     { stage1: 'xai/grok-imagine-image/edit',                   stage2: 'fal-ai/flux-pro/kontext', label: 'Grok -> FLUX Kontext' },
  'flux-klein-gpt':   { stage1: 'fal-ai/flux-2/klein/9b/edit',                   stage2: 'openai/gpt-image-2/edit', label: 'FLUX Klein -> GPT Image 2' },
  'flux-klein-nano':  { stage1: 'fal-ai/flux-2/klein/9b/edit',                   stage2: 'fal-ai/nano-banana-pro/edit', label: 'FLUX Klein -> Nano Banana Pro' },
  'flux-kontext-gpt': { stage1: 'fal-ai/flux-pro/kontext',                        stage2: 'openai/gpt-image-2/edit', label: 'FLUX Kontext -> GPT Image 2' },
  'grok-solo':        { stage1: 'xai/grok-imagine-image/edit',                   label: 'Grok only' },
  'flux-klein-solo':  { stage1: 'fal-ai/flux-2/klein/9b/edit',                   label: 'FLUX Klein only' },
  'flux-kontext-solo':{ stage1: 'fal-ai/flux-pro/kontext',                        label: 'FLUX Kontext [pro] only' },
  'gpt-solo':         { stage1: 'openai/gpt-image-2/edit',                        label: 'GPT Image 2 only' },
  'gemini-solo':      { stage1: 'fal-ai/gemini-3.1-flash-image-preview/edit',     label: 'Gemini only' },
  'flux-canny-solo':  { stage1: 'fal-ai/flux-control-lora-canny',                 label: 'FLUX Canny only' },
};

// ── Detect dominant BHK type ──────────────────────────────────────────────────

function detectDominantBHK(units1BHK: number, units2BHK: number, units3BHK: number, units4BHK: number): string {
  if (units4BHK > 0 && units4BHK >= units3BHK && units4BHK >= units2BHK && units4BHK >= units1BHK) return '4bhk';
  if (units3BHK > 0 && units3BHK >= units2BHK && units3BHK >= units1BHK) return '3bhk';
  if (units2BHK > 0 && units2BHK >= units1BHK) return '2bhk';
  return '1bhk';
}

// ── Stage 1: Grok prompt — N proportional flat zones + central core ───────────

function buildStage1Prompt(opts: {
  numFlats: number;
  passengerLifts: number;
  staircases: number;
  useFireSafety: boolean;
}): string {
  const { numFlats } = opts;
  const flatLabels = Array.from({ length: numFlats }, (_, i) => `F${i + 1}`).join(', ');

  return `You are a senior architectural zoning drafter. Your ONLY job is to divide a building footprint into EXACTLY ${numFlats} flat zones around a central CORE box — the way a real architect would do it.

INPUT: The uploaded image shows a WHITE polygon on a BLACK background. The white area is the building footprint. Work entirely within it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW AN ARCHITECT DIVIDES A FLOOR PLATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Follow these steps exactly as an architect would:

STEP 1 — PLACE THE CORE AT THE CENTROID:
Draw one compact rectangular box labeled "CORE" at the geometric center (centroid) of the white footprint.
- Simple white box, thin black outline, "CORE" text inside. Nothing else inside the CORE box.
- Size: roughly 20–25% of the total footprint area.
⛔ DO NOT fill core black. DO NOT draw lifts/stairs/steps inside it at this stage.

STEP 2 — DRAW A NARROW CORRIDOR RING AROUND THE CORE:
Add a thin corridor (access spine) that wraps around the CORE and connects to each flat's entry point.
- Also extend one straight corridor arm from the CORE outward to touch the exterior perimeter wall (for ventilation).

STEP 3 — DIVIDE THE EXTERIOR PERIMETER INTO ${numFlats} EQUAL SEGMENTS:
Imagine the exterior perimeter of the white footprint as a track.
- Walk clockwise around this track and mark ${numFlats} equally-spaced division points on the perimeter.
- At each division point, draw ONE straight wall from that point on the exterior boundary, projecting inward perpendicular to the perimeter, until it meets the corridor ring around the CORE.
- This creates EXACTLY ${numFlats} flat zones — like pizza slices or wheel spokes radiating from the CORE to the exterior wall.

STEP 4 — ZONE PROPORTIONS ADAPT TO SHAPE (NOT FORCED EQUAL RECTANGLES):
- DO NOT draw identical rectangular boxes of equal width. The shape decides the zone width.
- A flat at a CORNER of the building will naturally be wider (2 exterior walls) — this is architecturally correct and intentional.
- A flat on a STRAIGHT wall will be narrower. This is correct.
- Each zone is a natural wedge/trapezoid/strip shape determined by where the perimeter dividers land.
- Every zone MUST touch the exterior wall on at least 1 side.
- Every zone MUST touch the corridor on 1 side (entry side).
- NO zone may be fully interior/landlocked.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT ZONE LABELS — ZERO DUPLICATES ALLOWED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You MUST assign these exact ${numFlats} labels: ${flatLabels}.
- Mandatory sequence: Start at top-left with F1, and go strictly clockwise: F1, F2, F3, F4... F${numFlats}.
- NO DUPLICATE LABELS: Every single label from F1 to F${numFlats} MUST be used EXACTLY ONCE.
⛔ NEVER repeat a label (e.g. NEVER print F2 twice or F3 twice).
- Count your zones before rendering: if you drew ${numFlats} zones, you must have all ${numFlats} distinct labels: ${flatLabels}. Write each label in black text inside its zone.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLANK ZONE RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each flat zone (F1 to F${numFlats}) must be COMPLETELY BLANK inside — white fill, only the label text.
- DO NOT draw any rooms, walls, doors, windows, or furniture inside the zones at this stage.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DRAWING RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Black and white only. No grey, no colour.
- All dividing walls are straight lines. No curves, no diagonals unless the perimeter itself is curved.
- Clean crisp CAD line weight. White background.
- Stay within the white footprint boundary. Never draw outside it.

OUTPUT: A top-down 2D CAD zoning diagram showing the white footprint divided into exactly ${numFlats} proportional flat zones (${flatLabels}) around a central CORE box, with corridor ventilation access to the exterior wall. Crisp architectural line work, clean white background.`;
}

// ── Stage 2: GPT Image 2 prompt — fill zones using BHK reference ──────────────

function buildStage2Prompt(opts: {
  numFlats: number;
  bhkType: string;
  passengerLifts: number;
  staircases: number;
  hasReferenceImage: boolean;
}): string {
  const { numFlats, bhkType, passengerLifts, staircases, hasReferenceImage } = opts;

  const bhkLabel = bhkType.toUpperCase().replace('BHK', ' BHK');

  const coreDetailStr = [
    passengerLifts > 0 ? `${passengerLifts} lift/elevator shaft(s) (drawn as rectangular shafts)` : null,
    staircases > 0 ? `${staircases} staircase(s) (drawn with parallel step lines)` : null,
    'a shared corridor connecting to every flat entry door',
  ].filter(Boolean).join(', ');

  return `You are a senior architectural drafter producing a professional 2D CAD floor plan.

You have been provided with ${hasReferenceImage ? 'TWO' : 'ONE'} image(s):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE 1 — BASE ZONE LAYOUT (TO BE EDITED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE 1 shows a top-down 2D floor plan with ${numFlats} empty flat zones (F1–F${numFlats}) surrounding a central circulation core box (labeled "CORE").

⛔ IMMUTABLE ELEMENTS — DO NOT ALTER BOUNDARIES:
1. THE OUTER BUILDING BOUNDARY — Do NOT redraw, shrink, expand, or alter the building perimeter in any way.
2. THE FLAT ZONE BOUNDARIES — The partition lines dividing F1–F${numFlats} are fixed. Do NOT move, merge, or remove any zone boundary wall.

✅ WHAT YOU ARE MODIFYING AND DRAWING:
1. CENTRAL CORE INTERIOR: Inside the central "CORE" box from IMAGE 1, draw the exact core circulation elements: ${coreDetailStr}.
2. FLAT ZONE INTERIORS: Inside the empty white interior of each flat zone (F1–F${numFlats}), draw the complete room layout of a ${bhkLabel} apartment.

${hasReferenceImage ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE 2 — PRIMARY COMPOSITION PATTERN (FOLLOW THIS LAYOUT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE 2 is an architectural reference sheet showing 2 distinct ${bhkLabel} apartment layout compositions (VARIANT A = rectangular zone, VARIANT B = square zone).
- Notice the thick RED line marked "EXTERIOR" in IMAGE 2 — this represents the building perimeter wall.
- Notice how ALL habitable rooms (Living Room, Kitchen, and all Bedrooms) touch that RED exterior wall to get natural light and windows. Only Bathrooms are placed internally.

HOW TO APPLY IMAGE 2 TO EACH ZONE IN IMAGE 1:
STEP 1: Check the shape of the flat zone in IMAGE 1. If it is wider/rectangular, use VARIANT A from IMAGE 2. If it is squarish/deep, use VARIANT B from IMAGE 2.
STEP 2: Map the RED EXTERIOR wall from IMAGE 2 to the outer perimeter wall of the flat zone in IMAGE 1.
STEP 3: Reproduce the exact room arrangement, wall dividers, and door arcs from that VARIANT inside the zone.` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR TASK — FILL THE CORE & FLAT ZONES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. CORE DRAWING & CORRIDOR VENTILATION (CRITICAL):
   - Inside the central CORE box, draw ${passengerLifts > 0 ? `${passengerLifts} lift shaft(s)` : ''}${passengerLifts > 0 && staircases > 0 ? ' and ' : ''}${staircases > 0 ? `${staircases} staircase flight(s)` : ''}.
   - Draw a common access corridor extending from the central core to the entrance door of every flat.
   - FACADE VENTILATION: Extend the central corridor/lobby so it reaches an external perimeter wall with an exterior window tick. This provides natural light, fresh air ventilation, and smoke evacuation for the common corridor.

2. FLAT ROOM COMPOSITION — STRICT ${bhkLabel} ROOM COUNT:

⛔ EXACT ROOM COUNT — NON-NEGOTIABLE:
${bhkType === '1bhk' ? '- 1x LIVING ROOM\n- 1x KITCHEN\n- EXACTLY 1 BEDROOM (no more, no less)\n- 1x BATHROOM\nDO NOT draw 2 or more bedrooms. This is 1BHK.' : bhkType === '2bhk' ? '- 1x LIVING ROOM\n- 1x KITCHEN\n- EXACTLY 2 BEDROOMS: MASTER BEDROOM + BEDROOM 2 (no more, no less)\n- 2x BATHROOMS\nDO NOT draw 3 or more bedrooms. This is 2BHK.' : bhkType === '3bhk' ? '- 1x LIVING ROOM\n- 1x KITCHEN\n- EXACTLY 3 BEDROOMS: MASTER BEDROOM + BEDROOM 2 + BEDROOM 3 (no more, no less)\n- 3x BATHROOMS\nDO NOT draw 4 or more bedrooms. This is 3BHK.' : '- 1x LIVING ROOM\n- 1x KITCHEN + DINING\n- EXACTLY 4 BEDROOMS: MASTER BEDROOM + BEDROOM 2 + BEDROOM 3 + BEDROOM 4 (no more, no less)\n- 4x BATHROOMS\nDO NOT draw 5 or more bedrooms. This is 4BHK.'}

ROOM ARRANGEMENT & VENTILATION:
- Arrange the rooms inside each zone to MATCH the selected VARIANT from IMAGE 2.
- EXTERIOR VENTILATION: Every Living Room, Kitchen, and Bedroom MUST touch the outer building perimeter wall of its zone and have a window tick on that exterior wall.
- INTERNAL ROOMS: Bathrooms are placed internally toward the corridor/entry side.

Door logic (follow exactly):
- Corridor → [Entry Door + swing arc] → Flat Entry/Living Room
- Internal doors connect bedrooms and bathrooms as shown in IMAGE 2. Every door must have a quarter-circle swing arc.

Flat separation (non-negotiable):
- Thick party walls between every adjacent flat zone — no room crosses a zone boundary.
- Each flat has exactly ONE entrance door from the corridor side.
- Every room of a flat is strictly contained inside its own zone boundary.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DRAWING RULES — STRICT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ALL ROOM INTERIORS MUST BE EMPTY. No room names, no text, no dimensions inside any room.
- Place only flat numbers (F1, F2, F3…) once near each flat's entry door. No other text inside flat rooms.
- All walls perfectly straight at 90-degree angles. No diagonal or wavy lines.
- Every door shown with a quarter-circle swing arc.
- Window ticks on external perimeter walls only.
- Thick black exterior walls. Thinner interior partition walls. Visible party walls between flats.
- White background. Clean professional 2D CAD style. Black and white only.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL SELF-CHECK BEFORE OUTPUTTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before rendering, verify:
☑ The outer building boundary matches IMAGE 1 exactly — not shrunk, not expanded.
☑ Central core contains ${passengerLifts} lift(s), ${staircases} staircase(s), and shared corridor.
☑ All ${numFlats} flat zone boundary walls are still intact and unchanged.
☑ Every flat zone has been filled with a complete ${bhkLabel} room layout.
☑ BEDROOM COUNT: Every flat has EXACTLY ${bhkType === '1bhk' ? '1' : bhkType === '2bhk' ? '2' : bhkType === '3bhk' ? '3' : '4'} bedroom(s) — count them before finishing.
☑ Every habitable room (Living, Bedroom, Kitchen) touches an external wall with a window.
☑ No rooms exist outside the flat zone boundaries.
☑ No text inside room boxes — only flat numbers at entry doors.

Output: a complete professional 2D CAD floor plan with all ${numFlats} flats fully designed inside their zone boundaries from IMAGE 1.`;
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const {
      traceCanvasBase64,
      workflow = 'grok-gpt',
      units1BHK = 0,
      units2BHK = 0,
      units3BHK = 0,
      units4BHK = 0,
      passengerLifts = 2,
      staircases = 2,
      useVaastu = true,
      useFireSafety = true,
      shapeW,
      shapeH,
      // Legacy single-model fallback fields
      prompt,
      inputImageBase64,
      modelId,
      imageSize,
      apiKey,
      canvasW,
      canvasH,
    } = await req.json();

    // ── Determine image size from shape bounding box ──────────────────────────
    // If shapeH > shapeW → portrait. If shapeW > shapeH → landscape. Otherwise square.
    function pickImageSize(w?: number, h?: number): string {
      if (!w || !h || w === 0 || h === 0) return 'square_hd';
      const ratio = h / w;
      if (ratio > 1.15) return 'portrait_4_3';     // tall shape  → portrait
      if (ratio < 0.87) return 'landscape_4_3';    // wide shape  → landscape
      return 'square_hd';                           // near-square → square HD
    }
    const detectedImageSize = pickImageSize(shapeW, shapeH);
    console.log(`[IdeaGenerator] Shape bounding box: ${shapeW}×${shapeH}px → image_size: ${detectedImageSize}`);

    // ── NEW PIPELINE PATH: if traceCanvasBase64 is provided ──────────────────
    if (traceCanvasBase64) {
      const wf = WORKFLOWS[workflow] || WORKFLOWS['grok-gpt'];
      const stage1Model = wf.stage1;
      const stage2Model = wf.stage2 || null;

      console.log(`[IdeaGenerator] Pipeline: ${wf.label} | stage1=${stage1Model} stage2=${stage2Model || 'none'}`);

      // Upload trace image to fal storage
      const base64Data = traceCanvasBase64.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const traceFile = new File([new Blob([imageBuffer], { type: 'image/png' })], 'trace.png', { type: 'image/png' });
      const uploadedTraceUrl = await fal.storage.upload(traceFile);
      console.log('[IdeaGenerator] Trace uploaded:', uploadedTraceUrl);

      const totalUnits = units1BHK + units2BHK + units3BHK + units4BHK;
      const numFlats = Math.max(1, totalUnits);
      const dominantBHK = detectDominantBHK(units1BHK, units2BHK, units3BHK, units4BHK);

      // ── STAGE 1 — Grok: Generate N empty flat zone boxes + central core ────
      const stage1Prompt = buildStage1Prompt({
        numFlats,
        passengerLifts,
        staircases,
        useFireSafety,
      });

      console.log(`[IdeaGenerator] Stage 1: ${stage1Model} — drawing ${numFlats} empty flat zones...`);
      // Grok, FLUX Klein, and Gemini all use image_urls (array); FLUX Canny uses control_image_url
      const isFluxCanny = stage1Model.includes('flux-control-lora-canny');
      const stage1Input = isFluxCanny
        ? { control_image_url: uploadedTraceUrl, control_lora_image_url: uploadedTraceUrl, prompt: stage1Prompt, num_inference_steps: 28, guidance_scale: 3.5, controlnet_conditioning_scale: 1.0 }
        : { image_urls: [uploadedTraceUrl], prompt: stage1Prompt, image_size: detectedImageSize };
      const stage1Url = await runModel(stage1Model, stage1Input);
      console.log('[IdeaGenerator] Stage 1 output:', stage1Url);

      const stage1Base64 = await fetchToBase64(stage1Url);

      if (!stage2Model) {
        return NextResponse.json({
          url: stage1Base64,
          imageUrls: [stage1Base64],
          stage1ImageUrl: stage1Base64,
          systemPrompt: stage1Prompt,
          userPrompt: `STAGE 1 only | MODEL: ${stage1Model}`,
        });
      }

      // ── STAGE 2 — GPT Image 2: Fill zones using BHK reference image ────────
      console.log(`[IdeaGenerator] Stage 2: ${stage2Model} — filling zones with ${dominantBHK} composition...`);

      // Upload stage1 output to fal storage
      const stage1StorageUrl = await urlToFalStorage(stage1Url);

      // Load the BHK reference image and upload to fal storage
      const referenceStorageUrl = await loadReferenceToFalStorage(dominantBHK);
      const hasReferenceImage = !!referenceStorageUrl;

      // Build the stage 2 prompt
      const refinementPrompt = buildStage2Prompt({
        numFlats,
        bhkType: dominantBHK,
        passengerLifts,
        staircases,
        hasReferenceImage,
      });

      // Build image_urls array:
      // [0] = Stage 1 output (the base zone layout to edit)
      // [1] = BHK reference image (composition guide, if available)
      const imageUrls: string[] = [stage1StorageUrl];
      if (referenceStorageUrl) {
        imageUrls.push(referenceStorageUrl);
      }

      console.log(`[IdeaGenerator] Stage 2 image_urls count: ${imageUrls.length} (base + ${hasReferenceImage ? '1 reference' : 'no reference'})`);

      const stage2Input: Record<string, any> = {
        image_urls: imageUrls,
        prompt: refinementPrompt,
        quality: 'high',
        image_size: detectedImageSize,
      };

      const stage2Url = await runModel(stage2Model, stage2Input);
      console.log('[IdeaGenerator] Stage 2 output:', stage2Url);

      const stage2Base64 = await fetchToBase64(stage2Url);

      return NextResponse.json({
        url: stage2Base64,
        imageUrls: [stage2Base64],
        stage1ImageUrl: stage1Base64,
        stage2ImageUrl: stage2Base64,
        systemPrompt: stage1Prompt,
        refinementPrompt,
        userPrompt: `PIPELINE | Stage1: ${stage1Model} -> Stage2: ${stage2Model} | BHK: ${dominantBHK} | Reference: ${hasReferenceImage ? 'YES' : 'NO'}`,
      });
    }

    // ── LEGACY FALLBACK: old single-model path (if no traceCanvasBase64) ─────
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const activeApiKey = apiKey || process.env.FAL_KEY;
    if (!activeApiKey) {
      return NextResponse.json({ error: 'FAL_KEY is missing.' }, { status: 400 });
    }

    const cleanApiKey = activeApiKey.replace(/\s+/g, '').replace(/[^a-zA-Z0-9:-]/g, '');
    fal.config({ credentials: cleanApiKey });

    const input: any = { prompt };
    if (inputImageBase64) {
      input.image_url = `data:image/png;base64,${inputImageBase64}`;
    }
    input.image_size = { width: 1024, height: 1024 };

    const result = await fal.subscribe('openai/gpt-image-2/edit', { input });
    const images = (result as any)?.images || (result.data as any)?.images;
    const url = images?.[0]?.url || null;

    if (!url) {
      return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
    }

    return NextResponse.json({ url, imageUrls: [url] });

  } catch (error: any) {
    console.error('[IdeaGenerator] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
