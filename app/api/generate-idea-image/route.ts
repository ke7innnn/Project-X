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
  const { numFlats, passengerLifts, staircases, useFireSafety } = opts;

  const coreContents = [
    passengerLifts > 0 ? `${passengerLifts} elevator shaft(s)` : null,
    staircases > 0 ? `${staircases} staircase(s)` : null,
    'shared corridor',
  ].filter(Boolean).join(', ');

  return `You are a precise architectural zoning tool. Your ONLY job is to divide a building footprint into flat zones and draw a central core. Do NOT design any room interiors.

INPUT: The uploaded image shows a WHITE polygon on a BLACK background. The white polygon is the building footprint boundary.

THE WHITE BOUNDARY IS IMMUTABLE — never draw anything outside it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR ONLY TASK — ZONE DIVISION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 — CENTRAL CORE:
Draw one solid filled rectangle at the geometric center of the white building footprint. This is the central circulation core (${coreContents}). It must be clearly visible as a solid dark block.

STEP 2 — FLAT ZONES:
Divide the remaining white space (surrounding the central core) into exactly ${numFlats} flat zones. Each zone must:
- Be roughly equal in area to all other zones.
- Be a clean rectangular or L-shaped polygon.
- Touch or be accessible from the central core.
- Be completely EMPTY inside — no internal walls, no partitions, no rooms, no doors, no windows, no furniture.

STEP 3 — ZONE LABELS:
Label each zone with a single flat number only: F1, F2, F3... placed small, near the zone boundary. No other text anywhere.

${useFireSafety && numFlats >= 3 ? 'FIRE SAFETY: The central core must contain two staircase blocks placed at opposite ends of the core.' : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT DRAWING RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- All partition lines are straight, clean, 90-degree black lines.
- No diagonal walls, no jagged lines, no curved partitions.
- Do NOT draw any internal room walls inside the flat zones.
- Do NOT draw doors, windows, or furniture inside zones.
- Zone interiors must be completely blank white space.
- White background. Clean 2D top-down view. Black partition lines only.
- Output: the building footprint divided into ${numFlats} clean empty flat zones around a central solid core block.`;
}

// ── Stage 2: GPT Image 2 prompt — fill zones using BHK reference ──────────────

function buildStage2Prompt(opts: {
  numFlats: number;
  bhkType: string;
  hasReferenceImage: boolean;
}): string {
  const { numFlats, bhkType, hasReferenceImage } = opts;

  const bhkLabel = bhkType.toUpperCase().replace('BHK', ' BHK');

  return `You are a senior architectural drafter producing a professional 2D CAD floor plan.

You have been provided with ${hasReferenceImage ? 'TWO' : 'ONE'} image(s):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE 1 — BASE ZONE LAYOUT (TO BE EDITED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE 1 shows a top-down 2D floor plan with ${numFlats} empty flat zones (F1–F${numFlats}) surrounding a solid central circulation core block.

⛔ IMMUTABLE ELEMENTS — DO NOT TOUCH UNDER ANY CIRCUMSTANCE:
1. THE OUTER BUILDING BOUNDARY — Do NOT redraw, shrink, expand, or alter the building perimeter in any way.
2. THE CENTRAL CORE BLOCK — Do NOT draw inside it, do NOT remove it, do NOT resize or relocate it. Reproduce it exactly as a solid block. It is the staircase/lift core and must remain untouched.
3. THE FLAT ZONE BOUNDARIES — The partition lines dividing F1–F${numFlats} are fixed. Do NOT move, merge, or remove any zone boundary wall.

✅ WHAT YOU ARE ALLOWED TO MODIFY:
ONLY the empty white interior of each flat zone (F1–F${numFlats}). You may add internal room partition walls, doors, and windows strictly inside each zone's boundary. Nothing else changes.

${hasReferenceImage ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE 2 — REFERENCE COMPOSITION (GUIDE ONLY — DO NOT COPY LITERALLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE 2 is an architectural reference sheet showing 2–3 different ${bhkLabel} apartment layout compositions. Each demonstrates the ideal internal room arrangement for a ${bhkLabel} flat — room positions, door connections, and external ventilation windows.

STEP 1: Study all composition variants in IMAGE 2.
STEP 2: Select the variant whose proportions and shape best match the flat zones in IMAGE 1.
STEP 3: Apply that selected composition strategy inside each flat zone. Adapt it to fit — do not force-copy exact dimensions.` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR TASK — FILL THE FLAT ZONES WITH ROOMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Inside each empty flat zone from IMAGE 1, draw the complete internal floor plan of a ${bhkLabel} apartment.

Room composition (in order from entry to back):
1. ENTRY DOOR: Opens from the shared corridor (central core side). At the zone boundary wall facing the core.
2. LIVING ROOM: First room past entry. MUST touch an external perimeter wall with a window tick. Largest room.
3. KITCHEN + DINING: Adjacent to Living Room. Kitchen MUST touch an external wall with a window tick.
4. BEDROOMS: Deepest in the flat, furthest from entry. Every bedroom MUST touch an external wall with its own window. Master Bedroom is the largest.
5. BATHROOMS: Connect directly to a bedroom (ensuite) or internal hallway. NEVER open into Living Room, Kitchen, or Dining.

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
- Place only flat numbers (F1, F2, F3…) once near each flat's entry door. No other text.
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
☑ The central core block is still present, solid, and unchanged.
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
