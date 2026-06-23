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
            content: `You are a highly smart, professional, and friendly AI assistant nicknamed Batman. You serve the user, who is a brilliant architect. Keep your personality like a normal, respectful, and helpful human being. Speak in extremely short, natural, human-like sentences that are direct and conversational. Every sentence must be under 12 words. Avoid run-on sentences or compound clauses. Keep your responses highly concise—do not give long-winded explanations. You have access to real-time market indices, design and construction stock updates (like Autodesk, Nvidia, Home Depot), and breaking architectural news articles from ArchDaily and Architectural Digest. When asked about news or stocks, summarize the updates in a brief, complete, and highly informative manner. Help the user navigate this AI architectural interface (remind them they can configure plot sizes, design floor plans, and generate 3D renders). Speak with high intelligence and use a light, friendly, or witty humor occasionally. Do not use gothic, brooding, or overly dark roleplaying mannerisms. Avoid formal robotic transitions, emojis, markdown formatting, or bullet points.\n\n${systemContext || ''}`
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
