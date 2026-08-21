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
  return `Use the uploaded reference image as the **strict geometric reference** and convert it into a clean, professional **2D architectural CAD floor plan**.

**CRITICAL: Preserve the exact overall building geometry from the reference. Do NOT change, straighten, simplify, rotate, resize, or redesign the building shape.** The final plan must clearly maintain the same footprint, proportions, orientation, and arrangement as the reference sketch.

**Orange lines in the reference image represent rough interior room partitions drawn by the user.** Convert these orange partition hints into clean architectural CAD room walls. Follow the same room division logic and partition arrangement visible in the reference image. Keep the rooms empty — **no furniture, beds, sofas, tables, vehicles, people, plants, or decorative objects**.

Sharpen and regularize the geometry — straighten slightly skewed lines, make intersections crisp, balance symmetrical sections to appear mirrored and equal — but do NOT change the overall footprint or room arrangement. Treat this as a rough freehand sketch that needs to be professionally redrawn by an architect in AutoCAD.

Do NOT add any room name labels or flat labels inside the rooms. Leave rooms completely empty and unlabeled.

### CAD Drafting Style

* Professional AutoCAD / architectural floor-plan appearance
* Pure **2D top-down orthographic view**
* Clean **black wall outlines on a white background**
* Consistent wall thickness
* Straight, precise architectural lines
* Clean corners and accurate intersections
* Clear door openings and simple door swings where appropriate
* Windows/openings can be represented using standard architectural CAD symbols
* Clearly separate every room
* No perspective, No 3D rendering, No shadows, No textures
* No colors (black linework on white only)
* No furniture, No landscaping, No exterior decoration
* No room labels or text inside rooms

### Geometry Preservation

The **building footprint is the highest-priority requirement**. Keep the overall shape exactly in the same configuration as the reference sketch. The orange interior lines define room partitions — respect their general location and direction but convert them into clean, professional CAD wall lines.

The final result should look like the uploaded rough sketch has been **professionally redrawn by an architect in AutoCAD**, with the same building footprint and the same room organization, but with rough sketch lines replaced by precise CAD walls and clean empty rooms.

**Output:** clean professional architectural floor plan, top view, white background, black CAD linework, exact building shape preserved, empty rooms without any labels or furniture.`;
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
