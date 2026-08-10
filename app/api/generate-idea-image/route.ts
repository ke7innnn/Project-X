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
  'grok-gpt':         { stage1: 'xai/grok-imagine-image/quality/edit',           stage2: 'openai/gpt-image-2/edit', label: 'Grok [Quality] -> GPT Image 2' },
  'grok-nano':        { stage1: 'xai/grok-imagine-image/quality/edit',           stage2: 'fal-ai/nano-banana-pro/edit', label: 'Grok [Quality] -> Nano Banana Pro' },
  'grok-kontext':     { stage1: 'xai/grok-imagine-image/quality/edit',           stage2: 'fal-ai/flux-pro/kontext', label: 'Grok [Quality] -> FLUX Kontext' },
  'flux-klein-gpt':   { stage1: 'fal-ai/flux-2/klein/9b/edit',                   stage2: 'openai/gpt-image-2/edit', label: 'FLUX Klein -> GPT Image 2' },
  'flux-klein-nano':  { stage1: 'fal-ai/flux-2/klein/9b/edit',                   stage2: 'fal-ai/nano-banana-pro/edit', label: 'FLUX Klein -> Nano Banana Pro' },
  'flux-kontext-gpt': { stage1: 'fal-ai/flux-pro/kontext',                        stage2: 'openai/gpt-image-2/edit', label: 'FLUX Kontext -> GPT Image 2' },
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
  const { numFlats, bhkType, passengerLifts, staircases, hasReferenceImage } = opts;

  const bhkLabel = bhkType.toUpperCase().replace('BHK', ' BHK');
  const flatLabels = Array.from({ length: numFlats }, (_, i) => `F${i + 1}`).join(', ');
  const flatLabelsNewline = Array.from({ length: numFlats }, (_, i) => `F${i + 1}`).join('\n');

  // Generate per-flat locked zone lines
  const lockedZoneLines = Array.from({ length: numFlats }, (_, i) => `F${i + 1} = LOCKED RECTANGULAR APARTMENT ZONE`).join('\n');

  // Generate per-flat containment rules
  const containmentLines = Array.from({ length: numFlats }, (_, i) => {
    const label = `F${i + 1}`;
    return `For ${label}:\n\nALL ${label} rooms, walls, doors, windows, furniture and circulation must remain inside ${label}.`;
  }).join('\n\n');

  // Generate per-flat quality check lines
  const qualityCheckLines = Array.from({ length: numFlats }, (_, i) => {
    const label = `F${i + 1}`;
    return `CHECK ${label}:\n\n• Is every room completely inside ${label}?\n• Are all walls inside ${label}?\n• Are all doors inside ${label}?\n• Is all furniture inside ${label}?\n• Are windows only on exterior-facing boundaries?`;
  }).join('\n\n');

  // Generate per-flat independent containment
  const independentContainmentLines = Array.from({ length: numFlats }, (_, i) => {
    const label = `F${i + 1}`;
    return `${label} must be designed ONLY inside ${label}.`;
  }).join('\n\n');

  // BHK-specific room composition guidance
  const bhkRoomGuidance = bhkType === '1bhk'
    ? '• entrance/foyer\n• living room\n• kitchen\n• 1 bedroom\n• 1 bathroom\n• internal circulation'
    : bhkType === '2bhk'
    ? '• entrance/foyer\n• living room\n• dining area\n• kitchen\n• 2 bedrooms (master + bedroom 2)\n• 2 bathrooms\n• internal circulation'
    : bhkType === '3bhk'
    ? '• entrance/foyer\n• living room\n• dining area\n• kitchen\n• 3 bedrooms (master + bedroom 2 + bedroom 3)\n• 3 bathrooms\n• utility/service area\n• internal circulation'
    : '• entrance/foyer\n• living room\n• dining area\n• kitchen\n• 4 bedrooms (master + bedroom 2 + bedroom 3 + bedroom 4)\n• 4 bathrooms\n• utility/service areas\n• storage\n• internal circulation';

  return `You are a senior architectural floor-plan designer and residential planning architect.

You are editing the FIRST uploaded image.

The FIRST uploaded image is the MASTER ZONING PLAN.

${hasReferenceImage ? 'The SECOND uploaded image is an ARCHITECTURAL REFERENCE IMAGE showing examples of well-designed residential apartment floor plans.' : ''}

Your task is to transform the existing zoning diagram into a realistic, professionally designed 2D CAD residential apartment floor plan.

⛔ GRAPHIC STYLE MANDATE — READ FIRST:
- PURE BLACK 2D LINEWORK ON SOLID WHITE BACKGROUND ONLY.
- ABSOLUTELY NO COLOR FILLS, NO WOOD TEXTURES, NO GREY SHADING, NO 3D RENDERING.
- ABSOLUTELY NO ROOM NAMES OR TEXT INSIDE ROOMS (no "MASTER BEDROOM", "KITCHEN", "LIVING", "TOILET" text).
- KEEP ROOM INTERIORS CLEAN OF TEXT. ONLY KEEP FLAT LABELS (${flatLabels}) NEAR ENTRY DOORS.
- DO NOT MERGE OR SKIP ANY ZONE. All ${numFlats} flat zones (${flatLabels}) MUST be drawn independently.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE ROLES — EXTREMELY IMPORTANT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMAGE 1 = MASTER FLOOR-PLATE / ZONING GEOMETRY

${hasReferenceImage ? 'IMAGE 2 = ARCHITECTURAL DESIGN REFERENCE ONLY' : ''}

IMAGE 1 controls:

• exact building footprint
• exact ${flatLabels} apartment boundaries
• exact apartment positions
• exact apartment sizes
• exact CORE position
• exact CORE size
• exact corridor/access geometry
• overall floor-plate geometry

${hasReferenceImage ? `IMAGE 2 controls ONLY:

• room composition
• apartment planning logic
• room relationships
• circulation
• furniture arrangement
• kitchen organization
• bathroom placement
• bedroom placement
• living/dining composition
• window placement
• natural lighting
• ventilation
• cross ventilation
• realistic residential planning principles

IMAGE 2 MUST NEVER override IMAGE 1.

Do NOT copy the geometry of Image 2.

Do NOT copy the apartment boundaries from Image 2.

Do NOT copy its dimensions.

Do NOT copy its orientation.

Do NOT reshape ${flatLabels} to resemble Image 2.

Use Image 2 only to understand HOW A REAL ARCHITECT DESIGNS THE INSIDE OF AN APARTMENT.` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MASTER GEOMETRY — ABSOLUTELY LOCKED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The ${flatLabels} boundaries shown in IMAGE 1 are FINAL.

Treat every apartment zone as a HARD, CLOSED ARCHITECTURAL CONTAINER.

${lockedZoneLines}

DO NOT:

• move any zone
• resize any zone
• rotate any zone
• reshape any zone
• enlarge any zone
• shrink any zone
• merge zones
• split zones
• extend zones
• change the party walls
• change the exterior boundary of a zone

The apartment boundary shown in IMAGE 1 is a HARD LIMIT.

The interior apartment design MUST FIT INSIDE that boundary.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE CONTAINMENT RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EVERYTHING belonging to an apartment must remain completely inside its assigned zone.

${containmentLines}

Nothing may cross an apartment boundary.

Nothing may extend into another apartment.

Nothing may extend into the exterior leftover area.

Nothing may extend outside the building footprint.

Nothing may overlap the CORE.

If a room does not fit:

CHANGE THE ROOM LAYOUT.

NEVER CHANGE THE APARTMENT BOUNDARY.

This rule has absolute priority.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE — LOCKED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The CORE shown in IMAGE 1 is also FINAL and LOCKED.

Do NOT move it.

Do NOT resize it.

Do NOT reshape it.

Do NOT rotate it.

Do NOT allow apartment rooms to overlap it.

Do NOT allow apartment walls to enter it.

Do NOT place furniture inside it.

Inside the CORE, draw: ${passengerLifts > 0 ? `${passengerLifts} lift/elevator shaft(s)` : ''}${passengerLifts > 0 && staircases > 0 ? ', ' : ''}${staircases > 0 ? `${staircases} staircase(s)` : ''}, and shared access corridor.

Maintain a clear architectural relationship:

APARTMENTS → CORRIDOR → CORE

The CORE remains exactly where it appears in IMAGE 1.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORRIDOR — LOCKED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Respect the corridor/access geometry shown in IMAGE 1.

Do NOT relocate the main corridor.

Do NOT enlarge it unnecessarily.

Do NOT allow apartment rooms to consume the corridor.

Apartment entrances must connect logically to the existing corridor.

The corridor remains common circulation space.

Do not convert corridor space into apartment area.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APARTMENT INTERIOR DESIGN — ${bhkLabel}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Now design a realistic residential floor plan INSIDE each locked apartment zone.

${hasReferenceImage ? 'Use the SECOND IMAGE as architectural guidance.' : ''}

Each apartment should be designed as a complete, functional ${bhkLabel} residence.

For each apartment, intelligently organize:

${bhkRoomGuidance}

The exact room arrangement should be adapted to the available ${flatLabels} geometry.

Do NOT force the same layout into every apartment.

Different apartments may have different room arrangements depending on their position and available facade edges.

However, all apartments must remain completely inside their assigned zones.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ARCHITECTURAL COMPOSITION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${hasReferenceImage ? 'Use the reference image to create a professional architectural composition.' : 'Create a professional architectural composition.'}

The apartment should have a logical sequence such as:

ENTRY
→
FOYER / ENTRY TRANSITION
→
LIVING / DINING
→
KITCHEN
→
PRIVATE BEDROOM ZONE
→
BATHROOM / SERVICE AREAS

Adapt this hierarchy intelligently to each apartment.

Avoid unnecessarily long corridors.

Avoid awkward dead-end circulation.

Avoid unusable leftover spaces.

Avoid rooms that are excessively narrow.

Avoid randomly scattered rooms.

Use efficient architectural planning.

The final apartments should feel like they were designed by a professional residential architect.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VENTILATION + NATURAL LIGHT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${hasReferenceImage ? 'The SECOND IMAGE is particularly important for understanding ventilation and natural lighting.' : ''}

Use professional architectural principles.

Whenever possible:

• place living/dining spaces along exterior walls
• place bedrooms along exterior walls
• provide exterior windows for habitable rooms
• provide appropriate kitchen ventilation
• provide bathroom ventilation where possible
• use multiple exterior orientations for cross ventilation when available
• avoid placing habitable rooms completely landlocked
• use the exterior facade intelligently

Windows must ONLY occur on exterior-facing apartment boundaries.

DO NOT place windows:

• between two apartments
• into the CORE
• into the corridor
• through party walls

Do NOT create fake windows into internal circulation areas.

Where an apartment has two exterior facade sides, use that opportunity for better natural light and cross ventilation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REFERENCE IMAGE INTERPRETATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${hasReferenceImage ? `Study the SECOND IMAGE for architectural PRINCIPLES, not exact geometry.

Learn from it:

• room proportions
• furniture scale
• circulation width
• bedroom placement
• living/dining relationship
• kitchen placement
• bathroom grouping
• privacy zoning
• entry organization
• natural lighting
• ventilation
• cross ventilation
• efficient space utilization

Do NOT reproduce the reference apartment literally.

Do NOT copy its floor-plan shape.

Do NOT copy its dimensions.

Do NOT copy its exact room arrangement.

Instead:

UNDERSTAND THE DESIGN LOGIC → ADAPT IT TO THE LOCKED ${flatLabels} ZONES.` : 'Design each apartment using professional residential architectural principles.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FACADE + WINDOWS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Respect the existing exterior footprint from IMAGE 1.

The exterior-facing edge of each apartment is the location for its windows/openings.

Place windows logically according to the room behind them.

Living rooms and bedrooms should receive appropriate natural light.

Kitchens should have appropriate ventilation.

Bathrooms should have practical ventilation where exterior access allows.

Do not randomly distribute windows.

Do not create windows through party walls.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APARTMENT-BY-APARTMENT CONTAINMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Treat each apartment independently.

${independentContainmentLines}

Do not allow a room from one apartment to occupy another apartment.

Do not allow a room to cross a party wall.

Do not allow one apartment to borrow unused space from another.

Do not allow any apartment to expand into the irregular leftover portions of the building footprint.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROOM WALLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All internal apartment walls must remain inside their assigned zone.

Use clean architectural straight walls.

Walls should form practical rectangular or orthogonal rooms wherever possible.

Do not create unnecessary diagonal walls.

Do not create random curved walls.

Do not alter the original ${flatLabels} boundary walls.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FURNITURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add realistic architectural furniture only after the room layout is established.

Use furniture to communicate the intended function of each room.

Examples:

Living:
• sofa
• coffee table
• TV/media unit

Dining:
• dining table
• chairs

Bedroom:
• bed
• side tables
• wardrobe

Kitchen:
• counters
• cabinets
• appliances

Bathroom:
• WC
• basin
• shower/bath

Furniture must remain completely inside the assigned room.

Furniture must NEVER cross apartment boundaries.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LABELS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Keep the apartment labels:

${flatLabelsNewline}

Each label must appear exactly once.

Do not duplicate labels.

Do not remove labels.

The labels should identify their corresponding apartment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL PRIORITY HIERARCHY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When there is any conflict between instructions, follow this exact priority:

1. LOCKED BUILDING FOOTPRINT
2. LOCKED ${flatLabels} APARTMENT BOUNDARIES
3. LOCKED CORE
4. LOCKED CORRIDOR
5. APARTMENT CONTAINMENT
6. EXTERIOR/FACADE LIMITS
7. ARCHITECTURAL ROOM COMPOSITION
8. VENTILATION + NATURAL LIGHT
9. FURNITURE + DETAIL

NEVER sacrifice a higher-priority item to improve a lower-priority item.

For example:

If a reference layout requires more space than F1 provides:

DO NOT enlarge F1.

Instead redesign the rooms to fit F1.

If a bedroom from the reference does not fit:

DO NOT expand the apartment.

Instead adjust the bedroom proportions.

If better ventilation appears possible outside the assigned zone:

DO NOT expand the zone.

Instead find the best ventilation solution within the existing zone.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL QUALITY CHECK — MANDATORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before producing the final image, inspect the entire plan.

${qualityCheckLines}

FINAL CHECK:

• No apartment boundary has moved.
• No apartment has changed size.
• No apartment has changed shape.
• No room crosses a party wall.
• No room enters another apartment.
• No room enters the CORE.
• No room enters the corridor.
• No apartment expands into leftover exterior space.
• The CORE remains unchanged.
• The corridor remains unchanged.
• All ${numFlats} apartments remain independent.
• The floor plan is architecturally realistic.
• Natural light and ventilation are intelligently provided.
• The reference image has influenced DESIGN QUALITY, not GEOMETRY.

IF ANY ROOM OR ELEMENT EXTENDS OUTSIDE ITS ASSIGNED ${flatLabels} ZONE:

FIX THE INTERIOR LAYOUT.

DO NOT CHANGE THE ZONE.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GRAPHIC STYLE — STRICT 2D BLACK & WHITE CAD BLUEPRINT ONLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• PURE BLACK CAD LINEWORK ON A SOLID WHITE BACKGROUND ONLY.
• ABSOLUTELY NO COLOR FILLS.
• ABSOLUTELY NO WOOD FLOORING TEXTURES OR BEIGE FILLS.
• ABSOLUTELY NO GREY SHADING OR 3D RENDERING.
• ABSOLUTELY NO ROOM NAMES OR TEXT INSIDE ROOMS. Do NOT write "MASTER BEDROOM", "KITCHEN", "LIVING & DINING", "TOILET", or room names inside the room boxes. Keep all room interiors completely clean of text.
• Keep ONLY the flat labels (${flatLabels}) near entry doors.
• Draw all internal partition walls, doors (with quarter-circle swing arcs), window ticks, and minimal 2D CAD furniture outlines in SIMPLE 2D BLACK LINES ONLY.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Produce a professional top-down 2D residential architectural CAD blueprint floor plan in PURE BLACK AND WHITE.

Maintain the original zoning geometry exactly.

Fill each locked ${flatLabels} apartment zone independently with a realistic, functional, well-composed ${bhkLabel} residential floor plan${hasReferenceImage ? ' inspired by the SECOND reference image' : ''}.

DO NOT MERGE OR SKIP ANY ZONE. All ${numFlats} flat zones (${flatLabels}) MUST be present and designed.

The final result should look like a real 2D architectural CAD drawing created in AutoCAD.

MOST IMPORTANT:

THE ZONES ARE FIXED.
THE ROOMS MUST ADAPT TO THE ZONES.
BLACK AND WHITE 2D LINE ART ONLY — NO COLOR, NO WOOD TEXTURE, NO ROOM TEXT.`;
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
