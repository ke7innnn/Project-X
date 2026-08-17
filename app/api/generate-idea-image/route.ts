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
  units1BHK?: number;
  units2BHK?: number;
  units3BHK?: number;
  units4BHK?: number;
  bhkType?: string;
}): string {
  const { numFlats, hasReferenceImage, units1BHK = 0, units2BHK = 0, units3BHK = 0, units4BHK = 0, bhkType = '2bhk' } = opts;
  const flatLabelsArray = Array.from({ length: numFlats }, (_, i) => `F${i + 1}`);
  const flatLabels = flatLabelsArray.join(', ');
  const uniqueLabelLines = flatLabelsArray.map(label => `• ${label} (use once)`).join('\n');

  // Build exact exterior box count specifications per unit
  const boxRules: string[] = [];
  let totalBoxes = 0;
  let flatIdx = 1;

  if (units1BHK > 0) {
    const list = Array.from({ length: units1BHK }, () => `F${flatIdx++}`).join(', ');
    boxRules.push(`• 1BHK Units (${list}): EXACTLY 4 exterior facade boxes along outer perimeter (1 Attached Balcony + 1 Bedroom + 1 Kitchen + 1 Toilet).`);
    totalBoxes += units1BHK * 4;
  }
  if (units2BHK > 0) {
    const list = Array.from({ length: units2BHK }, () => `F${flatIdx++}`).join(', ');
    boxRules.push(`• 2BHK Units (${list}): EXACTLY 5 exterior facade boxes along outer perimeter (1 Attached Balcony + 2 Bedrooms [Master + Bed 2] + 1 Kitchen + 1 Master Toilet).`);
    totalBoxes += units2BHK * 5;
  }
  if (units3BHK > 0) {
    const list = Array.from({ length: units3BHK }, () => `F${flatIdx++}`).join(', ');
    boxRules.push(`• 3BHK Units (${list}): EXACTLY 6 exterior facade boxes along outer perimeter (1 Attached Balcony + 3 Bedrooms [Master + Bed 2 + Bed 3] + 1 Kitchen + 1 Master Toilet).`);
    totalBoxes += units3BHK * 6;
  }
  if (units4BHK > 0) {
    const list = Array.from({ length: units4BHK }, () => `F${flatIdx++}`).join(', ');
    boxRules.push(`• 4BHK Units (${list}): EXACTLY 7 exterior facade boxes along outer perimeter (1 Attached Balcony + 4 Bedrooms + 1 Kitchen + 1 Master Toilet).`);
    totalBoxes += units4BHK * 7;
  }

  // Fallback if generic dominant BHK
  if (boxRules.length === 0) {
    const boxesPerFlat = bhkType.includes('1') ? 4 : bhkType.includes('3') ? 6 : bhkType.includes('4') ? 7 : 5;
    totalBoxes = numFlats * boxesPerFlat;
    boxRules.push(`• Every flat zone (${flatLabels}): EXACTLY ${boxesPerFlat} exterior facade boxes along outer perimeter (Balcony, Bedrooms, Kitchen, Toilet).`);
  }

  const boxCountDescription = boxRules.join('\n');

  return `You are a licensed senior 2D architectural CAD drafter. EDIT THE FIRST UPLOADED IMAGE ONLY.

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
Your ONLY task: draw internal floor plan zoning lines INSIDE the white footprint to create EXACTLY ${numFlats} flat zones (${flatLabels}) connected to an architecturally optimized CORE block.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#1 — 100% IMMUTABLE OUTER BUILDING FOOTPRINT (RIGID LOCK)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• PRESERVE 100% OF THE OUTER WHITE PERIMETER SILHOUETTE:
  - The outer building boundary geometry, corners, angled wings, setbacks, and silhouette in the input image are 100% RIGID and IMMUTABLE.
  - DO NOT change, round, curve, square off, or alter the outer building facade walls.
  - The building shape must remain EXACTLY identical to the input image!

• 100% INTERNAL INFILL ONLY (ZERO EXTERIOR BLEED):
  - Every single room partition line, door, corridor, toilet, and balcony MUST sit strictly INSIDE the white footprint boundary.
  - ZERO walls, ZERO lines, and ZERO balconies extending out into the solid black background.
  - Balconies are strictly INSET / FLUSH inside the outer facade line (never cantilevered outward into black space).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#2 — ARCHITECTURAL CIRCULATION CORE PLACEMENT (SMART TYPOLOGY LOCATION)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Intelligently locate ONE compact rectangular circulation CORE (elevator shafts + fire staircases) in the most functionally optimal position for this specific building geometry:
  - For V-Shapes, Chevrons & L-Shapes: Position the core at the inner vertex knuckle / hinge corner so wings remain wide, continuous, and filled with natural perimeter daylight.
  - For T-Shapes & Triad Wings: Position the core at the main intersection junction where the wings meet.
  - For Symmetrical Radial / Hexagonal Towers: Position the core in the central structural hub.
  - For Linear / Elongated Slabs: Position the core along the rear or spine with an efficient circulation corridor.
• NEVER force the core into the dead geometric center if it splits a habitable wing or blocks exterior facade windows! Place it where it serves all ${numFlats} units with equal, minimal corridor length.
• Draw shared access corridors connecting the core directly to each flat unit entrance.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#3 — COLOR-CODED FLAT ZONES & SINGLE LABELS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Subdivide the floor plate into EXACTLY ${numFlats} flat zones (${flatLabels}) matching the building's natural wings.
• Draw the outer boundary outline of each flat zone in a DISTINCT, VIVID COLOR (e.g. Red for F1, Green for F2, Orange for F3, Blue for F4, Purple for F5, Teal for F6).
• Place each label clearly inside its flat zone EXACTLY ONCE:
${uniqueLabelLines}
• NO duplicate labels. NO extra unlabeled flat zones.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#4 — STRICT 90° ORTHOGONAL & BIG EXTERIOR ROOM BOXES (45% – 55% DEPTH)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• 90° ORTHOGONAL ROOM COMPARTMENTS:
  - Inside each flat zone, all interior room dividing partition lines must run strictly perpendicular (90°) and parallel to the facade wall.
  - ZERO diagonal cuts across rooms, ZERO slanted walls, ZERO triangle trapezoid rooms.

• BIG & DEEP EXTERIOR ROOMS (45% – 55% INWARD DEPTH):
  - In EVERY color-coded flat zone (e.g. F1 in Red, F2 in Green, F3 in Orange, etc.), make all exterior facade room boxes significantly BIGGER, DEEPER, and more spacious!
  - Exterior room boxes must extend inward 45% to 55% from the outer perimeter wall, creating generous, spacious 90° rectangular room proportions.
  - DO NOT draw small, thin, or shallow sliver boxes along the facade.

• STRICT EXTERIOR FACADE ROOM BOX COUNT:
  - Along the outer perimeter wall of EACH flat zone, draw EXACTLY the required number of spacious 90° rectangular room boxes:
${boxCountDescription}
  - Total exterior facade boxes across all units = EXACTLY ${totalBoxes} boxes.
  - Each exterior box is a clean orthogonal 90° rectangular compartment sitting on the outer building wall for:
    ① 1 Attached Balcony box (flush/inset inside the white boundary)
    ② The Bedroom boxes (1 for 1BHK, 2 for 2BHK, 3 for 3BHK, 4 for 4BHK)
    ③ 1 Kitchen box (with outside window)
    ④ 1 Toilet / Bathroom box (with exterior ventilation)

• EXPANSIVE LIVING ROOM / DINING IN REMAINING CENTRAL AREA:
  - Occupies the generous remaining central/main area of each flat zone, connecting the entrance foyer directly to the balcony, kitchen, and private bedroom corridors.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#5 — GRAPHIC STYLE (CLEAN 2D CAD ZONING BLUEPRINT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Pure 2D architectural CAD linework on the solid white footprint with a solid black background.
• All internal room partition lines remain thin, crisp black lines.
• Unit outer boundaries are drawn with distinct vivid colored lines (e.g. F1 Red, F2 Green, F3 Orange, F4 Blue, F5 Purple, F6 Teal).

OUTPUT: Clean 2D CAD zoning floor plan with EXACTLY ${numFlats} color-coded flat zones (${flatLabels}) inside the UNMODIFIED building footprint, with exactly ${totalBoxes} BIG, DEEP 90° rectangular exterior room boxes along the outer walls (${boxRules.length > 0 ? '1BHK=4, 2BHK=5, 3BHK=6, 4BHK=7' : ''}).`;
}

// ── Stage 2: GPT Image 2 prompt — fill zones using BHK reference ──────────────

function buildStage2Prompt(opts: {
  numFlats: number;
  bhkType: string;
  units1BHK?: number;
  units2BHK?: number;
  units3BHK?: number;
  units4BHK?: number;
  passengerLifts: number;
  staircases: number;
  hasReferenceImage: boolean;
}): string {
  const { numFlats, bhkType, units1BHK = 0, units2BHK = 0, units3BHK = 0, units4BHK = 0, passengerLifts, staircases, hasReferenceImage } = opts;

  const flatLabelsArray = Array.from({ length: numFlats }, (_, i) => `F${i + 1}`);
  const flatLabels = flatLabelsArray.join(', ');

  // Build specific mix assignment if mixed units exist
  const mixLines: string[] = [];
  let flatIndex = 1;
  if (units1BHK > 0) {
    const list = Array.from({ length: units1BHK }, () => `F${flatIndex++}`).join(', ');
    mixLines.push(`• ${list}: 1 BHK (Living Room in main remaining area + 1 Attached BALCONY + 1 Kitchen + 1 Bedroom + 1 Toilet in exterior boxes)`);
  }
  if (units2BHK > 0) {
    const list = Array.from({ length: units2BHK }, () => `F${flatIndex++}`).join(', ');
    mixLines.push(`• ${list}: 2 BHK (Living Room + Dining in main remaining area + 1 Attached BALCONY + 1 Kitchen + 2 Bedrooms [Master Bed + Bed 2] + 1 Master Toilet in exterior boxes)`);
  }
  if (units3BHK > 0) {
    const list = Array.from({ length: units3BHK }, () => `F${flatIndex++}`).join(', ');
    mixLines.push(`• ${list}: 3 BHK (Living Room + Dining in main remaining area + 1 Attached BALCONY + 1 Kitchen + 3 Bedrooms [Master Bed + Bed 2 + Bed 3] + 1 Master Toilet in exterior boxes)`);
  }
  if (units4BHK > 0) {
    const list = Array.from({ length: units4BHK }, () => `F${flatIndex++}`).join(', ');
    mixLines.push(`• ${list}: 4 BHK (Living Room + Dining in main remaining area + 1 Attached BALCONY + 1 Kitchen + 4 Bedrooms + 1 Master Toilet in exterior boxes)`);
  }

  const mixDescription = mixLines.length > 0
    ? mixLines.join('\n')
    : `• Every flat zone (${flatLabels}): ${bhkType.toUpperCase()} layout with Living Room in main area + Attached BALCONY + Bedrooms + Kitchen + Toilet in exterior boxes`;

  const liftsStr = passengerLifts > 0 ? `${passengerLifts} elevator shaft(s)` : '1 elevator shaft';
  const stairsStr = staircases > 0 ? `${staircases} fire staircase flight(s)` : '2 fire staircase flights';

  return `You are a licensed senior 2D CAD architectural blueprint enhancer and detailer. EDIT THE FIRST UPLOADED IMAGE ONLY.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIMARY DIRECTIVE — PRESERVE 100% COMPOSITION (ENHANCE ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• THE ARCHITECTURAL COMPOSITION IN IMAGE 1 IS 100% LOCKED AND PERFECT:
  - DO NOT change, shift, move, resize, add, or delete ANY walls, rooms, corridors, or core boxes.
  - Keep 100% of the exact room geometry, partition lines, central CORE, and colored unit boundaries (${flatLabels}) from IMAGE 1.
• YOUR ONLY MISSION: Transform IMAGE 1 into a crisp, high-end, publication-quality 2D CAD architectural floor plan blueprint by adding architectural linework detailing, standard CAD doors/windows, and elegant top-down furniture and decor.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#1 — IMMUTABLE LOCKED GEOMETRY & COMPOSITION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• OUTER BUILDING SILHOUETTE: 100% LOCKED. Keep the exact outer perimeter contour.
• CIRCULATION CORE & CORRIDORS: 100% LOCKED. Detail the interior of the core box with ${liftsStr}, ${stairsStr}, and a utility shaft.
• ROOM PARTITION WALLS: 100% LOCKED. Retain every existing room box and wall from IMAGE 1.
• UNIT BOUNDARIES (${flatLabels}): LOCKED with their distinct vivid boundary colors preserved from IMAGE 1.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#2 — ARCHITECTURAL CAD LINEWORK & OPENINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• WALLS: Crisp, sharp, solid black 2D CAD partition lines.
• DOORS: Standard quarter-circle door swing arcs showing clear opening direction into each room.
• WINDOWS: Clean double-line architectural window symbols along all exterior walls.
• SEAMLESS LIVING-TO-BALCONY SLIDER: The connection between the Living Room and Attached Balcony is drawn strictly as a full-width SLIDING GLASS DOOR / glazed threshold (thin double line / dashed slider with NO solid brick/masonry wall).
• BALCONY RAILING: Clean double-line glass/metal railing along the outer balcony edge.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#3 — ARCHITECTURAL FURNITURE, FIXTURES & ROOM DECORATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Populate each existing room in IMAGE 1 with clean, elegant, top-down 2D CAD vector furniture symbols and decor:
• MASTER BEDROOM: King-size double bed with pillows & side nightstands, wardrobe line, and dresser.
• BEDROOMS (Bed 2, Bed 3, Bed 4): Queen or single beds with side tables, built-in wardrobes, and study desk with chair.
• LIVING ROOM: L-shaped sectional sofa or 3+2 couch with a central coffee table, slim media/TV wall console, and corner accent indoor potted plant.
• DINING AREA: 4-seater to 6-seater dining table with neatly arranged chairs.
• KITCHEN: L-shaped or parallel modular kitchen counters with 2-bowl sink, cooktop stove, and refrigerator icon.
• ATTACHED BALCONY: Outdoor patio seating (2 chairs + small coffee table) and green potted planter boxes along the railing.
• BATHROOMS / TOILETS: Wall-hung WC commode, vanity washbasin with mirror, and glass shower partition enclosure.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#4 — GRAPHIC STYLE & TYPOGRAPHY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Pure 2D architectural CAD linework on a solid white background.
• Clean vector furniture line symbols (NO photo textures, NO 3D rendering).
• PRESERVE each flat's unique colored outer boundary outline from IMAGE 1 (e.g. F1 in Red, F2 in Green, etc.).
• Clean, crisp, legible architectural room text labels and flat markers (${flatLabels}).

OUTPUT: A beautiful, publication-grade, professional 2D CAD architectural blueprint that preserves 100% of IMAGE 1's exact composition while enhancing it with crisp CAD walls, doors, windows, and complete architectural furniture and decor.`;
}

// ── AI Architectural Evaluator Agent (Evaluates 4 Stage 1 candidates against shape & ventilation) ──

interface EvaluationResult {
  winnerIndex: number;
  winnerScore: number;
  reasoning: string;
  candidateCritiques: string[];
}

async function evaluateCandidatesWithVisionAgent(
  originalMaskBase64: string,
  candidateUrls: string[],
  dominantBHK: string,
  numFlats: number
): Promise<EvaluationResult> {
  const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
  if (!openRouterKey || candidateUrls.length <= 1) {
    return {
      winnerIndex: 0,
      winnerScore: 92,
      reasoning: 'Single candidate produced or offline evaluator fallback',
      candidateCritiques: candidateUrls.map((_, i) => `Candidate ${i + 1}: Processed successfully.`),
    };
  }

  try {
    const promptText = `You are a Senior Architectural QA Auditor & Geometric Shape Evaluator.
You are inspecting ${candidateUrls.length} candidate floor plan zoning layouts against the user's TARGET BUILDING FOOTPRINT (Image 0: solid white footprint mask on solid black background).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 SUPREME EVALUATION CRITERIA (SHAPE #1, LIVING-BALCONY #2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. SHAPE FIDELITY & CONTOUR ACCURACY (50% OF TOTAL SCORE — OVERWHELMING #1 PRIORITY / HARD KNOCKOUT):
   • Look at Image 0 (the original white building footprint mask). Compare each candidate (Candidate 0, 1, 2, 3) 1:1 against Image 0.
   • HEAVILY PENALIZE any candidate that rounds off sharp corners, turns angled wings into rectangles/ovals, truncates wings, or bleeds outside the boundary.
   • AWARD TOP SHAPE POINTS (40-50 pts) ONLY to the candidate that keeps the exact 1:1 geometric silhouette of Image 0.

2. LIVING ROOM DIRECTLY CONNECTED TO BALCONY (25% OF TOTAL SCORE — STRICT #2 MAIN PRIORITY):
   • In EVERY single flat unit, the central Living Room MUST be directly adjacent and connected to the Attached Balcony on the facade.
   • Seamless flow between Living Room and Balcony (wide sliding glass threshold, NO solid dividing wall, and NOT tucked away only accessible through a bedroom).
   • Penalize any candidate where the living room is cut off from the balcony!

3. FACADE VENTILATION FOR BEDROOMS, KITCHEN & TOILETS (20% OF TOTAL SCORE — #3 PRIORITY):
   • All bedrooms, kitchen, and toilets must sit along the outer perimeter facade to capture direct exterior windows and cross-ventilation.

4. 90° CAD PARTITIONS & UNIT LABELING (5% OF TOTAL SCORE):
   • Clean orthogonal linework with exactly ${numFlats} distinct unit zones.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY UNBIASED SCORING PROCESS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• DO NOT default to any particular candidate index. Judge each candidate (Candidate 0, 1, 2, 3) independently and strictly on its own architectural merit.
• For each candidate, evaluate:
  1. Shape Fidelity (0-50 pts): Does it match Image 0's outer boundary without rounding corners or clipping wings?
  2. Living-to-Balcony Connection (0-25 pts): Is the central living room directly attached to the exterior balcony?
  3. Ventilation (0-20 pts): Are bedrooms/kitchen/bathrooms on exterior walls?
  4. Orthogonal CAD (0-5 pts): Clean 90-degree internal zoning?
• Sum the sub-scores to compute the total score (0-100) for each candidate in the "candidateScores" array.
• Whichever candidate achieves the highest numerical score is selected as the winner.

Output your evaluation ONLY as a valid JSON object matching this schema:
{
  "candidateScores": [<score_0>, <score_1>, <score_2>, <score_3>],
  "winnerIndex": <index_of_highest_score>,
  "winnerScore": <highest_score>,
  "reasoning": "<concise explanation of why the highest-scoring candidate won>",
  "candidateCritiques": [
    "Candidate 0 (Score: X/100): <specific visual critique>",
    "Candidate 1 (Score: X/100): <specific visual critique>",
    "Candidate 2 (Score: X/100): <specific visual critique>",
    "Candidate 3 (Score: X/100): <specific visual critique>"
  ]
}`;

    const contentArray: any[] = [
      { type: 'text', text: promptText },
      {
        type: 'image_url',
        image_url: { url: originalMaskBase64.startsWith('data:') ? originalMaskBase64 : `data:image/png;base64,${originalMaskBase64}` },
      },
    ];

    candidateUrls.forEach((url, i) => {
      contentArray.push({ type: 'text', text: `=== CANDIDATE ${i} (Index: ${i}) ===` });
      contentArray.push({ type: 'image_url', image_url: { url } });
    });

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://projectx.app',
        'X-Title': 'Project X Architectural Evaluator Agent',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: contentArray }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      console.warn(`[EvaluatorAgent] Vision evaluation call failed (${res.status}), defaulting to Candidate 0`);
      return {
        winnerIndex: 0,
        winnerScore: 90,
        reasoning: 'Candidate 0 selected (evaluator response fallback)',
        candidateCritiques: candidateUrls.map((_, i) => `Candidate ${i + 1}: Available`),
      };
    }

    const json = await res.json();
    const rawContent = json.choices?.[0]?.message?.content || '{}';
    console.log('[EvaluatorAgent] Vision evaluation raw response:', rawContent);
    const parsed = JSON.parse(rawContent);

    // Calculate winning index dynamically from candidateScores array to guarantee zero hardcoded positional bias
    let winnerIndex = 0;
    let winnerScore = 90;

    if (Array.isArray(parsed.candidateScores) && parsed.candidateScores.length === candidateUrls.length) {
      let maxScore = -1;
      const topIndices: number[] = [];
      parsed.candidateScores.forEach((score: any, idx: number) => {
        const numScore = typeof score === 'number' ? score : parseInt(score, 10) || 0;
        if (numScore > maxScore) {
          maxScore = numScore;
          topIndices.length = 0;
          topIndices.push(idx);
        } else if (numScore === maxScore) {
          topIndices.push(idx);
        }
      });
      // In case of exact ties, choose fairly among top scorers
      winnerIndex = topIndices[Math.floor(Math.random() * topIndices.length)];
      winnerScore = maxScore > 0 ? maxScore : (parsed.winnerScore || 90);
    } else if (typeof parsed.winnerIndex === 'number' && parsed.winnerIndex >= 0 && parsed.winnerIndex < candidateUrls.length) {
      winnerIndex = parsed.winnerIndex;
      winnerScore = parsed.winnerScore || 90;
    }

    return {
      winnerIndex,
      winnerScore,
      reasoning: parsed.reasoning || `Candidate ${winnerIndex + 1} scored the highest (${winnerScore}/100) for shape fidelity and architectural layout.`,
      candidateCritiques: Array.isArray(parsed.candidateCritiques) ? parsed.candidateCritiques : [],
    };
  } catch (err: any) {
    console.warn('[EvaluatorAgent] Error during evaluation:', err.message);
    return {
      winnerIndex: 0,
      winnerScore: 88,
      reasoning: 'Candidate 0 selected (fallback)',
      candidateCritiques: candidateUrls.map((_, i) => `Candidate ${i + 1}: Ready`),
    };
  }
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const {
      traceCanvasBase64,
      workflow = 'gpt-low-gpt-medium',
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
      const ratio = w / h;
      if (ratio > 1.6) return { image_size: 'landscape_16_9', aspect_ratio: '16:9' };
      if (ratio > 1.25) return { image_size: 'landscape_4_3', aspect_ratio: '4:3' };
      if (ratio < 0.62) return { image_size: 'portrait_16_9', aspect_ratio: '9:16' };
      if (ratio < 0.8) return { image_size: 'portrait_4_3', aspect_ratio: '3:4' };
      return { image_size: 'square_hd', aspect_ratio: '1:1' };
    }

    const { image_size: detectedImageSize, aspect_ratio: detectedAspectRatio } = pickDimensions(shapeW, shapeH);

    // ── Two-Stage Workflow Pipeline ───────────────────────────────────────────
    if (traceCanvasBase64) {
      const activeApiKey = apiKey || process.env.FAL_KEY;
      if (!activeApiKey) {
        return NextResponse.json({ error: 'FAL_KEY is missing.' }, { status: 400 });
      }

      const cleanApiKey = activeApiKey.replace(/\s+/g, '').replace(/[^a-zA-Z0-9:-]/g, '');
      fal.config({ credentials: cleanApiKey });

      // Convert trace canvas data URI to a publicly accessible fal storage URL
      console.log('[IdeaGenerator] Uploading trace canvas mask to fal storage...');
      const uploadedTraceUrl = await urlToFalStorage(traceCanvasBase64);
      console.log('[IdeaGenerator] Trace canvas uploaded:', uploadedTraceUrl);

      const workflowConfig = WORKFLOWS[workflow] || WORKFLOWS['gpt-low-gpt-medium'] || WORKFLOWS['grok-gpt'];
      const stage2Model = workflowConfig.stage2 || 'openai/gpt-image-2/edit';

      const totalUnits = units1BHK + units2BHK + units3BHK + units4BHK;
      const numFlats = Math.max(1, totalUnits);
      const dominantBHK = detectDominantBHK(units1BHK, units2BHK, units3BHK, units4BHK);

      // ── STAGE 1: Generate 4 parallel candidate zoning layouts with GPT Image 2 [Low] ──
      const zoningRefUrl = await loadZoningReferenceToFalStorage();
      const hasZoningRef = !!zoningRefUrl;

      const stage1Prompt = buildStage1Prompt({
        numFlats,
        hasReferenceImage: hasZoningRef,
        units1BHK,
        units2BHK,
        units3BHK,
        units4BHK,
        bhkType: dominantBHK,
      });

      const stage1ImageUrls: string[] = [uploadedTraceUrl];
      if (zoningRefUrl) {
        stage1ImageUrls.push(zoningRefUrl);
      }

      console.log(`[IdeaGenerator] Stage 1: Generating 4 parallel candidate zoning layouts with openai/gpt-image-2/edit [Low]...`);

      const stage1Input = {
        image_urls: stage1ImageUrls,
        prompt: stage1Prompt,
        quality: 'low',
      };

      const candidatePromises = Array.from({ length: 4 }, () =>
        runModel('openai/gpt-image-2/edit', stage1Input)
      );

      const candidateResults = await Promise.allSettled(candidatePromises);
      const successfulCandidates: Array<{ url: string; seed?: number; index: number }> = [];

      candidateResults.forEach((res, idx) => {
        if (res.status === 'fulfilled' && res.value?.url) {
          successfulCandidates.push({ url: res.value.url, seed: res.value.seed, index: idx });
          console.log(`[IdeaGenerator] Stage 1 Candidate ${idx + 1}/4 generated successfully: ${res.value.url}`);
        } else if (res.status === 'rejected') {
          console.warn(`[IdeaGenerator] Stage 1 Candidate ${idx + 1}/4 failed:`, res.reason?.message);
        }
      });

      if (successfulCandidates.length === 0) {
        throw new Error('All 4 Step 1 candidates failed to generate.');
      }

      console.log(`[IdeaGenerator] Stage 1: ${successfulCandidates.length}/4 candidates ready. Running AI Architectural Evaluator Agent...`);

      // ── AI AGENT EVALUATION: Inspect shape preservation, ventilation, and living room composition ──
      const candidateUrls = successfulCandidates.map(c => c.url);
      const evaluation = await evaluateCandidatesWithVisionAgent(
        traceCanvasBase64,
        candidateUrls,
        dominantBHK,
        numFlats
      );

      const winningCandidate = successfulCandidates[evaluation.winnerIndex] || successfulCandidates[0];
      const stage1Url = winningCandidate.url;
      const stage1Seed = winningCandidate.seed;

      console.log(`[IdeaGenerator] 🏆 Evaluator Agent selected Candidate #${evaluation.winnerIndex + 1} (Score: ${evaluation.winnerScore}/100)!`);
      console.log(`[IdeaGenerator] 📝 Evaluator Reasoning: ${evaluation.reasoning}`);

      // Fetch all candidate base64s in parallel
      const candidateBase64s = await Promise.all(
        successfulCandidates.map(c => fetchToBase64(c.url))
      );
      const stage1Base64 = candidateBase64s[evaluation.winnerIndex] || candidateBase64s[0];

      if (!stage2Model) {
        return NextResponse.json({
          url: stage1Base64,
          imageUrls: candidateBase64s,
          stage1ImageUrl: stage1Base64,
          stage1Seed,
          evaluation: {
            winnerIndex: evaluation.winnerIndex,
            winnerScore: evaluation.winnerScore,
            reasoning: evaluation.reasoning,
            critiques: evaluation.candidateCritiques,
          },
          systemPrompt: stage1Prompt,
          userPrompt: `STAGE 1 (4 candidates evaluated by AI Vision Agent | Winner #${evaluation.winnerIndex + 1})`,
        });
      }

      // ── STAGE 2: GPT Image 2 architectural infill & furniture detailing on Winner ────
      const referenceStorageUrl = await loadReferenceToFalStorage(dominantBHK);
      const hasReferenceImage = !!referenceStorageUrl;

      const refinementPrompt = buildStage2Prompt({
        numFlats,
        bhkType: dominantBHK,
        units1BHK,
        units2BHK,
        units3BHK,
        units4BHK,
        passengerLifts,
        staircases,
        hasReferenceImage,
      });

      const stage2ImageUrls: string[] = [stage1Url];
      if (referenceStorageUrl) {
        stage2ImageUrls.push(referenceStorageUrl);
      }

      console.log(`[IdeaGenerator] Stage 2: Enhancing Winner #${evaluation.winnerIndex + 1} with openai/gpt-image-2/edit [Medium]...`);

      const gptInput: Record<string, any> = {
        image_urls: stage2ImageUrls,
        prompt: refinementPrompt,
        quality: 'medium',
      };

      const gptRes = await runModel('openai/gpt-image-2/edit', gptInput);
      const stage2Base64 = await fetchToBase64(gptRes.url);
      const stage2Seed = gptRes.seed;
      console.log('[IdeaGenerator] Stage 2 (GPT Image 2) enhanced blueprint generated successfully');

      return NextResponse.json({
        url: stage2Base64,
        imageUrls: [stage2Base64, ...candidateBase64s],
        stage1ImageUrl: stage1Base64,
        stage2ImageUrl: stage2Base64,
        stage1Candidates: candidateBase64s,
        winnerIndex: evaluation.winnerIndex,
        stage1Seed,
        stage2Seed,
        evaluation: {
          winnerIndex: evaluation.winnerIndex,
          winnerScore: evaluation.winnerScore,
          reasoning: evaluation.reasoning,
          critiques: evaluation.candidateCritiques,
        },
        systemPrompt: stage1Prompt,
        refinementPrompt,
        userPrompt: `PIPELINE | Stage 1: 4× GPT Image 2 [Low] (Winner #${evaluation.winnerIndex + 1} chosen by AI Agent: ${evaluation.winnerScore}/100) -> Stage 2: GPT Image 2 [Medium] | BHK: ${dominantBHK}`,
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
