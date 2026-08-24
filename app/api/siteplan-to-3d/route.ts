import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 300; // 5 min timeout for Vercel functions

fal.config({ credentials: process.env.FAL_KEY });

interface ColorLegendItem {
  color: string;
  colorName: string;
  label: string;
}

interface TextPinItem {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  text: string;
}

async function uploadBase64ToFalStorage(dataUri: string): Promise<string> {
  const base64 = dataUri.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  const blob = new Blob([buffer], { type: 'image/png' });
  const file = new File([blob], 'site_plan_input.png', { type: 'image/png' });
  return fal.storage.upload(file);
}

async function fetchToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`);
  const ct = res.headers.get('content-type') || 'image/png';
  const buf = await res.arrayBuffer();
  return `data:${ct};base64,${Buffer.from(buf).toString('base64')}`;
}

async function runModel(falModel: string, input: Record<string, any>): Promise<{ url: string; seed?: number }> {
  const result = await fal.subscribe(falModel, { input });
  const data = (result as any)?.data || result;
  const images = data?.images;
  if (!images || images.length === 0) throw new Error(`${falModel} returned no images`);
  const seed = data?.seed ?? (result as any)?.seed;
  return { url: images[0].url, seed };
}

// Fallback deterministic prompt synthesizer in case LLM is unavailable
function buildRuleBasedMasterPrompt(
  colorLegend: ColorLegendItem[],
  textPins: TextPinItem[],
  chatPrompt: string,
  lightingMode: 'day' | 'night' | 'custom',
  customTheme: string
): string {
  const legendDescriptions = colorLegend
    .map(item => `* **${item.colorName.toUpperCase()} (${item.color}) Zones**: Render as photorealistic ${item.label.toUpperCase()} with authentic materials, realistic surface textures, depth, and landscaping.`)
    .join('\n');

  const textPinDescriptions = textPins.length > 0
    ? `\n### Specific Text Annotations & Placements Placed on Plan:\n` +
      textPins.map(pin => `* Location at approximately (${pin.x.toFixed(0)}% X, ${pin.y.toFixed(0)}% Y) labeled "${pin.text.toUpperCase()}": Construct and render a photorealistic ${pin.text.toUpperCase()} here seamlessly integrated into the surrounding landscape.`).join('\n')
    : '';

  let lightingInstruction = '';
  if (lightingMode === 'day') {
    lightingInstruction = `* **CRAZY REALISTIC DAYLIGHTING & ATMOSPHERE**: Ultra-dramatic, brilliant high-noon sun and vibrant golden ambient daylight with crazy volumetric sunbeams. Razor-sharp architectural drop shadows cast by the buildings, glistening crystal-clear turquoise swimming pool water with vivid caustic ripples, glass facade sky reflections, vibrant lush botanical foliage highlights, and ultra-crisp physical micro-textures on every surface.`;
  } else if (lightingMode === 'night') {
    lightingInstruction = `* **CRAZY DRAMATIC NIGHT LIGHTING & ATMOSPHERE**: Showstopping, cinematic architectural twilight and night scene. Glowing neon turquoise underwater pool luminaires, warm 3000K golden interior window glows across all building floors, luminous landscape LED pathway bollards, tree spotlights casting dramatic shadows, glowing vehicle headlights on asphalt roads, and rich indigo twilight atmosphere with crazy contrast and ambient occlusion.`;
  } else {
    lightingInstruction = `* **CRAZY CUSTOM CINEMATIC LIGHTING**: ${customTheme || 'Dramatic golden hour sunset with rich orange-pink horizon glow, long cinematic shadows, and warm architectural rim lighting with crazy volumetric depth.'}`;
  }

  return `Transform this 2D site plan and masterplan diagram into an ultra-realistic, publication-grade 3D architectural masterplan aerial render.

### CAMERA ANGLE (CRITICAL MANDATE — STRICT TOP VIEW ONLY):
* **STRICT 90° TOP-DOWN OVERHEAD VIEW**: The camera angle MUST be a direct, straight-down top view (orthographic aerial top view). 
* Do NOT tilt the camera into a low-angle perspective or horizon slant.
* Maintain the true overhead layout, radial curves, and exact footprint orientations directly from above, with extruded 3D building roofs, realistic drop shadows, and landscape depth visible from the top-down vantage point.

### STRICT PROHIBITIONS — ZERO TEXT & ZERO DIMENSIONS (ABSOLUTE MANDATE):
* **ZERO TEXT OF ANY KIND**: Absolutely NO letters, words, room names, plot codes, numbers, or typography anywhere in the image.
* **ZERO DIMENSION LINES OR LABELS**: NO measurement arrows, scale bars, grid lines, CAD callouts, or legend overlays.
* The 2D site plan and text pins are strictly semantic layout directives for the 3D builder — they MUST be 100% excluded and ignored from the visual rendering so the final output is a clean, pristine, photorealistic 3D aerial photograph.

### Architectural Masterplan Rendering Protocol:
1. **Geometric Fidelity**: Follow the exact site plan layout, building positions, radial curves, road networks, and land zoning boundaries shown in the reference image. Extrude buildings into modern luxury towers matching the footprint shapes.
2. **Zoning & Material Legend**:
${legendDescriptions}
${textPinDescriptions}

3. **User Design Directives & Chat Instructions**:
${chatPrompt ? `* Special Focus: ${chatPrompt}` : '* Render with world-class architectural resort landscaping, luxury modern towers, and pristine infrastructure.'}

4. ${lightingInstruction}

5. **Visual Quality & Finish**:
* 8K hyper-detailed photorealistic finish: individual balcony glass railings, rooftop amenities, landscaped planters, textured asphalt roads with painted markings, lush tropical tree canopies, walking trails, and modern luxury facade treatments (wood louvers, white marble, bronze trims, floor-to-ceiling double-glazed curtain walls).
* Absolutely NO 2D flat graphic colors, NO cartoonish fills, NO raw diagram lines. Convert all 2D zones into lush, tactile, tangible 3D physical reality.`;
}

// LLM Prompt Synthesis Agent
async function synthesizePromptWithAgent(
  colorLegend: ColorLegendItem[],
  textPins: TextPinItem[],
  chatPrompt: string,
  lightingMode: 'day' | 'night' | 'custom',
  customTheme: string
): Promise<string> {
  const groqApiKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY_FALLBACK;
  
  if (!groqApiKey) {
    return buildRuleBasedMasterPrompt(colorLegend, textPins, chatPrompt, lightingMode, customTheme);
  }

  const systemPrompt = `You are a world-class architectural visualization director and prompt engineer for OpenAI GPT Image 2 (Edit).
Your job is to take a 2D colored/zoned site plan diagram and write an INSANELY DETAILED, ultra-photorealistic image-editing prompt that instructs the AI image model to render the site plan into an award-winning 3D masterplan aerial rendering.

RULES:
1. CAMERA ANGLE MANDATE (STRICT): The render MUST be a direct 90-degree TOP VIEW ANGLE ONLY (top-down masterplan view). Explicitly command the model to keep the camera pointing straight down at the site plan from above, preserving the exact layout and radial footprint geometry from above with extruded 3D roof depth and shadows.
2. STRICT ZERO-TEXT & ZERO-DIMENSIONS MANDATE: Absolute prohibition of any text, letters, numerals, room/zone labels, dimension lines, measurement arrows, scale bars, or typography in the rendered image. All text and labels in the input are strictly semantic placement directives and must NEVER appear as visible text in the final 3D photorealistic render.
3. CRAZY LIGHTING MANDATE: Infuse crazy ultra-dramatic lighting (volumetric sunbeams, razor-sharp building drop shadows, glowing turquoise pool water with caustics, warm 3000K window glows for night, LED landscape uplights, intense contrast and ray-traced reflections).
4. Directly map every color key-value zone to its physical 3D architectural counterpart (e.g. Yellow = luxury high-rise towers with glass curtain walls, Green = lush botanical parks and manicured lawns, Blue = crystalline resort infinity pools, Grey = asphalt roads and landscaped driveways, Pink = vibrant children's adventure playgrounds).
5. Incorporate all user text pin locations (e.g. if the user wrote "POOL" in an area, explicitly command the model to construct a photorealistic resort pool in that exact spot).
6. Emphasize geometric fidelity to the input reference shapes while turning flat 2D zones into rich, tangible 3D structures and lush terrain.
7. Output ONLY the raw prompt text for the image generator without conversational chit-chat.`;

  const userContext = `
Camera Angle: STRICT TOP VIEW ANGLE ONLY (90-degree overhead top-down perspective).
Text Policy: STRICT ZERO TEXT, ZERO LABELS, ZERO NUMBERS, ZERO DIMENSIONS.

Color Legend Mappings:
${colorLegend.map(item => `- ${item.colorName} (${item.color}): ${item.label}`).join('\n')}

Text Pin Annotations Placed on Image:
${textPins.length > 0 ? textPins.map(p => `- Label "${p.text}" at position (${p.x.toFixed(0)}%, ${p.y.toFixed(0)}%)`).join('\n') : 'None'}

Lighting Mode: ${lightingMode.toUpperCase()} (with CRAZY dramatic realistic lighting effects)
${lightingMode === 'custom' ? `Custom Lighting Theme: ${customTheme}` : ''}

User Chat Instructions:
"${chatPrompt || 'Render with maximum photorealism, crazy volumetric lighting, modern luxury architectural towers, and lush landscaping without any visible text.'}"
`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContext }
        ],
        temperature: 0.7,
        max_tokens: 650,
      }),
      signal: AbortSignal.timeout(12000), // 12s timeout for LLM
    });

    if (res.ok) {
      const data = await res.json();
      const generatedPrompt = data.choices?.[0]?.message?.content?.trim();
      if (generatedPrompt && generatedPrompt.length > 80) {
        return generatedPrompt;
      }
    }
  } catch (err) {
    console.warn('[SitePlanTo3D] Agent prompt synthesis failed, using fallback rule builder:', err);
  }

  return buildRuleBasedMasterPrompt(colorLegend, textPins, chatPrompt, lightingMode, customTheme);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      sitePlanBase64, 
      colorLegend = [], 
      textPins = [], 
      chatPrompt = '', 
      lightingMode = 'day', 
      customTheme = '',
      quality = 'medium',
      apiKey 
    } = body;

    if (!sitePlanBase64) {
      return NextResponse.json({ error: 'sitePlanBase64 image is required.' }, { status: 400 });
    }

    const activeApiKey = apiKey || process.env.FAL_KEY;
    if (!activeApiKey) {
      return NextResponse.json({ error: 'FAL_KEY is missing.' }, { status: 400 });
    }

    const cleanApiKey = activeApiKey.replace(/\s+/g, '').replace(/[^a-zA-Z0-9:-]/g, '');
    fal.config({ credentials: cleanApiKey });

    console.log('[SitePlanTo3D] Uploading site plan canvas to fal storage...');
    const uploadedSitePlanUrl = await uploadBase64ToFalStorage(sitePlanBase64);
    console.log('[SitePlanTo3D] Site plan uploaded:', uploadedSitePlanUrl);

    console.log('[SitePlanTo3D] Synthesizing crazy master prompt via AI Agent...');
    const masterPrompt = await synthesizePromptWithAgent(
      colorLegend,
      textPins,
      chatPrompt,
      lightingMode,
      customTheme
    );
    console.log('[SitePlanTo3D] Master prompt synthesized:\n', masterPrompt.slice(0, 200) + '...');

    console.log('[SitePlanTo3D] Calling GPT Image 2 (Edit) with quality: medium for 3D site plan rendering...');
    const gptRes = await runModel('openai/gpt-image-2/edit', {
      image_urls: [uploadedSitePlanUrl],
      prompt: masterPrompt,
      quality: quality || 'medium',
    });

    console.log('[SitePlanTo3D] Fetching rendered result to base64...');
    const resultBase64 = await fetchToBase64(gptRes.url);
    console.log('[SitePlanTo3D] 3D Site Plan Render Complete!');

    return NextResponse.json({
      url: resultBase64,
      imageUrl: resultBase64,
      seed: gptRes.seed ?? null,
      masterPrompt,
      workflow: 'siteplan-to-3d',
    });
  } catch (err: any) {
    console.error('[SitePlanTo3D] Error:', err);
    return NextResponse.json(
      { error: err.message || '3D Site Plan rendering failed.' },
      { status: 500 }
    );
  }
}
