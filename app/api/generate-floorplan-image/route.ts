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

  return `You are a professional AutoCAD architect. This image shows a white canvas with two polygon outlines:
- ORANGE dashed polygon = plot boundary (do NOT modify this line)
- CYAN solid polygon = site exterior / buildable zone (fill INSIDE this ONLY)

TASK: Draw a complete 2D architectural floor plan INSIDE the cyan polygon.
DO NOT draw anything outside the cyan boundary. DO NOT remove or redraw the orange or cyan lines.

FLOOR PLAN REQUIREMENTS:
- Total flats: ${flatCount}
- Total rooms: ${totalRooms}
- Total buildup area: ${schedule.totalBuildupArea} sqm
- Site: ${schedule.siteExteriorW}m × ${schedule.siteExteriorH}m

ROOM SCHEDULE (ALL ${totalRooms} rooms MUST appear — zero omissions):
${flatDescriptions}

SHARED SPACES (draw these too):
- Central corridor spine: 1.5m wide, running through building center
- Staircase: 3m × 2m, placed South or West
- Main entrance: North or East wall of site

VASTU RULES (strictly follow):
- Master Bedroom: South-West zone of each flat
- Kitchen: South-East zone of each flat  
- Living Room: North or North-East of each flat
- Bathroom: North-West of each flat
- All main entrances face North or East

DRAWING STYLE:
- White background, black walls
- Thick walls (20cm) between flats, thin walls (10cm) inside flat
- Every room: print code (e.g. "A1") + name (e.g. "Master Bedroom") + dimensions (e.g. "3.5m×4m") in small black text centered inside room
- Every room: draw door as arc swing symbol (0.9m gap in wall)
- Flat labels: "FLAT A", "FLAT B" etc. in bold at top of each flat zone
- Dimension lines on outer walls
- Style: clean AutoCAD technical blueprint, 2D top-down, NO furniture, NO shadows, NO 3D

CRITICAL RULES:
1. ALL ${totalRooms} rooms from the schedule above MUST be drawn — count them before finishing
2. ZERO duplicate room codes
3. Every single room gets a door symbol
4. Stay strictly inside the CYAN boundary — nothing outside
5. Keep the original ORANGE and CYAN polygon lines exactly as drawn in the input image`;
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
