import { NextResponse } from 'next/server';

export const maxDuration = 60; // 60s timeout for Vercel functions

/**
 * POST /api/floorplan-mastermind
 * Body: { step1ImageUrl: string, traceCanvasBase64: string, sitePolygonPoints: Array<{x: number, y: number}>, roomSchedule: any }
 * Computes exact room positions via Gemini Pro on OpenRouter to fit 100% inside the trace polygon.
 */
export async function POST(req: Request) {
  try {
    const { step1ImageUrl, traceCanvasBase64, sitePolygonPoints, roomSchedule } = await req.json();

    if (!step1ImageUrl || !traceCanvasBase64 || !roomSchedule || !sitePolygonPoints) {
      return NextResponse.json({ error: 'Missing step1ImageUrl, traceCanvasBase64, sitePolygonPoints, or roomSchedule' }, { status: 400 });
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) {
      throw new Error("Missing OPENROUTER_API_KEY in environment variables");
    }

    console.log('[Mastermind] Initializing layout calculation via OpenRouter...');

    // 1. Format site polygon points for the prompt (scale points relative to a 1000x1000 grid)
    const xs = sitePolygonPoints.map((p: any) => p.x);
    const ys = sitePolygonPoints.map((p: any) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX || 1;
    const height = maxY - minY || 1;

    const normalizedPolygon = sitePolygonPoints.map((p: any) => ({
      x: Math.round(((p.x - minX) / width) * 1000),
      y: Math.round(((p.y - minY) / height) * 1000)
    }));

    const prompt = `You are a master mathematical architect acting as a Mastermind for an AI image generator.
We must force the layout from the PRIMARY IMAGE to fit 100% inside the rigid boundary of the SECONDARY IMAGE (Trace Boundary).

### Required Rooms to Allocate:
${JSON.stringify(roomSchedule, null, 2)}

### Your Mastermind Task:
1. Examine the PRIMARY IMAGE (Rough Layout) and the SECONDARY IMAGE (Trace Boundary).
2. Compare them visually. Identify EXACTLY which flats or rooms in the PRIMARY IMAGE are bleeding outside the boundaries of the SECONDARY IMAGE.
3. Write an aggressive, highly detailed instructional prompt for the final AI image renderer.
4. Tell the AI exactly what to do: "Make Flat A much smaller, shrink the living room drastically, squish the Master Bedroom into an L-shape to fit the trace," etc. Be specific about which rooms are too big.
5. CRITICAL INSTRUCTION: The AI renderer has a bad habit of deleting rooms or missing flats when it redraws the layout. You MUST explicitly command the AI to: "RETAIN EVERY SINGLE ROOM AND FLAT exactly as shown in the PRIMARY IMAGE. Do not delete, merge, or omit any bedrooms, bathrooms, or kitchens. ALL flats must be perfectly preserved."
6. NEW FILL RULE: You must aggressively command the AI that ALL core rooms (especially BEDROOMS) are the highest priority. If the layout is tight, it must shrink rooms rather than deleting them. ONLY after ensuring every single core bedroom is drawn is it allowed to generate EXTRA, newly-named filler rooms (like "STORE", "UTILITY", "STUDY") to fill any weird geometric gaps near the trace boundary.
7. RED BOUNDARY RULE: Look closely at the SECONDARY IMAGE. It contains a thick NEON RED trace line. You must explicitly command the AI to use this RED line as the absolute literal boundary. Tell it: "Squash and reshape all the white architectural walls so they fit 100% completely INSIDE the thick NEON RED line. Do not let any white walls bleed past the red line!"
8. Return ONLY the raw text prompt, nothing else. Do not use markdown. Start directly with the instructions.`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: step1ImageUrl } },
              { type: "image_url", image_url: { url: traceCanvasBase64.startsWith('data:') ? traceCanvasBase64 : `data:image/png;base64,${traceCanvasBase64}` } }
            ]
          }
        ],
        temperature: 0.7
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const mastermindPrompt = data.choices[0].message.content.trim();

    console.log('[Mastermind] Successfully generated strategy prompt.');

    return NextResponse.json({
      mastermindPrompt
    });

  } catch (err: any) {
    console.error('[Mastermind] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Layout mastermind calculation failed' }, { status: 500 });
  }
}
