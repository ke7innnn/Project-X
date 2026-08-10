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

/** Load local Grok multi-shape zoning reference image from /public/references/grok_zoning_multi_ref.png and upload to fal storage */
async function loadGrokZoningReferenceToFalStorage(): Promise<string | null> {
  try {
    let refPath = path.join(process.cwd(), 'public', 'references', 'grok_zoning_multi_ref.png');
    if (!fs.existsSync(refPath)) {
      refPath = path.join(process.cwd(), 'public', 'references', 'grok_zoning_ref.png');
    }
    if (!fs.existsSync(refPath)) {
      console.warn(`[IdeaGenerator] Grok zoning reference not found: ${refPath}`);
      return null;
    }
    const buffer = fs.readFileSync(refPath);
    const blob = new Blob([buffer], { type: 'image/png' });
    const file = new File([blob], 'grok_zoning_multi_ref.png', { type: 'image/png' });
    const url = await fal.storage.upload(file);
    console.log(`[IdeaGenerator] Uploaded Grok zoning reference to fal storage: ${url}`);
    return url;
  } catch (err: any) {
    console.warn('[IdeaGenerator] Failed to load Grok zoning reference image:', err.message);
    return null;
  }
}

// ── Workflow model mapping ────────────────────────────────────────────────────

const WORKFLOWS: Record<string, { stage1: string; stage2?: string; label: string }> = {
  'grok-gpt':         { stage1: 'xai/grok-imagine-image/quality/edit',           stage2: 'fal-ai/nano-banana-2/edit', label: 'Grok [Quality] -> Nano Banana 2' },
  'grok-nano':        { stage1: 'xai/grok-imagine-image/quality/edit',           stage2: 'fal-ai/nano-banana-2/edit', label: 'Grok [Quality] -> Nano Banana 2' },
  'grok-kontext':     { stage1: 'xai/grok-imagine-image/quality/edit',           stage2: 'fal-ai/flux-pro/kontext', label: 'Grok [Quality] -> FLUX Kontext' },
  'flux-klein-gpt':   { stage1: 'fal-ai/flux-2/klein/9b/edit',                   stage2: 'fal-ai/nano-banana-2/edit', label: 'FLUX Klein -> Nano Banana 2' },
  'flux-klein-nano':  { stage1: 'fal-ai/flux-2/klein/9b/edit',                   stage2: 'fal-ai/nano-banana-2/edit', label: 'FLUX Klein -> Nano Banana 2' },
  'flux-kontext-gpt': { stage1: 'fal-ai/flux-pro/kontext',                        stage2: 'fal-ai/nano-banana-2/edit', label: 'FLUX Kontext -> Nano Banana 2' },
  'grok-solo':        { stage1: 'xai/grok-imagine-image/quality/edit',           label: 'Grok [Quality] only' },
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

function buildStage1Prompt(opts: {
  numFlats: number;
}): string {
  const { numFlats } = opts;
  const flatLabelsArray = Array.from({ length: numFlats }, (_, i) => `F${i + 1}`);
  const flatLabels = flatLabelsArray.join(', ');
  const uniqueLabelLines = flatLabelsArray.map(label => `• ${label} (use once)`).join('\n');

  return `You are a senior architectural floor-plan and zoning drafter.

EDIT THE UPLOADED IMAGE ONLY.

The uploaded image shows a WHITE building footprint polygon on a BLACK background. Ignore any faint background texture — treat the entire WHITE polygon area as a SINGLE EMPTY CANVAS.

Use the uploaded footprint as the exact outer boundary. Work entirely inside the WHITE footprint polygon.

Your ONLY task is to divide this building footprint into EXACTLY ${numFlats} clean, proportional apartment/flat zones (${flatLabels}) around a properly sized central rectangular CORE.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL LABELING RULE — UNIQUE LABELS ONLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You must use EACH label EXACTLY ONCE:
${uniqueLabelLines}

DO NOT DUPLICATE LABELS.
DO NOT write any label twice.
There are EXACTLY ${numFlats} apartments, so there must be EXACTLY ${numFlats} unique labels.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NO INTERNAL GRID LINES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Do NOT draw any internal grid lines, sub-boxes, or mesh lines inside the apartment zones.
• The interior of each flat box (${flatLabels}) must be 100% SOLID BLANK WHITE.
• The ONLY lines inside the building must be:
  1. The outer CORE rectangular box
  2. The corridor ring around the CORE
  3. The main straight partition walls separating ${flatLabels} from each other.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESIGN INTENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• ONE central rectangular CORE (20-25% area)
• ONE corridor ring wrapping around the CORE
• EXACTLY ${numFlats} clean RECTANGULAR or SQUARE apartment boxes (${flatLabels})
• All partition walls straight at 90 degrees
• Every flat touches an exterior perimeter wall for windows
• SOLID WHITE background inside all flat boxes
• Pure 2D black & white CAD linework only

OUTPUT ONLY THE FINAL CLEAN TOP-DOWN 2D CAD ZONING DIAGRAM.`;
}

// ── Stage 2: GPT Image 2 prompt — fill zones using BHK reference ──────────────

function buildStage2Prompt(opts: {
  numFlats: number;
  bhkType: string;
  passengerLifts: number;
  staircases: number;
  hasReferenceImage: boolean;
}): string {
  const { numFlats, bhkType, passengerLifts, staircases } = opts;

  const bhkLabel = bhkType.toUpperCase().replace('BHK', ' BHK');
  const flatLabelsArray = Array.from({ length: numFlats }, (_, i) => `F${i + 1}`);
  const flatLabels = flatLabelsArray.join(', ');

  const roomItems = bhkType === '1bhk'
    ? '- 1 Living Room & Dining area\n- 1 Kitchen\n- 1 Bedroom\n- 1 Bathroom'
    : bhkType === '2bhk'
    ? '- 1 Living Room & Dining area\n- 1 Kitchen\n- 2 Bedrooms (Master Bedroom + Bedroom 2)\n- 2 Bathrooms'
    : bhkType === '3bhk'
    ? '- 1 Living Room & Dining area\n- 1 Kitchen\n- 3 Bedrooms (Master + Bed 2 + Bed 3)\n- 3 Bathrooms'
    : '- 1 Living Room & Dining area\n- 1 Kitchen\n- 4 Bedrooms (Master + Bed 2 + Bed 3 + Bed 4)\n- 4 Bathrooms';

  const liftsStr = passengerLifts > 0 ? `${passengerLifts} rectangular elevator shaft(s)` : '1 rectangular elevator shaft';
  const stairsStr = staircases > 0 ? `${staircases} staircase flight(s)` : '2 staircase flights';

  return `You are a 2D CAD floor-plan drafter. EDIT THE UPLOADED IMAGE ONLY.

1. PRESERVE GEOMETRY (LOCKED):
Keep the outer building footprint shape, central CORE position, and all flat zone partition walls (${flatLabels}) EXACTLY as they appear in the uploaded image. Do NOT move, merge, or remove any main wall.

2. INSIDE THE CORE BOX:
Draw ${liftsStr} and ${stairsStr}.

3. INSIDE EACH FLAT ZONE (${flatLabels}):
Fill the empty white space inside EACH zone with a complete ${bhkLabel} 2D CAD apartment layout containing:
${roomItems}
- Door swing arcs and exterior window lines

4. GRAPHIC STYLE (STRICT):
Pure 2D black lines on a solid white background only. ABSOLUTELY NO COLOR, NO WOOD TEXTURES, NO GREY SHADING, NO 3D RENDERING.
NO ROOM NAMES OR TEXT INSIDE ROOMS. Keep room interiors completely clean of text.
Keep ONLY the flat labels (${flatLabels}) near entry doors.

Output a complete 2D CAD blueprint floor plan with rooms designed inside the preserved flat zones.`;
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

    // ── Determine image size and aspect ratio from shape bounding box ──────────
    function pickDimensions(w?: number, h?: number): { image_size: string; aspect_ratio: string } {
      if (!w || !h || w === 0 || h === 0) return { image_size: 'square_hd', aspect_ratio: '1:1' };
      const ratio = h / w;
      if (ratio > 1.15) return { image_size: 'portrait_4_3', aspect_ratio: '3:4' };     // tall shape  → portrait
      if (ratio < 0.87) return { image_size: 'landscape_4_3', aspect_ratio: '4:3' };    // wide shape  → landscape
      return { image_size: 'square_hd', aspect_ratio: '1:1' };                           // near-square → square HD
    }
    const { image_size: detectedImageSize, aspect_ratio: detectedAspectRatio } = pickDimensions(shapeW, shapeH);
    console.log(`[IdeaGenerator] Shape bounding box: ${shapeW}×${shapeH}px → image_size: ${detectedImageSize}, aspect_ratio: ${detectedAspectRatio}`);

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
      });

      console.log(`[IdeaGenerator] Stage 1: ${stage1Model} — drawing ${numFlats} empty flat zones...`);

      const stage1ImageUrls: string[] = [uploadedTraceUrl];

      const isFluxCanny = stage1Model.includes('flux-control-lora-canny');
      const isGrok = stage1Model.includes('grok');

      let stage1Input: Record<string, any>;

      if (isFluxCanny) {
        stage1Input = {
          control_image_url: uploadedTraceUrl,
          control_lora_image_url: uploadedTraceUrl,
          prompt: stage1Prompt,
          num_inference_steps: 28,
          guidance_scale: 3.5,
          controlnet_conditioning_scale: 1.0,
        };
      } else if (isGrok) {
        // Grok quality edit accepts multiple image_urls (trace + multi-shape reference)
        // We DO NOT pass image_size or aspect_ratio to prevent 422 Unprocessable Entity
        stage1Input = {
          image_urls: stage1ImageUrls,
          prompt: stage1Prompt,
          resolution: '1k',
        };
      } else {
        stage1Input = {
          image_urls: stage1ImageUrls,
          prompt: stage1Prompt,
          image_size: detectedImageSize,
          aspect_ratio: detectedAspectRatio,
        };
      }
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
        aspect_ratio: detectedAspectRatio,
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
