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
  // Build per-flat room listing
  const flatDescriptions = schedule.flats.map(flat => {
    const roomLines = flat.rooms.map(r =>
      `    - ${r.code}: ${r.name} (${r.w}m × ${r.h}m = ${r.area} sqm, door required)`
    ).join('\n');
    const flatArea = flat.rooms.reduce((s, r) => s + r.area, 0);
    return `  FLAT ${flat.id} [total ${flatArea} sqm]:\n${roomLines}`;
  }).join('\n');

  const totalRooms = schedule.flats.reduce((s, f) => s + f.rooms.length, 0);
  const flatCount = schedule.flats.length;

  return `You are a professional AutoCAD architect rendering a 2D floor plan. This image has two polygon outlines:
- ORANGE dashed polygon = plot boundary (do NOT touch this line)
- CYAN solid polygon = buildable site boundary — ALL rooms MUST be placed INSIDE this polygon

═══════════════════════════════════════════════════════
CRITICAL GEOMETRY RULE — READ THIS FIRST:
═══════════════════════════════════════════════════════
The CYAN polygon is NOT a rectangle. It has angled or tapered edges and corners.
The building footprint must EXACTLY follow the shape of the CYAN polygon.

⚠ DO NOT place rooms inside a rectangular bounding box.
⚠ DO NOT leave any white/empty space inside the CYAN polygon.
⚠ ALL areas inside the CYAN boundary must be filled with rooms, walls, corridor, or staircase.
⚠ Edge flats touching a diagonal or tapered wall MUST be trapezoidal/wedge-shaped to hug that wall exactly.
⚠ Corner rooms can be irregular polygons — they must fill the corner triangular zones completely.
⚠ The outer wall of the building = the cyan polygon line. Not an inner rectangle.
═══════════════════════════════════════════════════════

FLOOR PLAN REQUIREMENTS:
- Total flats: ${flatCount}
- Total rooms: ${totalRooms}
- Total buildup area: ${schedule.totalBuildupArea} sqm
- Site dimensions: ${schedule.siteExteriorW}m wide × ${schedule.siteExteriorH}m tall

ROOM SCHEDULE (ALL ${totalRooms} rooms MUST be drawn — zero omissions, zero duplicates):
${flatDescriptions}

LAYOUT STRATEGY:
- Arrange flats in 2 rows of 7 flats each (7 top row, 7 bottom row), with a central corridor spine of 1.5m width between them
- The 2 end flats on each side (e.g. Flat A and Flat G in the top row) must taper/stretch to fill the angled cyan corners
- Every flat's outer walls must press against the cyan boundary — no gap between flat outer wall and cyan line
- Staircase (3m × 2m) at the West end between the two rows
- Main entrance at North or East wall of cyan polygon

VASTU (follow strictly per flat):
- Master Bedroom → South-West of each flat
- Kitchen → South-East
- Living Room → North or North-East
- Bathrooms → North-West

DRAWING STYLE:
- White background, black walls
- Thick walls (20cm) between flats, thin walls (10cm) inside flat
- Every room: print code (e.g. "A1") + name + dimensions in small black text centered inside
- Every room: draw door as arc swing symbol (0.9m gap in wall)
- Flat labels "FLAT A", "FLAT B" etc. in bold at top of each flat zone
- Dimension lines on outer walls showing site width/height
- Style: clean AutoCAD 2D top-down blueprint, NO furniture, NO shadows, NO 3D, NO perspective

FINAL CHECKLIST BEFORE SUBMITTING:
1. ✓ ALL ${totalRooms} rooms drawn — every single one
2. ✓ ZERO white space gaps inside the cyan polygon — every corner is filled
3. ✓ Outer building walls follow the exact shape of the cyan polygon
4. ✓ Zero duplicate room codes
5. ✓ Every room has a door symbol
6. ✓ Orange and cyan polygon lines are preserved unchanged`;
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

    // 3. Call GPT-Image-2 edit at low quality for speed (~8-12s)
    console.log('[FloorPlan] Calling GPT-Image-2 (low quality)...');
    const result = await fal.subscribe('openai/gpt-image-2/edit', {
      input: {
        image_urls: [uploadedUrl],
        prompt,
        quality: 'low',
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
