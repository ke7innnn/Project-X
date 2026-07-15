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

function buildFloorPlanPrompt(schedule: RoomSchedule, sitePolygonPoints?: PolygonPoint[], circulationCore?: CirculationCore): string {
  const flatCount = schedule.flats.length;

  const flatList = schedule.flats.map(flat => {
    const roomCounts = flat.rooms.reduce((acc: Record<string, number>, r) => {
      acc[r.name] = (acc[r.name] || 0) + 1;
      return acc;
    }, {});
    return `${flat.name.toUpperCase()}: ` + Object.entries(roomCounts)
      .map(([name, count]) => `${count}x ${name}`)
      .join(', ');
  }).join('. ');

  const placementBlock = flatCount > 1
    ? `Distribute the ${flatCount} apartment units across the footprint to best fit the shape; one shared staircase and one lift at a central junction.`
    : `The apartment occupies the entire space.`;

  const layoutHint = schedule.layoutType ? `Layout Type: ${schedule.layoutType}. ` : '';

  return `Top-down 2D architectural floor plan, professional CAD blueprint, black line drawing on a white background.

The image contains one solid WHITE shape on a pure BLACK background. The white shape is the building footprint. The black area is outside the building.

Draw the complete floor plan so it FILLS THE ENTIRE white shape, edge to edge, with no empty white gaps and no margin between the rooms and the outline. The building's outer walls sit exactly on the edge of the white shape, tracing its outline precisely — every corner, every angle, every diagonal and step. Do not draw anything on the black area; it stays solid black and empty.

Inside the white shape, draw exactly ${flatCount} apartment unit(s):
[${flatList}.]
[${placementBlock}]
${layoutHint}Each apartment is a single connected group of its own rooms. You decide the best placement of the flats and rooms to perfectly fill the white space.

Line work: thin black double-line walls, doors shown as quarter-circle swing arcs, windows as short parallel ticks in the exterior walls. Print each room's name inside it in clear uppercase (LIVING, BEDROOM, KITCHEN, BATH) and one flat label per unit (FLAT A). Flat white room floors, crisp black-and-white technical drafting, no furniture, no color, no shadows.`;
}

export async function POST(req: Request) {
  try {
    const { imageBase64, maskBase64, visualTraceBase64, roomSchedule, imageSize = 'square', sitePolygonPoints, circulationCoreLocation } = await req.json();
    if (sitePolygonPoints && sitePolygonPoints.length > 0) {
      roomSchedule.sitePolygonPoints = sitePolygonPoints;
    }

    if (!imageBase64 || !visualTraceBase64 || !roomSchedule) {
      return NextResponse.json({ error: 'Missing images or roomSchedule' }, { status: 400 });
    }
    if (!maskBase64) {
      return NextResponse.json({ error: 'Mask image is required for inpainting' }, { status: 400 });
    }

    const SIZE_MAP: Record<string, { width: number; height: number }> = {
      'square_hd': { width: 1024, height: 1024 },
      'square': { width: 512, height: 512 },
      'landscape_4_3': { width: 1024, height: 768 },
      'landscape_16_9': { width: 1024, height: 576 },
      'portrait_4_3': { width: 768, height: 1024 },
      'portrait_16_9': { width: 576, height: 1024 },
    };
    const outputSize = SIZE_MAP[imageSize] || SIZE_MAP['square_hd'];
    console.log('[FloorPlan Step1] Output dimensions:', outputSize.width, '×', outputSize.height);

    // Bypassing fal.storage.upload to avoid 'Forbidden' bucket errors. 
    // We can pass the raw Base64 data URLs directly to the model.
    const uploadedUrl = imageBase64;
    const uploadedMaskUrl = maskBase64;

    const prompt = buildFloorPlanPrompt(roomSchedule, sitePolygonPoints, circulationCoreLocation);

    // 4. Call GPT-Image-2 (Step 1)
    console.log('[FloorPlan Step1] Calling GPT-Image-2...');
    const result = await fal.subscribe('openai/gpt-image-2/edit', {
      input: {
        image_url: uploadedUrl,
        mask_image_url: uploadedMaskUrl,
        prompt,
        quality: 'medium',
        image_size: outputSize,
        num_images: 1,
      },
    });

    const images = (result.data as any)?.images;
    if (!images || images.length === 0) {
      throw new Error('Fal.ai returned no images');
    }

    const falUrl = images[0].url;
    console.log('[FloorPlan Step1] Generated Step 1 URL:', falUrl);

    // Convert fal.ai URL to base64 immediately — fal.ai URLs expire quickly (TTL ~60s).
    // Returning a data URL guarantees the image is permanently usable across all pipeline steps.
    let imageBase64DataUrl = falUrl;
    try {
      const imgFetch = await fetch(falUrl);
      if (!imgFetch.ok) throw new Error(`HTTP ${imgFetch.status}`);
      const contentType = imgFetch.headers.get('content-type') || 'image/png';
      const imgBuffer = await imgFetch.arrayBuffer();
      const base64 = Buffer.from(imgBuffer).toString('base64');
      imageBase64DataUrl = `data:${contentType};base64,${base64}`;
      console.log('[FloorPlan Step1] Converted to base64 data URL, size:', base64.length);
    } catch (fetchErr: any) {
      console.warn('[FloorPlan Step1] Could not convert to base64, falling back to URL:', fetchErr.message);
    }

    return NextResponse.json({
      imageUrl: imageBase64DataUrl,
      traceUrl: '',
      prompt: prompt
    });

  } catch (err: any) {
    console.error('[FloorPlan Step1] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 });
  }
}
