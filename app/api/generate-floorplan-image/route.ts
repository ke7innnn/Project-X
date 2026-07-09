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

interface RoomSchedule {
  flats: Flat[];
  totalBuildupArea: number;
  plotW: number;
  plotH: number;
  siteExteriorW: number;
  siteExteriorH: number;
  layoutType?: string; // selected layout concept
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

function buildFloorPlanPrompt(schedule: RoomSchedule): string {
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

  const layoutInstructions = schedule.layoutType
    ? `- SELECTED BUILDING LAYOUT STYLE: ${schedule.layoutType}. Bends corridors and arranges flats precisely as specified by this strategy.`
    : `- ${flatCount} flats in 2 rows (top row: Flats A–${String.fromCharCode(64+Math.ceil(flatCount/2))}, bottom row: remaining flats)
- Central CORRIDOR spine 1.5m wide runs horizontally between the 2 rows
- Staircase 3×2m at the west end of corridor`;

  return `You are a professional AutoCAD architect. 

═══════════════════════════════════════════════════════
MASK & BOUNDARY COMPLIANCE — ABSOLUTE:
═══════════════════════════════════════════════════════
⚠ You are provided a mask. Draw the entire building layout (walls, rooms, corridors) ONLY inside the white masked region.
⚠ The thick black outer boundary walls of the building footprint must align perfectly along the edge/boundary of this white shape.
⚠ Do not draw any walls, text, or doors in the black (unmasked) region.
═══════════════════════════════════════════════════════

BUILDING LAYOUT STRATEGY:
${layoutInstructions}
- Corner flats must adapt their shapes (trapezoidal/angled) to perfectly fill the corners of the mask footprint.

FLOOR PLAN DATA:
- Site size: ${schedule.siteExteriorW}m × ${schedule.siteExteriorH}m
- Total buildup: ${schedule.totalBuildupArea} sqm
- Total flats: ${flatCount}
- Total rooms: ${totalRooms}

ROOM SCHEDULE (BHK type and zone layout per group):
${flatDescriptions}

═══════════════════════════════════════════════════════
UNIVERSAL ROOM FLOW & VENTILATION RULES:
═══════════════════════════════════════════════════════
⚠ LIVING ROOM is ALWAYS the room directly behind the entrance door. Entrance door from corridor swings directly into the Living Room.
⚠ Bedrooms, Living Rooms, and Kitchens must touch the outer shell of the mask to ensure large ventilation windows face the outside.
⚠ Bathrooms are always internal (placed between bedrooms) and must connect to ventilation shafts/ducts.
═══════════════════════════════════════════════════════

⚠ CRITICAL STYLE REFERENCE RULES:
- The reference image 'OqSJjCwQJ8MCnITL0aqnp_ref7_bhk_types.png' is provided ONLY as a visual guide for AutoCAD styling (line weights, font, door arc swing symbol).
- DO NOT copy the room configurations or layouts from the reference image. You must dynamically design room layouts for each flat that fit the traced shape.

DRAWING STYLE:
- White background, black walls
- Thick walls (20cm) between flats, thin walls (10cm) inside flat
- Every room: code + room name + dimensions centered in black text
- Every room: door with arc swing symbol (0.9m gap)
- Every flat: bold "FLAT A", "FLAT B" label
- Dimension lines on outer site walls
- Clean AutoCAD 2D top-down blueprint — NO furniture, NO shadows, NO 3D

FINAL CHECKLIST:
1. ✓ ALL ${totalRooms} rooms present — zero omissions
2. ✓ LIVING ROOM corridor-side in EVERY flat — never at back
3. ✓ MASTER BEDROOM at exterior back wall in EVERY flat
4. ✓ BHK zone layout followed per flat group
5. ✓ No white gaps inside the white masked footprint`;
}


export async function POST(req: Request) {
  try {
    const { imageBase64, maskBase64, roomSchedule, imageSize = 'square' } = await req.json();

    if (!imageBase64 || !roomSchedule) {
      return NextResponse.json({ error: 'Missing imageBase64 or roomSchedule' }, { status: 400 });
    }

    // Validate imageSize — only allow fal.ai supported values
    const VALID_SIZES = ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'];
    const validatedSize = VALID_SIZES.includes(imageSize) ? imageSize : 'square';
    console.log('[FloorPlan] Output image_size:', validatedSize);

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
    }

    // 3. Build the strict architectural prompt
    const prompt = buildFloorPlanPrompt(roomSchedule);
    console.log('[FloorPlan] Prompt length:', prompt.length, 'chars');

    // Only keep ref7_bhk_types.png for symbols and styling consistency
    const REFERENCE_IMAGES = [
      'https://v3b.fal.media/files/b/0aa1940a/OqSJjCwQJ8MCnITL0aqnp_ref7_bhk_types.png',    // 1BHK/2BHK/3BHK/4BHK flat type comparison — CAD style guide
    ];

    // 4. Call GPT-Image-2 edit — canvas + mask + CAD style reference
    console.log('[FloorPlan] Calling GPT-Image-2 with image_size:', validatedSize);
    const result = await fal.subscribe('openai/gpt-image-2/edit', {
      input: {
        image_urls: [uploadedUrl, ...REFERENCE_IMAGES],
        mask_image_url: uploadedMaskUrl, // Lock boundaries via mask inpainting
        prompt,
        quality: 'medium',
        image_size: validatedSize,
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
