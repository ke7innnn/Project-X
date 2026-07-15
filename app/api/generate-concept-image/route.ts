import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 60; // 60s timeout for Vercel functions

fal.config({ credentials: process.env.FAL_KEY });

/**
 * POST /api/generate-concept-image
 * Body: { traceCanvasBase64: string }
 * Uses Nano Banana Pro Edit to invent a concept floor plan inside an empty trace boundary.
 */
export async function POST(req: Request) {
  try {
    const { traceCanvasBase64 } = await req.json();

    if (!traceCanvasBase64) {
      return NextResponse.json({ error: 'Missing traceCanvasBase64' }, { status: 400 });
    }

    console.log('[ConceptGenerator] Initializing xai/grok-imagine-image/edit for concept generation...');

    const uploadedTraceUrl = traceCanvasBase64;

    const prompt = `The input image is a building boundary. The exterior background is solid black. The interior building footprint is solid white, enclosed by a red border line.

Redraw this shape as a highly detailed, professional 2D CAD architectural floor plan blueprint inside the white area.

RULES:
- Keep the background outside the shape solid black. Do not paint anything on the black area.
- The outer walls of the floor plan must sit exactly on the red boundary line, matching its shape precisely.
- Ignore the black area completely; only edit and paint inside the white sheet.
- You must subdivide the white area into multiple independent apartments/flats (e.g. FLAT A, FLAT B) and a shared circulation area (corridor, staircase, lift) if the space allows.
- Fill the entire white area with rooms, corridors, and service shafts so that there are zero empty white spaces or gaps remaining.
- The layout must consist of standard configurations (1BHK, 2BHK, 3BHK, or 4BHK units).
  * A 1BHK has exactly: 1x Living Room, 1x Kitchen, 1x Bedroom, 1x Bathroom.
  * A 2BHK has exactly: 1x Living Room, 1x Kitchen, 2x Bedroom, 1x Bathroom/WC.
  * A 3BHK has exactly: 1x Living Room, 1x Kitchen, 3x Bedroom, 2x Bathroom.
  * A 4BHK has exactly: 1x Living Room, 1x Kitchen, 4x Bedroom, 3x Bathroom.
- Style: thin black double-line walls, doors shown as swing arcs, windows as ticks in exterior walls, and crisp room labels in uppercase (LIVING, BEDROOM, KITCHEN, BATH, CORRIDOR).
- Flat white room floors, black-and-white drafting, no furniture, no color fills, no shading, and no 3D elements.`;

    const result = await fal.subscribe('xai/grok-imagine-image/edit', {
      input: {
        image_url: uploadedTraceUrl,
        prompt,
      },
    });

    const images = (result as any)?.images || (result.data as any)?.images;
    if (!images || images.length === 0) {
      throw new Error(`xai/grok-imagine-image/edit returned no images`);
    }

    const imageUrl = images[0].url;
    console.log(`[ConceptGenerator] Output URL:`, imageUrl);

    // Wait for CDN propagation
    let isReady = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const headRes = await fetch(imageUrl, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
        if (headRes.status === 200) {
          isReady = true;
          break;
        }
      } catch (e: any) {
        console.warn(`[ConceptGenerator] CDN check failed (attempt ${attempt + 1}):`, e.message);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    let finalImageUrl = imageUrl;
    try {
      const imgFetch = await fetch(imageUrl);
      if (!imgFetch.ok) throw new Error(`HTTP ${imgFetch.status}`);
      const contentType = imgFetch.headers.get('content-type') || 'image/png';
      const imgBuffer = await imgFetch.arrayBuffer();
      const base64 = Buffer.from(imgBuffer).toString('base64');
      finalImageUrl = `data:${contentType};base64,${base64}`;
    } catch (fetchErr: any) {
      console.warn(`[ConceptGenerator] Could not convert to base64:`, fetchErr.message);
    }

    return NextResponse.json({
      imageUrls: [finalImageUrl],
      systemPrompt: prompt,
      userPrompt: `TRACE IMAGE: [Trace Boundary]\nMODEL: xai/grok-imagine-image/edit`
    });

  } catch (err: any) {
    console.error('[ConceptGenerator] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Concept generation failed' }, { status: 500 });
  }
}
