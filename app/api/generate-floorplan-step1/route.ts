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

  const diagonalRule = hasDiagonals
    ? `- Orthogonal Internal Walls: All internal room dividers must be orthogonal (perfectly horizontal and vertical). However, any rooms that touch the diagonal outer boundary walls MUST have diagonal outer walls that align with the trace exactly. Do NOT draw flat horizontal or vertical shoulders at the corners to avoid diagonal walls; the outer walls of the rooms must follow the slanted trace lines directly from the corner.`
    : `- Orthogonal Walls: All walls and room dividers (both internal and external) MUST be orthogonal (perfectly horizontal and vertical, forming clean 90-degree rectangular rooms). Avoid drawing diagonal, slanted, or triangular rooms.`;

  const circulationRule = flatCount > 1
    ? `- Include a highly compact, space-efficient circulation core containing one standard staircase and EXACTLY ONE small elevator shaft (LIFT). 
- Place this core in the widest part of the site or against a flat wall. DO NOT force it into the geometric center if the site is narrow/pinched in the middle, as that will push rooms out of the boundary.
- DO NOT draw double elevators, and DO NOT draw a full loop/ring corridor around the core.
- Lobbies and corridors MUST be extremely compact, with a maximum width of 1.2m to 1.5m. Use a simple straight or T-shaped corridor to distribute access. Save as much space as possible.`
    : `- DO NOT draw any public elevator banks, public staircases, or public lobbies. This is a single, private individual residence/bungalow.
- Design it purely as a single home layout, utilizing private doors and direct room-to-room flow (no public corridors).`;

  const layoutSpecificInstructions = schedule.layoutType
    ? `\n\nLAYOUT STRATEGY & ROOM POSITIONING GUIDE (MUST OBEY):\n- Follow this exact spatial layout strategy: ${schedule.layoutType}. Arrange the rooms, corridors, stairs, and entrance lobbies strictly according to these layout directions.`
    : '';

  const flatList = schedule.flats.map(flat => {
    const roomCounts = flat.rooms.reduce((acc: Record<string, number>, r) => {
      acc[r.name] = (acc[r.name] || 0) + 1;
      return acc;
    }, {});
    const roomListStr = Object.entries(roomCounts)
      .map(([name, count]) => `${count}x ${name}`)
      .join(', ');
    return `- ${flat.name}: Must contain exactly [ ${roomListStr} ]`;
  }).join('\n');

  return `2D architectural floor plan, professional AutoCAD layout blueprint style. Clean black wall lines and labels, with white interior floors.

CRITICAL BOUNDARY RULE — READ THIS FIRST:
The image has a solid BLACK background representing empty space, with a bright WHITE polygon representing the building footprint in the center. 
You MUST draw the entire floor plan strictly inside the WHITE polygon. 
- COMPACT & SHRINK TO FIT (100% FREEDOM): You have absolute freedom to make the rooms, bathrooms, and kitchens as small and compact as needed. If the footprint is small or narrow, you MUST scale down and shrink all room and flat dimensions to make them very compact so that they comfortably fit inside the polygon. Prioritize packing all required rooms inside the boundary over making them large.
- 100% INSIDE: The solid black background area outside the white polygon MUST remain completely empty and black. DO NOT add any extra outer layer, DO NOT expand the building footprint, DO NOT extend walls into the black area. 
- RESPECT GEOMETRY: Draw the outer walls to trace the exact shape of the white polygon footprint. If the polygon has indents, steps, or diagonal lines, the outer walls must step or slope accordingly.

EXACT ROOM REQUIREMENTS PER FLAT (YOU MUST INCLUDE ALL OF THEM):
${flatList}

Layout requirements:
- Compact, high-efficiency residential floor plan containing exactly ${flatCount} separate flats, configured as ${bhk}BHK units.
- All flats must be drawn INWARD from the polygon edge, strictly fitting within the interior but NEVER extending past the outer boundary.
${circulationRule}
- STRICT ROOM COUNT (CRITICAL FAIL IF IGNORED): You MUST meticulously count every single room before finishing. Each flat MUST contain EXACTLY the rooms listed above. If the list says 3 bedrooms per flat, you must draw 3 distinct bedrooms for EVERY flat. DO NOT merge rooms, DO NOT omit kitchens, DO NOT skip bathrooms. Every single required room must be present in the final image!
${diagonalRule}
- VENTILATION & COURTYARDS: You are encouraged to leave empty black pockets (open shafts, air wells, or small courtyards) inside the footprint for ventilation. Do not over-inflate room sizes to force-fill every pixel; keeping rooms compact and well-ventilated is much better.
- Standard residential zoning: Living rooms near entrances, bedrooms and kitchens along exterior walls for windows.

Drawing Aesthetics:
- Clean, minimal, technical black-and-white drafting style. Pure black lines on white interior floors.
- The exterior space OUTSIDE the building must remain SOLID BLACK.
- Crisp, legible architectural labels inside major spaces (e.g., "LIVING", "BEDROOM", "KITCHEN").
- Standard architectural symbols: door openings with 90-degree swing arcs, window panes in exterior walls.
- ABSOLUTELY NO furniture, no color fills, no textures, no gray gradients, no 3D elements. Pure 2D schematic blueprint lines.`;
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
      'square_hd':      { width: 1024, height: 1024 },
      'square':         { width: 512,  height: 512  },
      'landscape_4_3':  { width: 1024, height: 768  },
      'landscape_16_9': { width: 1024, height: 576  },
      'portrait_4_3':   { width: 768,  height: 1024 },
      'portrait_16_9':  { width: 576,  height: 1024 },
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

    console.log('[FloorPlan Step1] Generated Step 1 URL:', images[0].url);

    return NextResponse.json({
      imageUrl: images[0].url,
      traceUrl: '', // The frontend already has visualTraceBase64 and passes it natively to Step 2
      prompt: prompt
    });

  } catch (err: any) {
    console.error('[FloorPlan Step1] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 });
  }
}
