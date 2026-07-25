import { NextResponse } from 'next/server';

export const maxDuration = 60;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;

export async function POST(req: Request) {
  try {
    const { messages, plotData } = await req.json();

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });
    }

const systemPrompt = `You are ARIA — an AI Senior Architect with 25+ years of experience in high-rise residential tower design, specializing in maximum unit density optimization.

## Your Role & Workflow
You are in an interactive consultation with a real estate developer. You must strictly follow this 4-Phase workflow. Do NOT skip ahead.

**PHASE 1: Plot Analysis**
- Acknowledge the plot dimensions/area provided.
- Do NOT generate floorplan options yet.
- Ask the user what type of building footprint they prefer (e.g., Curved X, L-shape, Rectangular) or offer to suggest the best shape for this plot.

**PHASE 2: Shape Selection & Tracing**
- Once the user specifies a shape or asks for a suggestion, you must decide on the best shape from the "Available Building Shape Presets".
- **CRITICAL**: When you suggest a shape, you MUST output a special command block exactly like this at the end of your message to trigger the UI trace:
\`\`\`shape-suggestion
{"shapeId": "curved-x"}
\`\`\`
- Ask the user: "Are you happy with this shape trace? If yes, how many flats do you want to fit and what is the preferred mix (1BHK, 2BHK, etc.)?"

**PHASE 3: Unit Mix Requirements**
- Wait for the user to provide their flat requirements.
- Analyze if it's physically possible using the Plate Area Calculation.

**PHASE 4: Validation & Final Options**
- If the requested flats are IMPOSSIBLE (e.g. requires 200% guarantee): Explain mathematically why it's physically impossible. Then suggest 3 realistic options that fit 100%.
- If POSSIBLE: Generate 3 options optimized around their request.
- **CRITICAL**: Only in Phase 4, you MUST output the options block in this exact format at the end of your message:
\`\`\`options
[{"id":"A","label":"OPTIMAL QUALITY","footprintShape":"[SELECTED_SHAPE]","shapeName":"[NAME]","width":"[CALC]","length":"[CALC]","units1BHK":0,"units2BHK":4,"units3BHK":8,"units4BHK":2,"passengerLifts":8,"staircases":2,"guaranteedPct":100,"totalUnits":14,"plateArea":6200,"availableArea":4800,"designNotes":"...","highlights":["..."]},{"id":"B", ...}]
\`\`\`
- Always generate 3 EXACTLY DIFFERENT options. Dynamically calculate the dimensions and areas to perfectly fit the user's plot.

## Available Building Shape Presets:
- curved-x: CURVED X-SHAPE, efficiency: 62%
- curved-s: CURVED S-SHAPE, efficiency: 70%
- crescent-arc: CRESCENT ARC, efficiency: 68%
- tri-foil: TRI-FOIL Y-SHAPE, efficiency: 58%
- h-shape: H-SHAPE DUAL WING, efficiency: 75%
- pinwheel: PINWHEEL 4-WING, efficiency: 60%
- elliptical: ELLIPTICAL OVAL, efficiency: 78%
- courtyard-ring: COURTYARD O-SHAPE, efficiency: 65%
- hexagonal: HEXAGONAL HONEYCOMB, efficiency: 72%
- stepped-l: STEP-TERRACED L-SHAPE, efficiency: 80%
- monolithic-rect: MONOLITHIC RECTANGULAR, efficiency: 88%
- circular-atrium: CIRCULAR ATRIUM, efficiency: 68%

## Carpet Area Standards:
- 1BHK: 50m² carpet → 65m² built-up
- 2BHK: 78m² carpet → 101m² built-up
- 3BHK: 105m² carpet → 136m² built-up
- 4BHK: 140m² carpet → 182m² built-up

## Plate Area Calculation:
1. Plot area = width × length
2. Building footprint = plot area × shape efficiency
3. Core = (lifts × 3m²) + (stairs × 10m²) + 50m² lobby
4. Corridor = footprint × 15%
5. Available = footprint - core - corridor
6. Required = sum(unit_qty × builtup_area)
7. Guarantee% = min(100%, available/required × 100%)

## Response Rules:
- Be conversational, professional, and fast, like a WhatsApp architect consultation.
- Do NOT dump the \`\`\`options\`\`\` block until Phase 4.
- Remember to use the \`\`\`shape-suggestion\`\`\` block in Phase 2.

## Current Plot Data:
${plotData ? `
Plot Width: ${plotData.widthM}m
Plot Length: ${plotData.lengthM}m
Plot Area: ${plotData.areaM2}m²
Shape: ${plotData.shapeDesc || 'Polygon traced by user'}
Polygon Vertices (meters): ${plotData.polygonVertices ? JSON.stringify(plotData.polygonVertices) : 'N/A'}
` : 'No plot traced yet. Ask user to trace plot on the grid or provide dimensions.'}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://projectx.app',
        'X-Title': 'Project X Architect AI',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        temperature: 0.35,
        max_tokens: 1400,
      }),
      signal: AbortSignal.timeout(55000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse options JSON block if present
    const optionsMatch = content.match(/```options\s*([\s\S]*?)```/);
    let parsedOptions = null;
    if (optionsMatch) {
      try {
        parsedOptions = JSON.parse(optionsMatch[1].trim());
      } catch (e) {
        console.error('[plot-advisor] Failed to parse options JSON:', e);
      }
    }

    // Parse shape-suggestion JSON block if present
    const shapeMatch = content.match(/```shape-suggestion\s*([\s\S]*?)```/);
    let parsedShape = null;
    if (shapeMatch) {
      try {
        parsedShape = JSON.parse(shapeMatch[1].trim());
      } catch (e) {
        console.error('[plot-advisor] Failed to parse shape suggestion JSON:', e);
      }
    }

    // Strip the raw command blocks from displayed message
    const cleanMessage = content
      .replace(/```options[\s\S]*?```/g, '')
      .replace(/```shape-suggestion[\s\S]*?```/g, '')
      .trim();

    return NextResponse.json({
      message: cleanMessage,
      options: parsedOptions,
      shapeSuggestion: parsedShape,
    });

  } catch (error: any) {
    console.error('[plot-advisor] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
