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
    const refPath = path.join(process.cwd(), 'public', 'references', `ref-${bhkType}.png`);
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

// ── Stage 1: Grok prompt — N empty equal flat zones + central core ────────────

function buildStage1Prompt(opts: {
  numFlats: number;
  passengerLifts: number;
  staircases: number;
  useFireSafety: boolean;
}): string {
  const { numFlats } = opts;

  return `You are a strict architectural zoning grid generator. Your ONLY job is to divide a building footprint into EXACTLY ${numFlats} equal-area flat zones around a central core box labeled "CORE".

INPUT: The uploaded image shows a WHITE polygon on a BLACK background (building footprint).

CRITICAL RULE 1 — IMMUTABLE FOOTPRINT:
The white polygon is the exact building boundary. Never draw outside it.

CRITICAL RULE 2 — SIMPLE CENTRAL CORE (WHITE BOX WITH BLACK BORDER):
Draw ONE central rectangular box at the geometric center of the footprint.
- Outline: Thin black outline. Inside: White background (SAME as the flat zones).
- Label: Print the text "CORE" in black text inside it.
⛔ DO NOT fill the core with solid black paint.
⛔ DO NOT draw any elevator shafts, lift doors, staircases, steps, or internal lines inside the core. It is a simple white box with black outline containing the text "CORE".

CRITICAL RULE 3 — EXACTLY ${numFlats} EQUAL-AREA FLAT ZONES:
Partition the white space around the central CORE box into EXACTLY ${numFlats} flat zones.
- ZONE COUNT: There must be EXACTLY ${numFlats} zones in total. Count them before rendering: F1, F2${numFlats > 2 ? `, ... F${numFlats}` : ''}.
- EQUAL SIZES: Every zone MUST be equal in area (equal width/length). All ${numFlats} zones must look identical in size.
- NO EXTRA BOXES: Do not draw additional unlabelled boxes, corridors, or sub-boxes.

CRITICAL RULE 4 — STRICT UNIQUE ZONE LABELS (F1 TO F${numFlats}):
Label each zone ONCE with its unique flat number: F1, F2, F3... up to F${numFlats}.
- Strictly NO DUPLICATE LABELS: Every number from F1 to F${numFlats} must be used EXACTLY ONCE. (e.g. if numFlats is 5, you MUST output F1, F2, F3, F4, F5 — NEVER repeat F4 or any other label).
- Do NOT skip any number in the sequence.
- Place the black text label clearly inside each zone.

CRITICAL RULE 5 — COMPLETELY BLANK ZONE INTERIORS:
Each zone (F1 to F${numFlats}) must be a completely blank white rectangle with ONLY its black text label (e.g. F1).
- DO NOT draw internal walls, room dividers, doors, windows, or furniture inside the zones.

CRITICAL RULE 6 — CORRIDOR VENTILATION ACCESS TO EXTERIOR FAÇADE:
- Extend the central "CORE" box or draw a straight access corridor line from the CORE box to touch at least ONE exterior perimeter wall.
- This creates an exterior window opening for the central corridor (providing natural light and fresh air ventilation).

OUTPUT SPECIFICATION:
Top-down 2D CAD diagram showing a white building footprint on a white canvas with black line drawings only: EXACTLY ${numFlats} equal-sized blank zones labeled F1 to F${numFlats} in black text around a central white box labeled "CORE" in black text, with a corridor extending to an exterior wall. Crisp black line work on clean white background.`;
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
IMAGE 2 — REFERENCE COMPOSITION (GUIDE ONLY — DO NOT COPY LITERALLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE 2 is an architectural reference sheet showing 2–3 different ${bhkLabel} apartment layout compositions. Each demonstrates the ideal internal room arrangement for a ${bhkLabel} flat — room positions, door connections, and external ventilation windows.

STEP 1: Study all composition variants in IMAGE 2.
STEP 2: Select the variant whose proportions and shape best match the flat zones in IMAGE 1.
STEP 3: Apply that selected composition strategy inside each flat zone. Adapt it to fit — do not force-copy exact dimensions.` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR TASK — FILL THE CORE & FLAT ZONES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. CORE DRAWING & CORRIDOR VENTILATION (CRITICAL):
   - Inside the central CORE box, draw ${passengerLifts > 0 ? `${passengerLifts} lift shaft(s)` : ''}${passengerLifts > 0 && staircases > 0 ? ' and ' : ''}${staircases > 0 ? `${staircases} staircase flight(s)` : ''}.
   - Draw a common access corridor extending from the central core to the entrance door of every flat.
   - FACADE VENTILATION: Extend the central corridor/lobby so it reaches an external perimeter wall with an exterior window tick. This provides natural light, fresh air ventilation, and smoke evacuation for the common corridor.

2. FLAT ROOM COMPOSITION (in order from entry to back):
   - ENTRY DOOR: Opens from the core corridor into the flat.
   - LIVING ROOM: First room past entry. MUST touch an external perimeter wall with a window tick. Largest room.
   - KITCHEN + DINING: Adjacent to Living Room. Kitchen MUST touch an external wall with a window tick.
   - BEDROOMS: Deepest in the flat, furthest from entry. Every bedroom MUST touch an external wall with its own window. Master Bedroom is the largest.
   - BATHROOMS: Connect directly to a bedroom (ensuite) or internal hallway. NEVER open into Living Room, Kitchen, or Dining.

Door logic (follow exactly):
- Corridor → [Entry Door + swing arc] → Living Room/Foyer
- Living Room → [opening or door] → Kitchen/Dining
- Hallway or Living → [door + swing arc] → Bedroom 1
- Hallway or Living → [door + swing arc] → Bedroom 2 (if applicable)
- Bedroom → [door + swing arc] → Ensuite Bathroom
- Hallway → [door + swing arc] → Common Bathroom

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
      // Legacy single-model fallback fields
      prompt,
      inputImageBase64,
      modelId,
      imageSize,
      apiKey,
      canvasW,
      canvasH,
    } = await req.json();

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
        : { image_urls: [uploadedTraceUrl], prompt: stage1Prompt };
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
