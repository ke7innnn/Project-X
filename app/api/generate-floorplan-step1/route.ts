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
- ZERO TOLERANCE FILL RULE: Every single square centimeter of the WHITE polygon area must contain a room, corridor, wall, or labeled space. There must be ZERO remaining white/empty space inside the polygon when you are finished. If any white pixel remains unfilled inside the polygon boundary, you have FAILED.
- WING TIP FILL MANDATE: If the polygon has arms, wings, tips, or any protruding extremities (like a cross, T-shape, L-shape, Y-shape, or star), you MUST push rooms all the way to the very tip of every single arm. Bedrooms and kitchens go at the wing tips. Do NOT stop rooms short of the polygon edge. The outer wall of each room must TOUCH the polygon boundary at every point. No room may end before reaching the boundary.
- FILL THE FOOTPRINT: You must stretch, scale, and align the outer walls of the floor plan so that they completely touch and follow the borders of the bright WHITE polygon. Do not leave large empty white spaces inside the polygon; maximize the layout to fill the entire building footprint.
- 100% INSIDE: The solid black background area outside the white polygon MUST remain completely empty and black. DO NOT add any extra outer layer, DO NOT expand the building footprint, DO NOT extend walls into the black area. 
- RESPECT GEOMETRY: Draw the outer walls to trace the exact shape of the white polygon footprint. If the polygon has indents, steps, or diagonal lines, the outer walls must step or slope accordingly.

EXACT ROOM REQUIREMENTS PER FLAT (YOU MUST INCLUDE ALL OF THEM):
${flatList}

Layout requirements:
- Compact, high-efficiency residential floor plan containing exactly ${flatCount} separate flats, configured as ${bhk}BHK units.
- EACH FLAT MUST BE A SINGLE, UNBROKEN CONTIGUOUS UNIT: All rooms belonging to a single flat (e.g. FLAT A) MUST be grouped together side-by-side inside a single cohesive wing or zone of the building footprint. You are STRICTLY FORBIDDEN from splitting rooms of the same flat across different wings, and they must not be separated by public corridors or other flats.
- ONE FLAT PER WING/ZONE: For irregular shapes with multiple wings (like Y-shape, L-shape, Cruciform, Butterfly, T-shape, H-shape), assign exactly one flat to each wing. The center intersection where the wings meet should contain the shared corridor, stairs, and lift core, serving as the central transition between the independent flats.
- PUSH ROOMS TO EXTREMITIES: Place bedrooms and kitchens at the far ends of each wing. Living rooms go closer to the center core. Every wing tip must have a room that extends all the way to the boundary edge — no empty pockets allowed.
- NO ROOM DUPLICATIONS OR FILLERS: Do not draw extra copies or duplicate rooms of a flat in another wing. Once a flat has its rooms drawn in its designated wing, do not draw any of its rooms anywhere else.
- All flats must touch the polygon edge and fit within the interior, never extending past the outer boundary.
${circulationRule}
- STRICT ROOM COUNT (CRITICAL FAIL IF IGNORED): You MUST meticulously count every single room before finishing. Each flat MUST contain EXACTLY the rooms listed above. If the list says 3 bedrooms per flat, you must draw 3 distinct bedrooms for EVERY flat. DO NOT merge rooms, DO NOT omit kitchens, DO NOT skip bathrooms. Every single required room must be present in the final image!
${diagonalRule}
- VENTILATION & COURTYARDS: You can leave empty black pockets (open shafts, air wells, or small courtyards) for ventilation if necessary, but you should maximize room sizes to make sure the floor plan fills the white polygon outline nicely.
- Standard residential zoning: Living rooms near entrances, bedrooms and kitchens along exterior walls for windows.${layoutSpecificInstructions}

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
