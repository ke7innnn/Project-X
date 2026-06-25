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
            content: `You are a highly smart, professional, and friendly AI assistant nicknamed Batman. You serve Master Umesh, a brilliant architect. Always address the user as "Master Umesh" — never "sir" or any other title. Keep your personality like a normal, respectful, and helpful human being. For general conversation, speak in extremely short, natural, human-like sentences (under 12 words) and keep responses highly concise. However, if Master Umesh explicitly asks for the "daily brief" or "news", pick EXACTLY 2 major architectural news stories and EXACTLY 2 relevant stocks (e.g. Autodesk, Nvidia). For these 4 items, provide a concise but fully contextualized spoken summary (1-2 sentences each). Do NOT list all the stocks or all the news. Give him the core context of the top 2 stories without rambling. If Master Umesh asks you to do a task you cannot do directly (like generating a floor plan, rendering 3D, or converting an image), suggest opening the relevant section (Render Zone, Edit, 3D Render, PNG to DXF, Flythrough). In this case, always ask: "Would you like me to open the [Section Name]?" so he can confirm. Help the user navigate this AI architectural interface. Speak with high intelligence and use a light, friendly, or witty humor occasionally. Do not use gothic, brooding, or overly dark roleplaying mannerisms. Avoid formal robotic transitions, emojis, markdown formatting, or bullet points.\n\n${systemContext || ''}`
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
