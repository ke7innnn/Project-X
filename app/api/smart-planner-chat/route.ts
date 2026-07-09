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
1. The user will provide raw plot dimensions, custom shape coordinate polygons, and flat requirements (BHK, quantity).
2. **GEOMETRY FEASIBILITY CHECK (CRITICAL):**
   - Check the True Site Exterior Polygon Area. Each flat needs minimum carpet area: 1BHK = 35sqm, 2BHK = 55sqm, 3BHK = 75sqm.
   - Analyze the shape coordinates. A standard apartment building needs a minimum structural width of 3.5m to accommodate a room + a corridor.
   - If the site polygon is too small or has extremely narrow necks (< 3.5m wide), you MUST deny the request. Explain clearly in the text: "Sorry, this shape is too narrow/small..." and do NOT output any JSON block.
3. **TWO-STEP OPTION FLOW (IF FEASIBLE):**
   - **Step 1 (First request):** Do not output the room schedule yet. Instead, look at the traced shape coordinates and suggest 2-3 creative layout concepts suited for this shape (e.g. Radial lobby core for squares/circles, Curved wing spine for S-shapes, L-shaped corridor, or Central atrium/courtyard layout).
     Output the options as a JSON block:
     \`\`\`json
     {
       "options": [
         { "id": "radial", "name": "Radial central lobby core", "desc": "Staircase and lift in the exact center, flats radiating outwards. Perfect for circular/square boundaries." },
         { "id": "curved_spine", "name": "Curved wing spine corridor", "desc": "Corridor sweeps through the S-bend, rooms align on the boundary. Ideal for this S-curve." }
       ]
     }
     \`\`\`
   - **Step 2 (After user selects an option):** If the user selects an option (e.g., messages contain "using Option: ..."), generate the detailed, mathematically accurate room schedule tailored *exactly* to that selected layout style.
     Output the final room schedule JSON block:
     \`\`\`json
     {
       "confirmed": true,
       "layoutType": "Selected layout strategy name and short guide for the image generator",
       "plotW": <number>,
       "plotH": <number>,
       "siteExteriorW": <number>,
       "siteExteriorH": <number>,
       "flats": [
         {
           "id": "A",
           "name": "Flat A",
           "rooms": [
             { "code": "A1", "name": "Master Bedroom", "w": 4, "h": 5, "area": 20 }
           ]
         }
       ],
       "totalBuildupArea": <total sqm>,
       "buildingFootprint": <sqm>
     }
     \`\`\`

4. Label each flat systematically: FLAT A, FLAT B, etc. Label each room with alphanumeric codes: A1, A2, B1, etc. All dimensions must be in multiples of 0.5m.

RULES FOR CONCISE DELIVERY:
- Keep all explanations and text replies extremely short, direct, and fast to read.
- NEVER write long paragraphs of text. Use bullet points or 1-2 sentence explanations.
- Speak like a busy, practical architect. Get straight to the point.
- Show your math in clean, short bullet lines.
- The "flats" array in the final JSON block MUST list every single flat explicitly.
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
    const { messages, plotBoundary, plotPoints, sitePoints } = await request.json();

    // Prepare polygon coordinates context
    const plotCoordinatesText = plotPoints && plotPoints.length > 0
      ? `Plot Polygon Boundary Points (in meters): [${plotPoints.map((p: any) => `(${p.x}m, ${p.y}m)`).join(', ')}]`
      : '';
    const siteCoordinatesText = sitePoints && sitePoints.length > 0
      ? `Site Exterior Polygon Points (in meters): [${sitePoints.map((p: any) => `(${p.x}m, ${p.y}m)`).join(', ')}]`
      : '';

    // Add plot context to the system prompt
    const systemWithContext = plotBoundary 
      ? `${SYSTEM_PROMPT}
      
CURRENT TRACED PLOT DATA (IRREGULAR POLYGON):
- Plot Bounding Box: ${plotBoundary.widthM}m × ${plotBoundary.heightM}m
- True Plot Polygon Area: ${plotBoundary.areaM} sqm
- Site Exterior Bounding Box: ${plotBoundary.siteWidthM}m × ${plotBoundary.siteHeightM}m
- True Site Exterior Polygon Area: ${plotBoundary.siteAreaM} sqm
${plotCoordinatesText}
${siteCoordinatesText}

⚠ ALWAYS use the 'True Site Exterior Polygon Area' for your carpet area calculations. Check if the shape points allow a layout without choking the rooms.`
      : SYSTEM_PROMPT;

    const { text, modelUsed } = await callOpenRouterWithFallback(systemWithContext, messages);

    // Try to extract JSON room schedule or layout options from the response
    let roomSchedule = null;
    let layoutOptions = null;
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.options) {
          layoutOptions = parsed.options;
        } else if (parsed.confirmed) {
          roomSchedule = parsed;
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    return NextResponse.json({ text, roomSchedule, layoutOptions, modelUsed });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
