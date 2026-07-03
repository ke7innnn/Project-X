import { NextResponse } from "next/server";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an expert AI Architect. You are given a semantic JSON floor plan layout and a user instruction.
Your job is to apply the user's instruction and recalculate the bounding boxes (x, y, width, height) of the rooms.

Input JSON format:
{
  "exterior_shell": { "width": number, "height": number },
  "rooms": [
    { "id": "...", "label": "...", "x": number, "y": number, "width": number, "height": number }
  ]
}

CRITICAL RULES:
1. Apply the user's requested dimensions to the target room.
2. RECALCULATE the x, y, width, and height of ADJACENT rooms so they fit perfectly inside the locked \`exterior_shell\` without overlapping.
3. The \`exterior_shell\` MUST NOT CHANGE.
4. Output ONLY the strictly valid JSON object of the updated layout. Do not output markdown or explanations.`;

export async function POST(request: Request) {
  try {
    const { layoutState, prompt } = await request.json();
    if (!layoutState || !prompt) {
      return NextResponse.json({ error: "Missing layoutState or prompt" }, { status: 400 });
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) throw new Error("Missing OPENROUTER_API_KEY");

    // Pass the layout JSON and instruction to Gemini 2.5 Pro for structural recalculation
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { 
            role: "user", 
            content: `CURRENT LAYOUT:\n${JSON.stringify(layoutState, null, 2)}\n\nUSER REQUEST: ${prompt}`
          }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${errText}`);
    }
    
    const data = await res.json();
    let content = data.choices[0].message.content.trim();
    
    // Clean up potential markdown formatting
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const newLayout = JSON.parse(content);

    return NextResponse.json({ layout: newLayout });
  } catch (error: any) {
    console.error("[redesign-layout] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
