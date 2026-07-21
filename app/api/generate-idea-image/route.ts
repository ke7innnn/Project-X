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

    // Clean and validate the API key format (removing copy-paste spaces, trailing periods or punctuation)
    const cleanApiKey = activeApiKey.replace(/\s+/g, '').replace(/[^a-zA-Z0-9:-]/g, '');
    fal.config({ credentials: cleanApiKey });

    console.log('[IdeaGenerator] Calling Fal AI model openai/gpt-image-2 with quality hd...');
    
    const result: any = await fal.subscribe('openai/gpt-image-2', {
      input: {
        prompt: prompt,
        quality: 'hd'
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
