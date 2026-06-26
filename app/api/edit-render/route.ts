import { NextResponse } from 'next/server';

const FAL_KEY = process.env.FAL_KEY!;

export const maxDuration = 60;

/**
 * POST /api/edit-render
 * Body: { renderBase64: string, editPrompt: string }
 * Uses xai/grok-imagine-image/edit to apply a text prompt edit on an existing render image.
 */
export async function POST(request: Request) {
  try {
    const { renderBase64, editPrompt } = await request.json();

    if (!renderBase64) {
      return NextResponse.json({ error: 'Missing render image' }, { status: 400 });
    }
    if (!editPrompt?.trim()) {
      return NextResponse.json({ error: 'Missing edit prompt' }, { status: 400 });
    }

    const imageDataUri = renderBase64.startsWith('data:')
      ? renderBase64
      : `data:image/jpeg;base64,${renderBase64}`;

    const body = {
      prompt: editPrompt.trim(),
      negative_prompt: "blurry, distorted, low quality, watermark, text overlay",
      image_urls: [imageDataUri],
    };

    const response = await fetch('https://fal.run/xai/grok-imagine-image/edit', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`grok-imagine edit error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const imageUrl = data?.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error('No image URL returned from grok-imagine');
    }

    // Fetch the image and return as base64
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
    if (!imgRes.ok) throw new Error('Failed to download edited render image');

    const arrayBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return NextResponse.json({ editedRender: base64 });
  } catch (err: any) {
    console.error('[edit-render] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
