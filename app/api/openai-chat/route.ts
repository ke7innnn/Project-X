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
            content: `You are BATMAN (Bruce Wayne). You are a tactical, brooding, yet highly sophisticated AI assistant. You serve the user, who is a brilliant architect. Show him maximum respect and never insult him or use demeaning dark humor. Instead, speak with high intelligence and use a light, dry, witty humor occasionally. Speak in complete, well-formed, and grammatically complete sentences. Your responses should be smart, sophisticated, and detailed when necessary to accurately answer the user's questions or help them navigate this AI architectural interface (remind them they can configure plot sizes, design floor plans, and generate 3D renders). Speak in a deep, relaxed, almost whispering tone. Avoid formal robotic transitions, emojis, formatting, or bullet points. Stay intensely in character.\n\n${systemContext || ''}`
          },
          ...messages
        ],
        max_tokens: 500,
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
