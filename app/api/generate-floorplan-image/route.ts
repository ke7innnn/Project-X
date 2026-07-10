import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

fal.config({ credentials: process.env.FAL_KEY });

interface Room {
  code: string;
  name: string;
  w: number;
  h: number;
  area: number;
}

interface Flat {
  id: string;
  name: string;
  rooms: Room[];
}

interface PolygonPoint {
  x: number;
  y: number;
}

interface CirculationCore {
  x: number;
  y: number;
}

interface RoomSchedule {
  flats: Flat[];
  totalBuildupArea: number;
  plotW: number;
  plotH: number;
  siteExteriorW: number;
  siteExteriorH: number;
  layoutType?: string;
  sitePolygonPoints?: PolygonPoint[];
}

/** Detect BHK type from the rooms in one flat group */
function detectBHKType(rooms: Room[]): number {
  const bedroomCount = rooms.filter(r =>
    /bedroom|bed room|master bed/i.test(r.name) && !/bath/i.test(r.name)
  ).length;
  return Math.max(1, bedroomCount); // 1BHK = 1 bedroom, 2BHK = 2, etc.
}

/** Return per-flat zone layout instruction for a specific BHK type */
function getBHKZoneLayout(bhk: number): string {
  switch (bhk) {
    case 1:
      return `THIS IS A 1BHK FLAT (Hall + Kitchen + 1 Bedroom + Bathroom):
ZONE 1 — CORRIDOR/ENTRANCE SIDE: LIVING ROOM/HALL directly behind entrance door
ZONE 2 — MIDDLE: KITCHEN on one side + BATHROOM on the other side
ZONE 3 — BACK (exterior wall): BEDROOM — single bedroom at the back exterior wall`;

    case 2:
      return `THIS IS A 2BHK FLAT (Living Room + Kitchen + 2 Bedrooms + 1-2 Bathrooms):
ZONE 1 — CORRIDOR/ENTRANCE SIDE: LIVING ROOM directly behind entrance door
ZONE 2 — MIDDLE: KITCHEN on one side + COMMON BATHROOM center
ZONE 3 — BACK (exterior wall): MASTER BEDROOM (with attached MASTER BATH) on one side + BEDROOM 2 on other side`;

    case 3:
      return `THIS IS A 3BHK FLAT (Living Room + Kitchen + 3 Bedrooms + 2 Bathrooms):
ZONE 1 — CORRIDOR/ENTRANCE SIDE: LIVING ROOM directly behind entrance door
ZONE 2 — MIDDLE: KITCHEN on one side + BEDROOM 2 on other side + COMMON BATHROOM between them
ZONE 3 — BACK (exterior wall): MASTER BEDROOM (with attached MASTER BATH) + BEDROOM 3`;

    default: // 4BHK or more
      return `THIS IS A ${bhk}BHK FLAT (Living Room + Kitchen + ${bhk} Bedrooms + Multiple Bathrooms):
ZONE 1 — CORRIDOR/ENTRANCE SIDE: LIVING ROOM (largest room) directly behind entrance door
ZONE 2 — MIDDLE: KITCHEN on one side + BEDROOM 2 and BEDROOM 3 distributed + COMMON BATHROOM
ZONE 3 — BACK (exterior wall): MASTER BEDROOM (with attached MASTER BATH) + remaining bedrooms`;
  }
}

function buildFloorPlanPrompt(schedule: RoomSchedule, sitePolygonPoints?: PolygonPoint[], circulationCore?: CirculationCore): string {
  // Group flats by layout similarity (same room names & dimensions) to optimize prompt length
  const groups: { [key: string]: { ids: string[]; rooms: Room[] } } = {};
  for (const flat of schedule.flats) {
    const key = flat.rooms.map(r => `${r.name}-${r.w}-${r.h}`).join('|');
    if (!groups[key]) {
      groups[key] = { ids: [], rooms: flat.rooms };
    }
    groups[key].ids.push(flat.id);
  }

  // Build per-group flat descriptions with BHK type detection
  const flatDescriptions = Object.entries(groups).map(([_, group]) => {
    const flatIdsStr = group.ids.map(id => `FLAT ${id}`).join(', ');
    const bhk = detectBHKType(group.rooms);
    const roomLines = group.rooms.map((r, idx) => {
      let suffix = r.code;
      for (const id of group.ids) {
        if (r.code.startsWith(id)) { suffix = r.code.slice(id.length); break; }
      }
      if (!suffix) suffix = String(idx + 1);
      const exampleCodes = group.ids.slice(0, 3).map(id => `${id}${suffix}`).join(', ');
      return `    - Suffix "${suffix}" (e.g. ${exampleCodes}): ${r.name} (${r.w}m × ${r.h}m = ${r.area} sqm, door required)`;
    }).join('\n');
    return `  FOR ${flatIdsStr} [${bhk}BHK]:\n${roomLines}\n  LAYOUT → ${getBHKZoneLayout(bhk)}`;
  }).join('\n\n');

  const totalRooms = schedule.flats.reduce((s, f) => s + f.rooms.length, 0);
  const flatCount = schedule.flats.length;

  // Build the flat label sequence as an explicit checklist (research: visual checklists prevent skipping)
  const flatLabels = Array.from({ length: flatCount }, (_, i) => `FLAT ${String.fromCharCode(65 + i)}`);
  const flatCheckboxList = flatLabels.map(l => `[ ] ${l}`).join('  ');
  const lastFlatLetter = String.fromCharCode(65 + flatCount - 1);

  const layoutInstructions = schedule.layoutType
    ? `SELECTED BUILDING LAYOUT STYLE: ${schedule.layoutType}. Arrange the ${flatCount} flats precisely using this strategy.`
    : `Arrange ${flatCount} flats in 2 rows with a central corridor spine 1.5m wide running between the rows.`;

  // Build shape polygon description from coordinates
  const polygonStr = sitePolygonPoints && sitePolygonPoints.length > 0
    ? sitePolygonPoints.map((p, i) => `V${i + 1}(${p.x}m,${p.y}m)`).join(' → ') + ` → back to V1`
    : `a ${schedule.siteExteriorW}m × ${schedule.siteExteriorH}m rectangle`;

  const shapeVertexCount = sitePolygonPoints?.length ?? 4;
  const isIrregular = shapeVertexCount > 4;

  // Adaptive stair core location from polygon centroid
  const coreStr = circulationCore
    ? `x=${circulationCore.x}m, y=${circulationCore.y}m (polygon geometric centroid — deepest interior point, furthest from all exterior walls)`
    : `the geometric center of the building footprint`;

  return `<role>
You are a senior AutoCAD draftsman who executes architectural blueprints with absolute precision. You do NOT make creative decisions about which flats to include, skip, or merge. You draw EXACTLY what is listed in the room schedule — no more, no less.
</role>

<constraints>
████████████████████████████████████████████████████
RULE 1 — BUILDING FOOTPRINT SHAPE (ABSOLUTE):
████████████████████████████████████████████████████
- The source image has the building's outer concrete walls PRE-DRAWN as a thick black closed polygon.
- You MUST draw all rooms and internal walls EXACTLY inside this pre-drawn black boundary.
- Do NOT alter, shrink, distort, round, or flip this outer wall shape in ANY way.
- Do NOT draw a rectangle, diamond, circle, or any other shape — only use the shape you see in the source image.

COORDINATE REFERENCE (HTML Canvas — Y increases DOWNWARDS from top-left):
  Vertices: ${polygonStr}
  This is a ${shapeVertexCount}-vertex ${isIrregular ? 'IRREGULAR POLYGON' : 'rectangle'}.
  A vertex with y=10m is near the TOP of the image. A vertex with y=45m is near the BOTTOM. Do NOT flip vertically.

SOURCE IMAGE VISUAL CUES:
  - The thick BLACK closed polygon outline = the building's outer concrete walls (do NOT change this shape).
  - The light GRAY fill inside the polygon = the building interior where rooms go.
  - The WHITE area outside the polygon = outside the building (do NOT draw here).
  - The thin CYAN line on the walls = guide trace (follow this line precisely).
  - Dimension labels on each wall edge show the wall length in meters.
  
MASK IMAGE:
  - WHITE area in the mask = the area where you MUST draw (inside the building).
  - BLACK area in the mask = the area you MUST NOT touch (outside the building).
████████████████████████████████████████████████████

████████████████████████████████████████████████████
RULE 2 — ALL ${flatCount} FLATS REQUIRED (NON-NEGOTIABLE):
████████████████████████████████████████████████████
Step 1 — ZONE DIVISION: Before drawing any walls, visually divide the building footprint into exactly ${flatCount} distinct zones.
Step 2 — LABEL ASSIGNMENT: Assign one flat label to each zone in order: FLAT A, FLAT B, ... FLAT ${lastFlatLetter}.
Step 3 — DRAW ROOMS: Draw all rooms from the room schedule inside each zone.

FLAT LABEL MANDATORY CHECKLIST — you must draw ALL of these, in alphabetical order, none can be skipped:
${flatCheckboxList}

⛔ DO NOT skip, merge, or omit ANY flat from the list above. If you skip even one flat, the output is INCORRECT.
⛔ EVERY flat in the checklist MUST have its label visible in the image (e.g., "FLAT A", "FLAT B", ...).
████████████████████████████████████████████████████

████████████████████████████████████████████████████
RULE 3 — CIRCULATION CORE PLACEMENT:
████████████████████████████████████████████████████
- Place the LIFT (2m × 2.5m) and STAIRCASE (4m × 5m) at approximately ${coreStr}.
- The circulation core MUST be positioned fully in the interior of the building — it must NOT touch or block any exterior wall.
- Exterior walls must remain free for ventilation windows of bedrooms, living rooms, and kitchens.
████████████████████████████████████████████████████
</constraints>

<layout>
${layoutInstructions}
- Corner flats must adapt their shapes (trapezoidal/angled) to perfectly fill every corner of the building footprint.
- Corridors must bend/angle to follow the exact outline of the pre-drawn black boundary.
</layout>

<floor_plan_data>
Site polygon: ${polygonStr}
Site bounding box: ${schedule.siteExteriorW}m × ${schedule.siteExteriorH}m
Total buildup area: ${schedule.totalBuildupArea} sqm
Total flats: ${flatCount} (FLAT A to FLAT ${lastFlatLetter})
Total rooms: ${totalRooms}
</floor_plan_data>

<room_schedule>
${flatDescriptions}
</room_schedule>

<ventilation_rules>
- LIVING ROOM is ALWAYS placed directly behind the entrance door (corridor-side).
- Bedrooms, Living Rooms, and Kitchens MUST touch the exterior shell of the polygon for window ventilation.
- Bathrooms are always internal (between bedrooms) with ventilation shafts.
</ventilation_rules>

<drawing_style>
- Ultra-clean 2D AutoCAD blueprint. White background, solid black walls.
- Outer walls: 30cm thick. Flat dividing walls: 20cm. Internal room walls: 10cm.
- Every room: door opening with arc swing symbol (0.9m gap).
- Every room: code + name + dimensions in technical font (e.g. "A1 Master Bedroom\n4.0m x 5.0m").
- Every flat: large bold label ("FLAT A", "FLAT B", etc.).
- Dimension lines with tick marks on all exterior walls showing measurements in meters.
- NO furniture, NO colors, NO shadows, NO 3D, NO textures. Pure 2D vector line drawing.
</drawing_style>

<final_checklist>
1. [ ] Outer walls match the pre-drawn black polygon exactly — not a diamond, not a rectangle
2. [ ] All ${flatCount} flats drawn (A to ${lastFlatLetter}) — none skipped or merged
3. [ ] All ${totalRooms} rooms present — zero omissions
4. [ ] Living Room corridor-side in every flat
5. [ ] Circulation core at ${coreStr} — not blocking exterior walls
6. [ ] All exterior walls have visible dimension lines
</final_checklist>`;
}


export async function POST(req: Request) {
  try {
    const { imageBase64, maskBase64, roomSchedule, imageSize = 'square', sitePolygonPoints, circulationCoreLocation } = await req.json();
    if (sitePolygonPoints && sitePolygonPoints.length > 0) {
      roomSchedule.sitePolygonPoints = sitePolygonPoints;
    }

    if (!imageBase64 || !roomSchedule) {
      return NextResponse.json({ error: 'Missing imageBase64 or roomSchedule' }, { status: 400 });
    }
    if (!maskBase64) {
      console.warn('[FloorPlan] ⚠ WARNING: No mask provided — boundary lock is DISABLED');
    }

    // Validate imageSize — map preset names to exact pixel dimensions
    // Using custom {width, height} ensures output matches source/mask resolution exactly
    const SIZE_MAP: Record<string, { width: number; height: number }> = {
      'square_hd':      { width: 1024, height: 1024 },
      'square':         { width: 512,  height: 512  },
      'landscape_4_3':  { width: 1024, height: 768  },
      'landscape_16_9': { width: 1024, height: 576  },
      'portrait_4_3':   { width: 768,  height: 1024 },
      'portrait_16_9':  { width: 576,  height: 1024 },
    };
    const outputSize = SIZE_MAP[imageSize] || SIZE_MAP['square_hd'];
    console.log('[FloorPlan] Output dimensions:', outputSize.width, '×', outputSize.height);

    // 1. Convert base64 to File and upload to fal.ai storage (Source image)
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const file = new File([imageBuffer], 'canvas-outline.png', { type: 'image/png' });

    console.log('[FloorPlan] Uploading canvas image to fal.ai storage...');
    const uploadedUrl = await fal.storage.upload(file);
    console.log('[FloorPlan] Uploaded source:', uploadedUrl);

    // 2. Upload mask image if provided
    let uploadedMaskUrl = undefined;
    if (maskBase64) {
      const maskData = maskBase64.replace(/^data:image\/\w+;base64,/, '');
      const maskBuffer = Buffer.from(maskData, 'base64');
      const maskFile = new File([maskBuffer], 'canvas-mask.png', { type: 'image/png' });

      console.log('[FloorPlan] Uploading mask image to fal.ai storage...');
      uploadedMaskUrl = await fal.storage.upload(maskFile);
      console.log('[FloorPlan] Uploaded mask:', uploadedMaskUrl);
    } else {
      console.warn('[FloorPlan] ⚠ No maskBase64 received — floor plan will generate WITHOUT boundary lock!');
    }

    // Confirm mask is set before calling
    console.log('[FloorPlan] Mask URL set:', uploadedMaskUrl ? '✓ YES — boundary lock ACTIVE' : '✗ NO — boundary lock INACTIVE');

    // 3. Build the strict architectural prompt with all constraint engineering applied
    const prompt = buildFloorPlanPrompt(roomSchedule, sitePolygonPoints, circulationCoreLocation);
    console.log('[FloorPlan] Prompt length:', prompt.length, 'chars');

    // 4. Call GPT-Image-2 edit — source image + mask + prompt
    console.log('[FloorPlan] Calling GPT-Image-2 with dimensions:', outputSize);
    console.log('[FloorPlan] mask_url being sent:', uploadedMaskUrl ?? 'NONE');
    const result = await fal.subscribe('openai/gpt-image-2/edit', {
      input: {
        image_urls: [uploadedUrl],
        mask_url: uploadedMaskUrl,
        prompt,
        quality: 'medium',  // 'medium' for cost efficiency; switch to 'high' for sharper output
        image_size: outputSize,  // Custom pixel dimensions — matches source/mask resolution exactly
        num_images: 1,
      },
    });

    const images = (result.data as any)?.images;
    if (!images || images.length === 0) {
      throw new Error('No images returned from GPT-Image-2');
    }

    const imageUrl = images[0].url;
    console.log('[FloorPlan] Generated image URL:', imageUrl);

    return NextResponse.json({ imageUrl, promptUsed: prompt });

  } catch (err: any) {
    console.error('[FloorPlan] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 });
  }
}
