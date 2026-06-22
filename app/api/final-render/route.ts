import { NextResponse } from 'next/server';
import { FINAL_RENDER_PROMPT } from '@/lib/prompts';

const FAL_KEY = process.env.FAL_KEY!;

export async function POST(request: Request) {
  try {
    const { floorPlanBase64, collectedParameters } = await request.json();

    if (!floorPlanBase64) {
      throw new Error('Missing floor plan image for rendering');
    }

    const prompt = typeof FINAL_RENDER_PROMPT === 'function'
      ? FINAL_RENDER_PROMPT(collectedParameters)
      : FINAL_RENDER_PROMPT;
    const body = {
      prompt,
      image_urls: [
        floorPlanBase64.startsWith('data:')
          ? floorPlanBase64
          : `data:image/jpeg;base64,${floorPlanBase64}`
      ]
    };

    console.log(`[xai/grok-imagine-image/edit] Generating 3D Render.`);
    
    const response = await fetch('https://fal.run/xai/grok-imagine-image/edit', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000), // 60s timeout
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`xai/grok-imagine-image/edit rendering error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const imageUrl = data?.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error('xai/grok-imagine-image/edit returned no render image URL');
    }

    // Download the rendered image as base64
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!imgRes.ok) {
      throw new Error('Failed to download rendered 3D image from fal.ai CDN');
    }
    const imgBuffer = await imgRes.arrayBuffer();
    const render = Buffer.from(imgBuffer).toString('base64');

    return NextResponse.json({ render });
  } catch (error: any) {
    console.error('Final render error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

