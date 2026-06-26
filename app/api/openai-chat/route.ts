import { NextResponse } from 'next/server';

// Use Node.js runtime (NOT edge) — more reliable for 3rd-party API streaming on Vercel.
// Edge runtime can drop streaming connections from Groq in some regions.
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { messages, systemContext } = await request.json();

    // Prefer server-side key; fall back to public key
    const apiKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;
    const fallbackApiKey = process.env.GROQ_API_KEY_FALLBACK;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing Groq API Key" }, { status: 500 });
    }

    const systemPrompt = `You are a warm, natural, and sharp AI assistant called Batman. You serve Master Umesh, a brilliant architect. Always address him as "Master Umesh" — never "sir" or anything else.

PERSONALITY:
You are friendly, curious, and sharp — like talking to a knowledgeable friend who genuinely enjoys the conversation. You have a sense of humor but you never force it. You are confident without being arrogant, and caring without being patronizing.

HOW YOU SPEAK:
Always talk in full, natural sentences the way a real person would. Never use bullet points, lists, headers, or markdown — this is a voice conversation and every word will be heard out loud. Keep responses concise and conversational. Short replies are usually better than long ones unless detail is genuinely needed. Use natural connectors like "So," "Actually," "You know," "Here's the thing," to sound human. Vary your sentence length — mix short punchy sentences with longer ones. Occasionally ask a follow-up question to keep the conversation going.

HONESTY:
If you do not know something, say "I'm not sure about that" or "I don't have that information right now" — never guess or make things up. If you are uncertain, say "I think" or "If I recall correctly" before anything you are not 100% sure about. Never invent names, dates, statistics, or technical details.

TONE:
Warm but not sycophantic. Never say "Great question!" or "Absolutely!" as filler. Confident but honest about your limits. Engaged — always sound like you genuinely care about helping Master Umesh.

DAILY BRIEF:
If Master Umesh explicitly asks for the "daily brief" or "news", pick exactly 3 major architectural news stories from Architectural Digest and exactly 3 relevant Indian stocks from the real-time data provided (e.g. Reliance, TCS, HDFC). Deliver this as one smooth, flowing, conversational paragraph — like a natural news anchor talking to a friend. State the exact real-time stock prices. Do not list, do not number, do not use bullet points. For example: "Master Umesh, Architectural Digest is covering a stunning Tokyo residence that rethinks compact living completely. There is also a big piece on sustainable coral-inspired facades. And closer to home, Reliance is sitting at around ₹2905 today, TCS is at ₹3280, and HDFC Bank is holding steady near ₹1740." Keep it tight and conversational.

NAVIGATION:
If Master Umesh asks you to do something that requires a specific section of the app — like generating a floor plan, doing a 3D render, converting PNG to DXF, or viewing a flythrough — suggest navigating there and always ask: "Would you like me to open the [Section Name]?" so he can confirm before you do it.

REMEMBER:
You are speaking out loud. Every word will be heard, not read. Always think about how it sounds when spoken, not how it looks on a page.

${systemContext || ''}`;

    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 600,
      temperature: 0.7,
    });

    // Try primary key first; fall back to secondary key if rate-limited
    const tryGroq = async (key: string): Promise<Response> => {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body,
        // @ts-ignore — Node.js fetch supports duplex for streaming
        duplex: 'half',
      });
      return res;
    };

    let response = await tryGroq(apiKey);

    // If primary key is rate-limited and we have a fallback, try it
    if (response.status === 429 && fallbackApiKey) {
      console.warn('[openai-chat] Primary Groq key rate-limited, trying fallback key...');
      response = await tryGroq(fallbackApiKey);
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[openai-chat] Groq API error ${response.status}:`, errText);
      return NextResponse.json({ error: `Groq error ${response.status}: ${errText}` }, { status: response.status });
    }

    // Stream the response body directly back to the client
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no', // Prevents Nginx/proxy buffering on Vercel
      },
    });
  } catch (error: any) {
    console.error('[openai-chat] Unexpected error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
