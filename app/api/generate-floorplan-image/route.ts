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
ZONE 1 — CORRIDOR SIDE: LIVING ROOM/HALL directly behind entrance door from corridor
ZONE 2 — MIDDLE: KITCHEN on one side + BATHROOM on the other side
ZONE 3 — BACK (exterior wall): BEDROOM — single bedroom at the back exterior wall`;

    case 2:
      return `THIS IS A 2BHK FLAT (Living Room + Kitchen + 2 Bedrooms + 1-2 Bathrooms):
ZONE 1 — CORRIDOR SIDE: LIVING ROOM directly behind entrance door from corridor
ZONE 2 — MIDDLE: KITCHEN on one side + COMMON BATHROOM center
ZONE 3 — BACK (exterior wall): MASTER BEDROOM (with attached MASTER BATH) on one side + BEDROOM 2 on other side`;

    case 3:
      return `THIS IS A 3BHK FLAT (Living Room + Kitchen + 3 Bedrooms + 2 Bathrooms):
ZONE 1 — CORRIDOR SIDE: LIVING ROOM directly behind entrance door from corridor
ZONE 2 — MIDDLE: KITCHEN on one side + BEDROOM 2 on other side + COMMON BATHROOM between them
ZONE 3 — BACK (exterior wall): MASTER BEDROOM (with attached MASTER BATH) + BEDROOM 3`;

    default: // 4BHK or more
      return `THIS IS A ${bhk}BHK FLAT (Living Room + Kitchen + ${bhk} Bedrooms + Multiple Bathrooms):
ZONE 1 — CORRIDOR SIDE: LIVING ROOM (largest room) directly behind entrance door from corridor
ZONE 2 — MIDDLE: KITCHEN on one side + BEDROOM 2 and BEDROOM 3 distributed across the width + COMMON BATHROOM
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

  return `You are a professional AutoCAD architect. This image has two polygon outlines:
- ORANGE dashed = plot boundary (NEVER touch or remove)
- CYAN solid = buildable zone — ALL content goes INSIDE this polygon

═══════════════════════════════════════════════════════
TRACES & BOUNDARY RULES — ABSOLUTE:
═══════════════════════════════════════════════════════
⚠ NEVER erase, move, repaint, or redraw the ORANGE or CYAN lines.
⚠ Keep them exactly at their original pixel positions and colors.
⚠ The building footprint = the CYAN polygon exactly. Not a rectangle.
⚠ Fill ALL corners and angled edges — no white gaps inside the CYAN zone.
═══════════════════════════════════════════════════════

BUILDING LAYOUT:
- ${flatCount} flats in 2 rows (top row: Flats A–${String.fromCharCode(64+Math.ceil(flatCount/2))}, bottom row: remaining flats)
- Central CORRIDOR spine 1.5m wide runs horizontally between the 2 rows
- Staircase 3×2m at the west end of corridor
- Corner flats must be trapezoidal/wedge-shaped to fill angled corners

FLOOR PLAN DATA:
- Site: ${schedule.siteExteriorW}m × ${schedule.siteExteriorH}m
- Total buildup: ${schedule.totalBuildupArea} sqm
- Total rooms: ${totalRooms}

ROOM SCHEDULE (BHK type and zone layout per group):
${flatDescriptions}

═══════════════════════════════════════════════════════
UNIVERSAL ROOM FLOW RULES (apply to ALL BHK types):
═══════════════════════════════════════════════════════
⚠ LIVING ROOM is ALWAYS the room directly behind the entrance door — never a bedroom or kitchen.
⚠ Entrance door from corridor swings directly INTO the Living Room.
⚠ FOR TOP ROW FLATS: Living Room at BOTTOM (corridor side), Master Bedroom at TOP (exterior wall).
⚠ FOR BOTTOM ROW FLATS: Living Room at TOP (corridor side), Master Bedroom at BOTTOM (exterior wall).
⚠ Bathrooms are always internal (no exterior windows) and placed between bedrooms.
⚠ Kitchen goes on the outer wall side with a ventilation window.
═══════════════════════════════════════════════════════

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
4. ✓ BHK zone layout followed per flat group (see ROOM SCHEDULE above)
5. ✓ No white gaps inside CYAN polygon
6. ✓ Orange and cyan lines untouched`;
}


export async function POST(req: Request) {
  try {
    const { imageBase64, roomSchedule, imageSize = 'square' } = await req.json();

    if (!imageBase64 || !roomSchedule) {
      return NextResponse.json({ error: 'Missing imageBase64 or roomSchedule' }, { status: 400 });
    }

    // Validate imageSize — only allow fal.ai supported values
    const VALID_SIZES = ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'];
    const validatedSize = VALID_SIZES.includes(imageSize) ? imageSize : 'square';
    console.log('[FloorPlan] Output image_size:', validatedSize);

    // 1. Convert base64 to File and upload to fal.ai storage
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const file = new File([imageBuffer], 'canvas-outline.png', { type: 'image/png' });

    console.log('[FloorPlan] Uploading canvas image to fal.ai storage...');
    const uploadedUrl = await fal.storage.upload(file);
    console.log('[FloorPlan] Uploaded:', uploadedUrl);

    // 2. Build the strict architectural prompt
    const prompt = buildFloorPlanPrompt(roomSchedule);
    console.log('[FloorPlan] Prompt length:', prompt.length, 'chars');

    // 3. Reference images — teach GPT-Image-2 all BHK types and room flow rules
    // Permanent fal.ai CDN URLs (never expire)
    const REFERENCE_IMAGES = [
      'https://v3b.fal.media/files/b/0aa1940a/OqSJjCwQJ8MCnITL0aqnp_ref7_bhk_types.png',    // 1BHK/2BHK/3BHK/4BHK flat type comparison — correct internal layout per BHK
      'https://v3b.fal.media/files/b/0aa193f1/66q9g0uzE0Wd7XB_nExau_ref5_corridor_flats.png', // 3 flats with corridor: Living Room always faces corridor
      'https://v3b.fal.media/files/b/0aa193f1/gayXUIsogXCEjJsrCkHi3_ref6_full_building.png',  // Full 14-flat building with correct top/bottom row orientation
    ];

    // 4. Call GPT-Image-2 edit — canvas + 3 targeted layout references
    console.log('[FloorPlan] Calling GPT-Image-2 (medium quality) with image_size:', validatedSize);
    const result = await fal.subscribe('openai/gpt-image-2/edit', {
      input: {
        image_urls: [uploadedUrl, ...REFERENCE_IMAGES],
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
