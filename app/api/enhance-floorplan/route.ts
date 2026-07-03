import { NextResponse } from 'next/server';

const FAL_KEY = process.env.FAL_KEY!;

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'Missing imageBase64 in request body' }, { status: 400 });
    }

    if (!FAL_KEY) {
      return NextResponse.json({ error: 'FAL_KEY not configured on server' }, { status: 500 });
    }

    const dataUri = imageBase64.startsWith('data:')
      ? imageBase64
      : `data:image/png;base64,${imageBase64}`;

    // Prompt optimized for cleaning up and professionalizing the CAD lines while locking interior layouts
    const prompt = `A professionally enhanced 2D architectural CAD floor plan. Clean, crisp, high-contrast black lines on a solid white background. Improve line weights, straighten and refine all walls, door symbols, and windows. Maintain the exact same room positions, layout structure, furniture placements, and text labels. Make the overall drawing look like a clean, master-level engineering blueprint.`;

    console.log('[enhance-floorplan] Calling fal.ai (GPT-Image-2 edit)...');
    
    const response = await fetch('https://fal.run/openai/gpt-image-2/edit', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_url: dataUri
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      throw new Error(`fal.ai error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const imageUrl = data?.images?.[0]?.url || data?.image?.url;
    if (!imageUrl) throw new Error('fal.ai returned no image URL');

    // Download the resulting image and return base64
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
    if (!imgRes.ok) throw new Error(`Failed to download enhanced image (status ${imgRes.status})`);
    
    const imgBuffer = await imgRes.arrayBuffer();
    const base64Result = Buffer.from(imgBuffer).toString('base64');

    return NextResponse.json({ enhancedFloorPlan: base64Result });

  } catch (error: any) {
    console.error('[enhance-floorplan] API Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
