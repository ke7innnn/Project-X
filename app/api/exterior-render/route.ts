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
  timeOfDay: 'day' | 'night';
  hasMultipleImages?: boolean;
  floorCount?: string | number;
  extraDirectives?: string;
}): string {
  const { timeOfDay, hasMultipleImages, floorCount, extraDirectives } = opts;

  const multiImageSection = hasMultipleImages
    ? `### MULTI-VIEW 3D MASSING COMPREHENSION:
* The input reference images provide MULTIPLE complementary viewpoints/angles of the EXACT same architectural 3D massing model.
* Cross-reference all uploaded angles to construct a comprehensive 3D spatial understanding of the building's geometry, curved podium wave louvers, cantilevered balcony profiles, tower height, and crown architecture.
* Render the primary architectural perspective matching the primary framing (Image 1) with complete spatial accuracy informed by all reference angles.
`
    : '';

  const floorSection = floorCount && Number(floorCount) > 0
    ? `### STRICT ARCHITECTURAL FLOOR COUNT MANDATE — EXACTLY ${floorCount} FLOORS:
* TOTAL STOREYS: The building MUST have EXACTLY ${floorCount} FLOORS / STOREYS from the ground-level podium to the top penthouse / crown level.
* COUNT EVERY LEVEL: Render precisely ${floorCount} distinct floor slabs, horizontal balcony bands, and window levels.
* ZERO DEVIATION: Under NO circumstances should you hallucinate extra floors, add random storeys, or truncate/omit any floors. Maintain the exact ${floorCount}-floor architectural vertical proportion and spacing.
`
    : '';

  if (timeOfDay === 'night') {
    return `Award-winning, hyper-photorealistic 8K architectural dusk & night exterior CGI photograph of an ultra-luxury modern high-rise tower, transformed from the 3D massing model in the input image(s).

### CRITICAL MANDATE — PRESERVE COMPOSITION & ELEVATE TO CGI REALISM:
* Preserve the EXACT camera angle, framing, perspective, and building massing from the primary reference model screenshot.
* DO NOT copy flat grey, untextured, wireframe, or raw 3D polygon surfaces from the input model.
* Transform every plane into ultra-luxurious, tangible physical materials with physics-accurate real-world lighting.
* Output MUST look like a real multi-million dollar architectural photograph taken on a medium format camera — completely indistinguishable from real life.

${floorSection}${multiImageSection}### HYPER-REALISTIC WINDOW GLASS REFLECTIONS & OPTICS:
* Double-glazed low-iron Starphire curtain wall glass with physics-accurate Fresnel reflections (IOR 1.52) — catching high-contrast mirror reflections of the fiery sunset clouds and ambient twilight sky at grazing angles.
* Micro-subtle tempered glass reflection distortion across individual modular panel seams, giving reflections realistic architectural pillowing and depth rather than flat artificial mirrors.
* Dual-Layer Glazing Realism: The outer glass pane reflects the burning orange-amber sunset sky and glowing LED ribbons, while the transparent interior reveals warm 2700K–3000K glowing ceiling coffers, recessed downlights, floor slabs, and penthouse silhouettes from within.
* Crisp dark bronze mullions and dark mirror-finish spandrel glass panels with deep structural shadow reveals separating each floor.
* Seamless structural laminated glass balcony balustrades with polished stainless-steel top caps catching sharp specular rim reflections.

### CRAZY SEXY ARCHITECTURAL LIGHTING (REFERENCE NIGHT STYLE):
* Warm 2700K–3000K golden interior lighting glowing brightly through all floor-to-ceiling glass windows, illuminating interior ceilings and creating cozy amber transparency on every single floor.
* Continuous, glowing warm golden LED ribbon cove lighting recessed underneath every single curved balcony rim and floor slab edge, wrapping around the entire tower in luminous horizontal bands.
* Powerful ground-level architectural floodlights and concealed uplights shooting dramatic warm light upward along facade vertical fins, fluted columns, and podium curves.
* Luminous glowing architectural halo beacon at the tower crown.
* Street-level bollard lights and warm spotlights illuminating lush palm trees.

### CRAZY CINEMATIC DUSK & SUNSET SKY:
* A showstopping, high-contrast stormy sunset sky at dusk: turbulent, billowing dark indigo and charcoal storm clouds backlit and under-lit from the setting horizon sun in blazing fiery orange, glowing amber, and radiant crimson.
* Spectacular volumetric golden light shafts piercing through storm cloud gaps, creating immense dramatic depth and cinematic color contrast.

### SEXY CRAZY MATERIALS & PHOTOREALISM TEXTURES:
* Curved champagne-gold anodized aluminum trims, brushed brass balcony handrails, and warm bronze metal louvers.
* Fluted travertine and textured limestone podium base with undulating sculptural parametric wave louvers.
* Lush rooftop sky garden and cascading greenery on balcony terraces with real botanic detail.

### SURROUNDINGS & FOREGROUND REFLECTIONS:
* Wet-look, rain-slicked dark asphalt and polished granite street in the foreground with glistening mirror reflections and light caustics mirroring the blazing golden lights of the tower and the fiery sunset sky.
* Majestic illuminated Royal Palm trees and lush tropical landscaping with warm upward spotlights at podium terraces and street level. Luxury cars and elegantly dressed pedestrians at curbside providing scale.

### RENDER FINISH & TECHNICAL EXCELLENCE:
* 8K Octane Render, V-Ray, Unreal Engine 5 architectural visualization quality.
* Ray-traced reflections on all glass, polished stone, and wet ground surfaces.
* Volumetric atmospheric glow, subtle lens flare and light bloom around warm fixtures, razor-sharp architectural drop shadows, and rich ambient occlusion in every structural joint.
* Zero wireframe, zero flat grey surfaces, zero cartoon look.

${extraDirectives ? `### ARCHITECT CUSTOM DIRECTIVES:\n${extraDirectives}` : ''}`;
  }

  // Day mode prompt — Clean, crisp, non-overcomplicated daylighting
  return `Award-winning, hyper-photorealistic 8K architectural daytime exterior CGI photograph of an ultra-luxury modern high-rise tower, transformed from the 3D massing model in the input image(s).

### CRITICAL MANDATE — PRESERVE COMPOSITION & ELEVATE TO CGI REALISM:
* Preserve the EXACT camera angle, framing, perspective, and building massing from the primary reference model screenshot.
* DO NOT copy flat grey, untextured, wireframe, or raw 3D polygon surfaces from the input model.
* Transform every surface into ultra-luxurious, tangible physical materials with physics-accurate real-world daylighting.
* Output MUST look like a real multi-million dollar architectural photograph taken on a medium format camera — completely indistinguishable from real life.

${floorSection}${multiImageSection}### CRISP DAYLIGHTING & ARCHITECTURAL GLASS:
* Crystal-clear double-glazed low-iron Starphire curtain wall glass with realistic sky reflections and natural daylight interior visibility.
* Crisp, golden-white 5200K morning / late-afternoon sunlight hitting the building at a dramatic 35-degree angle, casting razor-sharp architectural drop shadows from balconies across the facade.
* Clear blue sky with light wispy cirrus clouds and rich natural sunbeams.

### SEXY MATERIALS & ELEVATED FINISHES:
* Curved champagne-gold anodized aluminum trims, vertical aerofoil blade fins, and warm bronze window profiles.
* Fluted travertine and textured limestone podium base with undulating sculptural parametric wave louvers.
* Lush rooftop sky garden and cascading greenery on balcony terraces with sunlit tropical foliage.

### SURROUNDINGS & LANDSCAPING:
* Sun-drenched polished granite plaza paving and clean boulevard with majestic Royal Palm trees casting sharp diagonal shadows.
* Manicured tropical garden landscaping, fountains, luxury drop-off entrance with sports cars and pedestrians providing scale.

### RENDER FINISH & TECHNICAL EXCELLENCE:
* 8K Octane Render, V-Ray, Unreal Engine 5 architectural visualization quality.
* Ray-traced reflections on all glass and polished stone surfaces.
* Razor-sharp architectural drop shadows, micro-textures on every facade material, ambient occlusion in every joint.
* Zero wireframe, zero flat grey surfaces, zero cartoon look.

${extraDirectives ? `### ARCHITECT CUSTOM DIRECTIVES:\n${extraDirectives}` : ''}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      modelImages,
      modelBase64,
      floorCount,
      timeOfDay = 'night',
      extraDirectives = '',
      quality = 'medium',
    } = body;

    // Collect all input images (either array of strings or single base64)
    const imagesToProcess: string[] = Array.isArray(modelImages) && modelImages.length > 0
      ? modelImages
      : modelBase64
      ? [modelBase64]
      : [];

    if (imagesToProcess.length === 0) {
      return NextResponse.json({ error: 'At least one 3D model screenshot (modelImages or modelBase64) is required.' }, { status: 400 });
    }

    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json({ error: 'FAL_KEY is missing.' }, { status: 500 });
    }
    fal.config({ credentials: falKey });

    console.log(`[ExteriorRender] Uploading ${imagesToProcess.length} model screenshot(s) to fal storage in parallel...`);
    const uploadedModelUrls = await Promise.all(
      imagesToProcess.map((img) => uploadBase64ToFalStorage(img))
    );
    console.log('[ExteriorRender] Model screenshots uploaded:', uploadedModelUrls);

    const masterPrompt = buildExteriorPrompt({
      timeOfDay: timeOfDay === 'day' ? 'day' : 'night',
      hasMultipleImages: uploadedModelUrls.length > 1,
      floorCount,
      extraDirectives,
    });
    console.log('[ExteriorRender] Prompt synthesized:\n', masterPrompt.slice(0, 320) + '...');

    console.log('[ExteriorRender] Calling GPT Image 2 Edit with', uploadedModelUrls.length, 'reference images (quality:', quality, ', floors:', floorCount || 'auto', ')...');
    const result = await runModel('openai/gpt-image-2/edit', {
      image_urls: uploadedModelUrls,
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
      inputCount: uploadedModelUrls.length,
      floorCount: floorCount || null,
      workflow: 'exterior-render',
    });
  } catch (err: any) {
    console.error('[ExteriorRender Error]', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to render exterior visualization.' },
      { status: 500 }
    );
  }
}
