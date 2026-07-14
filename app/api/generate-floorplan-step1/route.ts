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
  const bhk = detectBHKType(schedule.flats[0]?.rooms || []);

  let hasDiagonals = false;
  if (sitePolygonPoints && sitePolygonPoints.length >= 3) {
    for (let i = 0; i < sitePolygonPoints.length; i++) {
      const a = sitePolygonPoints[i];
      const b = sitePolygonPoints[(i + 1) % sitePolygonPoints.length];
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      if (dx > 0.5 && dy > 0.5) {
        hasDiagonals = true;
        break;
      }
    }
  }

  const wallRule = hasDiagonals
    ? `Internal walls must be orthogonal. Rooms touching the diagonal boundary must follow those diagonal edges exactly — do not approximate slanted walls with steps or flat shoulders.`
    : `All walls must be perfectly orthogonal — horizontal and vertical only. No diagonal or triangular rooms.`;

  const flatList = schedule.flats.map(flat => {
    const roomCounts = flat.rooms.reduce((acc: Record<string, number>, r) => {
      acc[r.name] = (acc[r.name] || 0) + 1;
      return acc;
    }, {});
    return `  ${flat.name}:\n` + Object.entries(roomCounts)
      .map(([name, count]) => `    • ${name} ×${count}`)
      .join('\n');
  }).join('\n');

  const coreBlock = flatCount > 1
    ? `Shared circulation core: one staircase and one lift shaft, positioned where it best serves all flats. Corridors max 1.5 m wide. No double lifts, ring corridors, or oversized lobbies.`
    : `No shared core. Private doors and direct room-to-room flow only.`;

  const zoneBlock = flatCount > 1
    ? `Distribute the ${flatCount} flats across the footprint in contiguous zones sharing the central core. Produce the most plausible residential layout for this footprint while satisfying all program requirements.`
    : `Produce the most plausible single-residence layout for this footprint while satisfying all program requirements.`;

  const layoutHint = schedule.layoutType
    ? `\nLAYOUT NOTE: ${schedule.layoutType}`
    : '';

  return `BUILDING ENVELOPE

The white polygon in the image is the building envelope — the complete exterior wall of the building, already designed and fixed. The black area surrounding it is exterior void and must remain untouched.

The exterior wall geometry is already finalized. Do not reinterpret, simplify, round, or modify the building outline.

---

TASK

The building envelope is already complete.

Subdivide the enclosed floor area into a complete residential floor plan.

Do not redesign the building shape. Design only the interior partition walls and circulation.

${zoneBlock}

${wallRule}

---

ARCHITECTURAL PROGRAM

${flatCount > 1 ? `${flatCount} independent flats sharing a central circulation core.` : `1 private residence.`}

Required rooms per flat (do not omit, duplicate, merge, or invent rooms):
${flatList}

${coreBlock}
${layoutHint}

---

DESIGN PRINCIPLES

- Partition the footprint rather than placing a floor plan inside it.
- Bedrooms and living rooms on exterior walls for daylight.
- Kitchens and bathrooms clustered for services.
- Balanced room proportions throughout — no distorted or leftover voids.
- Every enclosed area must be purposeful: room, corridor, core, storage, or service void.

---

RENDERING

Clean 2D CAD floor plan. Black wall lines on white room interiors. Room labels in every space. Door swing arcs and window panes on exterior walls. No furniture, fills, gradients, or shading. Solid black outside the envelope.`;
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
        image_urls: [uploadedUrl],
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
