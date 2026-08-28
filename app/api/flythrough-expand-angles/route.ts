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

interface NewAngleBlueprint {
  id: string;
  label: string;
  cameraPrompt: string;
}

const NEW_ANGLE_BLUEPRINTS: NewAngleBlueprint[] = [
  {
    id: 'drone_overhead',
    label: '80m Drone Birds-Eye',
    cameraPrompt:
      'CAMERA ANGLE — 80M AERIAL DRONE OVERHEAD: Position the camera at a dynamic 80-meter aerial drone height looking down at a 45-degree angle. Captures the full rooftop pitched crown pavilions, the geometric footprint of the tower massing, surrounding landscaped street grid, and distant city horizon in crisp 8K daylight.',
  },
  {
    id: 'side_elevation',
    label: 'Side Elevation & Depth Profile',
    cameraPrompt:
      'CAMERA ANGLE — CINEMATIC SIDE PROFILE: Position the camera at mid-building height in a lateral position parallel to the facade, revealing the full building architectural depth, cantilevered balcony projections, and low-iron Starphire window glass reflections.',
  },
  {
    id: 'podium_plaza',
    label: 'Podium & Entrance Plaza',
    cameraPrompt:
      'CAMERA ANGLE — PODIUM PLAZA & DROP-OFF: Eye-level architectural view focusing on the ground retail podium, glass canopy lobby entrance, manicured palm trees, asphalt driveway with luxury cars, and elegant pedestrians providing scale.',
  },
  {
    id: 'penthouse_glint',
    label: 'Penthouse & Crown Sunset Glint',
    cameraPrompt:
      'CAMERA ANGLE — PENTHOUSE & CROWN DETAIL: Tight elevated architectural shot focusing on the top 4 penthouse levels and pitched roof crowns, catching intense specular golden sun glints, sky garden vegetation, and razor-sharp balcony railings.',
  },
];

export async function POST(req: Request) {
  try {
    const {
      referenceImages, // array of base64 strings
      timeOfDay = 'day',
      requestedAnglesCount = 4,
    } = await req.json();

    const imgs: string[] = Array.isArray(referenceImages) ? referenceImages : [];
    if (imgs.length === 0) {
      return NextResponse.json({ error: 'At least 1 reference image is required.' }, { status: 400 });
    }

    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json({ error: 'FAL_KEY is missing.' }, { status: 500 });
    }
    fal.config({ credentials: falKey });

    console.log(`[ExpandAngles] Uploading ${imgs.length} base image(s) to fal storage...`);
    const uploadedUrls = await Promise.all(
      imgs.map((img, i) => uploadBase64ToFalStorage(img, `base_angle_${i + 1}.png`))
    );

    const blueprintsToGenerate = NEW_ANGLE_BLUEPRINTS.slice(0, requestedAnglesCount || 4);
    console.log(`[ExpandAngles] Synthesizing ${blueprintsToGenerate.length} new unique angles in parallel...`);

    const anglePromises = blueprintsToGenerate.map(async (blueprint) => {
      const prompt = `Award-winning, hyper-photorealistic 8K architectural daytime exterior CGI photograph of the exact same building shown in the reference images.

### STRICT ARCHITECTURAL & MATERIAL CONSISTENCY MANDATE:
* You MUST maintain 100% exact architectural consistency with the building in the reference images: identical facade color, identical floor count, identical balcony profiles, identical podium louvers, identical glass curtain walls, and identical pitched roof pavilions.
* Do NOT alter the building design — only synthesize the new camera viewpoint specified below.

### ${blueprint.cameraPrompt}

### CRISP DAYLIGHTING & ARCHITECTURAL GLASS:
* Crystal-clear double-glazed low-iron Starphire curtain wall glass with realistic sky reflections and natural daylight interior visibility.
* Crisp, golden-white 5200K morning / late-afternoon sunlight hitting the building at a dramatic 35-degree angle, casting razor-sharp architectural drop shadows from balconies across the facade.
* Clear blue sky with light wispy cirrus clouds and rich natural sunbeams.

### RENDER FINISH & TECHNICAL EXCELLENCE:
* 8K Octane Render, V-Ray, Unreal Engine 5 architectural visualization quality.
* Ray-traced reflections on all glass and polished surfaces.
* Zero wireframe, zero flat grey surfaces, zero cartoon look.`;

      const res = await runModel('openai/gpt-image-2/edit', {
        image_urls: uploadedUrls,
        prompt,
        quality: 'medium',
      });

      const base64 = await fetchToBase64(res.url);
      return {
        id: blueprint.id,
        label: blueprint.label,
        base64,
        url: res.url,
        seed: res.seed ?? null,
      };
    });

    const results = await Promise.all(anglePromises);
    console.log(`[ExpandAngles] Successfully generated ${results.length} new angle keyframes!`);

    return NextResponse.json({
      success: true,
      angles: results,
    });
  } catch (err: any) {
    console.error('[ExpandAngles Error]', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to expand angle keyframes.' },
      { status: 500 }
    );
  }
}
