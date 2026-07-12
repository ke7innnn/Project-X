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
    const basePrefix = "IMPORTANT: The first image is the Base Layout. The second image is the exact Trace Boundary. You MUST use the second image as your rigid outer boundary constraint.\n\n";
    const prompt = mastermindPrompt ? (basePrefix + mastermindPrompt) : (basePrefix + `Redraw the first image (which is a clean vector schematic layout) into a highly professional, clean 2D CAD architectural floor plan blueprint. The layout MUST fit strictly inside the boundary shape defined by the black line in the second image (which is the trace outer boundary). Draw straight double-line walls, clean room corners, sliding doors, windows, and place standard labels inside the rooms. Make sure the background is clean white and the walls are crisp black lines. Do not draw anything outside the boundary defined in the second image.`);

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

    const imageUrls = [images[0].url];
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
