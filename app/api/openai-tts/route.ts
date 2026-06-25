import { NextResponse } from 'next/server';

export const runtime = 'edge';

async function handleTTS(text: string | null) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Missing OpenAI API Key in environment variables" }, { status: 500 });
  }

  if (!text) {
    return NextResponse.json({ error: "Missing input text" }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",          // Lower latency than tts-1-hd — starts playing ~200ms faster
        input: text,
        voice: "onyx",           // Deep, authoritative, manly voice
        speed: 1.0,              // Natural pace — confident and grounded
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText }, { status: response.status });
    }

    // Return the raw stream! This allows the browser <audio> tag to play it IMMEDIATELY as it downloads.
    return new Response(response.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { text } = await request.json();
    return handleTTS(text);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get('text');
  return handleTTS(text);
}
