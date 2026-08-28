import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 300;

fal.config({ credentials: process.env.FAL_KEY });

async function uploadBase64ToFalStorage(dataUri: string): Promise<string> {
  const base64 = dataUri.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  const blob = new Blob([buffer], { type: 'image/png' });
  const file = new File([blob], 'exterior_model_input.png', { type: 'image/png' });
  return fal.storage.upload(file);
}

async function fetchToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`);
  const ct = res.headers.get('content-type') || 'image/jpeg';
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

function buildExteriorPrompt(opts: {
  buildingType: string;
  floors: number;
  materialPreset: string;
  skyPreset: string;
  cameraAngle: string;
  extraDirectives: string;
  surroundings: string;
}): string {
  const { buildingType, floors, materialPreset, skyPreset, cameraAngle, extraDirectives, surroundings } = opts;

  const materialMap: Record<string, string> = {
    champagne_gold:
      'Curved champagne-gold anodized aluminum trims, brushed brass balcony handrails, and warm bronze metal louvers. Ultra-clear floor-to-ceiling double-glazed curtain wall glass with warm amber 2700K interior light glowing from inside every room. Fluted travertine and textured limestone podium base with undulating sculptural parametric wave louvers. Luminous glowing LED light ribbons under each curved balcony edge.',
    glass_steel:
      'Ultra-premium floor-to-ceiling double-glazed curtain wall glass with dark structural steel mullions. Glass panels blazing with warm amber interior floor-plate light glow from within, mirror-chrome balcony railings catching the sunset light, polished brushed stainless steel spandrel panels, deep-set glazing reveals, and glowing architectural crown lighting.',
    concrete_wood:
      'Warm raw-texture board-formed fair-faced concrete with horizontal rib shadow lines, honey-warm kiln-dried cedar and charred ipe wood brise-soleil louvers glowing amber in the sunset light, planted green balcony terraces overflowing with lush tropical vegetation cascading down facade bays, Corten steel accent fins in glowing rust-orange, polished concrete ground plaza with mirror wet finish.',
    white_marble:
      'Pure luminous book-matched Bianco Carrara and Calacatta gold marble cladding panels catching warm sunset glow, brushed 24K gold-finish window frames and architectural trims, polished Arabescato marble podium base reflecting the sky, white Venetian stucco infills, crystal-clear glass balconies with warm interior glow.',
    brick_terracotta:
      'Hand-laid elongated Danish wire-cut brick in warm terracotta, sand, and burnt-sienna tones. Bricks individually lit in warm golden-sunset light with deep mortar joint shadow relief, textured terracotta ceramic rain-screen panels, dark bronze window frames, warm amber interior window glow, natural travertine paving.',
    parametric_mesh:
      'Spectacular computational parametric perforated anodized titanium-gold and rose-gold aluminium mesh facade panels in gradient density organic pattern. Backlit with warm amber LED strips visible through mesh creating an extraordinary glowing lantern effect at dusk, sculptural organic geometry with sweeping curves, frameless dark glass.',
    luxury_dark:
      'Ultra-premium polished absolute black Zimbabwe granite and deep-charcoal nero marquina marble cladding catching brilliant reflections of the sunset sky in intense gold-copper tones, smoked bronze-tinted glass with warm amber interior glow, black powder-coated architectural grid, blackened steel blade fins.',
  };

  const skyMap: Record<string, string> = {
    sunset_dusk:
      'CRAZY EXPLOSIVE SUNSET DUSK SKY: A showstopping, high-contrast stormy sunset sky at dusk. Turbulent, billowing dark indigo and charcoal storm clouds backlit and under-lit from the setting horizon sun in blazing fiery orange, glowing amber, and radiant crimson. Spectacular volumetric golden light shafts piercing through storm cloud gaps. Dramatic atmospheric mood and crazy lighting contrast.',
    golden_hour:
      'CRAZY GOLDEN HOUR SUNSET: Blazing magic-hour golden sunset with an explosive orange-crimson-magenta horizon sky. Razor-sharp elongated building drop shadows slicing across the paving, warm 2700K amber rim lighting wrapping every facade edge, wispy high-altitude clouds ablaze in pink and coral, volumetric golden sunbeams, and glass panels reflecting the fiery sky.',
    blue_hour:
      'CINEMATIC BLUE HOUR TWILIGHT: Rich prussian navy sky at zenith transitioning to electric cobalt and ultramarine with a thin blazing amber-orange sunset line at the horizon. The tower is a glowing golden lantern against the deep blue night: every floor spills warm 2800K light, horizontal floor slab edges glow in continuous warm amber LED strips, and the wet street mirrors the lit building.',
    noon_blazing:
      'BLAZING CINEMATIC MIDDAY SUN: Electric saturated cerulean cobalt blue sky with blazing sun overhead. Ultra-high contrast between sunlit white facade panels and sharp pitch-black drop shadows. Glass facades reflect brilliant chrome mirror reflections of the sky, with heat shimmer distortion and ultra-sharp 8K physical textures.',
    dramatic_overcast:
      'BROODING DRAMATIC OVERCAST SKY: Heavy rolling storm clouds in deep blue-grey, charcoal and silver filling the sky. Dramatic god-rays and volumetric light shafts breaking through cloud gaps, spotlighting the building facade. Extreme ambient occlusion in every joint and crevice, revealing hyper-detailed material textures.',
    rainy_night:
      'HYPER-CINEMATIC RAINY NIGHT: Heavy rain transforming the ground into a deep mirror film of dark water reflecting the building\'s warm amber and white architectural lighting in glistening reflections. Deep inky navy sky, neon uplighters, warm 2700K floor glows, steam rising from grates, and luminous bokeh.',
    stormy_dusk:
      'APOCALYPTIC STORMY TWILIGHT: Turbulent apocalyptic dusk with massive cumulonimbus storm clouds churning in violent motion, lit internally in electric amber-orange from the sunset horizon while cloud tops are deep purple. Base architectural floodlights cutting brilliant white cones upward against the violent sky.',
  };

  const cameraMap: Record<string, string> = {
    hero_angle:
      'DRAMATIC HERO 45° COMPOSITION: Camera at a dynamic 3/4 angle showing two facade planes simultaneously, with dramatic vertical convergence exaggerating the building\'s soaring height from base podium to rooftop crown, with foreground landscaping and wet reflective street.',
    street_level:
      'DRAMATIC PEDESTRIAN STREET-LEVEL PERSPECTIVE: Camera at eye level (1.6m height), looking upward with an ultra-wide angle lens. Extreme vertical perspective convergence lines draw the eye from the wet reflective street and palm trees up to the glowing building crown.',
    worm_eye:
      'EXTREME WORM\'S EYE VIEW: Camera directly at the base of the building looking straight up. Facade fills the frame, converging to a vanishing point at the zenith with dramatic perspective distortion on each glowing balcony rim.',
    drone_45:
      'AERIAL DRONE 45° PERSPECTIVE: Aerial view from approximately 80m elevation showing the rooftop sky garden crown, the full building massing, and the surrounding illuminated landscape and street network below.',
    drone_side:
      'CINEMATIC DRONE LATERAL FLYBY: Camera at mid-building height in a lateral position parallel to the primary facade, revealing the full building profile with extreme depth of field.',
    interior_courtyard:
      'INTIMATE ATRIUM / COURTYARD VIEW: Camera inside the building courtyard looking upward through the open-top atrium at the dramatic sky above, with illuminated balconies and reflecting water pool at base.',
  };

  const material = materialMap[materialPreset] || materialMap['champagne_gold'];
  const sky = skyMap[skyPreset] || skyMap['sunset_dusk'];
  const camera = cameraMap[cameraAngle] || cameraMap['hero_angle'];

  return `Award-winning, hyper-photorealistic 8K architectural dusk exterior CGI photograph of an ultra-luxury ${buildingType.toLowerCase()} (${floors} stories tall), transformed from the 3D massing model in the input image.

### CRITICAL TRANSFORMATION MANDATE — DO NOT COPY SKETCHUP MODEL LOOK:
* Use the input image ONLY as a reference for overall building massing, floor count, and camera perspective.
* Completely replace all flat, grey, untextured, and raw 3D polygon surfaces with ultra-luxurious, hyper-detailed architectural materials and physics-accurate real-world lighting.
* Output MUST look like a real multi-million dollar architectural photograph taken on a high-end medium format camera — completely indistinguishable from real life.

### CRAZY SEXY ARCHITECTURAL LIGHTING:
* Warm 2700K–3000K golden interior lighting glowing brightly through all floor-to-ceiling glass windows, illuminating interior ceilings and creating cozy amber transparency on every single floor.
* Continuous, glowing warm golden LED ribbon cove lighting recessed underneath every single curved balcony rim and floor slab edge, wrapping around the entire tower in luminous horizontal bands.
* Powerful ground-level architectural floodlights and concealed uplights shooting dramatic warm light upward along facade vertical fins, fluted columns, and podium curves.
* Luminous glowing architectural halo beacon at the tower crown.
* Street-level bollard lights and warm spotlights illuminating lush palm trees.

### CRAZY CINEMATIC SKY:
${sky}

### SEXY CRAZY MATERIALS & PHOTOREALISM TEXTURES:
${material}

### CAMERA PERSPECTIVE:
${camera}

### SURROUNDINGS & FOREGROUND REFLECTIONS:
${surroundings || 'Wet-look, rain-slicked dark asphalt and polished granite street in the foreground with glistening mirror reflections and light caustics mirroring the blazing golden lights of the tower and the fiery sky. Majestic illuminated Royal Palm trees and lush tropical landscaping with warm upward spotlights at podium terraces and street level. Luxury cars and elegantly dressed pedestrians at curbside providing scale.'}

### RENDER FINISH & TECHNICAL EXCELLENCE:
* 8K Octane Render, V-Ray, Unreal Engine 5 architectural visualization quality.
* Ray-traced reflections on all glass, polished stone, and wet ground surfaces.
* Volumetric atmospheric glow, subtle lens flare and light bloom around warm fixtures, razor-sharp architectural drop shadows, and rich ambient occlusion in every structural joint.
* Zero wireframe, zero flat grey surfaces, zero cartoon look.`;
}

// LLM Prompt Synthesis Agent for custom directives
async function synthesizeExteriorPromptWithAgent(opts: {
  buildingType: string;
  floors: number;
  materialPreset: string;
  skyPreset: string;
  cameraAngle: string;
  extraDirectives: string;
  surroundings: string;
}): Promise<string> {
  const groqApiKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY_FALLBACK;
  
  if (!groqApiKey || !opts.extraDirectives.trim()) {
    return buildExteriorPrompt(opts);
  }

  const systemPrompt = `You are a world-class architectural visualization director and prompt engineer for OpenAI GPT Image 2 (Edit).
Your job is to write an INSANELY DETAILED, hyper-photorealistic, ultra-luxurious image-editing prompt that instructs the AI model to transform a raw 3D/SketchUp massing model into an award-winning, magazine-cover architectural CGI exterior photograph.

MANDATORY HALLMARKS TO ALWAYS INCLUDE:
1. CRAZY SEXY LIGHTING: Warm 2700K-3000K interior spills through all glass windows + continuous glowing warm golden LED ribbon cove lights under every curved balcony edge + powerful facade flood uplighting + crown halo beacon.
2. CRAZY CINEMATIC SKY: Dramatic turbulent sunset/dusk storm clouds with underlit fiery orange, burning amber, and violet rays + volumetric golden light beams.
3. CRAZY MATERIALS: Curved champagne gold trims, low-iron double-glazed curtain walls with sky reflections, fluted stone podium, lush cascading green sky gardens.
4. WET GROUND REFLECTIONS: Wet rain-slicked dark asphalt street in foreground reflecting the golden tower lights and fiery sunset sky in glistening mirror caustics.
5. STRICT NON-COPY: Emphasize transforming the model into rich photorealistic reality, eliminating all raw grey polygon surfaces.
6. Return ONLY the final raw prompt text with no conversational preamble.`;

  const userContext = `
Building Type: ${opts.buildingType} (${opts.floors} floors)
Material Style: ${opts.materialPreset}
Sky Style: ${opts.skyPreset}
Camera Angle: ${opts.cameraAngle}
User Custom Directives: "${opts.extraDirectives}"
Surroundings: "${opts.surroundings || 'Wet street with mirror reflections, illuminated Royal Palms, luxury cars'}"
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
        max_tokens: 700,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (res.ok) {
      const data = await res.json();
      const prompt = data.choices?.[0]?.message?.content?.trim();
      if (prompt && prompt.length > 100) {
        return prompt;
      }
    }
  } catch (err) {
    console.warn('[ExteriorRender] Agent prompt synthesis failed, using rule builder:', err);
  }

  return buildExteriorPrompt(opts);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      modelBase64,
      buildingType = 'Luxury Residential Tower',
      floors = 20,
      materialPreset = 'champagne_gold',
      skyPreset = 'sunset_dusk',
      cameraAngle = 'hero_angle',
      extraDirectives = '',
      surroundings = '',
      quality = 'medium',
    } = body;

    if (!modelBase64) {
      return NextResponse.json({ error: 'modelBase64 (SketchUp render image) is required.' }, { status: 400 });
    }

    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json({ error: 'FAL_KEY is missing.' }, { status: 500 });
    }
    fal.config({ credentials: falKey });

    console.log('[ExteriorRender] Uploading model screenshot to fal storage...');
    const uploadedModelUrl = await uploadBase64ToFalStorage(modelBase64);
    console.log('[ExteriorRender] Model uploaded:', uploadedModelUrl);

    console.log('[ExteriorRender] Synthesizing master exterior prompt...');
    const masterPrompt = await synthesizeExteriorPromptWithAgent({
      buildingType,
      floors: Number(floors),
      materialPreset,
      skyPreset,
      cameraAngle,
      extraDirectives,
      surroundings,
    });
    console.log('[ExteriorRender] Prompt synthesized:\n', masterPrompt.slice(0, 250) + '...');

    console.log('[ExteriorRender] Master prompt built, calling GPT Image 2 Edit (quality:', quality, ')...');
    const result = await runModel('openai/gpt-image-2/edit', {
      image_urls: [uploadedModelUrl],
      prompt: masterPrompt,
      quality: quality || 'medium',
    });

    console.log('[ExteriorRender] Fetching result to base64...');
    const resultBase64 = await fetchToBase64(result.url);
    console.log('[ExteriorRender] Exterior render complete!');

    return NextResponse.json({
      render: resultBase64,
      imageUrl: resultBase64,
      seed: result.seed ?? null,
      masterPrompt,
      workflow: 'exterior-render',
    });
  } catch (err: any) {
    console.error('[ExteriorRender] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Exterior rendering failed. Please try again.' },
      { status: 500 }
    );
  }
}
