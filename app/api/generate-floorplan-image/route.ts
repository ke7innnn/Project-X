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

  const flatDescriptions = Object.entries(groups).map(([_, group]) => {
    const flatIdsStr = group.ids.map(id => `FLAT ${id}`).join(', ');
    const roomLines = group.rooms.map((r, idx) => {
      // Find room code suffix relative to flat ID (e.g. "A1" -> "1")
      let suffix = r.code;
      for (const id of group.ids) {
        if (r.code.startsWith(id)) {
          suffix = r.code.slice(id.length);
          break;
        }
      }
      if (!suffix) suffix = String(idx + 1);
      
      const exampleCodes = group.ids.slice(0, 3).map(id => `${id}${suffix}`).join(', ');
      return `    - Suffix "${suffix}" (e.g. ${exampleCodes}): ${r.name} (${r.w}m × ${r.h}m = ${r.area} sqm, door required)`;
    }).join('\n');
    return `  FOR ${flatIdsStr}:\n${roomLines}`;
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
- Rooms: ${totalRooms}

ROOM SCHEDULE:
${flatDescriptions}

═══════════════════════════════════════════════════════
CRITICAL PER-FLAT ROOM LAYOUT (follow exactly):
═══════════════════════════════════════════════════════
Inside EACH flat, arrange rooms in this exact order FROM CORRIDOR INWARD:

ZONE 1 — CORRIDOR SIDE (entrance zone):
  • LIVING ROOM — largest room, directly behind entrance door, faces corridor wall
  • Entrance door swings INTO living room from corridor

ZONE 2 — MIDDLE of flat:
  • KITCHEN — to one side
  • BEDROOM 2 — to other side
  • Common bathroom between kitchen and bedroom 2

ZONE 3 — BACK (exterior wall, farthest from corridor):
  • MASTER BEDROOM — largest bedroom, at exterior back wall
  • MASTER BATHROOM — attached directly to master bedroom

FOR TOP ROW FLATS: corridor is at BOTTOM of flat, exterior wall is TOP → Living Room at bottom, Master Bedroom at top
FOR BOTTOM ROW FLATS: corridor is at TOP of flat, exterior wall is BOTTOM → Living Room at top, Master Bedroom at bottom

⚠ Living Room MUST always be the room closest to corridor — NEVER put a bedroom between corridor and living room.
⚠ Entrance door from corridor leads directly into Living Room or Foyer — NEVER directly into a bedroom or kitchen.
═══════════════════════════════════════════════════════

DRAWING STYLE:
- White background, black walls
- Thick walls (20cm) between flats, thin walls (10cm) inside flat
- Every room: code (e.g. "A1") + room name + dimensions centered in black text
- Every room: door with arc swing symbol (0.9m gap)
- Every flat: bold "FLAT A", "FLAT B" label
- Dimension lines on outer site walls
- Clean AutoCAD 2D top-down blueprint — NO furniture, NO shadows, NO 3D

FINAL CHECKLIST:
1. ✓ ALL ${totalRooms} rooms present — zero omissions
2. ✓ LIVING ROOM is corridor-side in EVERY flat — never at back
3. ✓ MASTER BEDROOM is at exterior back wall in EVERY flat
4. ✓ No white gaps inside CYAN polygon
5. ✓ Orange and cyan lines untouched`;
}

export async function POST(req: Request) {
  try {
    const { imageBase64, roomSchedule } = await req.json();

    if (!imageBase64 || !roomSchedule) {
      return NextResponse.json({ error: 'Missing imageBase64 or roomSchedule' }, { status: 400 });
    }

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

    // 3. Reference images — teach GPT-Image-2 correct per-flat room layout and flow
    // Permanent fal.ai CDN URLs (never expire)
    const REFERENCE_IMAGES = [
      'https://v3b.fal.media/files/b/0aa193f0/s7ugUngVzDI_gqbsnqWLw_ref4_single_flat.png',    // Single flat: Living Room at corridor side, bedrooms at back
      'https://v3b.fal.media/files/b/0aa193f1/66q9g0uzE0Wd7XB_nExau_ref5_corridor_flats.png', // 3 flats with corridor: Living Room always faces corridor
      'https://v3b.fal.media/files/b/0aa193f1/gayXUIsogXCEjJsrCkHi3_ref6_full_building.png',  // Full 14-flat building with correct top/bottom row orientation
    ];

    // 4. Call GPT-Image-2 edit — canvas + 3 targeted layout references
    console.log('[FloorPlan] Calling GPT-Image-2 (medium quality) with 3 flat-layout references...');
    const result = await fal.subscribe('openai/gpt-image-2/edit', {
      input: {
        image_urls: [uploadedUrl, ...REFERENCE_IMAGES],
        prompt,
        quality: 'medium',
        image_size: 'square',
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
