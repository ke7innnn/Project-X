import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import fs from 'fs';
import path from 'path';

export const maxDuration = 600; // 10 min — needed for 3-stage pipeline (Grok ~60s + GPT Stage2 ~90s + GPT Stage3 ~90s + uploads)

fal.config({ credentials: process.env.FAL_KEY });

// ── Helpers ───────────────────────────────────────────────────────────────────

async function runModel(falModel: string, input: Record<string, any>): Promise<{ url: string; seed?: number }> {
  const result = await fal.subscribe(falModel, { input });
  const data = (result as any)?.data || result;
  const images = data?.images;
  if (!images || images.length === 0) throw new Error(`${falModel} returned no images`);
  const seed = data?.seed ?? (result as any)?.seed;
  return { url: images[0].url, seed };
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
    // Priority order: BHK-specific image first, then generic fallback
    const candidatePaths = [
      path.join(process.cwd(), 'public', 'references', `${bhkType}.png`),        // e.g. 2bhk.png
      path.join(process.cwd(), 'public', 'references', `ref-${bhkType}.png`),    // e.g. ref-2bhk.png
      path.join(process.cwd(), 'public', 'references', 'master_cad_ref.png'),    // generic fallback
    ];

    let refPath: string | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        refPath = p;
        break;
      }
    }

    if (!refPath) {
      console.warn(`[IdeaGenerator] No reference image found for bhkType=${bhkType}`);
      return null;
    }

    console.log(`[IdeaGenerator] Using reference image: ${refPath}`);
    const buffer = fs.readFileSync(refPath);
    const blob = new Blob([buffer], { type: 'image/png' });
    const file = new File([blob], `${bhkType}_ref.png`, { type: 'image/png' });
    const url = await fal.storage.upload(file);
    console.log(`[IdeaGenerator] Uploaded ${bhkType} CAD reference to fal storage: ${url}`);
    return url;
  } catch (err: any) {
    console.warn(`[IdeaGenerator] Failed to load reference image:`, err.message);
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

/** Load local 90-degree multi-shape zoning reference image from /public/references/zoning_reference_90deg.png and upload to fal storage */
async function loadZoningReferenceToFalStorage(): Promise<string | null> {
  try {
    let refPath = path.join(process.cwd(), 'public', 'references', 'zoning_reference_90deg.png');
    if (!fs.existsSync(refPath)) {
      refPath = path.join(process.cwd(), 'public', 'references', 'grok_zoning_multi_ref.png');
    }
    if (!fs.existsSync(refPath)) {
      refPath = path.join(process.cwd(), 'public', 'references', 'grok_zoning_ref.png');
    }
    if (!fs.existsSync(refPath)) {
      console.warn(`[IdeaGenerator] Zoning reference not found: ${refPath}`);
      return null;
    }
    const buffer = fs.readFileSync(refPath);
    const blob = new Blob([buffer], { type: 'image/png' });
    const file = new File([blob], 'zoning_reference_90deg.png', { type: 'image/png' });
    const url = await fal.storage.upload(file);
    console.log(`[IdeaGenerator] Uploaded 90-degree zoning reference to fal storage: ${url}`);
    return url;
  } catch (err: any) {
    console.warn('[IdeaGenerator] Failed to load zoning reference image:', err.message);
    return null;
  }
}

// ── Workflow model mapping ────────────────────────────────────────────────────

const WORKFLOWS: Record<string, { stage1: string; stage2?: string; label: string }> = {
  'grok-gpt':             { stage1: 'xai/grok-imagine-image/quality/edit',           stage2: 'openai/gpt-image-2/edit', label: 'Grok [Quality] -> GPT Image 2' },
  'grok-nano':            { stage1: 'xai/grok-imagine-image/quality/edit',           stage2: 'openai/gpt-image-2/edit', label: 'Grok [Quality] -> GPT Image 2' },
  'grok-kontext':         { stage1: 'xai/grok-imagine-image/quality/edit',           stage2: 'fal-ai/flux-pro/kontext', label: 'Grok [Quality] -> FLUX Kontext' },
  'gpt-low-gpt-medium':   { stage1: 'openai/gpt-image-2/edit',                       stage2: 'openai/gpt-image-2/edit', label: 'GPT Image 2 [Low] -> GPT Image 2 [Medium]' },
  'flux-klein-gpt':       { stage1: 'fal-ai/flux-2/klein/9b/edit',                   stage2: 'openai/gpt-image-2/edit', label: 'FLUX Klein -> GPT Image 2' },
  'flux-klein-nano':      { stage1: 'fal-ai/flux-2/klein/9b/edit',                   stage2: 'openai/gpt-image-2/edit', label: 'FLUX Klein -> GPT Image 2' },
  'flux-kontext-gpt':     { stage1: 'fal-ai/flux-pro/kontext',                        stage2: 'openai/gpt-image-2/edit', label: 'FLUX Kontext -> GPT Image 2' },
  'grok-solo':            { stage1: 'xai/grok-imagine-image/quality/edit',           label: 'Grok [Quality] only' },
  'flux-klein-solo':      { stage1: 'fal-ai/flux-2/klein/9b/edit',                   label: 'FLUX Klein only' },
  'flux-kontext-solo':    { stage1: 'fal-ai/flux-pro/kontext',                        label: 'FLUX Kontext [pro] only' },
  'gpt-solo':             { stage1: 'openai/gpt-image-2/edit',                        label: 'GPT Image 2 only' },
  'gemini-solo':          { stage1: 'fal-ai/gemini-3.1-flash-image-preview/edit',     label: 'Gemini only' },
  'flux-canny-solo':      { stage1: 'fal-ai/flux-control-lora-canny',                 label: 'FLUX Canny only' },
};

// ── Detect dominant BHK type ──────────────────────────────────────────────────

function detectDominantBHK(units1BHK: number, units2BHK: number, units3BHK: number, units4BHK: number): string {
  if (units4BHK > 0 && units4BHK >= units3BHK && units4BHK >= units2BHK && units4BHK >= units1BHK) return '4bhk';
  if (units3BHK > 0 && units3BHK >= units2BHK && units3BHK >= units1BHK) return '3bhk';
  if (units2BHK > 0 && units2BHK >= units1BHK) return '2bhk';
  return '1bhk';
}

// ── Stage 1: Prompt for empty flat zones + central core ─────────────────────────

function buildStage1Prompt(opts: {
  numFlats: number;
  hasReferenceImage?: boolean;
}): string {
  const { numFlats, hasReferenceImage } = opts;
  const flatLabelsArray = Array.from({ length: numFlats }, (_, i) => `F${i + 1}`);
  const flatLabels = flatLabelsArray.join(', ');
  const uniqueLabelLines = flatLabelsArray.map(label => `• ${label} (use once)`).join('\n');

  return `You are a 2D architectural floor-plan drafter. EDIT THE FIRST UPLOADED IMAGE ONLY.

${hasReferenceImage ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE ROLES — EXTREMELY IMPORTANT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• IMAGE 1 = TARGET BUILDING FOOTPRINT (EDIT THIS IMAGE).
  Keep 100% of this exact outer boundary footprint shape. Draw all unit divisions entirely inside this shape.

• IMAGE 2 = 90-DEGREE SQUARES & RECTANGLES ZONING REFERENCE.
  LOOK AT IMAGE 2 CAREFULLY:
  - Notice that across all different building geometries (ring/octagon, V-shape, Y-shape), EVERY SINGLE UNIT DIVISION IS COMPOSED STRICTLY OF 90-DEGREE SQUARES AND RECTANGLES.
  - Notice how corridors run through the shapes and individual flat units are clean orthogonal rectangular/square blocks along the paths with color-coded boundaries.
  - Do NOT copy the specific building shape from IMAGE 2.
  - COPY THE PARTITIONING METHOD: Use clean 90° horizontal and vertical cuts to create clean rectangular/square flat unit blocks inside IMAGE 1!
` : ''}
The target image (IMAGE 1) shows a WHITE building footprint on a BLACK background.
Your ONLY task: divide the white footprint into EXACTLY ${numFlats} rectangular/square flat zones (${flatLabels}) around a central CORE block.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#1 — PARTITION WALLS: STRICT HORIZONTAL & VERTICAL ONLY (90°)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Draw ONLY straight HORIZONTAL (left-right) and VERTICAL (up-down) partition lines.
• EVERY flat zone MUST be a clean RECTANGLE or SQUARE shape — exactly as shown in the reference image (IMAGE 2).
• ABSOLUTELY FORBIDDEN:
  - NO diagonal lines from corners to center.
  - NO triangle, pie-slice, wedge, or trapezoid units.
  - NO angled walls or slanted partition lines.
• Even if the outer building footprint has diagonal or slanted boundary walls, ALL internal dividing walls MUST be strictly horizontal or vertical meeting at 90° angles.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#2 — CENTRAL CIRCULATION CORE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Place ONE rectangular CORE box (elevator + staircase) centrally inside the footprint.
• Draw a corridor ring around the CORE so every flat has direct access.
• Draw ONE thin straight entrance corridor from the CORE to the nearest outer facade wall.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#3 — EXACT FLAT COUNT & LABELS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Divide into EXACTLY ${numFlats} flat zones (${flatLabels}) of proportional, equal floor area.
• Place each label clearly inside its flat zone EXACTLY ONCE:
${uniqueLabelLines}
• NO duplicate labels. NO extra unlabeled boxes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#4 — COLOR-CODED BOUNDARIES & VISUAL STYLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• COLOR-CODED UNIT BOUNDARIES: Draw the outer boundary outline of each flat zone in a DIFFERENT, DISTINCT VIVID COLOR (e.g. red, blue, green, orange, purple, teal, crimson, indigo).
• All internal room/partition lines remain thin black lines.
• Solid blank white background inside each flat zone (no grid, no hatching, no textures).
• Pure 2D top-down CAD linework only. Stay 100% inside the white footprint polygon.

OUTPUT: Clean 2D CAD zoning floor plan with EXACTLY ${numFlats} rectangular flat zones (${flatLabels}) with 90° horizontal/vertical divisions and distinct colored boundaries.`;
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
  const flatLabelsArray = Array.from({ length: numFlats }, (_, i) => `F${i + 1}`);
  const flatLabels = flatLabelsArray.join(', ');

  const roomItemsBullet = bhkType === '1bhk'
    ? '* 1 Living + Dining\n* 1 Kitchen\n* 1 Bedroom\n* 1 Bathroom'
    : bhkType === '2bhk'
    ? '* 1 Living + Dining\n* 1 Kitchen\n* 2 Bedrooms (Master Bedroom + Bedroom 2)\n* 2 Bathrooms'
    : bhkType === '3bhk'
    ? '* 1 Living + Dining\n* 1 Kitchen\n* 3 Bedrooms (Master + Bed 2 + Bed 3)\n* 3 Bathrooms'
    : '* 1 Living + Dining\n* 1 Kitchen\n* 4 Bedrooms (Master + Bed 2 + Bed 3 + Bed 4)\n* 4 Bathrooms';

  const validationRoomStr = bhkType === '1bhk'
    ? '1 Living/Dining + 1 Kitchen + 1 Bedroom + 1 Bathroom'
    : bhkType === '2bhk'
    ? '1 Living/Dining + 1 Kitchen + 2 Bedrooms + 2 Bathrooms'
    : bhkType === '3bhk'
    ? '1 Living/Dining + 1 Kitchen + 3 Bedrooms + 3 Bathrooms'
    : '1 Living/Dining + 1 Kitchen + 4 Bedrooms + 4 Bathrooms';

  const liftsStr = passengerLifts > 0 ? `${passengerLifts} rectangular elevator shaft(s)` : '1 rectangular elevator shaft';
  const stairsStr = staircases > 0 ? `${staircases} staircase flight(s)` : '2 staircase flights';

  return `You are a 2D CAD floor-plan drafter. EDIT THE FIRST UPLOADED IMAGE ONLY.

${hasReferenceImage ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE ROLES — EXTREMELY IMPORTANT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• IMAGE 1 = MASTER ZONING DIAGRAM (EDIT THIS IMAGE).
  Keep 100% of the outer building footprint shape, central CORE position, and flat zone partition walls from IMAGE 1.

• IMAGE 2 = ROOM POSITIONING & FACADE VENTILATION REFERENCE ONLY.
  Do NOT copy the shape, dimensions, or footprint of IMAGE 2.
  Use IMAGE 2 EXCLUSIVELY as a reference for:
  1. ROOM POSITIONING & FLOW: How rooms (Living Room, Kitchen, Bedrooms, Bathrooms) are connected and arranged inside each flat.
  2. EXTERIOR FACADE VENTILATION: How Living Room, Kitchen, and ALL Bedrooms are positioned along outer building exterior walls so every habitable room connects to the outside for natural sunlight and ventilation.
  3. INTERNAL BATHROOM DUCTS: How internal Bathrooms use small ventilation shafts labeled "DUCT".` : ''}

1. PRESERVE GEOMETRY (LOCKED):
Keep the outer building footprint shape, central CORE position, and all flat zone partition walls (${flatLabels}) from IMAGE 1 EXACTLY as they appear. Do NOT move, merge, or remove any main wall.

2. INSIDE THE CORE BOX:
Draw ${liftsStr} and ${stairsStr}.

3. INSIDE EACH FLAT ZONE (${flatLabels})

Inside **EACH zone**, create one complete, functional **${bhkLabel} 2D CAD apartment layout**, adapted to that zone's exact irregular shape.

**Each flat must contain exactly:**

${roomItemsBullet}
* Internal circulation
* Door swings + window lines
* \`DUCT\` ventilation shafts where required

**Planning constraints:**

* All rooms and partitions must remain completely inside their assigned zone.
* **Living, Kitchen, and Bedroom MUST each touch a wall that forms the OUTER EDGE OF THE BUILDING (the building's outside-facing boundary), and each must have a window directly on that wall.**
* Bathroom may be internal. If it does not touch the building's outside-facing boundary, provide a small ventilation shaft labeled **\`DUCT\`**.
* **HARD RULE — KITCHEN & LIVING ROOM SEPARATION: The Kitchen and Living Room MUST be separated by a full solid partition wall with a door opening between them. NO open-plan or combined Kitchen-Living layouts are allowed. They must be two clearly distinct walled rooms connected only by a door.**
* Arrange rooms logically with practical adjacency and minimal circulation.
* Bedroom should have privacy; Kitchen should connect to Living/Dining via a door in the separating wall; Bathroom should preferably open from common circulation.
* Adapt the layout to each zone's **irregular geometry**; do not force identical or purely rectangular layouts.
* Use realistic wall thicknesses, door swings, window lines, and room proportions.
* **Any remaining awkward, narrow, or unusable leftover space should remain EMPTY and may be used as ventilation/duct space. Do NOT create additional rooms or force partitions into these areas.**

**Validation:** Every ${flatLabels} must contain exactly **${validationRoomStr}**. Living, Kitchen, and Bedroom must each have a window directly on the **building's outside-facing boundary wall**. Any internal Bathroom must have a \`DUCT\`.

4. GRAPHIC STYLE (STRICT):
Pure 2D black lines on a solid white background only. ABSOLUTELY NO WOOD TEXTURES, NO GREY SHADING, NO 3D RENDERING.
NO ROOM NAMES OR TEXT INSIDE ROOMS. Keep room interiors completely clean of text.
Keep ONLY the flat labels (${flatLabels}) near entry doors.

COLOR-CODED UNIT BOUNDARIES (PRESERVE FROM IMAGE 1):
• Each flat zone in IMAGE 1 already has its own distinct colored outer boundary outline. PRESERVE that exact same color for each flat's outer boundary outline in your output — do not change or remove those colors.
• All internal room partition walls drawn inside each flat must remain thin black lines.
• Only the outer boundary wall outline of each flat zone keeps its unique color from IMAGE 1.

Output a complete 2D CAD blueprint floor plan with rooms designed inside the preserved flat zones of IMAGE 1.`;
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
      seed: reqSeed,
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
      const wf = WORKFLOWS[workflow] || WORKFLOWS['gpt-low-gpt-medium'];
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

      // ── STAGE 1: Generate N empty flat zone boxes + central core ──────────
      const zoningRefUrl = await loadZoningReferenceToFalStorage();
      const hasZoningRef = !!zoningRefUrl;

      const stage1Prompt = buildStage1Prompt({
        numFlats,
        hasReferenceImage: hasZoningRef,
      });

      console.log(`[IdeaGenerator] Stage 1: ${stage1Model} — drawing ${numFlats} empty flat zones... (hasZoningRef: ${hasZoningRef})`);

      const stage1ImageUrls: string[] = [uploadedTraceUrl];
      if (zoningRefUrl) {
        stage1ImageUrls.push(zoningRefUrl);
      }

      const isFluxCanny = stage1Model.includes('flux-control-lora-canny');
      const isGrok = stage1Model.includes('grok');
      const isGPTImage = stage1Model.includes('gpt-image-2');

      let stage1Input: Record<string, any>;

      const stage1TargetSeed = Math.floor(Math.random() * 2147483647);

      if (isFluxCanny) {
        stage1Input = {
          control_image_url: uploadedTraceUrl,
          control_lora_image_url: uploadedTraceUrl,
          prompt: stage1Prompt,
          num_inference_steps: 28,
          guidance_scale: 3.5,
          controlnet_conditioning_scale: 1.0,
          seed: stage1TargetSeed,
        };
      } else if (isGrok) {
        // Grok quality edit — accepts image_urls, resolution, seed. No image_size/aspect_ratio.
        stage1Input = {
          image_urls: stage1ImageUrls,
          prompt: stage1Prompt,
          resolution: '1k',
          seed: stage1TargetSeed,
        };
      } else if (isGPTImage) {
        // GPT Image 2 edit — accepts image_urls and quality. No seed, no image_size, no aspect_ratio.
        stage1Input = {
          image_urls: stage1ImageUrls,
          prompt: stage1Prompt,
          quality: 'low',
        };
      } else {
        stage1Input = {
          image_urls: stage1ImageUrls,
          prompt: stage1Prompt,
          image_size: detectedImageSize,
          aspect_ratio: detectedAspectRatio,
          seed: stage1TargetSeed,
        };
      }
      const { url: stage1Url, seed: returnedStage1Seed } = await runModel(stage1Model, stage1Input);
      const stage1Seed = returnedStage1Seed ?? stage1TargetSeed;
      console.log(`[IdeaGenerator] Stage 1 output (seed: ${stage1Seed}):`, stage1Url);

      const stage1Base64 = await fetchToBase64(stage1Url);

      if (!stage2Model) {
        return NextResponse.json({
          url: stage1Base64,
          imageUrls: [stage1Base64],
          stage1ImageUrl: stage1Base64,
          stage1Seed,
          systemPrompt: stage1Prompt,
          userPrompt: `STAGE 1 only | MODEL: ${stage1Model}`,
        });
      }

      // ── STAGE 2 — GPT Image 2: Fill zones using BHK reference image ────────
      // Load master CAD reference image and upload to fal storage
      const referenceStorageUrl = await loadReferenceToFalStorage(dominantBHK);
      const hasReferenceImage = !!referenceStorageUrl;

      const refinementPrompt = buildStage2Prompt({
        numFlats,
        bhkType: dominantBHK,
        passengerLifts,
        staircases,
        hasReferenceImage,
      });

      const imageUrls: string[] = [stage1Url];
      if (referenceStorageUrl) {
        imageUrls.push(referenceStorageUrl);
      }

      console.log(`[IdeaGenerator] Stage 2 image_urls count: ${imageUrls.length} (Stage 1 footprint + ${hasReferenceImage ? 'Master CAD reference' : 'no reference'})`);

      const stage2Input: Record<string, any> = {
        image_urls: imageUrls,
        prompt: refinementPrompt,
        quality: 'medium',
      };

      const { url: stage2Url, seed: returnedSeed } = await runModel(stage2Model, stage2Input);
      const stage2Seed = returnedSeed ?? undefined;
      console.log(`[IdeaGenerator] Stage 2 output (seed: ${stage2Seed}):`, stage2Url);

      const stage2Base64 = await fetchToBase64(stage2Url);

      // ── STAGE 2.5 — GPT-4o Vision: Architectural Audit ──────────────────────
      console.log(`[IdeaGenerator] Stage 2.5: GPT-4o Vision — auditing floor plan for ventilation and circulation issues...`);

      const flatLabelsList = Array.from({ length: numFlats }, (_, i) => `F${i + 1}`).join(', ');
      const colorMap = ['red','blue','green','orange','purple','teal','crimson','indigo','dark-green','dark-orange'];
      const flatColorList = Array.from({ length: numFlats }, (_, i) => `F${i + 1} (${colorMap[i % colorMap.length]} boundary)`).join(', ');

      const auditSystemPrompt = `You are a licensed senior architect reviewing a 2D CAD residential floor plan. Your job is to produce a precise, actionable correction brief for each flat unit that has architectural deficiencies.

CRITICAL RULE FOR FIX INSTRUCTIONS:
- NEVER use measurements, numbers, distances, or dimensions (no meters, no millimeters, no percentages).
- Describe fixes using ONLY spatial and positional language: "shift to the left wall", "push to the top edge", "move to the outer perimeter", "swap position with", "slide toward the exterior", "reposition to the corner", "flip to the opposite wall", etc.
- The goal is visual repositioning instructions that a drawing model can understand, not engineering dimensions.

Be specific: name the unit by its label AND boundary color. Output ONLY a structured correction brief — no preamble, no praise.`;

      const auditUserPrompt = `Analyze this 2D CAD floor plan image. It contains ${numFlats} flat units: ${flatColorList}. Each unit is identified by its colored outer boundary outline.

For EACH flat unit (${flatLabelsList}), check and report:

1. VENTILATION CHECK: Is every habitable room (Living Room, Kitchen, ALL Bedrooms) placed on the exterior/perimeter wall of the building with a direct window opening? If any habitable room is positioned away from the outer building wall (landlocked interior position, no window), flag it.

2. CIRCULATION CHECK: Does the flat have a clear foyer/entrance from the shared corridor? Is there an internal passage connecting all rooms without crossing through another room? Can every room be reached without passing through a habitable room?

3. ROOM ADJACENCY CHECK: Is the Kitchen directly next to Living/Dining? Are Bedroom doors opening from a corridor/passage rather than from the Living Room?

Output Format — write one block per problematic flat only:
UNIT [F#] ([color] boundary):
- PROBLEM: [exact room name] is positioned away from the outer wall / has no exterior window / has no direct corridor access etc.
- FIX: [positional repositioning instruction — e.g. "shift the Living Room to the left outer wall of this unit", "push the Kitchen toward the top exterior edge", "swap the Bedroom and Bathroom positions so Bedroom faces the outer wall", "slide the Living Room to the bottom perimeter wall", "rotate the room arrangement so Bedrooms are on the outer side"]

DO NOT use any numbers, meters, or measurements in the FIX instructions. Use only directional and positional language.

If a flat has NO issues, skip it entirely.
At the end write: UNITS WITH NO ISSUES: [list any perfect flats, or "None" if all have issues].`;

      let auditReport = '';
      try {
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            max_tokens: 1200,
            messages: [
              { role: 'system', content: auditSystemPrompt },
              {
                role: 'user',
                content: [
                  { type: 'text', text: auditUserPrompt },
                  { type: 'image_url', image_url: { url: stage2Base64, detail: 'high' } },
                ],
              },
            ],
          }),
        });
        const auditJson = await openaiResponse.json();
        auditReport = auditJson?.choices?.[0]?.message?.content || '';
        console.log(`[IdeaGenerator] Stage 2.5 Audit Report:\n${auditReport}`);
      } catch (auditErr) {
        console.warn('[IdeaGenerator] Stage 2.5 audit failed, proceeding without audit report:', auditErr);
      }

      // ── STAGE 3 — GPT Image 2: Architectural Correction ──────────────────────
      console.log(`[IdeaGenerator] Stage 3: openai/gpt-image-2/edit — applying architectural corrections...`);

      // Upload Stage 2 result to fal storage so GPT Image 2 can accept it as image_url
      const stage2FalUrl = await urlToFalStorage(stage2Url);

      const auditSection = auditReport
        ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ARCHITECTURAL AUDIT REPORT — SPECIFIC ISSUES TO FIX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The following issues were identified in this floor plan by an architectural review. Fix EACH issue precisely as described:

${auditReport}

Apply the above fixes by editing ONLY the internal room partitions and doors of the flagged units. Do NOT change any unit that was marked as having no issues.`
        : '';

      const ventilationPrompt = `You are a licensed senior architect performing a final quality review and correction pass on this residential floor plan.

EDIT THE UPLOADED IMAGE. Correct every architectural deficiency while keeping overall zoning and flat boundaries intact.

${auditSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠ IMMUTABLE GEOMETRY — ABSOLUTE CONSTRAINTS (DO NOT VIOLATE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

THE FOLLOWING MUST NEVER CHANGE — TREAT THESE AS LOCKED:

1. THE OUTER BUILDING BOUNDARY (facade/perimeter shape) — LOCKED. Do NOT alter, reshape, shrink, extend, or redraw the exterior building walls under any circumstance.
2. THE FLAT UNIT BOUNDARY WALLS (the main partition walls separating F1, F2, F3... from each other) — LOCKED. Do NOT move, remove, merge, or resize any flat zone boundary.
3. THE CORE BLOCK (elevator + staircase box) and its position — LOCKED. Do NOT move or resize the CORE.
4. THE SHARED CORRIDOR / ENTRANCE ACCESS — LOCKED. Do NOT remove or reroute the building's main circulation corridor.

YOU MAY ONLY TOUCH: The internal room partitions, internal doors, and internal wall layouts INSIDE each flat zone.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — AUDIT EVERY FLAT (${flatLabelsList})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For each flat zone, check and fix ALL of the following:

VENTILATION (CRITICAL):
• Every habitable room must be placed on the exterior/perimeter of the building.
• Every habitable room — Living Room, Dining, Kitchen, and ALL Bedrooms — MUST touch an exterior building wall and have a window opening directly on that wall.
• If any of these rooms is landlocked (no exterior wall contact), REDESIGN the room layout within that flat to push the Living Room, Kitchen, and Bedrooms to the perimeter.
• Only Bathrooms and utility areas may be internal — they must have a small ventilation duct shaft labeled "DUCT".

INTERNAL CIRCULATION:
• Each flat MUST have a clear internal entrance/foyer connected to the building's shared corridor.
• A short internal hallway or circulation spine must connect ALL rooms within the flat without crossing through other rooms.
• Bedroom doors must open from the private circulation area, NOT directly from the Living Room.
• Kitchen must connect directly to the Living/Dining area.
• Bathroom must be accessible from the internal circulation, NOT only from a Bedroom.

ROOM ADJACENCY (PROFESSIONAL STANDARD):
• Living/Dining → Kitchen: directly adjacent, open plan or single wall between them.
• Master Bedroom → Bathroom: preferred direct access.
• No dead-end rooms that require crossing another habitable room to exit.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — REDESIGN FLAT INTERNAL ROOM LAYOUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REDESIGN internal room partitions inside each flat zone (${flatLabelsList}) to create an architectural layout of perfection.
• Every habitable room must be placed on the exterior/perimeter of the building.
• Do NOT preserve the original internal room positions. You have full freedom to completely reorganize, resize, and reposition every room to create a much better architectural layout.
• The flat's outer boundary wall shape MUST remain 100% identical — do not alter the outer perimeter of any flat zone.
• Redraw internal partitions, internal doors, and room positions inside each flat zone for optimal room proportions, direct window contact, and smooth circulation.
• The newly organized flat layouts must fit entirely within their original flat boundary shapes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — PRESERVE LOCKED STRUCTURES ONLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Do NOT touch the outer building boundary, flat zone boundaries, CORE block, or shared corridor ring.
• Pure 2D black lines on white background only. No colors, no textures, no 3D. No people.
• DO NOT ADD ANY OVERLAY ANNOTATIONS — No airflow arrows, no ventilation callout labels, no legend boxes, no compass roses, no color-coded zones. Output a clean corrected CAD plan ONLY.

OUTPUT: A complete, architecturally corrected 2D CAD floor plan where EVERY flat has proper exterior ventilation for all habitable rooms and clean internal circulation — with the building shape and all flat boundaries 100% preserved, but internal rooms completely reorganized for architectural perfection.`;

      const stage3Input: Record<string, any> = {
        image_urls: [stage2FalUrl],
        prompt: ventilationPrompt,
        quality: 'medium',
      };

      const { url: stage3Url } = await runModel('openai/gpt-image-2/edit', stage3Input);
      console.log(`[IdeaGenerator] Stage 3 output:`, stage3Url);

      const stage3Base64 = await fetchToBase64(stage3Url);

      return NextResponse.json({
        url: stage3Base64,
        imageUrls: [stage3Base64],
        stage1ImageUrl: stage1Base64,
        stage2ImageUrl: stage2Base64,
        stage3ImageUrl: stage3Base64,
        stage1Seed,
        stage2Seed,
        systemPrompt: stage1Prompt,
        refinementPrompt,
        stage3Prompt: ventilationPrompt,
        auditReport,
        userPrompt: `PIPELINE | Stage1: ${stage1Model} -> Stage2: ${stage2Model} -> Stage2.5: GPT-4o Audit -> Stage3: openai/gpt-image-2/edit | BHK: ${dominantBHK}`,
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
