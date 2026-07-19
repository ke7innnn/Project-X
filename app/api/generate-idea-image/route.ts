import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export async function POST(req: Request) {
  try {
    const { prompt, style, apiKey } = await req.json();

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

    // Configure client with key for this request execution context
    fal.config({ credentials: activeApiKey });

    const enhancedPrompt = `High-rise tower typical floor plan drawing, 2D architectural CAD plan layout blueprint, ${style ? `${style} footprint style,` : ''} ${prompt}. Clean elevator lobby and staircase center core, corridor loop, clear lines, high resolution, professional blueprint sheet presentation on white paper background.`;

    console.log('[IdeaGenerator] Calling Fal AI model fal-ai/flux/schnell...');
    
    const result: any = await fal.subscribe('fal-ai/flux/schnell', {
      input: {
        prompt: enhancedPrompt,
        image_size: 'square_hd',
      }
    });

    const images = result?.images || result?.data?.images;
    if (!images || images.length === 0) {
      return NextResponse.json({ error: 'Fal AI model returned no images' }, { status: 500 });
    }

    return NextResponse.json({ url: images[0].url });
  } catch (error: any) {
    console.error('[IdeaGenerator] Fal AI Error:', error.message || error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
