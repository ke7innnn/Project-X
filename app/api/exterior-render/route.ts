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
    glass_steel:
      'ultra-premium floor-to-ceiling double-glazed low-iron glass curtain wall with polished brushed-steel mullion frames, deep dark structural steel spandrel panels, mirror-finish chrome balcony railings, backlit glass facade panels glowing amber at night',
    concrete_wood:
      'exposed fair-faced board-formed concrete walls with ultra-fine horizontal rib texture, warm kiln-dried charred cedar wood louvers and brise-soleil, raw-edge polished concrete soffits, Corten steel accent fins patinated in orange-rust tones, lush planted green terraces',
    white_marble:
      'pure book-matched Carrara white marble cladding panels with fine grey veining, polished Arabescato marble base plinth, brushed brass window frames and door surrounds, hand-laid Calacatta marble paving with mirror-finish wet look, crisp white rendered stucco infills',
    brick_terracotta:
      'handcrafted Danish wire-cut elongated brick in warm terracotta and burnt sienna palette, recessed mortar joints, textured terracotta ceramic rain-screen panels, dark bronze window frames with deep reveals, natural travertine paving, and wrought iron decorative railings',
    parametric_mesh:
      'computational parametric perforated aluminium mesh facade panels in gradient density pattern, anodized titanium gold and matte black finish, sculptural organic geometry, backlit LED strips behind mesh creating otherworldly amber glow at dusk, seamless frameless glazing inserts',
    luxury_dark:
      'ultra-dark polished black granite and obsidian stone cladding, smoked ultra-dark bronze-tinted glass, black powder-coated aluminium structural grid, brushed dark titanium balcony frames, noir zinc sheet metal coping, deep-set shadow-gap reveals, and dramatically angled blade fins in blackened steel',
  };

  const skyMap: Record<string, string> = {
    golden_hour:
      'MAGIC HOUR — Blazing golden hour sunset at exactly 6:42PM with an explosive orange-crimson-magenta horizon gradient sky, razor-sharp elongated building drop shadows slicing diagonally across the paving, warm 2700K amber rim lighting wrapping every facade edge, wispy high-altitude cirrus clouds ablaze in pink and coral, volumetric golden sunbeams punching through cloud breaks, glass panels igniting in intense mirror reflections of the orange sky',
    blue_hour:
      'BLUE HOUR — Cinematic architectural twilight at precisely 7:24PM, the sky is a jaw-dropping gradient from deep prussian navy at zenith to electric cobalt at the horizon, the building lit by warm 3200K golden interior spill from every floor plate glazing, exterior LED architectural uplighters washing the facade in crisp white and ice blue, the foreground paving glowing in subtle puddle reflections of the lit building, first stars visible at the zenith',
    dramatic_overcast:
      'DRAMATIC OVERCAST — Brooding, heavy storm-clouds in deep blue-grey and charcoal rolling overhead, diffuse even silvery daylight casting no harsh shadows for ultimate material texture revelation, god-rays of light breaking through gaps in storm clouds with volumetric beams, the building facade textures rendered in extraordinary hyperdetail in the even dramatic lighting, ambient occlusion in every surface crevice for depth',
    noon_blazing:
      'SCORCHING MIDDAY SUN — Blazing 5500K white sun at 90 degrees overhead, razor-sharp crisp building drop-shadows pitch black at exactly 90 degrees, vivid saturated sky in electric cerulean cobalt blue, ultra-high contrast between sunlit white facade panels glowing almost neon-bright and shadowed recesses in deep shadow, glass facades reflecting a bright chrome mirror image of the sky, shimmering heat distortion near ground-level paving, ultra-sharp 8K detail in every material surface texture',
    rainy_night:
      'RAINY CINEMATIC NIGHT — Heavy rain slicking every horizontal surface in a deep mirror-film, neon architectural facade uplighters and warm 2700K window glows reflecting in oily wet paving in abstract expressionist patterns, deep inky navy sky with no stars, steam rising from warm drainage grates, bokeh neon city glow visible in the background, the building itself an island of warmth against the cold moody night',
    stormy_dusk:
      'STORMY TWILIGHT — Apocalyptic dramatic dusk with turbulent silver-purple storm clouds churning overhead split by a single violent streak of amber-orange horizon glow, blue lightning silhouetting the tower crown, rain-slicked glass facades glowing from within in warm amber, architectural flood-lights cutting dramatic uplighting cones from the building base, deep navy foreground and violently saturated sky creating an alien cinematic moment',
  };

  const cameraMap: Record<string, string> = {
    street_level:
      'ultra-wide angle street-level pedestrian perspective at exact eye level (1.6m from ground), camera looking up at the building with extreme foreshortening exaggerating the tower height, dramatic convergence of vertical lines, foreground includes landscaped pedestrian plaza, trees, and people for scale',
    worm_eye:
      'dramatic worm\'s-eye-view looking straight up at the building from directly below, extreme fisheye-like convergence of vertical lines to zenith vanishing point, facade details overwhelming the frame, explosive sky visible through glass balconies, structural geometry rendered in dramatic perspective distortion',
    hero_angle:
      'dramatic 45-degree angled hero perspective from a slightly elevated vantage point (approx 3rd floor height of an adjacent building), two facade planes visible simultaneously, showing the full building height from base plaza to rooftop crown, wide-angle 24mm equivalent lens compression, flanking street-level landscape in foreground',
    drone_45:
      'aerial drone perspective at 45-degree downward angle from approximately 80m elevation, showing the building crown, rooftop terrace, surrounding landscaping and streets below in perfect 45-degree isometric aerial composition, dramatic foreshortening of surrounding urban context',
    drone_side:
      'cinematic lateral drone flyby perspective at mid-building height, exactly parallel to the primary facade, revealing the full height width proportion of the building like an architectural elevation but with extreme 3D depth, surrounding context visible on both sides, ultra-wide 16mm equivalent lens field of view',
    interior_courtyard:
      'intimate interior courtyard or atrium perspective from within the building envelope, surrounded by 3 or 4 facade planes, looking up at the sky through the open-top atrium or light well, warm morning light flooding down from the opening above, detail of the interior-facing facades with planted balconies, water feature or reflecting pool at base level',
  };

  const material = materialMap[materialPreset] || materialMap['glass_steel'];
  const sky = skyMap[skyPreset] || skyMap['golden_hour'];
  const camera = cameraMap[cameraAngle] || cameraMap['hero_angle'];

  return `You are rendering the EXACT building shown in this SketchUp/3D architectural massing model as a HYPER-PHOTOREALISTIC architectural exterior visualization at PUBLICATION GRADE.

## ABSOLUTE GEOMETRIC FIDELITY MANDATE:
* CRITICAL: You MUST preserve 100% of the exact building geometry, massing, composition, floor count (${floors} floors), facade articulation, setbacks, cantilevers, overhangs, wing configurations, and architectural form shown in the reference model.
* DO NOT simplify, round, or alter the building massing or footprint geometry in any way — follow the input model exactly.
* Count and match every floor plate, every balcony extrusion, every facade bay and column grid spacing from the reference.
* Maintain the exact same camera angle, composition frame, and lens perspective as shown in the input model.
* Building Type: ${buildingType.toUpperCase()} — render appropriate architectural scale, proportion, and urban context accordingly.
* Total Floors: ${floors} — every floor plate, slab edge, and facade bay MUST be counted and rendered correctly.

## FACADE MATERIALS (Apply to every surface):
${material}

## SKY & LIGHTING ATMOSPHERE:
${sky}

## CAMERA COMPOSITION:
${camera}

## SURROUNDINGS & CONTEXT:
${surroundings || 'Ultra-premium urban architectural context: polished granite plaza paving with seamless mirror-wet finish, majestic mature specimen date palms and weeping fig trees with lush canopies, bespoke custom-designed street furniture in black powder-coated steel, luxury sports cars parked at curbside, people in elegant architectural-fashion attire providing human scale, receding boulevard perspective with distant city skyline'}

## ULTRA-PHOTOREALISM RENDERING MANDATES:
* 8K publication-grade photorealistic architectural visualization — each surface texture must be individually grain-mapped and physically correct.
* Every glass panel must show distinct sky reflections, interior floor plate reveals through glazing, and anti-reflective coating edge glint.
* Structural elements (columns, beams, spandrel panels) must cast correct physics-accurate soft shadows on adjacent surfaces.
* Ground plane must show material relief, ambient occlusion in expansion joints, and wet-look or dry-look finish correct to the lighting scenario.
* Foreground landscaping must be botanically specific with realistic leaf cluster density and volumetric canopy depth.
* Atmospheric depth haze must fade distant context naturally.
* RAY-TRACED REFLECTIONS on every glass and polished surface.
* CRAZY volumetric lighting with visible light shafts in atmospheric conditions.
* Lens effects: slight chromatic aberration at edges, lens flare on direct light sources, subtle film grain, natural vignette.
* ZERO cartoon or illustration look — this must be indistinguishable from a real photograph of a real built building.

${extraDirectives ? `## ADDITIONAL CLIENT DESIGN DIRECTIVES:\n${extraDirectives}` : ''}

## ABSOLUTE PROHIBITIONS:
* NO text, labels, or watermarks visible anywhere.
* NO 3D model wireframe or mesh lines visible.
* NO grey placeholder surfaces — every surface must be fully material-rendered.
* NO altering the building geometry from what the model shows.`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      modelBase64,
      buildingType = 'Luxury Residential Tower',
      floors = 20,
      materialPreset = 'glass_steel',
      skyPreset = 'golden_hour',
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

    const masterPrompt = buildExteriorPrompt({
      buildingType,
      floors: Number(floors),
      materialPreset,
      skyPreset,
      cameraAngle,
      extraDirectives,
      surroundings,
    });

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
