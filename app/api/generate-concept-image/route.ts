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

    console.log('[ConceptGenerator] Initializing Nano Banana Pro Edit for concept generation...');

    const uploadedTraceUrl = traceCanvasBase64;

    const prompt = `IMAGE 1 is an empty boundary trace on a white background. IMAGE 2 is the exact same empty boundary trace.

Fill this entire shape with a beautiful, creative, and highly detailed conceptual floor plan. You decide how many rooms, flats, or spaces to add. 

FILL RULES:
- Ensure the outer walls sit perfectly on the red/black boundary edge.
- Fill the entire space with rooms and corridors.
- Zero empty pockets inside the boundary.

Style: professional 2D CAD blueprint, thin black double-line walls, door swing arcs, window ticks, crisp room labels in uppercase. Outside the boundary must be solid black.`;

    const result = await fal.subscribe('fal-ai/nano-banana-pro/edit', {
      input: {
        image_urls: [uploadedTraceUrl, uploadedTraceUrl], // Pass trace as both source and controlnet
        prompt,
      },
    });

    const images = (result as any)?.images || (result.data as any)?.images;
    if (!images || images.length === 0) {
      throw new Error(`Nano Banana Pro Edit returned no images`);
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
      userPrompt: `TRACE IMAGE: [Trace Boundary]\nMODEL: fal-ai/nano-banana-pro/edit`
    });

  } catch (err: any) {
    console.error('[ConceptGenerator] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Concept generation failed' }, { status: 500 });
  }
}
