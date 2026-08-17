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
  widthM?: number; lengthM?: number; stories?: number; userPrompt?: string;
}): string {
  const { isSingle, buildingType, numFlats, roomItems, userPrompt, widthM = 80, lengthM = 80, stories = 10 } = opts;

  const conceptShape = userPrompt?.trim() || 'Modern Luxury Residential Tower';

  return `TASK: Redraw and generate a world-class, ultra-luxury MASTER ARCHITECTURAL PRESENTATION BOARD floor plan drawing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 MANDATORY DIRECTIVE: 100% 3-WAY GEOMETRIC SHAPE SYNCHRONIZATION ACROSS ALL PANELS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The user's requested building shape and architectural brief is:
⭐ TARGET CONCEPT & SHAPE: "${conceptShape}"
BUILDING DIMENSIONS: ${widthM}m Width × ${lengthM}m Length | Height: ${stories} Stories | Target Units: ${numFlats} Flats (${roomItems ? roomItems : 'Standard Luxury Residential'})

YOU MUST COMPLETELY RE-RENDER AND SYNCHRONIZE ALL THREE VISUAL PANELS TO THIS EXACT SAME BUILDING SHAPE:
1. PANEL 1 (Main 2D Floor Plan - Left 70%): Must be drawn with the exact outer silhouette and footprint of the "${conceptShape}"!
2. PANEL 2 (Top View 3D Building Form - Top Right): Must be a 3D aerial roof massing render of THAT EXACT SAME "${conceptShape}" silhouette from above!
3. PANEL 3 (3D Perspective View - Middle Right): Must be a photorealistic 3D perspective tower render rising up in THAT EXACT SAME "${conceptShape}" geometry with matching floor slabs, matching curved/faceted wrap-around glass balconies, and architectural crown!
4. ZERO RESIDUE OF OLD REFERENCE SHAPES: Under NO circumstances leave the old reference droplet or wedge massing in the 3D panels. The 3D tower on the right MUST BE the exact 3D extrusion of the 2D floor plan on the left!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BOARD COMPOSITION & MULTI-VIEW LAYOUT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. MAIN LEFT REGION (70% Canvas Width) — 2D MASTER RESIDENTIAL FLOOR PLAN:
   - Complete, highly detailed architectural floor plan sculpted into the exact outer perimeter contour of "${conceptShape}".
   - Subdivided into ${numFlats} luxury residential apartments (${isSingle ? '1 expansive penthouse layout' : `${numFlats} private luxury flats`}).
   - Architectural Textures: Polished cream travertine / Italian calacatta marble flooring in living and dining zones, warm honey oak herringbone hardwood in master bedroom suites, light textured porcelain in kitchens and bathrooms.
   - Designer Vector Furniture:
     • Master Suites: King-size beds with floating nightstands, glass walk-in wardrobe closets, and ensuite spa bathrooms with double vanities, freestanding tubs, and glass walk-in rainshowers.
     • Secondary Bedrooms: Queen/single beds with study workstations and built-in wardrobes.
     • Living & Dining Lounges: Deep curved / L-shaped Italian designer sectional sofas, round travertine coffee tables, slim TV media consoles, and 6-to-8-seater marble dining tables.
     • Modular Chef's Kitchens: Sleek quartz island breakfast counters with barstools, double undermount sinks, and gas cooktops.
     • Wrap-around Facade Balconies: Floor-to-ceiling sliding glass doors opening seamlessly onto continuous curved balconies with teak wood decking, outdoor lounge seating, and lush tropical green planter boxes.
   - Central Core: Central fire staircase with realistic step treads & UP/DN arrows, and 2× Passenger Lifts with clear elevator car doors.
   - Distinct North Arrow indicator and callout leader lines: "FLAT 01 - 1 BHK", "FLAT 02 - 2 BHK", etc.

2. TOP-RIGHT PANEL (30% Canvas Width, Upper Box) — "TOP VIEW (BUILDING FORM)":
   - Realistic 3D aerial architectural massing render of the roof plate from directly above, sculpted into the EXACT "${conceptShape}" silhouette with landscaped rooftop sky terrace, solar canopy, and architectural crown.

3. MIDDLE-RIGHT PANEL (30% Canvas Width, Middle Box) — "3D VIEW (BUILDING FORM)":
   - Photorealistic 3D isometric perspective architectural render of the complete ${stories}-story tower elevation.
   - Must showcase the exact "${conceptShape}" geometry with floor-to-floor curved glass curtain walls, cantilevered wrap-around balcony slabs with warm LED under-soffit lighting, and a sculpted aerodynamic crown.

4. BOTTOM-RIGHT CARD — "FLOOR PLAN SUMMARY" & "FLAT LEGEND":
   - Clean architectural summary card with modern typography:
     • Title: ${conceptShape.toUpperCase()} RESIDENTIAL TOWER
     • Dimension & Stories: ${widthM}m × ${lengthM}m | ${stories} Levels
     • Total Unit Mix breakdown matching the flats on the plan
     • Color-coded Flat Legend key table matching each flat's pastel tint.
     • Footnote: "NOTE: PLAN IS CONCEPTUAL AND CAN BE MODIFIED AS PER SITE CONDITIONS".

AESTHETICS:
Crisp architectural CAD linework, warm cream and sand presentation backdrop, ultra-clean publication-ready presentation board layout, photorealistic rendering.`;
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

YOUR TASK: Redesign the interior of this floor plan while keeping the exterior building boundary exactly as shown, producing a code-aware, dimensioned 2D floor plan.

PRIORITY ORDER (highest to lowest):
1. Preserve the uploaded exterior footprint exactly.
2. Life safety: correct means of egress (see RULE #2).
3. Every room meets minimum habitable size (see RULE #3).
4. All required rooms present, labeled, and dimensioned.
5. Realistic circulation, adjacency, ventilation, and Vaastu.
6. Clean professional presentation.

CRITICAL RULE #1 — EXTERIOR FOOTPRINT:
Preserve the uploaded exterior footprint exactly. Outer wall polyline, angles, proportions, and building shape remain unchanged. Modify only interior partitions.

CRITICAL RULE #2 — EGRESS (LIFE SAFETY, NON-NEGOTIABLE):
Any floor with 3 or more apartments MUST have TWO separate staircases, placed so the two escape routes are remote from each other (not side by side). Every apartment entrance must reach at least one staircase via the common corridor without passing through another apartment. Place one lift core near the primary stair. No apartment may be a dead-end more than a short corridor run from a stair.

CRITICAL RULE #3 — MINIMUM ROOM SIZES (NON-NEGOTIABLE):
No room may be drawn below these minimums (confirm exact values against local NBC 2016 / municipal bye-laws):
- Bedroom (single-use habitable): min 9.5 sq.m, min width 2.4 m
- Master Bedroom: min 11 sq.m
- Living Room: min 11 sq.m
- Kitchen: min 5 sq.m, min width 1.8 m
- Bathroom/Toilet: min 1.8 sq.m, min width 1.2 m
- Corridor width: min 1.0 m
If all required rooms cannot fit at or above these minimums, REDUCE THE NUMBER OF FLATS on this floor. A smaller number of correct, habitable flats is REQUIRED. Never shrink a room below minimum, and never create a tiny filler room to fill space.

CRITICAL RULE #4 — NO UNUSABLE GEOMETRY:
No habitable room (bedroom, living, kitchen) may contain an interior corner angle below 75 degrees. Where the exterior footprint creates acute or irregular leftover geometry, absorb that space into circulation, storage, a service shaft, or a utility balcony — NEVER into a bedroom or living room. Do not place a bed, sofa, or dining set inside an acute corner.

CRITICAL RULE #5 — ROOM COMPLETENESS:
No apartment may omit, merge, or substitute a required room. Each apartment must visibly contain its labeled Living Room, Kitchen, Bedroom(s), Bathroom(s), and Entrance.
${perFlatChecklist}

CRITICAL RULE #6 — ENTRANCES & DOORS:
Each apartment has its own entrance door from the common corridor/lobby; no shared entrances. Every room has a visible door swing arc. No room is doorless, landlocked, or walled-off.

ZONING GRADIENT (public → private):
- Public (Living, Dining, Entrance/Foyer): near the entry corridor.
- Service (Kitchen, Utility, Common Bath, Store): buffer zone.
- Private (Bedrooms, Ensuites): deepest point, furthest from entrance.

ADJACENCY & VENTILATION:
1. Dining touches Kitchen; Kitchen touches a Utility balcony.
2. Every ensuite touches and connects directly to its own Bedroom.
3. Living connects directly to Dining.
4. A bathroom door NEVER opens directly off Living, Dining, or Kitchen — access via corridor/lobby or bedroom only.
5. Bedrooms, Living, and Kitchen MUST touch an external wall (windows). Bathrooms and utilities may be internal but need a vent shaft.

VAASTU (weighted, but never override RULES #2–#4):
- Kitchen toward South-East of the flat.
- Master Bedroom toward South-West.
- Main Entrance toward North-East.
- Avoid Toilet/Bathroom in the North-East corner.

DRAWING & ANNOTATION REQUIREMENTS:
- Label every room with its name clearly. Do not write numerical dimensions (no "3600 x 3000", no numbers), write names only.
- Include a graphic SCALE BAR and a NORTH ARROW.
- Thick black exterior walls, thin interior partitions.
- Swing doors shown with arc; window ticks on exterior walls.
- Room labels prefixed with flat number (F1-Living, F1-Kitchen).
- Red outline around the exterior walls.
- White background, clean professional 2D CAD style.

FINAL VALIDATION — before outputting, verify all ${numFlats} apartments contain exactly:
${countedRooms.map(r => `- ${r}`).join('\n')}
- 1x Entrance (door to corridor)
- All rooms labeled
- Verify every room has a door swing indicating accessibility

Output the redesigned floor plan image only.`;
}



import fs from 'fs';
import path from 'path';

async function getReferenceImageUrl(uploadedRefBase64?: string | null): Promise<string> {
  if (uploadedRefBase64 && uploadedRefBase64.length > 50) {
    const base64Data = uploadedRefBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const file = new File([new Blob([imageBuffer], { type: 'image/jpeg' })], 'user_ref.jpg', { type: 'image/jpeg' });
    return await fal.storage.upload(file);
  }

  // Use master presentation board reference by default
  const masterPath = path.join(process.cwd(), 'public', 'references', 'master_presentation_board.jpg');
  if (fs.existsSync(masterPath)) {
    const buffer = fs.readFileSync(masterPath);
    const file = new File([new Blob([buffer], { type: 'image/jpeg' })], 'master_ref.jpg', { type: 'image/jpeg' });
    return await fal.storage.upload(file);
  }

  throw new Error('Master presentation board reference not found');
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const {
      traceCanvasBase64, referenceImageBase64, userPrompt, widthM = 80, lengthM = 80,
      stories = 10, buildingType = 'multi-residential', roomConfig = 'auto',
      workflow = 'gpt-solo', flatCount = 'auto', hasDividers = false,
      hasCore = false, numRegions = 1
    } = await req.json();

    // Map workflow -> stage1 model + optional stage2 model
    const WORKFLOWS: Record<string, { stage1: string; stage2?: string; label: string }> = {
      'gpt-solo':         { stage1: 'openai/gpt-image-2/edit',                        label: 'GPT Image 2 (Master Board)' },
      'grok-gpt':         { stage1: 'xai/grok-imagine-image/edit',                   stage2: 'openai/gpt-image-2/edit', label: 'Grok -> GPT Image 2' },
      'grok-nano':        { stage1: 'xai/grok-imagine-image/edit',                   stage2: 'fal-ai/nano-banana-pro/edit', label: 'Grok -> Nano Banana Pro' },
      'flux-klein-gpt':   { stage1: 'fal-ai/flux-2/klein/9b/edit',                   stage2: 'openai/gpt-image-2/edit', label: 'FLUX Klein -> GPT Image 2' },
      'gemini-solo':      { stage1: 'fal-ai/gemini-3.1-flash-image-preview/edit',     label: 'Gemini only' },
      'grok-solo':        { stage1: 'xai/grok-imagine-image/edit',                   label: 'Grok only' },
    };

    const wf = WORKFLOWS[workflow] || WORKFLOWS['gpt-solo'];
    const stage1Model = wf.stage1;
    const stage2Model = wf.stage2 || null;

    console.log(`[ConceptGenerator] Workflow: ${wf.label} | stage1=${stage1Model} stage2=${stage2Model || 'none'}`);

    // Resolve reference image URL (either user trace, user uploaded reference, or default master presentation board)
    let uploadedReferenceUrl: string;
    if (traceCanvasBase64 && traceCanvasBase64.length > 50) {
      const base64Data = traceCanvasBase64.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const traceFile = new File([new Blob([imageBuffer], { type: 'image/png' })], 'trace.png', { type: 'image/png' });
      uploadedReferenceUrl = await fal.storage.upload(traceFile);
    } else {
      uploadedReferenceUrl = await getReferenceImageUrl(referenceImageBase64);
    }
    console.log('[ConceptGenerator] Reference Image uploaded to FAL storage:', uploadedReferenceUrl);

    const isSingle = buildingType === 'single-residential';
    const numFlats = isSingle ? 1 : ((hasDividers && numRegions > 1) ? numRegions : (flatCount !== 'auto' ? parseInt(flatCount, 10) : 4));

    // Room definitions
    let roomItems = '', roomListLabelHint = '', verifyChecks = '';
    if (isSingle) {
      roomItems = 'L = Living\nK = Kitchen\nMB = Master Bedroom\nB2 = Bedroom 2\nT1 = Master Toilet\nT2 = Common Toilet\nFOY = Foyer\nUTI = Utility';
      roomListLabelHint = 'L K MB B2 T1 T2 FOY UTI';
      verifyChecks = '- Exactly 1 Foyer.\n- Exactly 1 Living room.\n- Exactly 1 Kitchen.\n- Exactly 2 Bedrooms.\n- Exactly 2 Bathrooms.';
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

    const promptOpts = { 
      isSingle, 
      buildingType, 
      numFlats, 
      hasDividers, 
      hasCore, 
      roomItems, 
      roomListLabelHint, 
      verifyChecks,
      widthM,
      lengthM,
      stories,
      userPrompt
    };
    const stage1Prompt = buildPrompt(promptOpts);

    // ── STAGE 1 ──────────────────────────────────────────────────────────────
    const stage1Input = buildFalInput(stage1Model, uploadedReferenceUrl, stage1Prompt);
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
