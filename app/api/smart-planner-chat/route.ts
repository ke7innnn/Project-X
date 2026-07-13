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

BHK TOTAL AREA STANDARDS & EXACT ROOM COMPOSITION:
- 1BHK: 35-50 sqm carpet area. MUST CONTAIN EXACTLY: 1 Bedroom, 1 Kitchen, 1 Bathroom, 1 Living Room.
- 2BHK: 55-75 sqm carpet area. MUST CONTAIN EXACTLY: 2 Bedrooms, 1 Kitchen, 1 Bathroom, 1 Living Room.
- 3BHK: 75-110 sqm carpet area. MUST CONTAIN EXACTLY: 3 Bedrooms, 1 Kitchen, 1 Bathroom, 1 Living Room.
- 4BHK: 110-150 sqm carpet area. MUST CONTAIN EXACTLY: 4 Bedrooms, 1 Kitchen, 1 Bathroom, 1 Living Room.

VENTILATION PLACEMENT RULES:
- Any room that requires ventilation (Bedrooms, Living Rooms, Kitchens, Balconies) MUST be positioned on the exterior boundary walls of the flat.
- Only non-habitable rooms (Bathrooms, Toilets, Corridors) can be buried in the interior core without direct exterior ventilation.

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
   ### CRITICAL DENSITY & CARPET AREA RULES (MUST OBEY):
   1. **CRITICAL VISUAL ANALYSIS (THE TRACE IMAGE):**
      You are provided with a visual trace image of the plot boundary (a black polygon on a white canvas). YOU MUST LOOK AT THIS IMAGE carefully! The image reveals the exact geometric shape, deep cutouts, narrow pinch points, and the number of physical "wings" or branches the shape has. Your architectural layout suggestions MUST be mathematically bound by the physical reality of this image. (e.g. If the image shows a cross with 4 distinct wings, you are physically limited to 4 flats maximum. Do not hallucinate extra space!)
   2. **DETERMINE SITE SHAPE COMPLEXITY & DEDUCTION PERCENTAGE:**
      Analyze the visual shape, number of vertices, and indents of the custom shape polygon:
      - **Simple Shapes (4-5 vertices, e.g., Square, Rectangle):** Deduct a base of **25%** from the 'True Site Exterior Polygon Area' for corridors, staircases, and walls.
      - **Medium Shapes (6-8 vertices, e.g., L-shape, U-shape, clean hexagon):** Deduct **35%** from the 'True Site Exterior Polygon Area' due to corner inefficiencies.
      - **Complex/Highly Irregular Shapes (8+ vertices OR shapes with deep inward indents/slots, e.g., Star, Butterfly, Bat, shapes with V-shaped cuts or hollow courtyards):** Deduct **45% to 50%** from the 'True Site Exterior Polygon Area' to account for high layout inefficiencies, pinch points, and required light shafts. If there are any inward-pointing vertices, automatically treat it as a Complex Shape!
   3. The remaining percentage (e.g. 50% for complex/indented shapes) is your absolute maximum Net Carpet Area limit. You are strictly FORBIDDEN from generating a room schedule where the sum of individual room areas exceeds this Net Carpet Area.
   4. **Ground Coverage constraint:** For any irregular shape with indents/slots, the total buildup footprint of all flats combined must not exceed **45-50%** of the True Site Area. This ensures the building has enough room to wrap around the indents without bleeding outside the boundary.
   5. **AI RENDERER CAPABILITY LIMITS & DENSITY RULES (CRITICAL):**
      - The image rendering engine struggles heavily if you cram too many flats into complex shapes. Keep the flat count low, spacious, and highly realistic.
      - For CROSS, STAR, or highly indented shapes: DO NOT suggest more than 1 flat per distinct wing/branch (e.g., a cross shape has 4 wings, so max 4 flats). Do NOT suggest high numbers like 6 or 8 flats!
      - **KEEP FLAT COUNT CONSERVATIVE (LOWER IS BETTER):** Do not suggest high-density layouts. Suggesting fewer, larger, and more spacious flats is highly preferred.
   6. If a user asks for a density (number of flats) that mathematically violates this dynamic capacity limit, you MUST reject the request in the chat interface and explain: "Based on the geometric complexity and the usable area of this shape, only a maximum of N flats can realistically fit."
3. **SMART LAYOUT SUGGESTIONS (FIRST RESPONSE — ALWAYS USE THIS FLOW):**
   When a user asks about flats or layouts, DO NOT ask them for a flat count.
   Instead, act like a master architect. Look at the specific irregular shape (polygon vertices) and area. Suggest UP TO 3 custom layout options (you can give 1, 2, or 3 options depending on what is actually realistic and architecturally feasible for this shape. If only 1 layout is realistic due to geometric constraints or a tiny area, only suggest 1 option! Do not force bad/infeasible designs).
   
   For EACH layout option you suggest, you MUST:
   a) Invent a custom design name based on the shape (e.g., if it's a cross, suggest "Cruciform Wing Layout". If it's a triangle, suggest "Wedge-Core Perimeter Layout"). NEVER just reuse the examples below.
   b) Calculate the EXACT number of flats that fit best in that layout for this shape (ONE specific number, NOT a range). It is fine to suggest fewer flats if the geometry is tight!
   c) Include the math inside the "desc" field of the JSON.
   d) State the BHK type that fits that layout naturally
   
   ⚠ STRICT RULE 1: Give ONE exact flat count per option. The number must be architecturally justified by the geometry and the layout style.
   ⚠ STRICT RULE 2: The JSON below is strictly for FORMATTING purposes. You MUST invent your own "id", "name", and "desc" based on the actual shape. DO NOT reuse "radial", "spine", or "l_wing" unless the shape actually calls for it.
   ⚠ STRICT RULE 3: Always write a brief, friendly conversational message first to explain your suggestions/schedule to the user, and then append the JSON block in a markdown code block (\`\`\`json ... \`\`\`) at the very end of your response. Never output a raw JSON block without some helpful conversational intro text.
   
   Propose layout options like this (Format Example):
   \`\`\`json
   {
     "options": [
       {
         "id": "custom_geometric_name_1",
         "name": "[Invented Shape-Specific Layout Name]",
         "flatCount": 3,
         "bhkType": "3BHK",
         "desc": "Staircase placed in the widest part of the [Shape Name], allowing flats to stretch into the narrow wings. [Math breakdown here]."
       },
       {
         "id": "custom_geometric_name_2",
         "name": "[Invented Shape-Specific Layout Name]",
         "flatCount": 2,
         "bhkType": "2BHK",
         "desc": "A lower density approach to fit the jagged edges of this plot smoothly without squishing rooms. [Math breakdown here]."
       },
       {
         "id": "custom_geometric_name_3",
         "name": "[Invented Shape-Specific Layout Name]",
         "flatCount": 1,
         "bhkType": "4BHK",
         "desc": "Premium sprawling layout utilizing the deep corners of the site. [Math breakdown here]."
       }
     ]
   }
   \`\`\`

4. **ROOM SCHEDULE GENERATION (After user selects a layout option):**
   If the user selects an option (messages contain "using Option: ..."), generate the detailed, mathematically accurate room schedule.
   
   ⚠ **CRITICAL EFFICIENCY RULE:** You only need to define ONE typical flat (or 2 if mirrored variations exist) in the "flats" array.
   You MUST add a "targetFlatCount" field at the root level. The backend will automatically clone and rename them (Flat A, B, C... to N).
   
   \`\`\`json
    {
      "confirmed": true,
      "layoutType": "A highly detailed layout strategy and physical room positioning guide for the image generator. Describe exactly where to place the staircase, elevators, and rooms. Crucial: Use clear descriptive size adjectives (e.g., 'spacious', 'compact', 'extremely tiny', 'large') instead of raw meter numbers, because the image generator cannot read numerical dimensions (e.g., 'This is a single flat. Do not draw stairs or lifts. Place a large, sprawling Living Room in the wide left wing, a medium-sized Kitchen in the center, and make the bedrooms in the narrow right wing extremely compact and tiny to fit inside.').",
      "targetFlatCount": 10,
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
     "totalBuildupArea": <total sqm of the flats listed in array>,
     "buildingFootprint": <sqm>
   }
   \`\`\`

5. Label each flat systematically: FLAT A, FLAT B, etc. Label each room with alphanumeric codes: A1, A2, B1, etc. All dimensions must be in multiples of 0.5m.

6. **ARCHITECTURAL ADVISORY & FEASIBILITY CONSULTING (OPEN-ENDED):**
   - If the user asks open-ended questions like "how many flats can fit here?", "evaluate this shape", etc., act as a senior consulting architect.
   - Use architectural terminology: aspect ratio, structural depth, perimeter ventilation envelope, circulation efficiency, escape distances, setback index, floor coverage ratio, utility core placement, single-loaded vs double-loaded corridors.
   - DO NOT output any JSON block for advisory questions. Only output professional text analysis.

RULES FOR CONCISE DELIVERY:
- Keep all text replies extremely short, direct, and fast to read.
- NEVER write long paragraphs. Use bullet points or 1-2 sentence explanations.
- Speak like a busy, practical architect. Get straight to the point.
- Show your math in clean, short bullet lines.
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
  messages: any[]
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

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'OpenRouter Error');

      const text = data.choices?.[0]?.message?.content;
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
    const { messages, plotBoundary, plotPoints, sitePoints, traceImageBase64 } = await request.json();

    // Prepare polygon coordinates context
    const plotCoordinatesText = plotPoints && plotPoints.length > 0
      ? `Plot Polygon Boundary Points (in meters): [${plotPoints.map((p: any) => `(${p.x}m, ${p.y}m)`).join(', ')}]`
      : '';
    const siteCoordinatesText = sitePoints && sitePoints.length > 0
      ? `Site Exterior Polygon Points (in meters): [${sitePoints.map((p: any) => `(${p.x}m, ${p.y}m)`).join(', ')}]`
      : '';

    // ─── LAYER 1: Deterministic Area Math ─────────────────────────────────
    // Never let the LLM guess — compute the ceiling in code.
    const siteAreaSqm = plotBoundary?.siteAreaM || 0;
    const userText = messages.map((m: any) => m.content).join(' ').toLowerCase();

    // Calculate base shape deduction deterministically based on the number of vertices
    const numPoints = sitePoints?.length || plotPoints?.length || 0;
    let baseDeduction = 0.30;
    let complexityLabel = 'simple shape';
    
    if (numPoints >= 8 && numPoints < 12) {
      baseDeduction = 0.40;
      complexityLabel = 'medium complexity shape';
    } else if (numPoints >= 12) {
      baseDeduction = 0.50;
      complexityLabel = 'highly complex shape';
    }

    let deductionPercent = baseDeduction;
    const deductionBreakdown: string[] = [`${(baseDeduction * 100).toFixed(0)}% base (${complexityLabel}, ${numPoints} vertices)`];

    // Dynamic deductions for amenities the user mentioned
    if (/parking|car\s*park|basement/i.test(userText)) {
      deductionPercent += 0.15;
      deductionBreakdown.push('15% parking/basement');
    }
    if (/garden|park|green\s*space|lawn|landscape/i.test(userText)) {
      deductionPercent += 0.10;
      deductionBreakdown.push('10% garden/green space');
    }
    if (/pool|swimming|gym|club\s*house|amenity/i.test(userText)) {
      deductionPercent += 0.08;
      deductionBreakdown.push('8% amenities (pool/gym/clubhouse)');
    }

    // Ground coverage index limits building footprint to 50% of the site area
    const groundCoverageRatio = 0.50;

    // Remaining percentage represents core, stairs, corridors, structural columns, and walls
    const efficiency = 1 - deductionPercent;

    // The usable flat carpet area is building footprint multiplied by core efficiency
    const usableArea = Math.floor(siteAreaSqm * groundCoverageRatio * efficiency);

    // Standard carpet sizes (in sqm)
    const MIN_FLAT_SIZES: Record<string, number> = {
      '1BHK': 55, '2BHK': 85, '3BHK': 125, '4BHK': 170,
    };

    // Detect BHK type from user messages
    const bhkMatch = userText.match(/(\d)\s*bhk/i);
    const detectedBHK = bhkMatch ? `${bhkMatch[1]}BHK` : '2BHK';
    const minFlatSize = MIN_FLAT_SIZES[detectedBHK] || 85;
    const maxFlats = siteAreaSqm > 0 ? Math.max(1, Math.floor(usableArea / minFlatSize)) : 99;

    console.log(`[SmartPlanner] Deterministic math: site=${siteAreaSqm}sqm, deduction=${(deductionPercent * 100).toFixed(0)}% [${deductionBreakdown.join(' + ')}], usable=${usableArea}sqm, BHK=${detectedBHK}(${minFlatSize}sqm min), maxFlats=${maxFlats}`);

    // ─── Build system prompt with deterministic constraints ───────────────
    const deterministicConstraints = siteAreaSqm > 0 ? `

DETERMINISTIC HARD CAPS (COMPUTED BY CODE — YOU CANNOT OVERRIDE THESE):
- True Site Exterior Polygon Area: ${siteAreaSqm} sqm
- Total Deductions: ${(deductionPercent * 100).toFixed(0)}% [${deductionBreakdown.join(' + ')}]
- Net Usable Carpet Area: ${usableArea} sqm
- Detected Flat Type: ${detectedBHK} (minimum ${minFlatSize} sqm each)
- ⛔ ABSOLUTE MAXIMUM FLATS: ${maxFlats}
- You MUST NOT suggest, accept, or generate more than ${maxFlats} flats under any circumstances.
- If the user asks for more than ${maxFlats} flats, REJECT immediately with: "Based on the geometric constraints (${usableArea} sqm usable), only ${maxFlats} ${detectedBHK} flats can realistically fit."
- Your layout option flat counts MUST each be ≤ ${maxFlats}.` : '';

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
${deterministicConstraints}`
      : SYSTEM_PROMPT;

    let finalMessages = [...messages];
    if (traceImageBase64) {
      const lastUserIndex = finalMessages.map((m: any) => m.role).lastIndexOf('user');
      if (lastUserIndex !== -1) {
        const originalText = finalMessages[lastUserIndex].content;
        finalMessages[lastUserIndex] = {
          role: 'user',
          content: [
            { type: 'text', text: originalText },
            { type: 'image_url', image_url: { url: traceImageBase64 } }
          ]
        };
      }
    }

    const { text, modelUsed } = await callOpenRouterWithFallback(systemWithContext, finalMessages);

    // Try to extract JSON room schedule or layout options from the response
    let roomSchedule = null;
    let layoutOptions = null;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonString = jsonMatch ? jsonMatch[1] : text;

    try {
      const parsed = JSON.parse(jsonString);
        if (parsed.options) {
          layoutOptions = parsed.options;

          // ─── LAYER 2a: Hard clamp layout option flat counts ──────────────
          if (maxFlats < 99) {
            for (const opt of layoutOptions) {
              if (opt.flatCount && opt.flatCount > maxFlats) {
                console.warn(`[SmartPlanner] CLAMP: Layout "${opt.name}" suggested ${opt.flatCount} flats → clamped to ${maxFlats}`);
                opt.flatCount = maxFlats;
                opt.desc = `[Adjusted: max ${maxFlats} flats for this site] ${opt.desc}`;
              }
            }
          }
        } else if (parsed.confirmed) {
          roomSchedule = parsed;

          // ─── LAYER 2b: Hard clamp targetFlatCount ────────────────────────
          if (maxFlats < 99 && roomSchedule.targetFlatCount && roomSchedule.targetFlatCount > maxFlats) {
            console.warn(`[SmartPlanner] CLAMP: LLM requested ${roomSchedule.targetFlatCount} flats → clamped to ${maxFlats}`);
            roomSchedule.targetFlatCount = maxFlats;
          }

          // Auto-expand flats to handle large numbers (e.g. 10 flats) without LLM truncation
          if (roomSchedule.targetFlatCount && roomSchedule.flats && roomSchedule.flats.length > 0) {
            const requestedCount = roomSchedule.targetFlatCount;
            const currentFlats = roomSchedule.flats;
            const expandedFlats = [];

            for (let i = 0; i < requestedCount; i++) {
              const flatTemplate = currentFlats[i % currentFlats.length];
              const flatLetter = String.fromCharCode(65 + i); // A, B, C, D...

              // Deep clone the rooms and rename their codes to match the new flat letter
              const clonedRooms = flatTemplate.rooms.map((room: any) => {
                const roomSuffix = room.code.replace(/^[A-Z]/, '');
                return {
                  ...room,
                  code: `${flatLetter}${roomSuffix}`
                };
              });

              expandedFlats.push({
                ...flatTemplate,
                id: flatLetter,
                name: `Flat ${flatLetter}`,
                rooms: clonedRooms
              });
            }
            roomSchedule.flats = expandedFlats;
            // Re-calculate total buildup area
            roomSchedule.totalBuildupArea = expandedFlats.reduce((sum, f) => sum + f.rooms.reduce((s: number, r: any) => s + r.area, 0), 0);
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }

    // Include maxFlats in the response so the frontend can display the cap
    return NextResponse.json({ text, roomSchedule, layoutOptions, modelUsed, maxFlats: maxFlats < 99 ? maxFlats : undefined });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
