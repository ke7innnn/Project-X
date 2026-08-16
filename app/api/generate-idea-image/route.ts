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
#1 — IMMUTABLE LOCKED EXTERIOR SILHOUETTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• RIGID BOUNDARY LOCK: The outer boundary of the white polygon in IMAGE 1 is 100% LOCKED and IMMUTABLE.
• Maintain the EXACT footprint geometry, sharp corners, angles, setbacks, and silhouette with pixel-perfect precision.
• DO NOT round off sharp corners, DO NOT bulge flat facade walls, and DO NOT distort the perimeter contour.
• 100% INTERNAL INFILL ONLY: Every single room box, partition line, and balcony MUST sit strictly INSIDE the white footprint boundary. ZERO lines, walls, or balconies extending into the solid black background.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#2 — PARTITION WALLS: STRICT HORIZONTAL & VERTICAL ONLY (90° T-SQUARE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Draw ONLY straight HORIZONTAL (left-right) and VERTICAL (up-down) partition lines.
• EVERY flat zone MUST be a clean RECTANGLE or SQUARE shape — exactly as shown in the reference image (IMAGE 2).
• ABSOLUTELY FORBIDDEN:
  - NO diagonal lines from corners to center.
  - NO triangle, pie-slice, wedge, or trapezoid units.
  - NO angled walls or slanted partition lines.
• Even if the outer building footprint has diagonal or slanted boundary walls, ALL internal dividing walls MUST be strictly horizontal or vertical meeting at 90° angles.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#3 — CENTRAL CIRCULATION CORE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Place ONE rectangular CORE box (elevator + staircase) centrally inside the footprint.
• Draw a corridor ring around the CORE so every flat has direct access.
• Draw ONE thin straight entrance corridor from the CORE to the nearest outer facade wall.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#4 — EXACT FLAT COUNT & LABELS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Divide into EXACTLY ${numFlats} flat zones (${flatLabels}) of proportional, equal floor area.
• Place each label clearly inside its flat zone EXACTLY ONCE:
${uniqueLabelLines}
• NO duplicate labels. NO extra unlabeled boxes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#5 — STRICT 90° ORTHOGONAL EXTERIOR ROOM BOXES & LARGE HABITABLE DEPTH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• STRICT ORTHOGONAL 90° T-SQUARE GRID:
  - Every exterior room box MUST be a clean, perfect 90° perpendicular rectangle or square.
  - All internal partition lines must run strictly perpendicular (90°) or parallel to outer walls.
  - ZERO slanted lines, ZERO diagonal cuts, ZERO trapezoids.

• LARGE HABITABLE DEPTH (35% – 45% OF WING):
  - Every exterior room box must be deep and spacious (occupying 35% to 45% of the flat zone's inward depth, with 1:1 square or 1:1.2 rectangular proportions).
  - DO NOT draw thin, shallow, or skin-deep sliver boxes along the facade.

• STRICT EXTERIOR FACADE ROOM BOX COUNT:
  - Along the outer exterior facade/perimeter wall of EACH flat zone, draw EXACTLY the required number of spacious 90° rectangular room boxes:
${boxCountDescription}
  - Total exterior facade boxes across all units = EXACTLY ${totalBoxes} boxes.
  - Each exterior box is a clean orthogonal 90° rectangular compartment sitting on the outer building wall for:
    ① 1 Attached Balcony box
    ② The Bedroom boxes (1 for 1BHK, 2 for 2BHK, 3 for 3BHK, 4 for 4BHK)
    ③ 1 Kitchen box (with outside window)
    ④ 1 Toilet / Bathroom box (with exterior ventilation)

• EXPANSIVE LIVING ROOM / DINING IN REMAINING MAIN AREA:
  - Occupies the generous remaining central/main area of each flat zone, connecting the entrance foyer directly to the balcony, kitchen, and private bedroom corridors.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#6 — COLOR-CODED BOUNDARIES & VISUAL STYLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• COLOR-CODED UNIT BOUNDARIES: Draw the outer boundary outline of each flat zone in a DIFFERENT, DISTINCT VIVID COLOR (e.g. red, blue, green, orange, purple, teal, crimson, indigo).
• All internal room partition lines remain thin black lines.
• Pure 2D top-down CAD linework only. Stay 100% inside the white footprint polygon.

OUTPUT: Clean 2D CAD zoning floor plan with EXACTLY ${numFlats} rectangular flat zones (${flatLabels}) with 90° horizontal/vertical divisions, exactly ${totalBoxes} large 90° rectangular exterior room boxes along the outer walls (${boxRules.length > 0 ? '1BHK=4, 2BHK=5, 3BHK=6, 4BHK=7' : ''}), and distinct colored boundaries.`;
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

  return `You are a licensed senior 2D CAD architectural drafter. EDIT THE FIRST UPLOADED IMAGE ONLY.

${hasReferenceImage ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE ROLES — EXTREMELY IMPORTANT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• IMAGE 1 = MASTER ZONING DIAGRAM (EDIT THIS IMAGE).
  Keep 100% of the outer building perimeter boundary, central CORE position, and flat zone color boundaries (${flatLabels}) from IMAGE 1.

• IMAGE 2 = CROSS-VENTILATION & ROOM FLOW REFERENCE.
  Study the architectural composition in IMAGE 2:
  1. EXPANSIVE LIVING ROOM: The Living Room sits in the spacious remaining internal/central area of the apartment connecting the foyer to all zones.
  2. SEAMLESS BALCONY OPENING: Living Room connects directly to the Attached Balcony with NO solid partition wall.
  3. EXTERIOR BEDROOMS & KITCHEN: Habitable rooms (Attached Balcony, Bedrooms, Kitchen, Toilet) occupy the EXTERIOR FACADE BOXES along the building perimeter for natural airflow and daylight.
  4. SOLID KITCHEN PARTITION: Kitchen is an enclosed walled room with a window and a door connecting to Living/Dining.
  5. FOYER CIRCULATION: Entrance foyer connects directly to Living Room and private bedroom corridors.
  Apply this exact architectural layout inside every flat zone of IMAGE 1!
` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#1 — IMMUTABLE LOCKED GEOMETRY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• OUTER FACADE BOUNDARY: LOCKED. Do not alter, stretch, or reshape the building perimeter.
• CENTRAL CIRCULATION CORE: LOCKED. Keep the core box and shared corridor intact.
• UNIT BOUNDARIES (${flatLabels}): LOCKED with their unique colors preserved from IMAGE 1.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#2 — CENTRAL CORE LAYOUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Inside the central CORE box: Draw ${liftsStr}, ${stairsStr}, and a central ventilation/utility duct shaft.
• Shared corridor wraps around the core to provide direct, equal access to each flat's front entrance door.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#3 — EXACT UNIT SPECIFICATION & ROOM CHECKLIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Fill all ${numFlats} flat zones (${flatLabels}) with EXACTLY their required room inventory — no extra rooms, no missing rooms:
${mixDescription}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#4 — STRICT ROOM-TO-BOX ASSIGNMENT & BALCONY EXTENSION LOGIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. EXTERIOR FACADE BOXES (MANDATORY FOR BALCONY, BEDROOMS, KITCHEN & TOILETS):
   • The exterior boxes lining the outer building perimeter MUST be strictly assigned to:
     ① ATTACHED OUTDOOR BALCONY with railing along the outer facade
     ② BEDROOMS (Master Bedroom, Bedroom 2, Bedroom 3, Bedroom 4) with double-line outside windows
     ③ KITCHEN with exterior wall window for natural cooking ventilation
     ④ TOILETS / BATHROOMS (Master Bath, Common Bath) sitting in exterior boxes with windows/louvers for direct natural ventilation
   • Under NO circumstances should any bedroom or kitchen be landlocked without external windows.

2. EXPANSIVE LIVING ROOM & DINING IN REMAINING MAIN AREA:
   • The LIVING ROOM + DINING AREA occupies the main spacious remaining body of the apartment.
   • Provides private internal hallway access to bedrooms, kitchen, and bathrooms.

3. SEAMLESS LIVING-TO-BALCONY EXTENSION (NO SOLID WALL):
   • The Living Room connects directly into the Attached Balcony with NO solid partition/brick wall between them.
   • The boundary between Living Room and Balcony is drawn strictly as a full-width SLIDING GLASS DOOR / glazed threshold (thin double line / dashed slider with no opaque wall).

4. KITCHEN WALL ENCLOSURE:
   • Kitchen must be an enclosed room with a solid partition wall and door connecting to Living/Dining (no open-plan kitchen).

5. CIRCULATION SEQUENCE:
   • Common Corridor → Apartment Entrance Door → Foyer / Living Room → Balcony / Kitchen / Bedroom Hallway & Bathrooms.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#5 — GRAPHIC STYLE (STRICT 2D CAD BLUEPRINT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Pure 2D architectural CAD linework on solid white background.
• Standard door swings (quarter-circle arcs), balcony railings, sliding glass sliders, and double-line window openings along exterior walls.
• NO wood textures, NO 3D rendering, NO color fills inside rooms.
• PRESERVE each flat's unique colored outer boundary outline from IMAGE 1. All internal partition lines remain thin black lines.
• Keep flat labels (${flatLabels}) near entry doors.

OUTPUT: A complete, functional 2D CAD floor plan with all ${numFlats} units perfectly arranged with Living Room in the main remaining area seamlessly opening to the Balcony (no solid wall), and Bedrooms, Kitchen, and Toilets in exterior facade boxes inside IMAGE 1.`;
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
        units1BHK,
        units2BHK,
        units3BHK,
        units4BHK,
        bhkType: dominantBHK,
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

      // ── STAGE 2 — Dual Model Execution: GPT Image 2 + Nano Banana 2 ────────
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

      console.log(`[IdeaGenerator] Stage 2 dual dispatch (Nano Banana Pro + Nano Banana 2) | image_urls: ${stage2ImageUrls.length} (Zoning + ${hasReferenceImage ? 'Cross-vent reference' : 'none'})`);

      const proInput: Record<string, any> = {
        image_urls: stage2ImageUrls,
        prompt: refinementPrompt,
      };

      const nanoInput: Record<string, any> = {
        image_urls: stage2ImageUrls,
        prompt: refinementPrompt,
      };

      const [proRes, nanoRes] = await Promise.allSettled([
        runModel('fal-ai/nano-banana-pro/edit', proInput),
        runModel('fal-ai/nano-banana-2/edit', nanoInput),
      ]);

      let stage2ProBase64: string | null = null;
      let stage2ProSeed: number | undefined = undefined;
      if (proRes.status === 'fulfilled') {
        stage2ProSeed = proRes.value.seed;
        stage2ProBase64 = await fetchToBase64(proRes.value.url);
        console.log('[IdeaGenerator] Stage 2A (Nano Banana Pro) generated successfully');
      } else {
        console.warn('[IdeaGenerator] Stage 2A (Nano Banana Pro) failed:', proRes.reason?.message);
      }

      let stage2NanoBase64: string | null = null;
      let stage2NanoSeed: number | undefined = undefined;
      if (nanoRes.status === 'fulfilled') {
        stage2NanoSeed = nanoRes.value.seed;
        stage2NanoBase64 = await fetchToBase64(nanoRes.value.url);
        console.log('[IdeaGenerator] Stage 2B (Nano Banana 2) generated successfully');
      } else {
        console.warn('[IdeaGenerator] Stage 2B (Nano Banana 2) failed:', nanoRes.reason?.message);
      }

      const primaryResult = stage2ProBase64 || stage2NanoBase64 || stage1Base64;
      const allResults = [stage2ProBase64, stage2NanoBase64].filter((img): img is string => Boolean(img));

      return NextResponse.json({
        url: primaryResult,
        imageUrls: allResults.length > 0 ? allResults : [primaryResult],
        stage1ImageUrl: stage1Base64,
        stage2ImageUrl: stage2ProBase64,
        stage2ProImageUrl: stage2ProBase64,
        stage2NanoImageUrl: stage2NanoBase64,
        stage1Seed,
        stage2Seed: stage2ProSeed ?? stage2NanoSeed,
        systemPrompt: stage1Prompt,
        refinementPrompt,
        userPrompt: `PIPELINE | Stage1: ${stage1Model} -> Stage 2A: Nano Banana Pro + Stage 2B: Nano Banana 2 | BHK: ${dominantBHK}`,
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
