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
  cameraAngle: string;
  extraDirectives?: string;
}): string {
  const { timeOfDay, cameraAngle, extraDirectives } = opts;

  const cameraMap: Record<string, string> = {
    hero_angle:
      'DRAMATIC HERO 45° VIEW: Camera at a dynamic 3/4 angle showing two facade planes simultaneously, with dramatic vertical convergence exaggerating the building\'s soaring height from base podium to rooftop crown, with foreground landscaping and reflective street.',
    street_level:
      'DRAMATIC STREET-LEVEL EYE VIEW: Camera at human eye level (1.6m height) looking upward with an ultra-wide angle lens. Extreme vertical convergence lines draw the eye from the street and illuminated palm trees up to the glowing building crown.',
    worm_eye:
      'EXTREME WORM\'S EYE VIEW: Camera placed directly at the base of the building looking straight up at the sky. Facade fills the frame, converging to a vanishing point at the zenith with dramatic perspective distortion on every glowing balcony rim.',
    drone_aerial:
      'AERIAL DRONE 45° VIEW: High-angle aerial drone perspective from approximately 80m elevation showing the rooftop sky garden crown, the full building massing, and surrounding illuminated landscape and street network below.',
    side_elevation:
      'CINEMATIC SIDE PROFILE VIEW: Camera at mid-building height in a lateral position parallel to the primary facade, revealing the full building architectural elevation with extreme depth of field.',
  };

  const cameraInstruction = cameraMap[cameraAngle] || cameraMap['hero_angle'];

  if (timeOfDay === 'night') {
    return `Award-winning, hyper-photorealistic 8K architectural dusk & night exterior CGI photograph of an ultra-luxury modern high-rise tower, transformed from the 3D massing model in the input image.

### CRITICAL MANDATE — DO NOT COPY SKETCHUP MODEL LOOK:
* Use the input image ONLY as a reference for overall building massing, floor count, and camera perspective.
* Completely eliminate all flat, grey, untextured, wireframe, or raw 3D polygon surfaces from the input model.
* Transform every surface into ultra-luxurious, tangible physical materials with physics-accurate real-world lighting.
* Output MUST look like a real multi-million dollar architectural photograph taken on a medium format camera — completely indistinguishable from real life.

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
* Ultra-clear floor-to-ceiling double-glazed curtain wall glass with warm amber interior light glowing from inside every room.
* Fluted travertine and textured limestone podium base with undulating sculptural parametric wave louvers.
* Lush rooftop sky garden and cascading greenery on balcony terraces with real botanic detail.

### CAMERA PERSPECTIVE:
${cameraInstruction}

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

  // Day mode prompt
  return `Award-winning, hyper-photorealistic 8K architectural daytime exterior CGI photograph of an ultra-luxury modern high-rise tower, transformed from the 3D massing model in the input image.

### CRITICAL MANDATE — DO NOT COPY SKETCHUP MODEL LOOK:
* Use the input image ONLY as a reference for overall building massing, floor count, and camera perspective.
* Completely eliminate all flat, grey, untextured, wireframe, or raw 3D polygon surfaces from the input model.
* Transform every surface into ultra-luxurious, tangible physical materials with physics-accurate real-world daylighting.
* Output MUST look like a real multi-million dollar architectural photograph taken on a medium format camera — completely indistinguishable from real life.

### BRILLIANT DAYLIGHTING & ATMOSPHERE:
* Brilliant 5500K natural golden midday sun with razor-sharp, physics-accurate architectural drop shadows cast across balconies and facade recesses.
* Electric cerulean blue sky with soft wispy clouds and radiant sunbeams.
* Crystal-clear sky reflections and cloud reflections across floor-to-ceiling double-glazed glass facades.
* Bright, airy interior transparency revealing luxury penthouse interior layouts.

### SEXY CRAZY MATERIALS & PHOTOREALISM TEXTURES:
* Curved champagne-gold anodized aluminum trims, brushed brass balcony handrails, and warm bronze metal louvers gleaming in the sun.
* Ultra-clear floor-to-ceiling double-glazed curtain wall glass with mirror sky reflections.
* Fluted travertine and textured limestone podium base with undulating sculptural parametric wave louvers.
* Lush rooftop sky garden and cascading greenery on balcony terraces with sunlit tropical foliage.

### CAMERA PERSPECTIVE:
${cameraInstruction}

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
      modelBase64,
      timeOfDay = 'night',
      cameraAngle = 'hero_angle',
      extraDirectives = '',
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

    const masterPrompt = buildExteriorPrompt({
      timeOfDay: timeOfDay === 'day' ? 'day' : 'night',
      cameraAngle: cameraAngle || 'hero_angle',
      extraDirectives,
    });
    console.log('[ExteriorRender] Prompt synthesized:\n', masterPrompt.slice(0, 250) + '...');

    console.log('[ExteriorRender] Calling GPT Image 2 Edit (quality:', quality, ')...');
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
