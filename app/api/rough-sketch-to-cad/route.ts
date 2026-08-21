import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 300; // 5 min max

fal.config({ credentials: process.env.FAL_KEY });

async function uploadBase64ToFalStorage(dataUri: string): Promise<string> {
  const base64 = dataUri.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  const blob = new Blob([buffer], { type: 'image/png' });
  const file = new File([blob], 'rough_sketch.png', { type: 'image/png' });
  return fal.storage.upload(file);
}

function buildRoughSketchPrompt(): string {
  return `You are a licensed senior 2D architectural CAD drafter. EDIT AND CONVERT THE UPLOADED REFERENCE IMAGE into a clean, professional 2D architectural CAD floor plan.

### Input Reference Image Legend
* **Black area (outside)**: Exterior property / background
* **White area**: Exact building floor plate boundary footprint
* **Orange lines**: User-drawn rough interior room partition wall sketches
* **Black lines (if any)**: Main structural flat / wing divider cuts

### Critical Geometry Preservation
1. **Preserve the exact building footprint boundary**: Do NOT alter, reshape, simplify, rotate, resize, or replace the overall building shape. The building's exterior perimeter and wings must remain identical to the white area in the reference image.
2. **Convert orange lines into architectural CAD walls**: Treat each orange line as a room partition. Draft clean, straight, consistent-thickness interior CAD walls following the exact placement and room division logic of the orange lines.
3. **Sharpen & regularize**: Make wall lines perfectly straight, parallel, or perpendicular (90° angles). Ensure corner joints and T-intersections meet cleanly without stray gaps or overshoots. Balance mirrored wings symmetrically.

### CAD Drafting Specifications
* **View**: Pure 2D top-down orthographic CAD blueprint view (no 3D, no perspective, no elevation angles).
* **Color Palette**: Pure white background with crisp, solid black CAD wall linework only. No colored fills, no grey gradients, no drop shadows.
* **Openings**: Add standard architectural door openings with clean arc swings and simple window indicators on exterior walls.
* **Empty Rooms**: Keep every room completely clean and empty.
* **Strict Prohibitions**:
  - NO furniture (no beds, sofas, tables, chairs, sinks, stoves)
  - NO room name labels, dimensions, text, numbers, or annotations
  - NO people, vehicles, trees, plants, or landscaping
  - NO decorative textures, floor hatching, or shading

**Final Goal**: A pristine architectural CAD floor plan that looks like an architect imported the user's sketch into AutoCAD and drew precise, clean black walls over the white footprint, perfectly maintaining the building's geometry and room layout.`;
}

export async function POST(req: Request) {
  try {
    const { traceCanvasBase64, apiKey } = await req.json();

    if (!traceCanvasBase64) {
      return NextResponse.json({ error: 'traceCanvasBase64 is required.' }, { status: 400 });
    }

    const activeApiKey = apiKey || process.env.FAL_KEY;
    if (!activeApiKey) {
      return NextResponse.json({ error: 'FAL_KEY is missing.' }, { status: 400 });
    }

    const cleanApiKey = activeApiKey.replace(/\s+/g, '').replace(/[^a-zA-Z0-9:-]/g, '');
    fal.config({ credentials: cleanApiKey });

    console.log('[RoughSketchToCAD] Uploading sketch canvas to fal storage...');
    const uploadedSketchUrl = await uploadBase64ToFalStorage(traceCanvasBase64);
    console.log('[RoughSketchToCAD] Sketch uploaded:', uploadedSketchUrl);

    const prompt = buildRoughSketchPrompt();

    console.log('[RoughSketchToCAD] Calling GPT Image 2 (Medium) for sketch -> CAD conversion...');
    const result = await fal.subscribe('openai/gpt-image-2/edit', {
      input: {
        prompt,
        image_url: uploadedSketchUrl,
        image_size: 'square_hd',
        quality: 'medium',
        num_images: 1,
      },
    });

    const data = (result as any)?.data || result;
    const images = data?.images;

    if (!images || images.length === 0) {
      throw new Error('GPT Image 2 returned no images for rough sketch conversion.');
    }

    const imageUrl = images[0].url;
    const seed = data?.seed ?? (result as any)?.seed ?? null;

    console.log('[RoughSketchToCAD] CAD conversion complete:', imageUrl);

    return NextResponse.json({
      url: imageUrl,
      imageUrl,
      seed,
      workflow: 'rough-sketch-to-cad',
    });
  } catch (err: any) {
    console.error('[RoughSketchToCAD] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Rough sketch to CAD conversion failed.' },
      { status: 500 }
    );
  }
}
