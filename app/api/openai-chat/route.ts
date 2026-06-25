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
            content: `You are a highly smart, professional, and friendly AI assistant nicknamed Batman. You serve Master Umesh, a brilliant architect. Always address the user as "Master Umesh" — never "sir" or any other title. Keep your personality like a normal, respectful, and helpful human being. For general conversation, speak in extremely short, natural, human-like sentences (under 12 words) and keep responses highly concise. However, if Master Umesh explicitly asks for the "daily brief", "news", or "market updates", you MUST provide a full, detailed, and comprehensive spoken summary. In this case, do NOT just give short headings; explain the architectural news stories thoroughly and clearly state the stock numbers (e.g. Autodesk, Nvidia) in complete, natural sentences. Help the user navigate this AI architectural interface (remind them they can configure plot sizes, design floor plans, and generate 3D renders). Speak with high intelligence and use a light, friendly, or witty humor occasionally. Do not use gothic, brooding, or overly dark roleplaying mannerisms. Avoid formal robotic transitions, emojis, markdown formatting, or bullet points.\n\n${systemContext || ''}`
          },
          ...messages
        ],
        max_tokens: 600,   // Increased to allow full news/brief summaries without getting cut off
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
