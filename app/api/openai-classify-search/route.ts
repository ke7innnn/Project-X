import { NextResponse } from 'next/server';

export const maxDuration = 10;

export async function POST(request: Request) {
  try {
    const { message } = await request.json();

    const apiKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;
    const fallbackApiKey = process.env.GROQ_API_KEY_FALLBACK;

    if (!apiKey) {
      return NextResponse.json({ needsSearch: false });
    }

    const systemPrompt = `You are an intent classifier for an AI assistant.
Your ONLY job is to determine if the user's query requires searching the live internet to provide an accurate, up-to-date, or factual answer.

Reply ONLY with "YES" if:
- It asks for real-time information (e.g., news, weather, current events).
- It asks for specific factual data you might not know confidently.
- It asks for prices, specs, or details about real-world entities.

Reply ONLY with "NO" if:
- It is a general conversation ("hello", "how are you").
- It is about a system feature or navigation ("open the render zone").
- It is a general knowledge question that any LLM knows instantly without searching (e.g., "what is 2+2", "what is the capital of France", "who wrote Romeo and Juliet").
- It asks about the current architectural project.

Query: "${message}"`;

    const body = JSON.stringify({
      model: 'llama-3.1-8b-instant', // Super fast model
      messages: [{ role: 'system', content: systemPrompt }],
      max_tokens: 5,
      temperature: 0,
    });

    const tryGroq = async (key: string): Promise<Response> => {
      return fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body,
      });
    };

    let response = await tryGroq(apiKey);

    if (response.status === 429 && fallbackApiKey) {
      response = await tryGroq(fallbackApiKey);
    }

    if (!response.ok) {
      return NextResponse.json({ needsSearch: false });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim().toUpperCase() || 'NO';

    return NextResponse.json({ needsSearch: reply.includes('YES') });
  } catch (error) {
    return NextResponse.json({ needsSearch: false });
  }
}
