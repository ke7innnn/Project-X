import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt, style, apiKey } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Determine the API key to use (user-provided or server-side env)
    const activeApiKey = apiKey || process.env.OPENAI_API_KEY;

    if (!activeApiKey) {
      return NextResponse.json(
        { error: 'OpenAI API Key is missing. Switch to simulation mode or configure it in settings.' },
        { status: 400 }
      );
    }

    const enhancedPrompt = `Premium architectural rendering, ${style ? `${style} style,` : ''} ${prompt}. High resolution, dramatic shadows, photorealistic, professional concept design.`;

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeApiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: enhancedPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || 'OpenAI generation request failed' },
        { status: response.status }
      );
    }

    return NextResponse.json({ url: data.data[0].url });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
