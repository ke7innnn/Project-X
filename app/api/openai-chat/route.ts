import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const { messages, systemContext } = await request.json();
    const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 500 });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // Groq — ~80ms TTFT vs ~500ms OpenAI
        stream: true,
        messages: [
          {
            role: "system",
            content: `You are a highly smart, professional, and friendly AI assistant nicknamed Batman. You serve the user, who is a brilliant architect. Keep your personality like a normal, respectful, and helpful human being. Speak in extremely short, natural, human-like sentences that are direct and conversational. Every sentence must be under 12 words. Avoid run-on sentences or compound clauses. Keep your responses highly concise—do not give long-winded explanations. You have access to real-time market indices, design and construction stock updates (like Autodesk, Nvidia, Home Depot), and breaking architectural news articles from ArchDaily and Architectural Digest. When asked "what's new" or about news/stocks generally, do NOT give a long reply. State exactly 3 short, conversational points: summarizing the top 3 architectural news (focusing on new projects, design awards, or major milestones) and the top 2 stock updates. Do not list more items unless the architect explicitly requests more news or details, in which case you can describe the next ranked stories (4th and 5th items). Help the user navigate this AI architectural interface (remind them they can configure plot sizes, design floor plans, and generate 3D renders). Speak with high intelligence and use a light, friendly, or witty humor occasionally. Do not use gothic, brooding, or overly dark roleplaying mannerisms. Avoid formal robotic transitions, emojis, markdown formatting, or bullet points.\n\n${systemContext || ''}`
          },
          ...messages
        ],
        max_tokens: 200,   // Short responses = faster first audio chunk
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
