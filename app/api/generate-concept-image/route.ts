import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 120; // extended for 2-stage pipeline

fal.config({ credentials: process.env.FAL_KEY });

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Build prompts ─────────────────────────────────────────────────────────────

function buildPrompt(opts: {
  isSingle: boolean; buildingType: string; numFlats: number;
  hasDividers: boolean; hasCore: boolean;
  roomItems: string; roomListLabelHint: string; verifyChecks: string;
}): string {
  const { isSingle, buildingType, numFlats, hasDividers, hasCore, roomItems, roomListLabelHint, verifyChecks } = opts;

  const rawRooms = roomItems.split('\n').map(line => line.split(' = ')[1]?.trim()).filter(Boolean);
  let checklist = 'Apartment validation checklist:\n';
  if (!isSingle && buildingType === 'multi-residential') {
    for (let i = 1; i <= numFlats; i++) {
      checklist += `Flat ${i}\n`;
      rawRooms.forEach(r => { checklist += `[*] ${r}\n`; });
      checklist += '\n';
    }
  } else {
    checklist = 'Required rooms:\n';
    rawRooms.forEach(r => { checklist += `[*] ${r}\n`; });
  }

  return `Task: Design a professional architectural floor plan using the uploaded building footprint (WHITE) as the exact outer boundary.
Preserve the exterior shape exactly. The white boundary is immutable.

${hasDividers ? 'The solid colored regions dictate apartment boundaries. Never cross region borders.' : ''}

Create ${isSingle ? `1 unified ${buildingType} layout` : `${numFlats} independent residential apartments, each approximately equal in area (if practical).`}

${hasCore ? 'Design a central circulation core with stairs and lift centered EXACTLY on the CYAN square.' : (isSingle ? '' : 'Design a central circulation core with main staircase, lift, and shared corridor.')}

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
5. Wall layouts must align cleanly at 90-degree angles to make functional rectangular spaces. No awkward floating walls or random interior shapes.

CRITICAL LIGHT & VENTILATION (EXTERNAL WALLS):
Bedrooms, Living Rooms, and Kitchens MUST touch an external wall to allow large windows for natural light and ventilation. Internal baths, corridors, and stores can be placed in the interior core without direct light.

VAASTU RULES (Highly Weighted):
- Kitchen: Position towards the South-East (SE) corner of the flat layout.
- Master Bedroom: Position towards the South-West (SW) corner of the flat.
- Main Entrance: Position towards the North-East (NE) corner of the flat.
- Toilet/Bathroom: Avoid placing in the North-East (NE) corner.

Specify architectural constraints:
150 mm exterior walls, 100 mm partition walls, 900 mm doors, 1200 mm corridor.

After completion, draw one red outline around the exterior walls (#FF0000).`;
}

function buildRefinementPrompt(opts: {
  isSingle: boolean; buildingType: string; numFlats: number; roomConfig: string;
  roomItems: string;
}): string {
  const { isSingle, buildingType, numFlats, roomConfig, roomItems } = opts;

  // Build count-labeled rooms e.g. "1x Living, 1x Kitchen, 2x Bedrooms, 2x Bathrooms"
  let countedRooms: string[] = [];
  if (roomConfig === '1bhk') {
    countedRooms = ['1x Living Room', '1x Kitchen', '1x Bedroom', '1x Bathroom'];
  } else if (roomConfig === '2bhk') {
    countedRooms = ['1x Living Room', '1x Kitchen', '2x Bedrooms', '2x Bathrooms'];
  } else if (roomConfig === '3bhk') {
    countedRooms = ['1x Living Room', '1x Kitchen', '3x Bedrooms', '3x Bathrooms'];
  } else if (isSingle) {
    countedRooms = ['1x Foyer', '1x Living Room', '1x Kitchen', '2x Bedrooms', '2x Bathrooms', '1x Utility'];
  } else if (buildingType === 'office') {
    countedRooms = ['1x Reception', '1x Open Workspace', '3x Cabins', '1x Meeting Room', '1x Pantry', '2x Toilets'];
  } else if (buildingType === 'healthcare') {
    countedRooms = ['1x Reception/Waiting', '2x Consultation Rooms', '1x Nurse Station', '2x Patient Wards', '1x Pharmacy', '1x Laboratory', '2x Toilets'];
  } else {
    countedRooms = roomItems.split('\n').map(line => line.split(' = ')[1]?.trim()).filter(Boolean).map(r => `1x ${r}`);
  }

  const countedRoomsStr = countedRooms.join(', ');

  let perFlatChecklist = '';
  if (!isSingle && buildingType === 'multi-residential') {
    for (let i = 1; i <= numFlats; i++) {
      perFlatChecklist += `\nFlat ${i}: ${countedRoomsStr}`;
    }
  }

  return `You are an expert architectural drafter. The image you received is a CAD floor plan generated by AI.

YOUR TASK: Redesign the interior of this floor plan while keeping the exterior building boundary exactly as shown.

Priority order (highest to lowest):
1. Preserve the uploaded exterior footprint exactly.
2. Ensure all ${numFlats} apartments contain every required room.
3. Maintain realistic circulation and entrance access.
4. Optimize room proportions and adjacency.
5. Produce a clean professional architectural presentation.

CRITICAL RULE #1 — EXTERIOR FOOTPRINT:
Preserve the uploaded exterior footprint exactly. The outer wall polyline, angles, proportions, and overall building shape must remain unchanged. Modify only the interior partitions.

CRITICAL RULE #2 — ROOM COMPLETENESS:
No apartment may omit, merge, or substitute any required room. Every apartment must visibly contain one labeled Living Room, one labeled Kitchen, one labeled Bedroom (per count), one labeled Bathroom (per count), and one labeled Entrance.
${perFlatChecklist}

CRITICAL RULE #3 — APARTMENT ENTRANCES & CIRCULATION:
Each apartment must have its own entrance door from the common corridor or lobby. No apartment may share an entrance.
Every room must have a clear door swing (arc) leading into it. No room can be doorless, landlocked, or walled-off.

ZONING GRADIENT:
Design every flat logically as a gradient from public to private spaces:
- "public" zone (Living Room, Dining, Entrance/Foyer) must be near the entry corridor/road side.
- "service" zone (Kitchen, Utility, Common Bath, Store) acts as a buffer between public and private.
- "private" zone (Bedrooms, Ensuite Bathrooms) must be placed at the deepest point of the flat, furthest from the entrance.

ROOM ADJACENCY & VENTILATION:
1. Dining must touch Kitchen; Kitchen must touch the Utility balcony.
2. Every attached ensuite bathroom must touch and connect directly to its own Bedroom.
3. Living room must connect directly to the dining area.
4. NEVER make a bathroom door open directly off the living room, dining area, or kitchen. It must be accessed through a corridor/lobby or a private bedroom.
5. Ventilation constraint: Bedrooms, Living, and Kitchen MUST touch an external wall to allow windows. Bathrooms and utilities can be internal.

VAASTU RULES (Highly Weighted):
- Kitchen: Position towards the South-East (SE) corner of the flat layout.
- Master Bedroom: Position towards the South-West (SW) corner of the flat.
- Main Entrance: Position towards the North-East (NE) corner of the flat.
- Toilet/Bathroom: Avoid placing in the North-East (NE) corner.

REDESIGN INSTRUCTIONS:
1. Keep exactly ${numFlats} apartments — no more, no less.
2. Every flat MUST have exactly: ${countedRoomsStr} + 1x Entrance door.
3. Redesign room layouts for maximum spatial logic, efficiency, and circulation.
4. Use compact, miniature room sizes — pack rooms tightly. A tiny room is better than a missing room.
5. Kitchens on plumbing walls, bathrooms adjacent to bedrooms.
6. Place a shared staircase and lift core centrally.

STYLE:
- Clean professional 2D CAD floor plan
- White background
- Thick black exterior walls, thin interior partition walls
- Swing doors shown with arc, window ticks on exterior walls
- All rooms labeled clearly with flat number prefix (e.g. F1-Living, F1-Kitchen)
- Red outline drawn around the exterior walls

FINAL VALIDATION — before outputting, verify all ${numFlats} apartments contain exactly:
${countedRooms.map(r => `- ${r}`).join('\n')}
- 1x Entrance (door to corridor)
- All rooms labeled
- Verify every room has a door swing indicating accessibility

Output the redesigned floor plan image only.`;
}



// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const {
      traceCanvasBase64, buildingType = 'multi-residential', roomConfig = 'auto',
      workflow = 'grok-solo', flatCount = 'auto', hasDividers = false,
      hasCore = false, numRegions = 1
    } = await req.json();

    if (!traceCanvasBase64) {
      return NextResponse.json({ error: 'Missing traceCanvasBase64' }, { status: 400 });
    }

    // Map workflow -> stage1 model + optional stage2 model
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

    const wf = WORKFLOWS[workflow] || WORKFLOWS['grok-gpt'];
    const stage1Model = wf.stage1;
    const stage2Model = wf.stage2 || null;

    console.log(`[ConceptGenerator] Workflow: ${wf.label} | stage1=${stage1Model} stage2=${stage2Model || 'none'}`);

    // Upload trace image to fal storage
    const base64Data = traceCanvasBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const traceFile = new File([new Blob([imageBuffer], { type: 'image/png' })], 'trace.png', { type: 'image/png' });
    const uploadedTraceUrl = await fal.storage.upload(traceFile);
    console.log('[ConceptGenerator] Trace uploaded:', uploadedTraceUrl);

    const isSingle = buildingType === 'single-residential';
    const numFlats = isSingle ? 1 : ((hasDividers && numRegions > 1) ? numRegions : (flatCount !== 'auto' ? parseInt(flatCount, 10) : 4));

    // Room definitions
    let roomItems = '', roomListLabelHint = '', verifyChecks = '';
    if (isSingle) {
      roomItems = 'L = Living\nK = Kitchen\nMB = Master Bedroom\nB2 = Bedroom 2\nT1 = Master Toilet\nT2 = Common Toilet\nFOY = Foyer\nUTI = Utility';
      roomListLabelHint = 'L K MB B2 T1 T2 FOY UTI';
      verifyChecks = '- Exactly 1 Foyer.\n- Exactly 1 Living room.\n- Exactly 1 Kitchen.\n- Exactly 2 Bedrooms.\n- Exactly 2 Bathrooms.';
    } else if (buildingType === 'office') {
      roomItems = 'REC = Reception\nOPEN = Open Office Workspace\nCAB = Private Cabin\nMEET = Meeting Room\nPAN = Pantry\nST = Store\nT = Toilet';
      roomListLabelHint = 'REC OPEN CAB-1 CAB-2 CAB-3 MEET PAN ST T-1 T-2';
      verifyChecks = '- Exactly 1 Reception.\n- Exactly 1 Open Workspace.\n- Exactly 3 Cabins.\n- Exactly 2 Toilets.';
    } else if (buildingType === 'healthcare') {
      roomItems = 'REC = Reception/Waiting\nC = Consultation Room\nNS = Nurse Station\nW = Patient Ward\nPHAR = Pharmacy\nLAB = Laboratory\nST = Store\nT = Toilet';
      roomListLabelHint = 'REC C-1 C-2 NS W-1 W-2 PHAR LAB ST T-1';
      verifyChecks = '- Exactly 1 Reception.\n- Exactly 2 Consultation Rooms.\n- Exactly 2 Patient Wards.\n- Exactly 1 Pharmacy.';
    } else {
      if (roomConfig === '1bhk') {
        roomItems = 'L-i = Living\nK-i = Kitchen\nB-i = Bedroom\nT-i = Bathroom';
        roomListLabelHint = 'L-i K-i B-i T-i';
        verifyChecks = `- Exactly ${numFlats} Living rooms.\n- Exactly ${numFlats} Kitchens.\n- Exactly ${numFlats} Bedrooms.\n- Exactly ${numFlats} Bathrooms.`;
      } else if (roomConfig === '2bhk') {
        roomItems = 'L-i = Living\nK-i = Kitchen\nB1-i = Master Bedroom\nB2-i = Bedroom 2\nT1-i = Master Bathroom\nT2-i = Common Bathroom';
        roomListLabelHint = 'L-i K-i B1-i B2-i T1-i T2-i';
        verifyChecks = `- Exactly ${numFlats} Living rooms.\n- Exactly ${numFlats} Kitchens.\n- Exactly ${numFlats * 2} Bedrooms.\n- Exactly ${numFlats * 2} Bathrooms.`;
      } else if (roomConfig === '3bhk') {
        roomItems = 'L-i = Living\nK-i = Kitchen\nB1-i = Master Bedroom\nB2-i = Bedroom 2\nB3-i = Bedroom 3\nT1-i = Master Bathroom\nT2-i = Bathroom 2\nT3-i = Common Bathroom';
        roomListLabelHint = 'L-i K-i B1-i B2-i B3-i T1-i T2-i T3-i';
        verifyChecks = `- Exactly ${numFlats} Living rooms.\n- Exactly ${numFlats} Kitchens.\n- Exactly ${numFlats * 3} Bedrooms.\n- Exactly ${numFlats * 3} Bathrooms.`;
      } else {
        roomItems = 'L-i = Living\nK-i = Kitchen\nB-i = Bedroom\nT-i = Bathroom';
        roomListLabelHint = 'L-i K-i B-i T-i';
        verifyChecks = `- Exactly ${numFlats} Living rooms.\n- Exactly ${numFlats} Kitchens.\n- Exactly ${numFlats * 2} Bedrooms.\n- Exactly ${numFlats * 2} Bathrooms.`;
      }
    }

    const promptOpts = { isSingle, buildingType, numFlats, hasDividers, hasCore, roomItems, roomListLabelHint, verifyChecks };
    const stage1Prompt = buildPrompt(promptOpts);

    // ── STAGE 1 ──────────────────────────────────────────────────────────────
    const stage1Input = buildFalInput(stage1Model, uploadedTraceUrl, stage1Prompt);
    console.log('[ConceptGenerator] Stage 1 input keys:', Object.keys(stage1Input));
    const stage1Url = await runModel(stage1Model, stage1Input);
    console.log('[ConceptGenerator] Stage 1 output:', stage1Url);

    const stage1Base64 = await fetchToBase64(stage1Url);

    if (!stage2Model) {
      return NextResponse.json({
        imageUrls: [stage1Base64],
        stage1ImageUrl: stage1Base64,
        systemPrompt: stage1Prompt,
        userPrompt: `STAGE 1 only | MODEL: ${stage1Model}`,
      });
    }

    // ── STAGE 2 ───────────────────────────────────────────────────────────────
    console.log(`[ConceptGenerator] Stage 2: ${stage2Model} refinement...`);
    const stage1StorageUrl = await urlToFalStorage(stage1Url);
    const refinementPrompt = buildRefinementPrompt({ isSingle, buildingType, numFlats, roomConfig, roomItems });
    const stage2Input = buildFalInput(stage2Model, stage1StorageUrl, refinementPrompt);
    const stage2Url = await runModel(stage2Model, stage2Input);
    console.log('[ConceptGenerator] Stage 2 output:', stage2Url);

    const stage2Base64 = await fetchToBase64(stage2Url);

    return NextResponse.json({
      imageUrls: [stage2Base64],
      stage1ImageUrl: stage1Base64,
      stage2ImageUrl: stage2Base64,
      systemPrompt: stage1Prompt,
      refinementPrompt,
      userPrompt: `PIPELINE | Stage1: ${stage1Model} -> Stage2: ${stage2Model}`,
    });

  } catch (err: any) {
    console.error('[ConceptGenerator] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Concept generation failed' }, { status: 500 });
  }
}
