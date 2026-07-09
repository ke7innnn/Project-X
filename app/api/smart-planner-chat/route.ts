import { NextResponse } from 'next/server';

export const maxDuration = 60;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// Standard minimum room sizes in metres (real architecture standards)
const ROOM_STANDARDS = `
INDIAN ARCHITECTURE STANDARDS (NBC 2016):
- Master Bedroom: minimum 3.0m × 3.5m = 10.5 sqm (ideal: 4.0m × 5.0m)
- Bedroom 2/3: minimum 2.5m × 3.0m = 7.5 sqm (ideal: 3.0m × 4.0m)
- Living Room: minimum 3.0m × 4.0m = 12 sqm (ideal: 4.0m × 6.0m)
- Kitchen: minimum 2.0m × 2.5m = 5 sqm (ideal: 3.0m × 4.0m)
- Bathroom/WC: minimum 1.2m × 1.5m = 1.8 sqm (ideal: 1.8m × 2.5m)
- Toilet: minimum 1.0m × 1.2m (ideal: 1.5m × 2.0m)
- Corridor/Passage: minimum 1.0m wide (ideal: 1.2-1.5m)
- Staircase: minimum 1.0m wide, 3m length per floor
- Lobby/Foyer: minimum 2m × 2m

BHK TOTAL AREA STANDARDS:
- 1BHK: 35-50 sqm (carpet area)
- 2BHK: 55-75 sqm (carpet area)
- 3BHK: 75-110 sqm (carpet area)
- 4BHK: 110-150 sqm (carpet area)

SETBACK RULES (typical Indian municipal):
- Front setback: minimum 3m from boundary
- Side setback: minimum 1.5m from boundary
- Rear setback: minimum 3m from boundary
- Total setback loss: approximately 15-20% of plot area

FAR (Floor Area Ratio) in India: typically 1.0-2.5 depending on city zone
Ground coverage: typically 40-60% of plot area allowed for building footprint
`;

const SYSTEM_PROMPT = `You are a senior architect and urban planner with 30 years of experience in Indian residential architecture. 
You follow National Building Code (NBC) 2016 standards strictly.

${ROOM_STANDARDS}

YOUR JOB:
1. The user will tell you their plot dimensions and what they want to build (how many flats, BHK type, etc.)
2. You MUST do the math first. Calculate total required area vs available buildable area.
3. If the user's request is IMPOSSIBLE in their plot, correct them with EXACT numbers and suggest what IS possible.
4. If the user's request is POSSIBLE, confirm it and provide a detailed, mathematically accurate room schedule.
5. Label each flat systematically: FLAT A, FLAT B, etc. Label each room with alphanumeric codes: A1, A2, B1, etc.
6. Always give dimensions in metres and area in square metres.

ROOM SCHEDULE FORMAT (use this exact format when confirming a layout):
When you are ready to output the final confirmed room schedule, OUTPUT A JSON BLOCK like this at the end of your message:

\`\`\`json
{
  "confirmed": true,
  "plotW": <number in metres>,
  "plotH": <number in metres>,
  "siteExteriorW": <buildable width after setbacks>,
  "siteExteriorH": <buildable height after setbacks>,
  "flats": [
    {
      "id": "A",
      "name": "Flat A",
      "rooms": [
        { "code": "A1", "name": "Master Bedroom", "w": 4, "h": 5, "area": 20 },
        { "code": "A2", "name": "Bedroom 2", "w": 3, "h": 4, "area": 12 },
        { "code": "A3", "name": "Living Room", "w": 4, "h": 5, "area": 20 },
        { "code": "A4", "name": "Kitchen", "w": 3, "h": 3.5, "area": 10.5 },
        { "code": "A5", "name": "Bathroom", "w": 1.8, "h": 2.5, "area": 4.5 },
        { "code": "A6", "name": "Toilet", "w": 1.5, "h": 2, "area": 3 }
      ]
    }
  ],
  "totalBuildupArea": <total sqm of all rooms>,
  "buildingFootprint": <sqm of ground floor footprint>
}
\`\`\`

RULES FOR CONCISE DELIVERY:
- Keep all explanations and text replies extremely short, direct, and fast to read.
- NEVER write long paragraphs of text. Use bullet points or 1-2 sentence explanations.
- Speak like a busy, practical architect. No fluff or generic welcomes. Get straight to the point.
- Show your math in clean, short bullet lines.
- Ask clarifying questions concisely.
- If the user asks to modify a room, recalculate and output the revised JSON immediately.
- All dimensions must be in multiples of 0.5m.
- The "flats" array in the JSON block MUST list every single flat explicitly (e.g., Flat A, Flat B, Flat C ... up to Flat N for 14 flats). Do NOT summarize, group, or show only one typical flat. Every flat needs its own object in the JSON with all its rooms.
`;

// Fast and cheap models on OpenRouter with strong math capabilities
const OPENROUTER_MODELS = [
  'google/gemini-2.5-flash',           // Top recommendation: super fast, ultra cheap, solid math & JSON
  'meta-llama/llama-3.3-70b-instruct',  // High quality reasoning, cheap, excellent math
  'deepseek/deepseek-chat',             // Extremely cheap, very strong math & general reasoning
  'qwen/qwen-2.5-coder-32b-instruct',   // Great fallback for structured JSON tasks
];

async function callOpenRouterWithFallback(
  systemWithContext: string,
  messages: { role: string; content: string }[]
): Promise<{ text: string; modelUsed: string }> {
  let lastError = '';

  for (const model of OPENROUTER_MODELS) {
    try {
      console.log(`[SmartPlanner] Trying OpenRouter model: ${model}`);
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://project-x-mu-eight.vercel.app',
          'X-Title': 'Smart Planner',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemWithContext },
            ...messages,
          ],
          temperature: 0.1,
          max_tokens: 6000,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[SmartPlanner] OpenRouter ${model} failed (${res.status}):`, errText.slice(0, 120));
        lastError = errText;
        continue;
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';

      if (!text) {
        console.warn(`[SmartPlanner] OpenRouter ${model} returned empty text`);
        lastError = 'Empty response';
        continue;
      }

      console.log(`[SmartPlanner] ✓ OpenRouter success with ${model} — ${text.length} chars`);
      return { text, modelUsed: model };

    } catch (err: any) {
      console.warn(`[SmartPlanner] OpenRouter ${model} threw:`, err.message);
      lastError = err.message;
    }
  }

  throw new Error(`All OpenRouter models failed. Last error: ${lastError}`);
}

export async function POST(request: Request) {
  try {
    const { messages, plotBoundary } = await request.json();

    // Add plot context to the first user message if we have boundary data
    const systemWithContext = plotBoundary 
      ? `${SYSTEM_PROMPT}\n\nCURRENT TRACED PLOT DATA (DO NOT RECALCULATE AREA AS W×H, IT IS A POLYGON):\n- Plot Bounding Box: ${plotBoundary.widthM}m × ${plotBoundary.heightM}m\n- True Plot Polygon Area: ${plotBoundary.areaM} sqm\n- Site Exterior Bounding Box: ${plotBoundary.siteWidthM}m × ${plotBoundary.siteHeightM}m\n- True Site Exterior Polygon Area: ${plotBoundary.siteAreaM} sqm\n\nALWAYS use the 'True Polygon Area' for your calculations, do NOT multiply width × height because the user's trace is an irregular polygon, not a perfect rectangle.`
      : SYSTEM_PROMPT;

    const { text, modelUsed } = await callOpenRouterWithFallback(systemWithContext, messages);

    // Try to extract JSON room schedule from the response
    let roomSchedule = null;
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        roomSchedule = JSON.parse(jsonMatch[1]);
      } catch (e) {
        // Couldn't parse, that's fine — will retry on next user message
      }
    }

    return NextResponse.json({ text, roomSchedule, modelUsed });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
