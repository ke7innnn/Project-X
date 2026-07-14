import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 60; // 60s timeout for Vercel functions

fal.config({ credentials: process.env.FAL_KEY });

/**
 * POST /api/generate-floorplan-image (Step 2/3)
 * Body: { schematicBase64: string, traceCanvasBase64: string, aspectRatio: string }
 * Uses Nano Banana Pro Edit (Gemini 3 Pro Edit) to render the schematic into a CAD blueprint.
 */
export async function POST(req: Request) {
  try {
    const { schematicBase64, traceCanvasBase64, aspectRatio = '1:1', mastermindPrompt } = await req.json();

    if (!schematicBase64 || !traceCanvasBase64) {
      return NextResponse.json({ error: 'Missing schematicBase64 or traceCanvasBase64' }, { status: 400 });
    }

    console.log('[FloorPlan Step3] Initializing CAD Polish pipeline with Nano Banana Pro Edit...');

    // 1. We bypass fal.storage.upload to avoid 'Forbidden' bucket errors or Vercel fetch timeouts with huge files.
    // We can pass the raw Base64 data URLs directly to the model.
    const uploadedSchematicUrl = schematicBase64;
    const uploadedTraceUrl = traceCanvasBase64;

    // 3. Build prompt for Nano Banana Pro Edit
    const geometryRules = `Reference Image: IMAGE 1 = architectural organization only
Constraint Image: IMAGE 2 = exact building footprint (ground truth geometry)

The red boundary is the ground truth geometry. IMAGE 1 is only a reference for architectural organization.

IMAGE 2 defines the exact building footprint. The red boundary IS the final exterior wall and is an absolute geometric constraint, not a guide.

Every point inside the red boundary must belong to the building. No enclosed voids, unused space, blank regions, or gaps are permitted. Every point must be part of a room, corridor, wall, core, shaft, or service space.

You may completely reconstruct, resize, relocate, reshape, split, merge, or add rooms and corridors as necessary. Preserve the overall architectural organization, circulation, and apartment relationships from IMAGE 1 while freely reconstructing the geometry. Completely reconstruct the floor plan so the footprint and layout appear to have been designed together from the beginning.

Priority:
1. Match the red boundary exactly.
2. Eliminate all interior voids.
3. Preserve realistic architecture.
4. Preserve the organization of IMAGE 1.

Incorrect outputs include:
- any unused interior space
- any gap between rooms and the exterior wall
- exterior walls not coinciding with the boundary
- disconnected building wings
- distorted or obviously stretched layouts

Maintain realistic circulation, room adjacency, wall alignment, architectural symmetry where appropriate, and recognizable flats, stairs, lifts, and cores. Do not preserve the original exterior wall if it conflicts with the supplied boundary. Nothing may extend outside the boundary.`;

    const styleRules = `Output a clean professional 2D CAD floor plan with black double-line walls, white interior, room labels, door swing arcs, exterior windows, and a solid black background outside the boundary. No furniture, textures, colors, gradients, shadows, or 3D effects.`;

    const prompt = `
${geometryRules}

Additional design preferences (follow only if they do not violate the geometric constraints above):
${mastermindPrompt || ''}

${styleRules}
`.trim();

    // 4. Call Nano Banana Pro Edit
    const result = await fal.subscribe('fal-ai/nano-banana-pro/edit', {
      input: {
        image_urls: [uploadedSchematicUrl, uploadedTraceUrl], // Pass both schematic and trace reference
        prompt,
      },
    });

    const images = (result as any)?.images || (result.data as any)?.images;
    if (!images || images.length === 0) {
      throw new Error('Nano Banana Pro Edit returned no images');
    }

    const imageUrl = images[0].url;
    console.log('[FloorPlan Step3] Output URL:', imageUrl);

    // Wait for the CDN to propagate the file before fetching it
    let isReady = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const headRes = await fetch(imageUrl, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
        if (headRes.status === 200) {
          isReady = true;
          console.log(`[FloorPlan Step3] CDN URL is ready after ${attempt + 1} attempt(s)`);
          break;
        }
      } catch (e: any) {
        console.warn(`[FloorPlan Step3] CDN propagation check failed (attempt ${attempt + 1}):`, e.message);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!isReady) {
      console.warn(`[FloorPlan Step3] CDN URL did not return 200 after 10 attempts: ${imageUrl}`);
    }

    // Convert to base64 immediately — fal.ai/nano-banana-pro URLs expire.
    // Using a permanent data URL guarantees the image renders in the browser at any time.
    let finalImageUrl = imageUrl;
    try {
      const imgFetch = await fetch(imageUrl);
      if (!imgFetch.ok) throw new Error(`HTTP ${imgFetch.status}`);
      const contentType = imgFetch.headers.get('content-type') || 'image/png';
      const imgBuffer = await imgFetch.arrayBuffer();
      const base64 = Buffer.from(imgBuffer).toString('base64');
      finalImageUrl = `data:${contentType};base64,${base64}`;
      console.log('[FloorPlan Step3] Converted output to base64 data URL, size:', base64.length);
    } catch (fetchErr: any) {
      console.warn('[FloorPlan Step3] Could not convert to base64, falling back to URL:', fetchErr.message);
    }

    const imageUrls = [finalImageUrl];
    console.log('[FloorPlan Step3] Success polishing schematic into CAD floor plan using Nano Banana Pro Edit.');

    return NextResponse.json({
      imageUrls,
      systemPrompt: prompt,
      userPrompt: `SCHEMATIC IMAGE: [Mastermind Output]\nTRACE IMAGE: [Trace Boundary]\nMODEL: fal-ai/nano-banana-pro/edit`
    });

  } catch (err: any) {
    console.error('[FloorPlan Step3] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'CAD polish rendering failed' }, { status: 500 });
  }
}
