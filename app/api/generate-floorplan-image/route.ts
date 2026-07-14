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
    const boundaryRules = `BOUNDARY CONSTRAINT (ABSOLUTE HARD RULES — VIOLATION = COMPLETE FAILURE):
IMAGE 1 = the floor plan schematic layout to reproduce.
IMAGE 2 = the SACRED OUTER BOUNDARY. Every single wall, room, label, and line in your output MUST sit completely INSIDE this boundary shape. This is non-negotiable.

RULE 1 — OUTER WALLS MUST TRACE THE BOUNDARY: The outermost building walls MUST follow the exact edge of the boundary polygon from IMAGE 2. The building perimeter IS the boundary line. Do NOT draw anything outside it.
RULE 2 — NO OVERFLOW: If any room would overflow outside the boundary shape, you MUST shrink it, remove it, or reshape it until it fits entirely inside. NOTHING can extend past the boundary line.
RULE 3 — SOLID BLACK BACKGROUND: Any area OUTSIDE the boundary polygon MUST remain completely solid black. Do not put walls, rooms, labels, or any content in the black background area.
RULE 4 — RESPECT THE SHAPE: The boundary in IMAGE 2 is a Y-shape (or whatever irregular shape is shown). Your output floor plan must fit within that exact Y-shape (or other shape). Do NOT square it off or extend wings beyond the boundary tips.
RULE 5 — NO PARTIAL ROOMS AT EDGES: Do NOT let a room start inside the boundary and then have its wall continue outside. All rooms must be complete closed rectangles fully contained within the boundary.`;

    const basePrefix = boundaryRules + "\n\n";
    const fallbackPrompt = `Redraw IMAGE 1 (the schematic layout) as a professional 2D CAD architectural floor plan. STRICT RULE: ALL content must be inside the boundary from IMAGE 2. Clean black double-line walls on white floors. Add door swing arcs, window panes, and room labels. Background outside the boundary = solid black. Zero tolerance for overflow.`;
    const prompt = mastermindPrompt ? (basePrefix + mastermindPrompt) : (basePrefix + fallbackPrompt);

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
