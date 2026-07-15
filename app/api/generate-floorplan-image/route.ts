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
    const fallbackPrompt = `Redraw IMAGE 1 (the schematic layout) as a professional 2D CAD architectural floor plan. Clean black double-line walls on white floors. Add door swing arcs, window panes, and room labels. Background outside the boundary = solid black. Maximize the layout footprint so that the rooms stretch to touch and fill the boundary shape from IMAGE 2.`;
    const prompt = mastermindPrompt || fallbackPrompt;

    // 4. Call Nano Banana Pro Edit — fire 2 parallel generations with different seeds
    const generateOne = async (seedLabel: string) => {
      const result = await fal.subscribe('fal-ai/nano-banana-pro/edit', {
        input: {
          image_urls: [uploadedSchematicUrl, uploadedTraceUrl],
          prompt,
        },
      });

      const images = (result as any)?.images || (result.data as any)?.images;
      if (!images || images.length === 0) {
        throw new Error(`Nano Banana Pro Edit (${seedLabel}) returned no images`);
      }

      const imageUrl = images[0].url;
      console.log(`[FloorPlan Step3] Output URL (${seedLabel}):`, imageUrl);

      // Wait for the CDN to propagate the file before fetching it
      let isReady = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const headRes = await fetch(imageUrl, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
          if (headRes.status === 200) {
            isReady = true;
            console.log(`[FloorPlan Step3] CDN URL is ready (${seedLabel}) after ${attempt + 1} attempt(s)`);
            break;
          }
        } catch (e: any) {
          console.warn(`[FloorPlan Step3] CDN propagation check failed (${seedLabel}, attempt ${attempt + 1}):`, e.message);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!isReady) {
        console.warn(`[FloorPlan Step3] CDN URL did not return 200 after 10 attempts (${seedLabel}): ${imageUrl}`);
      }

      // Convert to base64 immediately — fal.ai/nano-banana-pro URLs expire.
      let finalImageUrl = imageUrl;
      try {
        const imgFetch = await fetch(imageUrl);
        if (!imgFetch.ok) throw new Error(`HTTP ${imgFetch.status}`);
        const contentType = imgFetch.headers.get('content-type') || 'image/png';
        const imgBuffer = await imgFetch.arrayBuffer();
        const base64 = Buffer.from(imgBuffer).toString('base64');
        finalImageUrl = `data:${contentType};base64,${base64}`;
        console.log(`[FloorPlan Step3] Converted (${seedLabel}) to base64, size:`, base64.length);
      } catch (fetchErr: any) {
        console.warn(`[FloorPlan Step3] Could not convert (${seedLabel}) to base64:`, fetchErr.message);
      }

      return finalImageUrl;
    };

    // Fire a single generation
    const img1 = await generateOne('seed-1');

    const imageUrls = [img1];
    console.log(`[FloorPlan Step3] Success — generated 1 variation.`);

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
