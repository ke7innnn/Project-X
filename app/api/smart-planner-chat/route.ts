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

RULES:
- Be conversational and friendly but precise like a real architect
- ALWAYS show your math working (e.g. "3 flats × 75 sqm = 225 sqm needed, your site exterior = 200 sqm, NOT POSSIBLE")  
- Suggest alternatives when something is not possible
- Ask clarifying questions if the user hasn't provided plot dimensions yet
- If the user asks to modify a room ("make master bedroom bigger"), recalculate EVERYTHING and re-output the JSON
- Never make up numbers. Every dimension must be architecturally logical.
- All dimensions must be in multiples of 0.5m (real architects work to half-metre grids)
`;

export async function POST(request: Request) {
  try {
    const { messages, plotBoundary } = await request.json();

    // Add plot context to the first user message if we have boundary data
    const systemWithContext = plotBoundary 
      ? `${SYSTEM_PROMPT}\n\nCURRENT TRACED PLOT: The user has traced a plot boundary of approximately ${plotBoundary.widthM}m × ${plotBoundary.heightM}m = ${plotBoundary.areaM} sqm. Site exterior (buildable area after setbacks) is approximately ${plotBoundary.siteWidthM}m × ${plotBoundary.siteHeightM}m = ${plotBoundary.siteAreaM} sqm.`
      : SYSTEM_PROMPT;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://project-x-mu-eight.vercel.app',
        'X-Title': 'Smart Planner',
      },
      body: JSON.stringify({
        model: 'groq/llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemWithContext },
          ...messages
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Try to extract JSON room schedule from the response
    let roomSchedule = null;
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        roomSchedule = JSON.parse(jsonMatch[1]);
      } catch (e) {
        // Couldn't parse, that's fine
      }
    }

    return NextResponse.json({ 
      text,
      roomSchedule 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
