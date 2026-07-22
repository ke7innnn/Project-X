import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export async function POST(req: Request) {
  try {
    const { prompt, style, imageSize, apiKey } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const activeApiKey = apiKey || process.env.FAL_KEY;

    if (!activeApiKey) {
      return NextResponse.json(
        { error: 'Fal AI API Key (FAL_KEY) is missing. Switch to simulation mode or configure it in settings.' },
        { status: 400 }
      );
    }

    // Clean and validate the API key format (removing copy-paste spaces, trailing periods or punctuation)
    const cleanApiKey = activeApiKey.replace(/\s+/g, '').replace(/[^a-zA-Z0-9:-]/g, '');
    fal.config({ credentials: cleanApiKey });

    console.log(`[IdeaGenerator] Executing dual parallel generation: GPT-Image-2 (medium) + Nano Banana 2 (${imageSize || 'square_hd'})...`);
    
    const gptPromise = fal.subscribe('openai/gpt-image-2', {
      input: {
        prompt: prompt,
        quality: 'medium'
      }
    }).catch(err => {
      console.error('[IdeaGenerator] GPT-Image-2 failed:', err.message || err);
      return null;
    });

    const nanoPromise = fal.subscribe('fal-ai/nano-banana-2', {
      input: {
        prompt: prompt,
        image_size: imageSize || 'square_hd'
      } as any
    }).catch(err => {
      console.error('[IdeaGenerator] Nano Banana 2 failed:', err.message || err);
      return null;
    });

    const [gptRes, nanoRes] = await Promise.all([gptPromise, nanoPromise]);

    const gptImages = (gptRes as any)?.images || (gptRes as any)?.data?.images;
    const nanoImages = (nanoRes as any)?.images || (nanoRes as any)?.data?.images;

    const gptUrl = gptImages?.[0]?.url || null;
    const nanoUrl = nanoImages?.[0]?.url || null;

    if (!gptUrl && !nanoUrl) {
      return NextResponse.json({ error: 'Both Fal AI models (GPT-Image-2 & Nano Banana 2) failed to generate images.' }, { status: 500 });
    }

    return NextResponse.json({
      gptImageUrl: gptUrl,
      nanoImageUrl: nanoUrl,
      url: gptUrl || nanoUrl
    });
  } catch (error: any) {
    console.error('[IdeaGenerator] Fal AI Error:', error.message || error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
