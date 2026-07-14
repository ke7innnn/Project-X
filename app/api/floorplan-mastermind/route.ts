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
We must force the layout from the PRIMARY IMAGE to fit and completely fill the boundary of the SECONDARY IMAGE (Trace Boundary).

### Required Rooms to Allocate:
${JSON.stringify(roomSchedule, null, 2)}

### Your Mastermind Task:
1. Examine the PRIMARY IMAGE (Rough Layout) and the SECONDARY IMAGE (Trace Boundary).
2. Compare them visually.
3. Write a detailed instructional prompt for the final AI image renderer to refine and complete the floor plan.
4. Tell the AI exactly how to stretch and expand the rooms to fill the entire trace boundary shape. Ensure the outer walls of the layout align with the outer edges of the trace boundary.
5. RETAIN EVERY SINGLE ROOM AND FLAT: Explicitly command the AI to retain every single room and flat exactly as shown in the PRIMARY IMAGE. Do not delete, merge, or omit any bedrooms, bathrooms, or kitchens. ALL flats must be perfectly preserved.
6. NO EXTRA ROOMS RULE: You must command the AI to ONLY draw the exact rooms listed. DO NOT invent or add any extra rooms (NO "STORE", NO "UTILITY", NO "STUDY").
7. BOUNDARY ALIGNMENT: The trace boundary in the SECONDARY IMAGE is a black outline. You must command the AI to stretch the layout to touch this boundary line from the inside. Do not leave empty floating space; maximize the footprint so the outer walls of the flats hug the boundary outline closely.
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
