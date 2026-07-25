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

## Your Role
Help real estate developers plan high-rise towers. Analyze plot boundaries, suggest best building footprints, calculate unit counts with guaranteed ventilation and compliance.

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
- Be fast and direct like a WhatsApp architect consultation
- When plot is provided, IMMEDIATELY calculate and suggest 3 options
- Always show specific numbers
- When user confirms, say "Parameters set! Click GENERATE FLOOR PLAN."

## CRITICAL: When showing options, ALWAYS include this exact JSON block at the end:

\`\`\`options
[{"id":"A","label":"OPTIMAL QUALITY — 100% GUARANTEED","footprintShape":"curved-x","shapeName":"CURVED X-SHAPE","width":"100","length":"100","units1BHK":0,"units2BHK":4,"units3BHK":8,"units4BHK":2,"passengerLifts":8,"staircases":2,"guaranteedPct":100,"totalUnits":14,"plateArea":6200,"availableArea":4800,"designNotes":"Curved X-shape tower with panoramic views on all 4 wings.","highlights":["All units with external facades","360 panoramic views","Cross-ventilation guaranteed"]},{"id":"B","label":"MAX DENSITY — 85% GUARANTEED","footprintShape":"monolithic-rect","shapeName":"MONOLITHIC RECTANGULAR","width":"100","length":"100","units1BHK":2,"units2BHK":6,"units3BHK":8,"units4BHK":2,"passengerLifts":8,"staircases":2,"guaranteedPct":85,"totalUnits":18,"plateArea":8800,"availableArea":7200,"designNotes":"Double-loaded rectangular slab maximizing unit count.","highlights":["Maximum density","Simple construction","Good core efficiency"]},{"id":"C","label":"BALANCED MIX — 95% GUARANTEED","footprintShape":"h-shape","shapeName":"H-SHAPE DUAL WING","width":"100","length":"100","units1BHK":0,"units2BHK":4,"units3BHK":6,"units4BHK":2,"passengerLifts":6,"staircases":2,"guaranteedPct":95,"totalUnits":12,"plateArea":7500,"availableArea":6000,"designNotes":"H-shape twin wings with premium unit mix.","highlights":["Balanced efficiency","High privacy","Wide views"]}]
\`\`\`

Replace the example numbers above with ACTUAL calculations based on the plot data provided.

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

    // Strip the raw options JSON from displayed message (show formatted cards instead)
    const cleanMessage = content.replace(/```options[\s\S]*?```/g, '').trim();

    return NextResponse.json({
      message: cleanMessage,
      options: parsedOptions,
    });

  } catch (error: any) {
    console.error('[plot-advisor] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
