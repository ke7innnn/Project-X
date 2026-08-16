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

  return `You are a licensed senior 2D architectural CAD drafter. EDIT THE INPUT IMAGE ONLY.

The input image shows the EXACT WHITE building footprint on a solid BLACK background.
Your ONLY task: draw internal floor plan zoning lines INSIDE the white footprint to create EXACTLY ${numFlats} flat zones (${flatLabels}) around a central CORE block.

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
#2 — CENTRAL CIRCULATION CORE & CORRIDORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Place ONE rectangular CORE box (elevator shafts + fire staircases) centrally inside the footprint.
• Draw a shared corridor ring wrapping around the core so each flat zone has direct front entrance access.
• Draw ONE straight entrance corridor from the CORE to the outer facade.

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
• CENTRAL CORE & CORRIDORS: 100% LOCKED. Detail the interior of the core box with ${liftsStr}, ${stairsStr}, and a utility shaft.
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
      // Pass ONLY the single target footprint image so the AI never blends or morphs with other shapes
      const stage1Prompt = buildStage1Prompt({
        numFlats,
        hasReferenceImage: false,
        units1BHK,
        units2BHK,
        units3BHK,
        units4BHK,
        bhkType: dominantBHK,
      });

      console.log(`[IdeaGenerator] Stage 1: ${stage1Model} — drawing ${numFlats} empty flat zones inside exact footprint...`);

      const stage1ImageUrls: string[] = [uploadedTraceUrl];

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

      // ── STAGE 2: GPT Image 2 architectural infill & furniture detailing ────
      // Load master CAD cross-ventilation reference image and upload to fal storage
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

      console.log(`[IdeaGenerator] Stage 2: openai/gpt-image-2/edit | image_urls: ${stage2ImageUrls.length} (Zoning + ${hasReferenceImage ? 'Cross-vent reference' : 'none'})`);

      const gptInput: Record<string, any> = {
        image_urls: stage2ImageUrls,
        prompt: refinementPrompt,
        quality: 'medium',
      };

      const gptRes = await runModel('openai/gpt-image-2/edit', gptInput);
      const stage2Base64 = await fetchToBase64(gptRes.url);
      const stage2Seed = gptRes.seed;
      console.log('[IdeaGenerator] Stage 2 (GPT Image 2) generated successfully');

      return NextResponse.json({
        url: stage2Base64,
        imageUrls: [stage2Base64],
        stage1ImageUrl: stage1Base64,
        stage2ImageUrl: stage2Base64,
        stage1Seed,
        stage2Seed,
        systemPrompt: stage1Prompt,
        refinementPrompt,
        userPrompt: `PIPELINE | Stage 1: ${stage1Model} -> Stage 2: openai/gpt-image-2/edit [Medium] | BHK: ${dominantBHK}`,
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
