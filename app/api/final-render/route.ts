import { NextResponse } from 'next/server';
import { FINAL_RENDER_PROMPT } from '@/lib/prompts';

const FAL_KEY = process.env.FAL_KEY!;

export const maxDuration = 60; // 60s timeout for Vercel functions

export async function POST(request: Request) {
  try {
    const { 
      floorPlanBase64, 
      collectedParameters,
      isSunpathEdit,
      sunpathDirection,
      existingRenderBase64,
      renderStyle
    } = await request.json();

    let inputImageBase64 = floorPlanBase64;
    let prompt = '';

    if (isSunpathEdit) {
      if (!existingRenderBase64) {
        throw new Error('Missing existing 3D render image for sunpath edit');
      }
      inputImageBase64 = existingRenderBase64;
      prompt = `Adjust the lighting and environment of this architectural 3D render. The sun is now coming from the ${sunpathDirection}, casting long, sharp, cinematic shadows that fall towards the opposite side. Maintain the exact house structure, materials, colors, and layout. Only change the sun's position, shadows, and the ambient sun path lighting.`;
      console.log(`[xai/grok-imagine-image/edit] Editing Sunpath. Direction: "${sunpathDirection}"`);
    } else {
      if (!floorPlanBase64) {
        throw new Error('Missing floor plan image for rendering');
      }
      prompt = typeof FINAL_RENDER_PROMPT === 'function'
        ? FINAL_RENDER_PROMPT({ ...collectedParameters, renderStyle })
        : FINAL_RENDER_PROMPT;
      console.log(`[xai/grok-imagine-image/edit] Generating 3D Render with style: "${renderStyle || 'Normal'}"`);
    }

    const body = {
      prompt,
      negative_prompt: "text, words, letters, typography, alphabet, writing, labels, fonts, numbers, watermarks, blurred text, scrambled letters, floating text, symbols, illegible text, text on floor",
      image_urls: [
        inputImageBase64.startsWith('data:')
          ? inputImageBase64
          : `data:image/jpeg;base64,${inputImageBase64}`
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

