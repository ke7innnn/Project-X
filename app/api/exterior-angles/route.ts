import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 300;

fal.config({ credentials: process.env.FAL_KEY });

async function uploadBase64ToFalStorage(dataUri: string, filename = 'reference.png'): Promise<string> {
  const base64 = dataUri.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  const blob = new Blob([buffer], { type: 'image/png' });
  const file = new File([blob], filename, { type: 'image/png' });
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

function buildAnglePrompt(
  angle: AngleConfig,
  timeOfDay: 'day' | 'night',
  hasShapeReferences: boolean,
  floorCount?: string | number,
  extraDirectives?: string
): string {
  const isNight = timeOfDay === 'night';

  const imageReferenceMandate = hasShapeReferences
    ? `### INPUT IMAGE REFERENCES — CRITICAL READING ORDER:
* IMAGE 1 (First Image) = ⭐ PRIMARY DESIGN REFERENCE: This is the finalized photorealistic architectural CGI render. You MUST replicate 100% of its materials, luxury finishes, lighting mood, color palette, glass reflections, LED ribbons, balcony profiles, champagne-gold trims, and every architectural detail with absolute fidelity.
* IMAGES 2, 3, 4... (Additional Images) = 📐 3D SHAPE & GEOMETRY REFERENCES: These are raw 3D model screenshots (SketchUp/Rhino/Revit). Use them ONLY to understand the building's 3D massing, floor count, curved podium geometry, tower profile, and spatial depth. DO NOT replicate any grey/flat/untextured surfaces, wireframes, or unrendered materials from these shape references.
* SYNTHESIS RULE: Combine the luxury visual language of Image 1 with the architectural geometry comprehension from Images 2+, then render from the new camera angle specified below.
`
    : `### INPUT IMAGE REFERENCE:
* IMAGE 1 = ⭐ PRIMARY DESIGN REFERENCE: Replicate 100% of its materials, lighting, finishes, glass reflections, and every architectural detail. Only synthesize the new camera viewpoint specified below.
`;

  const floorSection = floorCount && Number(floorCount) > 0
    ? `### STRICT ARCHITECTURAL FLOOR COUNT MANDATE — EXACTLY ${floorCount} FLOORS:
* TOTAL STOREYS: The building MUST have EXACTLY ${floorCount} FLOORS / STOREYS from the ground-level podium to the top penthouse / crown level.
* Count every single floor level, balcony band, and slab line meticulously so there are precisely ${floorCount} distinct floor tiers visible in this camera angle.
* ZERO DEVIATION: Under NO circumstances should you hallucinate extra floors or omit floors. Maintain the exact ${floorCount}-floor count identically to the design reference.
`
    : '';

  const lightingSection = isNight
    ? `### ARCHITECTURAL LIGHTING & WINDOW GLASS (MAINTAIN 100% CONSISTENCY WITH IMAGE 1):
* HYPER-REALISTIC GLASS REFLECTIONS: Double-glazed low-iron Starphire curtain wall glass with Fresnel reflections (IOR 1.52) catching high-contrast mirror reflections of fiery sunset clouds and glowing LED ribbons, with subtle panel-by-panel pillowing distortion.
* Dual-Layer Depth: Outer glass reflects the sky while letting warm 2700K–3000K golden interior illumination from ceiling downlights and penthouse layouts glow from within.
* Powerful ground-level architectural floodlights shooting warm light upward along podium vertical fins and fluted columns.
* Glowing architectural halo beacon on the tower crown.
* CRAZY SUNSET DUSK SKY: Dramatic stormy sunset clouds with underlit fiery orange, burning amber, and radiant crimson rays against deep indigo/violet sky with golden sunbeams.
* FOREGROUND: Wet rain-slicked dark asphalt street with glistening mirror reflections and light caustics mirroring the tower's warm golden lights and the fiery sky, with illuminated Royal Palm trees.`
    : `### CRISP DAYLIGHTING & ARCHITECTURAL GLASS (MAINTAIN 100% CONSISTENCY WITH IMAGE 1):
* Double-glazed low-iron Starphire curtain wall glass with crisp mirror sky reflections and interior daylight visibility.
* Crisp 5200K golden-white morning / late-afternoon sunlight hitting the building at an angled 35-degree perspective, casting sharp diagonal architectural drop shadows from curved balconies across the facade.
* Curved champagne-gold aluminum trims and vertical fins gleaming in the sun.
* Cascading emerald green sky gardens on balcony planters, sunlit Royal Palms, and polished granite plaza reflecting the architecture.`;

  return `Award-winning, hyper-photorealistic 8K architectural CGI photograph of the exact same building, captured from a new professional architectural viewpoint.

${imageReferenceMandate}
${floorSection}### MANDATE — 100% ARCHITECTURAL & MATERIAL CONSISTENCY:
* You MUST maintain 100% exact architectural consistency with the DESIGN REFERENCE (Image 1): identical curved champagne-gold trims, identical floor count, identical balcony profiles, identical fluted podium louvers, identical glass curtain walls, and identical materials.
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
      modelImages,        // optional: original SketchUp screenshots as shape references
      floorCount,         // optional: strict floor count parameter
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

    // Upload rendered reference (Image 1 — Design Reference) + any shape reference images in parallel
    const shapeRefs: string[] = Array.isArray(modelImages) ? modelImages : [];
    const hasShapeReferences = shapeRefs.length > 0;

    console.log(`[ExteriorAngles] Uploading rendered design reference + ${shapeRefs.length} shape reference(s) to fal storage...`);

    const [designRefUrl, ...shapeRefUrls] = await Promise.all([
      uploadBase64ToFalStorage(renderedBase64, 'design_reference.png'),
      ...shapeRefs.map((img, i) => uploadBase64ToFalStorage(img, `shape_reference_${i + 1}.png`)),
    ]);

    // Final image_urls order: [Design Reference, ...Shape References]
    const allImageUrls = [designRefUrl, ...shapeRefUrls];
    console.log(`[ExteriorAngles] All images uploaded. Total: ${allImageUrls.length} (1 design + ${shapeRefUrls.length} shape refs)`);

    console.log('[ExteriorAngles] Launching 3 parallel angle generations (Hero, Street Level, Worm\'s Eye)...');

    // Run all 3 angles in parallel using Promise.all
    const anglePromises = THREE_PROFESSIONAL_ANGLES.map(async (angle) => {
      const prompt = buildAnglePrompt(angle, timeOfDay === 'day' ? 'day' : 'night', hasShapeReferences, floorCount, extraDirectives);
      console.log(`[ExteriorAngles] Calling GPT Image 2 for ${angle.label} with ${allImageUrls.length} reference image(s) (floors: ${floorCount || 'auto'})...`);
      
      const res = await runModel('openai/gpt-image-2/edit', {
        image_urls: allImageUrls,
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
      shapeRefsUsed: shapeRefUrls.length,
      floorCount: floorCount || null,
    });
  } catch (err: any) {
    console.error('[ExteriorAngles] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to render multi-angle perspectives.' },
      { status: 500 }
    );
  }
}
