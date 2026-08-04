import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 300; // 5 min — needed for 2-stage pipeline (Grok ~60s + GPT ~90s + uploads)

fal.config({ credentials: process.env.FAL_KEY });

// ── Helpers (ported from generate-concept-image) ─────────────────────────────

function buildFalInput(falModel: string, imageUrl: string, prompt: string): Record<string, any> {
  const usePluralUrls = falModel.includes('gemini') || falModel.includes('nano-banana') || falModel.includes('klein');
  const isGptImage2   = falModel.includes('openai');
  const isFluxCanny   = falModel.includes('flux-control-lora-canny');

  if (isGptImage2) {
    return { image_urls: [imageUrl], prompt, quality: 'medium' };
  } else if (isFluxCanny) {
    return { control_image_url: imageUrl, control_lora_image_url: imageUrl, prompt, num_inference_steps: 28, guidance_scale: 3.5, controlnet_conditioning_scale: 1.0 };
  } else if (usePluralUrls) {
    return { image_urls: [imageUrl], prompt };
  }
  return { image_url: imageUrl, prompt };
}

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

// ── Workflow model mapping (same as concept generator) ───────────────────────

const WORKFLOWS: Record<string, { stage1: string; stage2?: string; label: string }> = {
  'grok-gpt':         { stage1: 'xai/grok-imagine-image/edit',                   stage2: 'openai/gpt-image-2/edit', label: 'Grok -> GPT Image 2' },
  'grok-nano':        { stage1: 'xai/grok-imagine-image/edit',                   stage2: 'fal-ai/nano-banana-pro/edit', label: 'Grok -> Nano Banana' },
  'grok-kontext':     { stage1: 'xai/grok-imagine-image/edit',                   stage2: 'fal-ai/flux-pro/kontext', label: 'Grok -> FLUX Kontext' },
  'flux-klein-gpt':   { stage1: 'fal-ai/flux-2/klein/9b/edit',                   stage2: 'openai/gpt-image-2/edit', label: 'FLUX Klein -> GPT Image 2' },
  'flux-klein-nano':  { stage1: 'fal-ai/flux-2/klein/9b/edit',                   stage2: 'fal-ai/nano-banana-pro/edit', label: 'FLUX Klein -> Nano Banana' },
  'flux-kontext-gpt': { stage1: 'fal-ai/flux-pro/kontext',                        stage2: 'openai/gpt-image-2/edit', label: 'FLUX Kontext -> GPT Image 2' },
  'grok-solo':        { stage1: 'xai/grok-imagine-image/edit',                   label: 'Grok only' },
  'flux-klein-solo':  { stage1: 'fal-ai/flux-2/klein/9b/edit',                   label: 'FLUX Klein only' },
  'flux-kontext-solo':{ stage1: 'fal-ai/flux-pro/kontext',                        label: 'FLUX Kontext [pro] only' },
  'gpt-solo':         { stage1: 'openai/gpt-image-2/edit',                        label: 'GPT Image 2 only' },
  'gemini-solo':      { stage1: 'fal-ai/gemini-3.1-flash-image-preview/edit',     label: 'Gemini only' },
  'flux-canny-solo':  { stage1: 'fal-ai/flux-control-lora-canny',                 label: 'FLUX Canny only' },
};

// ── Build Stage 1 prompt (architectural floor plan from trace) ────────────────

function buildStage1Prompt(opts: {
  numFlats: number;
  roomItems: string;
  hasLifts: boolean;
  hasStairs: boolean;
  passengerLifts: number;
  staircases: number;
  useVaastu: boolean;
  useFireSafety: boolean;
}): string {
  const { numFlats, roomItems, hasLifts, hasStairs, passengerLifts, staircases, useVaastu, useFireSafety } = opts;

  // Build core spec
  const coreSpecs: string[] = [];
  if (hasLifts) coreSpecs.push(`${passengerLifts} lifts`);
  if (hasStairs) coreSpecs.push(`${staircases} staircases`);
  const coreSpecStr = coreSpecs.length > 0 ? `Design a central circulation core with ${coreSpecs.join(' + ')}, placed at the center of the building.` : 'Design a central circulation core with main staircase, lift, and shared corridor.';

  // Build checklist
  const rawRooms = roomItems.split('\n').map(line => line.split(' = ')[1]?.trim()).filter(Boolean);
  let checklist = 'Apartment validation checklist:\n';
  for (let i = 1; i <= numFlats; i++) {
    checklist += `Flat ${i}\n`;
    rawRooms.forEach(r => { checklist += `[*] ${r}\n`; });
    checklist += '\n';
  }

  return `Task: Design a professional architectural floor plan using the uploaded building footprint (WHITE) as the exact outer boundary.
Preserve the exterior shape exactly. The white boundary is immutable.

Create ${numFlats} independent residential apartments, each approximately equal in area (if practical).

${coreSpecStr}

Use realistic architectural planning, COMPACT miniature rooms, and strict Vastu principles.
A tiny room is always better than a missing room. Micro-size rooms if needed. Pack rooms tightly.

Show: Thick black exterior walls, interior partition walls, doors with swings, windows, room labels, flat numbering, clean CAD style, white background.

${checklist}
Validate every unit contains these exact rooms before finalizing. Do not omit any room.

CRITICAL ZONING GRADIENT:
Design every flat logically as a gradient from public to private spaces:
- "public" zone (Living Room, Dining, Entrance/Foyer) must be near the entry corridor/road side.
- "service" zone (Kitchen, Utility, Common Bath, Store) acts as a buffer between public and private.
- "private" zone (Bedrooms, Ensuite Bathrooms) must be placed at the deepest point of the flat, furthest from the entrance.

CRITICAL CIRCULATION, DOOR PLACEMENT & ADJACENCY:
1. Every room MUST have a physical door swing (clearly drawn arc) connecting it to another room or hallway. No landlocked or doorless rooms.
2. Flat entrance door must open directly into the Living Room or Foyer.
3. Adjacencies: Dining must touch Kitchen; Kitchen must touch the Utility balcony.
4. Bathrooms must connect directly to a Bedroom (as ensuite) or a Common Hallway. NEVER make a bathroom door open directly into the Living Room, Dining Room, or Kitchen.
5. Wall layouts must align cleanly at 90-degree angles to make functional rectangular spaces.

CRITICAL LIGHT & VENTILATION (EXTERNAL WALLS):
Bedrooms, Living Rooms, and Kitchens MUST touch an external wall to allow large windows for natural light and ventilation. Internal baths, corridors, and stores can be placed in the interior core without direct light.

${useVaastu ? `VAASTU RULES (Highly Weighted):
- Kitchen: Position towards the South-East (SE) corner of the flat layout.
- Master Bedroom: Position towards the South-West (SW) corner of the flat.
- Main Entrance: Position towards the North-East (NE) corner of the flat.
- Avoid Toilet/Bathroom in the North-East corner.` : ''}

${useFireSafety ? `FIRE SAFETY:
Any floor with 3 or more apartments MUST have TWO separate staircases, placed so the two escape routes are remote from each other. Every apartment entrance must reach at least one staircase via the common corridor without passing through another apartment.` : ''}

Specify architectural constraints:
150 mm exterior walls, 100 mm partition walls, 900 mm doors, 1200 mm corridor.

DRAWING & ANNOTATION:
- Label every room with its name clearly. Do not write numerical dimensions.
- Thick black exterior walls, thin interior partitions.
- Swing doors shown with arc; window ticks on exterior walls.
- Room labels prefixed with flat number (F1-Living, F1-Kitchen).
- Red outline around the exterior walls.
- White background, clean professional 2D CAD style.

After completion, draw one red outline around the exterior walls (#FF0000).`;
}

// ── Build Stage 2 refinement prompt ──────────────────────────────────────────

function buildRefinementPrompt(opts: {
  numFlats: number;
  countedRooms: string[];
}): string {
  const { numFlats, countedRooms } = opts;
  const countedRoomsStr = countedRooms.join(', ');

  let perFlatChecklist = '';
  for (let i = 1; i <= numFlats; i++) {
    perFlatChecklist += `\nFlat ${i}: ${countedRoomsStr}`;
  }

  return `You are an expert architectural drafter. The image you received is a CAD floor plan generated by AI.

YOUR TASK: Redesign the interior of this floor plan while keeping the exterior building boundary exactly as shown, producing a code-aware, dimensioned 2D floor plan.

PRIORITY ORDER (highest to lowest):
1. Preserve the uploaded exterior footprint exactly.
2. Life safety: correct means of egress.
3. Every room meets minimum habitable size.
4. All required rooms present, labeled, and dimensioned.
5. Realistic circulation, adjacency, ventilation, and Vaastu.
6. Clean professional presentation.

CRITICAL RULE #1 — EXTERIOR FOOTPRINT:
Preserve the uploaded exterior footprint exactly. Outer wall polyline, angles, proportions, and building shape remain unchanged. Modify only interior partitions.

CRITICAL RULE #2 — EGRESS (LIFE SAFETY, NON-NEGOTIABLE):
Any floor with 3 or more apartments MUST have TWO separate staircases, placed so the two escape routes are remote from each other. Every apartment entrance must reach at least one staircase via the common corridor without passing through another apartment.

CRITICAL RULE #3 — MINIMUM ROOM SIZES (NON-NEGOTIABLE):
- Bedroom: min 9.5 sq.m, min width 2.4 m
- Master Bedroom: min 11 sq.m
- Living Room: min 11 sq.m
- Kitchen: min 5 sq.m, min width 1.8 m
- Bathroom/Toilet: min 1.8 sq.m, min width 1.2 m
- Corridor width: min 1.0 m

CRITICAL RULE #4 — ROOM COMPLETENESS:
No apartment may omit, merge, or substitute a required room.
${perFlatChecklist}

CRITICAL RULE #5 — ENTRANCES & DOORS:
Each apartment has its own entrance door from the common corridor/lobby. Every room has a visible door swing arc.

ZONING GRADIENT (public → private):
- Public (Living, Dining, Entrance/Foyer): near the entry corridor.
- Service (Kitchen, Utility, Common Bath): buffer zone.
- Private (Bedrooms, Ensuites): deepest point, furthest from entrance.

ADJACENCY & VENTILATION:
1. Dining touches Kitchen; Kitchen touches a Utility balcony.
2. Every ensuite touches and connects directly to its own Bedroom.
3. Bedrooms, Living, and Kitchen MUST touch an external wall (windows).

VAASTU:
- Kitchen toward South-East of the flat.
- Master Bedroom toward South-West.
- Main Entrance toward North-East.
- Avoid Toilet/Bathroom in the North-East corner.

DRAWING & ANNOTATION:
- Label every room with its name clearly.
- Thick black exterior walls, thin interior partitions.
- Swing doors shown with arc; window ticks on exterior walls.
- Room labels prefixed with flat number (F1-Living, F1-Kitchen).
- Red outline around the exterior walls.
- White background, clean professional 2D CAD style.

FINAL VALIDATION — verify all ${numFlats} apartments contain exactly:
${countedRooms.map(r => `- ${r}`).join('\n')}
- 1x Entrance (door to corridor)
- All rooms labeled

Output the redesigned floor plan image only.`;
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

      // Build room items based on BHK types
      let roomItems = '';
      let countedRooms: string[] = [];

      if (units1BHK > 0 && units2BHK === 0 && units3BHK === 0 && units4BHK === 0) {
        // All 1BHK
        roomItems = 'L-i = Living\nK-i = Kitchen\nB-i = Bedroom\nT-i = Bathroom';
        countedRooms = ['1x Living Room', '1x Kitchen', '1x Bedroom', '1x Bathroom'];
      } else if (units2BHK > 0 && units3BHK === 0 && units4BHK === 0) {
        // 2BHK dominant
        roomItems = 'L-i = Living\nK-i = Kitchen\nB1-i = Master Bedroom\nB2-i = Bedroom 2\nT1-i = Master Bathroom\nT2-i = Common Bathroom';
        countedRooms = ['1x Living Room', '1x Kitchen', '2x Bedrooms', '2x Bathrooms'];
      } else if (units3BHK > 0) {
        // 3BHK dominant
        roomItems = 'L-i = Living\nK-i = Kitchen\nB1-i = Master Bedroom\nB2-i = Bedroom 2\nB3-i = Bedroom 3\nT1-i = Master Bathroom\nT2-i = Bathroom 2\nT3-i = Common Bathroom';
        countedRooms = ['1x Living Room', '1x Kitchen', '3x Bedrooms', '3x Bathrooms'];
      } else {
        // Mixed or 4BHK
        roomItems = 'L-i = Living\nK-i = Kitchen\nB1-i = Master Bedroom\nB2-i = Bedroom 2\nT1-i = Master Bathroom\nT2-i = Common Bathroom';
        countedRooms = ['1x Living Room', '1x Kitchen', '2x Bedrooms', '2x Bathrooms'];
      }

      const stage1Prompt = buildStage1Prompt({
        numFlats,
        roomItems,
        hasLifts: passengerLifts > 0,
        hasStairs: staircases > 0,
        passengerLifts,
        staircases,
        useVaastu,
        useFireSafety,
      });

      // ── STAGE 1 ────────────────────────────────────────────────────────────
      const stage1Input = buildFalInput(stage1Model, uploadedTraceUrl, stage1Prompt);
      console.log('[IdeaGenerator] Stage 1 input keys:', Object.keys(stage1Input));
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

      // ── STAGE 2 ────────────────────────────────────────────────────────────
      console.log(`[IdeaGenerator] Stage 2: ${stage2Model} refinement...`);
      const stage1StorageUrl = await urlToFalStorage(stage1Url);
      const refinementPrompt = buildRefinementPrompt({ numFlats, countedRooms });
      const stage2Input = buildFalInput(stage2Model, stage1StorageUrl, refinementPrompt);
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
        userPrompt: `PIPELINE | Stage1: ${stage1Model} -> Stage2: ${stage2Model}`,
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

    // Simple text-only generation as legacy fallback
    const input: any = { prompt };
    if (inputImageBase64) {
      input.image_url = `data:image/png;base64,${inputImageBase64}`;
    }
    input.image_size = { width: 1024, height: 1024 };

    const result = await fal.subscribe('fal-ai/nano-banana-2/edit', { input });
    const images = (result as any)?.images || (result.data as any)?.images;
    const url = images?.[0]?.url || null;

    if (!url) {
      return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
    }

    return NextResponse.json({ url });

  } catch (err: any) {
    console.error('[IdeaGenerator] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 });
  }
}
