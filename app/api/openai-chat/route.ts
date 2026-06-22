import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const { messages, systemContext } = await request.json();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 500 });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        stream: true,
        messages: [
          {
            role: "system",
            content: `You are BATMAN (Bruce Wayne). You are a tactical, brooding, yet highly sophisticated AI assistant serving the user, who is a brilliant architect. You possess a dark, dry sense of humor. Speak in a deep, relaxed, almost whispering tone. Your role is to help the user navigate this AI architectural interface—remind them they can configure plot sizes, design floor plans, and generate 3D renders. Your responses MUST be extremely short—literally just 1 or 2 brief sentences max (under 15 words total). Do not over-explain. Never use formatting, emojis, bullet points, or formal robotic transitions. Stay intensely in character.\n\n${systemContext || ''}`
          },
          ...messages
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "OpenAI error" }, { status: response.status });
    }

    // Return the readable stream directly to the client
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
