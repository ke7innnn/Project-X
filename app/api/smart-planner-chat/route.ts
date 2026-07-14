import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

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
    1. **CRITICAL VISUAL ANALYSIS (THE TRACE IMAGE & INSPIRATION TEMPLATE):**
       - **The Trace Image:** You are provided with a visual trace image of the plot boundary (a black polygon on a white canvas). YOU MUST LOOK AT THIS IMAGE carefully! The image reveals the exact geometric shape, deep cutouts, narrow pinch points, and the number of physical "wings" or branches the shape has. Your architectural layout suggestions MUST be mathematically bound by the physical reality of this image. (e.g. If the image shows a cross with 4 distinct wings, you are physically limited to 4 flats maximum. Do not hallucinate extra space!)
       - **The Inspiration Template Image:** A second image may be attached representing a professional, clean floor plan designed for the same shape family (e.g. L-shape, Tri-star radial, Butterfly, H-shape dumbbell). YOU MUST LOOK AT THIS TEMPLATE to take layout inspiration:
         - Notice where a professional architect places the service core (stairs, elevator lobby, foyer).
         - Notice how corridors branch to distribute flat entrances cleanly.
         - Notice the general zoning and partition of flats.
         - **CRITICAL:** Ignore all furniture, colors, textures, text values, dimensions, or grid lines in the template image. Focus only on the spatial floor plan division.
         - In your room schedule output, describe in "layoutType" how to replicate this professional staircase, elevator core, and corridor arrangement inside the user's custom-traced boundary.
    2. **DETERMINE SITE SHAPE COMPLEXITY & DEDUCTION PERCENTAGE:**
      Analyze the visual shape, number of vertices, and indents of the custom shape polygon:
      - **Simple Shapes (4-5 vertices, e.g., Square, Rectangle):** Deduct a base of **25%** from the 'True Site Exterior Polygon Area' for corridors, staircases, and walls.
      - **Medium Shapes (6-8 vertices, e.g., L-shape, U-shape, clean hexagon):** Deduct **35%** from the 'True Site Exterior Polygon Area' due to corner inefficiencies.
      - **Complex/Highly Irregular Shapes (8+ vertices OR shapes with deep inward indents/slots, e.g., Star, Butterfly, Bat, shapes with V-shaped cuts or hollow courtyards):** Deduct **45% to 50%** from the 'True Site Exterior Polygon Area' to account for high layout inefficiencies, pinch points, and required light shafts. If there are any inward-pointing vertices, automatically treat it as a Complex Shape!
   3. The remaining percentage (e.g. 50% for complex/indented shapes) is your absolute maximum Net Carpet Area limit. You are strictly FORBIDDEN from generating a room schedule where the sum of individual room areas exceeds this Net Carpet Area.
   4. **Ground Coverage constraint:** For any irregular shape with indents/slots, the total buildup footprint of all flats combined must not exceed **45-50%** of the True Site Area. This ensures the building has enough room to wrap around the indents without bleeding outside the boundary.
   5. **AI RENDERER CAPABILITY LIMITS & DENSITY RULES (CRITICAL):**
       - The image rendering engine struggles heavily if you cram too many flats into complex shapes. Keep the flat count spacious and highly realistic.
       - **DYNAMIC SHAPE ADAPTABILITY (VERSATILITY):** Do not restrict yourself to standard shapes (L, T, Y, Cross). If the user provides a completely bizarre, asymmetrical, or custom freeform shape, you MUST adapt dynamically!
       - Treat every drawing uniquely. If the shape has 5 weird asymmetrical branches, suggest 5 flats. If it has 1 big mass and 1 tiny nub, suggest 2 flats. You are fully unleashed to handle ANY custom polygon geometry based purely on visual inspection of its arms/tips.
       - **KEEP FLAT COUNT CONSERVATIVE:** Sparing room space and ensuring clean ventilation is better than cramming flats. Never suggest high-density layouts (e.g. 6+ flats) on custom traces UNLESS the shape physically has that many distinct outward branches.
    6. If the user requests more flats than standard capacity limits, warning them about compact room sizing is required, but you must still proceed and fulfill their request by proposing ultra-efficient compact units. Do not refuse to design them.
3. **SMART LAYOUT SUGGESTIONS (FIRST RESPONSE — ALWAYS USE THIS FLOW):**
   When a user asks about flats or layouts, DO NOT ask them for a flat count.
   Instead, act like a master architect.

   **STEP A — WING ANATOMY ANALYSIS (MANDATORY, DO THIS FIRST):**
   Before suggesting any options, silently analyze the trace image like a structural engineer:
   - VISUALLY COUNT the number of distinct **tips, outward protrusions, or arms** sticking out from the shape's center mass in the trace image. (e.g., an L-shape has 2 tips, a T-shape or Y-shape has 3 distinct tips, a cross has 4 tips). 
   - Even if two arms form a wide angle, count them as separate tips!
   - Your suggested flat count MUST EXACTLY MATCH this visual tip/protrusion count (e.g., if you see 3 tips sticking out, suggest exactly 3 flats. If you see 4 tips, suggest exactly 4 flats). Do NOT force extra flats that will spoil the exterior shape.
   - Identify the **geometric center or junction point** where these arms meet — this is where the shared staircase/lift core will go.
   - **USER REQUESTS (CRITICAL):** If the user asks to add a stair, a lift, or an extra room, or any custom requirement, you MUST catch this and explicitly incorporate it into the layout options and the final room schedule.

   **STEP B — SUGGEST LAYOUT OPTIONS:**
   Suggest UP TO 3 layout options based on the wing analysis. Each option MUST be geometrically feasible.
   
   For EACH layout option you suggest, you MUST:
   a) Invent a custom design name based on the shape (e.g., if it's a cross, suggest "Cruciform Wing Layout"). NEVER reuse the examples.
   b) Calculate the EXACT number of flats that fit, based on viable wing count. ONE specific number, NOT a range.
   c) Include the math and wing breakdown inside the "desc" field.
   d) State the BHK type that fits naturally.
   
   ⚠ STRICT RULE 1: Give ONE exact flat count per option. The number must be architecturally justified by the wing geometry.
   ⚠ STRICT RULE 2: You MUST invent your own "id", "name", and "desc" based on the actual shape.
   ⚠ STRICT RULE 3: Always write a brief, friendly conversational message first, then append the JSON block.
   
   Propose layout options like this (Format Example):
   \`\`\`json
   {
     "options": [
       {
         "id": "custom_geometric_name_1",
         "name": "[Invented Shape-Specific Layout Name]",
         "flatCount": 3,
         "bhkType": "3BHK",
         "desc": "Wing Analysis: This Y-shape has 3 arms — top-left, top-right, and bottom. Staircase placed at center junction. Flat A occupies top-left arm (est. 45sqm), Flat B occupies top-right arm (est. 42sqm), Flat C occupies bottom arm (est. 40sqm). Total: 127sqm buildup within 50% coverage limit."
       },
       {
         "id": "custom_geometric_name_2",
         "name": "[Invented Shape-Specific Layout Name]",
         "flatCount": 2,
         "bhkType": "2BHK",
         "desc": "Lower density: top-left and top-right arms merged into one larger Flat A. Bottom arm becomes Flat B. More spacious rooms, better ventilation through center courtyard."
       }
     ]
   }
   \`\`\`

4. **ROOM SCHEDULE GENERATION (After user selects a layout option):**
   If the user selects an option (messages contain "using Option: ..."), generate the detailed, mathematically accurate room schedule.
   
   ⚠ **CRITICAL EFFICIENCY RULE:** You only need to define ONE typical flat (or 2 if mirrored variations exist) in the "flats" array.
   You MUST add a "targetFlatCount" field at the root level. The backend will automatically clone and rename them (Flat A, B, C... to N).
   
   ⚠ **MANDATORY LAYOUT TYPE RULE — WING ZONE ASSIGNMENT (MOST IMPORTANT):**
   The "layoutType" field is the spatial brain of the image generator. It MUST contain:
   1. **Wing-by-wing flat assignment:** Explicitly state which flat occupies which physical zone. e.g. "FLAT A occupies the TOP-LEFT WING. FLAT B occupies the TOP-RIGHT WING. FLAT C occupies the BOTTOM WING."
   2. **Core location:** Exactly where the shared staircase and lift core sit. e.g. "The staircase + lift core is centered at the Y-junction, equidistant from all three flat entrances."
   3. **Room-level guidance:** For each flat, state which specific rooms go where inside their wing. e.g. "In Flat A's top-left wing: Living Room faces the outer tip, Kitchen is mid-wing, Bedrooms are closest to the core."
   4. **Prohibited zones:** State what must remain empty. e.g. "The center junction is ONLY for the lobby and stairs. NO flat rooms may intrude into this zone."
   5. Use ONLY descriptive positional language (top, bottom, left, right, inner, outer, tip, base, center). NO raw meter numbers.
   
   \`\`\`json
    {
      "confirmed": true,
      "layoutType": "WING ASSIGNMENT: FLAT A → TOP-LEFT WING (Living faces the outer tip, Kitchen mid-wing, Bedrooms toward core). FLAT B → TOP-RIGHT WING (mirror of Flat A). FLAT C → BOTTOM WING (elongated — Living at the tip, then Kitchen, then 2 bedrooms and bath stacked toward the core). CORE: Centered staircase + single lift at the Y-junction, accessed by a compact T-shaped lobby. The junction center is EXCLUSIVELY for stairs+lift. No flat rooms in the junction.",
      "targetFlatCount": 3,
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
    const { messages, plotBoundary, plotPoints, sitePoints, traceImageBase64, shapePreset } = await request.json();

    const userText = messages.map((m: any) => m.content).join(' ').toLowerCase();

    // Classify shape to load matching inspiration template
    let classifiedShape: string | null = shapePreset || null;
    
    // If custom drawn (no shapePreset), run a quick visual classification call via Gemini
    if (!classifiedShape && traceImageBase64) {
      try {
        console.log('[SmartPlanner] Custom trace detected. Calling visual classifier...');
        const classificationRes = await callOpenRouterWithFallback(
          "You are a professional architectural shape classification assistant. Respond with ONLY the matching category name in lowercase.",
          [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: "Classify this black-and-white plot trace image into one of these exact categories: 'box', 'l-shape', 'u-shape', 't-shape', 'cruciform', 'butterfly', 'y-shape', 'h-shape'. Output ONLY the matching name, completely lowercase, with no other text, punctuation, or explanation."
                },
                { type: 'image_url', image_url: { url: traceImageBase64 } }
              ]
            }
          ]
        );
        const detected = classificationRes.text.trim().toLowerCase();
        // Keep only valid classes
        if (['box', 'l-shape', 'u-shape', 't-shape', 'cruciform', 'butterfly', 'y-shape', 'h-shape'].includes(detected)) {
          classifiedShape = detected;
          console.log(`[SmartPlanner] Visual classifier output: "${classifiedShape}"`);
        } else {
          console.warn(`[SmartPlanner] Visual classifier returned unknown shape: "${detected}"`);
        }
      } catch (err: any) {
        console.warn('[SmartPlanner] Visual classification call failed:', err.message);
      }
    }

    // Keyword scans to support user descriptions (e.g. butterfly, radial star, dumbbell)
    if (userText.includes('butterfly') || userText.includes('hexagonal')) {
      classifiedShape = 'butterfly';
    } else if (userText.includes('y-shape') || userText.includes('tri-star') || userText.includes('radial')) {
      classifiedShape = 'y-shape';
    } else if (userText.includes('h-shape') || userText.includes('dumbbell')) {
      classifiedShape = 'h-shape';
    }

    // Load template image base64
    let templateImageBase64: string | null = null;
    if (classifiedShape) {
      const templateFilenameMap: Record<string, string> = {
        'box': 'box',
        'l-shape': 'l-shape',
        'u-shape': 'u-shape',
        't-shape': 't-shape',
        'h-shape': 'h-shape',
        'y-shape': 'y-shape',
        'butterfly': 'butterfly',
        'cruciform': 'cruciform',
      };
      const baseName = templateFilenameMap[classifiedShape];
      if (baseName) {
        try {
          const ext = (baseName === 'butterfly' || baseName === 'cruciform') ? 'png' : 'jpg';
          
          // Randomly select one of the 3 templates if they exist (e.g. l-shape-1.jpg, l-shape-2.jpg, l-shape-3.jpg)
          const index = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
          let filename = `${baseName}-${index}.${ext}`;
          let filePath = path.join(process.cwd(), 'public', 'inspiration-templates', filename);
          
          // Fallback to -1 if the randomly selected one doesn't exist
          if (!fs.existsSync(filePath)) {
            filename = `${baseName}-1.${ext}`;
            filePath = path.join(process.cwd(), 'public', 'inspiration-templates', filename);
          }

          if (fs.existsSync(filePath)) {
            const fileBuffer = fs.readFileSync(filePath);
            const mimeType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
            templateImageBase64 = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
            console.log(`[SmartPlanner] Loaded inspiration template for shape "${classifiedShape}": ${filename}`);
          }
        } catch (err: any) {
          console.warn('[SmartPlanner] Failed to load template image:', err.message);
        }
      }
    }

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
      '1BHK': 35, '2BHK': 55, '3BHK': 75, '4BHK': 105,
    };

    // Detect BHK type from user messages
    const bhkMatch = userText.match(/(\d)\s*bhk/i);
    const detectedBHK = bhkMatch ? `${bhkMatch[1]}BHK` : '2BHK';
    const minFlatSize = MIN_FLAT_SIZES[detectedBHK] || 55;
    // User explicitly requested LLM to handle flat counting based on visual wings, no hard clamping.
    const maxFlats = 99; 

    console.log(`[SmartPlanner] Deterministic math: site=${siteAreaSqm}sqm, usable=${usableArea}sqm, BHK=${detectedBHK}(${minFlatSize}sqm min), maxFlats=UNLIMITED(Visual)`);

    // ─── Build system prompt with deterministic constraints ───────────────
    const deterministicConstraints = siteAreaSqm > 0 ? `

DETERMINISTIC CAPACITY GUIDELINES (COMPUTED BY CODE):
- True Site Exterior Polygon Area: ${siteAreaSqm} sqm
- Total Deductions: ${(deductionPercent * 100).toFixed(0)}% [${deductionBreakdown.join(' + ')}]
- Net Usable Carpet Area: ${usableArea} sqm
- Detected Flat Type: ${detectedBHK} (minimum ${minFlatSize} sqm each)` : '';

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
        const contentArray: any[] = [
          { type: 'text', text: originalText },
          { type: 'image_url', image_url: { url: traceImageBase64 } }
        ];

        if (templateImageBase64) {
          contentArray.push({ type: 'image_url', image_url: { url: templateImageBase64 } });
        }

        finalMessages[lastUserIndex] = {
          role: 'user',
          content: contentArray
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
        } else if (parsed.confirmed) {
          roomSchedule = parsed;

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
