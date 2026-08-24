import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 120;

fal.config({ credentials: process.env.FAL_KEY });

async function uploadBase64ToFalStorage(base64Data: string): Promise<string> {
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  const file = new File([new Blob([buffer], { type: 'image/png' })], 'concept_board.png', { type: 'image/png' });
  return await fal.storage.upload(file);
}

async function fetchToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`);
  const ct = res.headers.get('content-type') || 'image/png';
  const buf = await res.arrayBuffer();
  return `data:${ct};base64,${Buffer.from(buf).toString('base64')}`;
}

async function runModel(falModel: string, input: Record<string, any>): Promise<{ url: string; seed?: number }> {
  const result = await fal.subscribe(falModel, { input });
  const images = (result as any)?.images || (result.data as any)?.images;
  if (!images || images.length === 0) throw new Error(`${falModel} returned no images`);
  return { url: images[0].url, seed: (result as any)?.seed };
}

const CONCEPT_TO_CAD_PROMPT = `EXTRACT & TRANSFORM 2D FLOOR PLAN INTO CLEAN ARCHITECTURAL CAD LINE DRAWING:

1. FOCUS STRICTLY ON THE LEFT 2D FLOOR PLAN:
- Look ONLY at the 2D architectural master floor plan located on the LEFT side of the input presentation sheet.
- Isolate and extract ONLY this 2D floor plan plate. Completely ignore and discard the 3D roof top views, 3D perspective elevations, and summary tables from the right side.

2. PURE BLACK-AND-WHITE CAD BLUEPRINT LINE-ART FORMAT:
- BACKGROUND: 100% pure solid white (#FFFFFF). Absolutely zero textures, no wood decking, no marble fills, no gradients, no beige backgrounds.
- LINEWORK: Razor-sharp, crisp, solid black (#000000) vector CAD lines and outlines.
- STRUCTURAL WALLS: Thick, solid black double-line exterior perimeter walls and interior partition demising walls.
- DOORWAYS & CIRCULATION: Clear door openings with visible 90-degree curved door swing arcs.
- CENTRAL CORE: Clear staircase step treads with UP/DN arrows, and elevator shaft boxes.
- ROOMS & FIXTURES: Clean, minimal line-art architectural outlines of room furniture (beds, sofas, sanitary ware, kitchen counters, dining sets).
- FULL SHEET ORIENTATION: Direct orthographic 2D top-down plan view filling the sheet cleanly on pure white backdrop.

3. STRICT PROHIBITIONS:
- ABSOLUTELY NO 3D angles, NO perspective views, NO axonometric shadows.
- ABSOLUTELY NO colors, NO grey shading, NO photographic textures.
- Pure black lines on solid white background only, perfectly optimized for raster-to-DXF CAD conversion.`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { conceptBoardBase64, apiKey } = body;

    if (!conceptBoardBase64) {
      return NextResponse.json({ error: 'conceptBoardBase64 image is required.' }, { status: 400 });
    }

    const activeApiKey = apiKey || process.env.FAL_KEY;
    if (!activeApiKey) {
      return NextResponse.json({ error: 'FAL_KEY is missing.' }, { status: 400 });
    }

    const cleanApiKey = activeApiKey.replace(/\s+/g, '').replace(/[^a-zA-Z0-9:-]/g, '');
    fal.config({ credentials: cleanApiKey });

    console.log('[ConceptToCAD] Uploading concept board image to fal storage...');
    const uploadedBoardUrl = await uploadBase64ToFalStorage(conceptBoardBase64);
    console.log('[ConceptToCAD] Concept board uploaded:', uploadedBoardUrl);

    console.log('[ConceptToCAD] Calling GPT Image 2 (Edit) to extract 2D CAD line drawing...');
    const gptRes = await runModel('openai/gpt-image-2/edit', {
      image_urls: [uploadedBoardUrl],
      prompt: CONCEPT_TO_CAD_PROMPT,
      quality: 'medium',
    });

    console.log('[ConceptToCAD] Fetching CAD result to base64...');
    const cadBase64 = await fetchToBase64(gptRes.url);
    console.log('[ConceptToCAD] CAD Line Plan generated successfully!');

    return NextResponse.json({
      cadImageUrl: cadBase64,
      url: cadBase64,
      seed: gptRes.seed ?? null,
      workflow: 'concept-to-cad',
    });
  } catch (err: any) {
    console.error('[ConceptToCAD] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Converting Concept Board to 2D CAD failed.' },
      { status: 500 }
    );
  }
}
