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
  const flatCount = schedule.flats.length;
  const totalRooms = schedule.flats.reduce((s, f) => s + f.rooms.length, 0);
  const lastFlatLetter = String.fromCharCode(65 + flatCount - 1);
  const flatLabelList = Array.from({ length: flatCount }, (_, i) => `FLAT ${String.fromCharCode(65 + i)}`).join(', ');

  // Detect BHK from first flat
  const bhk = detectBHKType(schedule.flats[0]?.rooms || []);

  // Compact room list — just names and sizes, no verbose structure
  const roomList = schedule.flats[0]?.rooms
    .map(r => `${r.name} ${r.w}×${r.h}m`)
    .join(', ') || '';

  // Layout instruction
  const layoutStr = schedule.layoutType
    ? `Layout: ${schedule.layoutType}.`
    : `Double-loaded corridor layout, flats on both sides.`;

  // Core location
  const coreStr = circulationCore
    ? `Place staircase and lift at x=${circulationCore.x}m y=${circulationCore.y}m (building center).`
    : `Place staircase and lift at the building center.`;

  // Polygon vertices (compact)
  const vertexStr = sitePolygonPoints && sitePolygonPoints.length > 0
    ? sitePolygonPoints.map((p, i) => `(${p.x},${p.y})`).join('→')
    : '';

  // ── THE PROMPT — optimized for GPT-Image-2 ──
  // First sentence = most critical constraint (shape).
  // Short, dense, front-loaded. No XML tags. ~400 tokens.
  return `The source image shows a white polygon shape on a solid black background. The mask restricts editing to the transparent (alpha=0) polygon region. Draw the floor plan ONLY inside this white polygon shape. The black area is protected by the mask and must remain solid black. Keep the exact shape of the white polygon, do not make it rectangular.

${flatCount} flats, each ${bhk}BHK. You MUST draw all ${flatCount} flats labeled: ${flatLabelList}. Do not skip or merge any flat.

Each flat contains: ${roomList}. Every room needs a door with arc swing.

${layoutStr} ${coreStr} Staircase must not touch exterior walls.

Room placement rules: Living Room behind entrance door (corridor side). Bedrooms and Kitchen on exterior walls for windows. Bathrooms internal between rooms.

Site area: ${schedule.siteExteriorW}m × ${schedule.siteExteriorH}m, ${schedule.totalBuildupArea} sqm total.${vertexStr ? ` Vertices: ${vertexStr}.` : ''}

Drawing style: professional 2D AutoCAD blueprint, solid black wall lines on white, clean technical labels showing room code + name + dimensions inside each room, bold flat labels "FLAT A" through "FLAT ${lastFlatLetter}", dimension lines on exterior walls. No furniture, no colors, no shadows, no 3D — pure black lines on white.`;
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
