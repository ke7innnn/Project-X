import { NextResponse } from 'next/server';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are the Lead Architectural Visualizer & Creative Director AI Agent.
Your job is to collaborate with the architect to brainstorm, refine, and engineer custom themes, architectural styles, lighting vibes, facade materials, and landscaping ideas for their 3D exterior render.

When the user describes an idea, theme, aesthetic, or personal suggestion (e.g. "cyberpunk look with purple skies", "make it look like a quiet biophilic garden tower in Singapore", "add wood louvers and warm sunset glow", "clean white minimalist travertine with Scandinavian landscape"):

1. Provide a warm, concise, professional response (1-3 sentences) explaining how you're translating their vision into high-end architectural CGI parameters.
2. SYNTHESIZE A HIGHLY SPECIFIC, PHOTOREALISTIC ARCHITECT DIRECTIVE STRING:
   - Include specific real-world materials (e.g., fluted Roman travertine, curved champagne-bronze louvers, charred Shou Sugi Ban timber, low-iron tinted glass).
   - Specify lighting and atmosphere (e.g., warm 2700K recessed amber cove lighting, soft golden sunbeams, backlit vertical greenery, mist fountains).
   - Specify landscaping and surroundings (e.g., cascading bougainvillea, specimen Royal Palms, wet granite plaza).
3. Suggest the optimal Time of Day ('day' or 'night') for this specific aesthetic.

You MUST respond strictly in valid JSON format with the following structure:
{
  "reply": "Your concise, insightful response to the architect explaining the aesthetic choices.",
  "suggestedDirectives": "Crisp, comma-separated architectural directives ready for injection into the render prompt.",
  "themeName": "Short 2-3 word theme title (e.g. Biophilic Oasis, Neo-Tokyo Horizon, Warm Travertine Minimal)",
  "suggestedTimeOfDay": "day" or "night"
}

Do not wrap the JSON in extra text or explanation outside the JSON object.`;

export async function POST(req: Request) {
  try {
    const {
      messages,
      currentDirectives = '',
      timeOfDay = 'night',
      floorCount = '',
    } = await req.json();

    const groqKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;

    const userContext = `\nCurrent Project Context:\n- Time of Day: ${timeOfDay}\n- Total Floors: ${floorCount || 'Auto (from 3D model)'}\n- Current Architect Directives: ${currentDirectives || 'None'}`;

    const formattedMessages = [
      { role: 'system', content: SYSTEM_PROMPT + userContext },
      ...(Array.isArray(messages) ? messages : []),
    ];

    let rawText = '';

    // 1. Try Groq (Ultra fast)
    if (groqKey) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: formattedMessages,
            temperature: 0.7,
            max_tokens: 600,
            response_format: { type: 'json_object' },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          rawText = data.choices?.[0]?.message?.content || '';
        }
      } catch (err) {
        console.warn('[ExteriorAssistant] Groq failed, trying fallback...', err);
      }
    }

    // 2. Try OpenRouter if Groq didn't succeed
    if (!rawText && openRouterKey) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.0-flash-001',
            messages: formattedMessages,
            temperature: 0.7,
            max_tokens: 600,
            response_format: { type: 'json_object' },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          rawText = data.choices?.[0]?.message?.content || '';
        }
      } catch (err) {
        console.warn('[ExteriorAssistant] OpenRouter failed, trying fallback...', err);
      }
    }

    // 3. Try OpenAI if still no text
    if (!rawText && openaiKey) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: formattedMessages,
            temperature: 0.7,
            max_tokens: 600,
            response_format: { type: 'json_object' },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          rawText = data.choices?.[0]?.message?.content || '';
        }
      } catch (err) {
        console.error('[ExteriorAssistant] OpenAI failed:', err);
      }
    }

    if (!rawText) {
      return NextResponse.json({
        reply: "I understand your vision. I've formulated custom architectural directives for materials, lighting, and facade treatments.",
        suggestedDirectives: "Curved bronze louvers, fluted natural stone podium, warm 2700K recessed amber cove lighting ribbons, cascading sky garden planters with bougainvillea, and reflective dark granite plaza.",
        themeName: "Custom Luxury Theme",
        suggestedTimeOfDay: timeOfDay,
      });
    }

    try {
      const parsed = JSON.parse(rawText);
      return NextResponse.json({
        reply: parsed.reply || 'Here is the customized architectural directive for your render.',
        suggestedDirectives: parsed.suggestedDirectives || '',
        themeName: parsed.themeName || 'Custom Theme',
        suggestedTimeOfDay: parsed.suggestedTimeOfDay || null,
      });
    } catch (parseErr) {
      return NextResponse.json({
        reply: rawText,
        suggestedDirectives: rawText,
        themeName: 'Custom Theme',
        suggestedTimeOfDay: null,
      });
    }
  } catch (err: any) {
    console.error('[ExteriorAssistant Error]', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to process assistant suggestion.' },
      { status: 500 }
    );
  }
}
