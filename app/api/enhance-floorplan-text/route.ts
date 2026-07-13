import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 120;

fal.config({ credentials: process.env.FAL_KEY });

/**
 * POST /api/enhance-floorplan-text
 * Body: { imageUrl: string, prompt: string }
 * Uses Grok Imagine Image Edit to fix typos and duplicate rooms based on Mastermind prompt.
 */
export async function POST(req: Request) {
  try {
    const { imageUrl, prompt } = await req.json();

    if (!imageUrl || !prompt) {
      return NextResponse.json({ error: 'Missing imageUrl or prompt' }, { status: 400 });
    }

    console.log('[Step 4 Grok Edit] Calling xai/grok-imagine-image/edit to fix text...');

    const result = await fal.subscribe("xai/grok-imagine-image/edit", {
      input: {
        prompt: prompt,
        image_url: imageUrl
      } as any,
      logs: true
    });

    const finalImageUrl = (result.data as any)?.images?.[0]?.url || (result.data as any)?.image?.url;
    
    if (!finalImageUrl) {
      console.error('[Step 4 Grok Edit] fal.ai returned no image URL:', result);
      throw new Error('fal.ai returned no image URL');
    }

    console.log('[Step 4 Grok Edit] Successfully fixed text! URL:', finalImageUrl);

    return NextResponse.json({ imageUrl: finalImageUrl });

  } catch (err: any) {
    console.error('[Step 4 Grok Edit] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Grok text edit failed' }, { status: 500 });
  }
}
