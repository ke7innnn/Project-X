import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 300;

fal.config({ credentials: process.env.FAL_KEY });

async function uploadBase64ToFalStorage(dataUri: string): Promise<string> {
  const base64 = dataUri.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  const blob = new Blob([buffer], { type: 'image/png' });
  const file = new File([blob], 'rendered_exterior_reference.png', { type: 'image/png' });
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

interface AngleConfig {
  id: string;
  label: string;
  shortDesc: string;
  cameraPrompt: string;
}

const THREE_PROFESSIONAL_ANGLES: AngleConfig[] = [
  {
    id: 'hero_angle',
    label: 'Hero View (45°)',
    shortDesc: 'Dramatic elevated 3/4 perspective showing full tower & podium',
    cameraPrompt:
      'CAMERA ANGLE — HERO 45-DEGREE VIEW: Position the camera at a dynamic elevated 3/4 angle (approx. 5th-floor height of adjacent structure), showing two facade planes simultaneously. The wide-angle lens captures the full architectural composition from the wet reflective ground plaza up to the glowing crown beacon against the sky, showing complete building height and podium articulation in a majestic architectural hero shot.',
  },
  {
    id: 'street_level',
    label: 'Street Level',
    shortDesc: 'Pedestrian human eye-level looking up dramatically',
    cameraPrompt:
      'CAMERA ANGLE — PEDESTRIAN STREET LEVEL: Position the camera at exact human eye level (1.6m from the ground) on the pedestrian sidewalk/plaza looking dramatically upward with a wide-angle lens. Extreme vertical convergence lines emphasize the soaring height of the tower. The foreground features wet rain-slicked dark asphalt with mirror puddle reflections, illuminated Royal Palm trees, warm landscape bollards, and luxury cars for human scale.',
  },
  {
    id: 'worm_eye',
    label: "Worm's Eye",
    shortDesc: "Extreme upward shot from the building base converging to zenith",
    cameraPrompt:
      'CAMERA ANGLE — EXTREME WORM\'S EYE VIEW: Position the camera directly at the building podium base looking almost vertically straight up into the sky. The curved facade, glowing cantilevered balcony rims, and LED cove lighting ribbons converge sharply to a vanishing point at the zenith. The underside of balconies and architectural slab projections create dramatic layered depth against the stormy sunset dusk sky.',
  },
];

function buildAnglePrompt(angle: AngleConfig, timeOfDay: 'day' | 'night', extraDirectives?: string): string {
  const isNight = timeOfDay === 'night';

  const lightingSection = isNight
    ? `### ARCHITECTURAL LIGHTING & ATMOSPHERE (MAINTAIN 100% CONSISTENCY):
* Warm 2700K–3000K golden interior lighting spilling through all floor-to-ceiling glass windows, illuminating interior ceilings on every floor.
* Continuous glowing warm golden LED ribbon cove lighting recessed underneath every single curved balcony rim and floor slab edge.
* Powerful ground-level architectural floodlights shooting warm light upward along podium vertical fins and fluted columns.
* Glowing architectural halo beacon on the tower crown.
* CRAZY SUNSET DUSK SKY: Dramatic stormy sunset clouds with underlit fiery orange, burning amber, and radiant crimson rays against deep indigo/violet sky with golden sunbeams.
* FOREGROUND: Wet rain-slicked dark asphalt street with glistening mirror reflections and light caustics mirroring the tower's warm golden lights and the fiery sky, with illuminated Royal Palm trees.`
    : `### CRAZY SEXY DAYLIGHTING & ATMOSPHERE (MAINTAIN 100% CONSISTENCY):
* Crisp 5200K golden-white morning / late-afternoon sunlight hitting the building at an angled 35-degree perspective, casting long diagonal architectural drop shadows from curved balconies across the facade.
* Deep electric cerulean-azure blue sky with luminous cirrus clouds and specular sun glints.
* Ultra-clear double-glazed low-iron glass reflecting sky and clouds while revealing warm interior downlights and penthouse layouts.
* Curved champagne-gold aluminum trims and vertical fins gleaming in the sun.
* Cascading emerald green sky gardens overflowing from balcony planters, sunlit Royal Palms, and wet-look polished granite plaza reflecting the architecture.`;

  return `Award-winning, hyper-photorealistic 8K architectural CGI photograph of the exact same building shown in the reference image, captured from a new professional architectural viewpoint.

### MANDATE — 100% ARCHITECTURAL & MATERIAL CONSISTENCY:
* You MUST maintain 100% exact architectural consistency with the building in the reference image: identical curved champagne-gold trims, identical floor count, identical balcony profiles, identical fluted podium louvers, identical glass curtain walls, and identical materials.
* Do NOT alter the building design or architectural language — only synthesize the new camera viewpoint specified below.

### ${angle.cameraPrompt}

${lightingSection}

### TECHNICAL QUALITY:
* 8K Octane Render, V-Ray, Unreal Engine 5 architectural visualization quality.
* Ray-traced reflections on all glass, polished stone, and wet ground surfaces.
* Volumetric atmospheric bloom, sharp drop shadows, physics-accurate perspective convergence.
* Zero wireframe, zero cartoon, pure luxury architectural photography.

${extraDirectives ? `### CUSTOM DIRECTIVES:\n${extraDirectives}` : ''}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      renderedBase64,
      timeOfDay = 'night',
      extraDirectives = '',
      quality = 'medium',
    } = body;

    if (!renderedBase64) {
      return NextResponse.json({ error: 'renderedBase64 reference image is required.' }, { status: 400 });
    }

    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json({ error: 'FAL_KEY is missing.' }, { status: 500 });
    }
    fal.config({ credentials: falKey });

    console.log('[ExteriorAngles] Uploading rendered reference image to fal storage...');
    const referenceImageUrl = await uploadBase64ToFalStorage(renderedBase64);
    console.log('[ExteriorAngles] Reference uploaded:', referenceImageUrl);

    console.log('[ExteriorAngles] Launching 3 parallel angle generations (Hero, Street Level, Worm\'s Eye)...');

    // Run all 3 angles in parallel using Promise.all
    const anglePromises = THREE_PROFESSIONAL_ANGLES.map(async (angle) => {
      const prompt = buildAnglePrompt(angle, timeOfDay === 'day' ? 'day' : 'night', extraDirectives);
      console.log(`[ExteriorAngles] Calling GPT Image 2 for ${angle.label}...`);
      
      const res = await runModel('openai/gpt-image-2/edit', {
        image_urls: [referenceImageUrl],
        prompt,
        quality: quality || 'medium',
      });

      const base64 = await fetchToBase64(res.url);
      console.log(`[ExteriorAngles] Finished angle: ${angle.label}`);

      return {
        id: angle.id,
        label: angle.label,
        shortDesc: angle.shortDesc,
        render: base64,
        seed: res.seed ?? null,
      };
    });

    const angleResults = await Promise.all(anglePromises);
    console.log('[ExteriorAngles] All 3 professional angles successfully rendered in parallel!');

    return NextResponse.json({
      success: true,
      angles: angleResults,
    });
  } catch (err: any) {
    console.error('[ExteriorAngles] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to render multi-angle perspectives.' },
      { status: 500 }
    );
  }
}
