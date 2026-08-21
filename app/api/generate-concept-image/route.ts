import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 120; // extended for 2-stage pipeline

fal.config({ credentials: process.env.FAL_KEY });

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildFalInput(falModel: string, imageUrl: string | null, prompt: string): Record<string, any> {
  const isGptImage2Edit = falModel === 'openai/gpt-image-2/edit';
  const isGptImage2T2I  = falModel === 'openai/gpt-image-2';
  const isFluxCanny     = falModel.includes('flux-control-lora-canny');
  const usePluralUrls   = falModel.includes('gemini') || falModel.includes('nano-banana') || falModel.includes('klein');

  if (isGptImage2T2I || !imageUrl) {
    return { prompt, quality: 'low' };
  } else if (isGptImage2Edit) {
    return { image_urls: [imageUrl], prompt, quality: 'low' };
  } else if (isFluxCanny) {
    return { control_image_url: imageUrl, control_lora_image_url: imageUrl, prompt, num_inference_steps: 28, guidance_scale: 3.5, controlnet_conditioning_scale: 1.0 };
  } else if (usePluralUrls) {
    return { image_urls: [imageUrl], prompt };
  }
  return { image_url: imageUrl, prompt };
}

async function runModel(falModel: string, input: Record<string, any>): Promise<string> {
  const result = await fal.subscribe(falModel, { input });
  const images = (result as any)?.images || (result.data as any)?.images;
  if (!images || images.length === 0) throw new Error(`${falModel} returned no images`);
  return images[0].url;
}

async function fetchToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`);
  const ct = res.headers.get('content-type') || 'image/png';
  const buf = await res.arrayBuffer();
  return `data:${ct};base64,${Buffer.from(buf).toString('base64')}`;
}

async function urlToFalStorage(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const blob = new Blob([buf], { type: 'image/png' });
  const file = new File([blob], 'stage1.png', { type: 'image/png' });
  return fal.storage.upload(file);
}

function getFlatRoomAnatomy(bhk: string): string {
  switch (bhk) {
    case '1bhk':
      return '[1× Master Bedroom (Queen Bed), 1× Attached Bathroom/Toilet, 1× Living/Dining Lounge (Sofa + Dining Set), 1× Modular Kitchen with Breakfast Bar, 1× Attached Facade Balcony]';
    case '2bhk':
      return '[1× Master Suite (King Bed + Ensuite Bath), 1× Secondary Bedroom (Queen Bed), 1× Common Bathroom, 1× Open-Concept Living & Dining Lounge, 1× Modular Kitchen, 1× Attached Facade Balcony]';
    case '3bhk':
      return '[1× Master Suite (King Bed + Walk-in Wardrobe + Ensuite Spa Bath), 1× Bedroom 2 (Queen Bed), 1× Bedroom 3 (Twin Beds), 3× Bathrooms, 1× Grand Living Lounge, 1× Formal Dining Room, 1× Chef Kitchen, 1× Wrap-around Balcony]';
    case '4bhk':
      return '[1× Presidential Master Suite, 3× En-suite Bedrooms, 4× Bathrooms, 1× Grand Living Hall, 1× Formal Dining, 1× Family Lounge, 1× Chef Kitchen with Pantry, 1× Panoramic Balconies]';
    default:
      return '[1× Master Bedroom, 1× Bedroom 2, 2× Bathrooms, 1× Living/Dining Room, 1× Kitchen, 1× Balcony]';
  }
}

function getShapeGeometricDirectives(prompt: string, numFlats: number): { shapeName: string; directives: string } {
  const p = prompt.toLowerCase();
  
  if (p.includes('arc') || p.includes('crescent') || p.includes('bow')) {
    return {
      shapeName: 'ARC / CRESCENT',
      directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL ARC / CRESCENT GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE a dramatic, unmistakable, sweeping C-SHAPED CRESCENT ARC RIBBON!
• THE INNER CONCAVE REGION IS OPEN AIR / OUTDOOR VOID: DO NOT fill the center with solid rooms into a square or barrel box! The inner curve must clearly show the white/cream presentation board background outside the building.
• APARTMENT LAYOUT: All ${numFlats} apartments are distributed sequentially along the curved ribbon from the left tip to the right tip of the arc.
• 3-WAY SYNCHRONIZATION: The 3D Top View (roof) and the 3D Perspective Elevation MUST BE the EXACT SAME C-shaped curved crescent tower with continuous curved balconies!
• FORBIDDEN: DO NOT draw a solid rectangle, block, or barrel!`,
    };
  }
  
  if (p.includes('stepped') || p.includes('l-shape') || p.includes('l shape')) {
    return {
      shapeName: 'STEPPED L-SHAPE',
      directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL STEPPED L-SHAPE GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE an unmistakable 2-wing L-SHAPED building with stepped terraced corners!
• The corner quadrant outside the L is open outdoor space (not solid rooms).
• The 3D Top View and 3D Perspective Elevation MUST BE the exact same L-shaped multi-story tower!`,
    };
  }

  if (p.includes('batman') || p.includes('dark knight') || p.includes('batwing')) {
    return {
      shapeName: 'BATMAN INSIGNIA',
      directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL BATMAN INSIGNIA GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE the iconic BATMAN INSIGNIA silhouette with dual pointed ears at top, scalloped side wings, and tapered bottom tail!
• The negative space between the ears and wing scallops is open outdoor space.
• The 3D views must match this exact sculptural Batman tower!`,
    };
  }

  if (p.includes('torso') || p.includes('twisted') || p.includes('turning')) {
    return {
      shapeName: 'TURNING TORSO',
      directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL TURNING TORSO GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE a sleek rhomboid / parallelogram with a central core.
• The 3D Perspective Elevation MUST show the dramatic 90-degree twisting spiral skyscraper form!`,
    };
  }

  if (p.includes('wave') || p.includes('s-shape') || p.includes('aqua') || p.includes('al hamra') || p.includes('al-hamra')) {
    return {
      shapeName: 'S-SHAPE WAVEFORM',
      directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL S-SHAPE / WAVEFORM GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE a continuous double-curved S-SHAPED serpentine ribbon with alternating concave/convex bays!
• The 3D views must match this exact undulating wave skyscraper!`,
    };
  }

  if (p.includes('triang') || p.includes('3-wing') || p.includes('burj') || p.includes('trefoil') || p.includes('y-shape')) {
    return {
      shapeName: 'TRI-WING Y-PRISM',
      directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL TRI-WING Y-SHAPE GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE a 3-winged Y-SHAPED / trefoil layout radiating 120° from a central triangular hub!
• The 3 open bays between the wings are open outdoor space.
• The 3D views must match this exact 3-winged tower!`,
    };
  }

  if (p.includes('pinwheel')) {
    return {
      shapeName: 'DYNAMIC PINWHEEL',
      directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL PINWHEEL GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE a dynamic 4-wing rotating PINWHEEL geometry with 4 staggered projecting arms!
• The 3D views must match this exact pinwheel skyscraper!`,
    };
  }

  if (p.includes('t-shape') || p.includes('t shape')) {
    return {
      shapeName: 'T-SHAPE SLAB',
      directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL T-SHAPE GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE a distinct T-SHAPE with a wide horizontal bar and a vertical spine leg!
• The two side quadrants flanking the vertical leg are open outdoor space.
• The 3D views must match this exact T-shaped tower!`,
    };
  }

  if (p.includes('h-shape') || p.includes('h shape')) {
    return {
      shapeName: 'H-SHAPE DUAL WING',
      directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL H-SHAPE GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE an H-SHAPE with two parallel residential wings connected by a central circulation bridge!
• The top and bottom central courtyards are open outdoor space.
• The 3D views must match this exact H-shaped dual wing tower!`,
    };
  }

  if (p.includes('ginkgo') || p.includes('fan') || p.includes('leaf')) {
    return {
      shapeName: 'GINKGO FAN LEAF',
      directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL GINKGO FAN LEAF GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE a distinct curved FAN LEAF shape with radial lobes and an indented base notch!
• The 3D Top View and 3D Perspective Elevation MUST BE the exact same organic fan-leaf profile!`,
    };
  }

  if (p.includes('cross') || p.includes('4-wing') || p.includes('plus') || p.includes('x-shape')) {
    return {
      shapeName: '4-WING CROSS',
      directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL 4-WING CROSS GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE a 4-winged symmetrical cross / plus shape with 4 distinct projecting wings and open corner voids!
• The 3D views must match this exact 4-winged cross tower!`,
    };
  }

  if (p.includes('diamond')) {
    return {
      shapeName: 'DOUBLE DIAMOND',
      directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL DOUBLE DIAMOND GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE two interlocking faceted diamond lozenge wings with sharp angled facade points!
• The 3D views must match this exact faceted diamond tower!`,
    };
  }

  if (p.includes('droplet') || p.includes('teardrop')) {
    return {
      shapeName: 'WATER DROPLET',
      directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL WATER DROPLET GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE a sleek aerodynamic teardrop with a rounded bulbous base and a tapered nose!
• The 3D views must match this exact teardrop massing!`,
    };
  }

  if (p.includes('hexagon') || p.includes('honeycomb')) {
    return {
      shapeName: 'HEXAGONAL HONEYCOMB',
      directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL HEXAGONAL HONEYCOMB GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE a clean 6-sided faceted hexagon with open space outside all 6 outer facets!
• The 3D views must match this exact 6-sided hexagonal tower!`,
    };
  }

  if (p.includes('octagon') || p.includes('star') || p.includes('petronas') || p.includes('wtc')) {
    return {
      shapeName: 'OCTAGONAL STAR',
      directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL OCTAGONAL / STARBURST GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE an 8-sided faceted octagon or 8-point geometric starburst!
• The 3D views must match this exact multi-faceted faceted tower!`,
    };
  }

  // Universal Custom Shape Fallback
  return {
    shapeName: prompt.split(/\s+/).slice(0, 3).join(' ').toUpperCase(),
    directives: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL CUSTOM GEOMETRIC SILHOUETTE MANDATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The 2D building footprint MUST BE sculpted into the EXACT authentic outer silhouette of: "${prompt}".
• NEGATIVE SPACE MANDATE: DO NOT fill the canvas with a solid rectangular box or barrel! The outer boundary must distinctly show the exact contours, curves, notches, wings, or facets of this shape, surrounded by clean presentation board backdrop.
• 3-WAY SYNCHRONIZATION: The 2D floor plan (left), 3D roof top view (top-right), and 3D isometric perspective elevation (mid-right) MUST ALL BE 100% VISUALLY AND GEOMETRICALLY IDENTICAL to this exact shape!`,
  };
}

function buildPrompt(opts: {
  isSingle: boolean; buildingType: string; numFlats: number;
  hasDividers: boolean; hasCore: boolean;
  roomItems: string; roomListLabelHint: string; verifyChecks: string;
  widthM?: number; lengthM?: number; userPrompt?: string;
}): string {
  const { isSingle, numFlats = 6, userPrompt = '', widthM = 80, lengthM = 80 } = opts;

  const { shapeName, directives: geometricDirectives } = getShapeGeometricDirectives(userPrompt, numFlats);

  const flatLabelsList = Array.from({ length: numFlats }, (_, i) => `"FLAT ${String(i + 1).padStart(2, '0')}"`).join(', ');

  const itemizedFlatRoster = Array.from({ length: numFlats }, (_, i) => 
    `• FLAT ${String(i + 1).padStart(2, '0')}: [1× Master Suite with Ensuite Bath, 1× Secondary Bedroom, 2× Bathrooms, 1× Living & Dining Lounge, 1× Modular Kitchen, 1× Attached Facade Balcony]`
  ).join('\n');

  return `High-end MASTER ARCHITECTURAL PRESENTATION BOARD floor plan drawing of a luxury residential building.

${geometricDirectives}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 MANDATORY APARTMENT PARTITIONING SCHEDULE (EXACTLY ${numFlats} APARTMENT UNITS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The 2D floor plan plate MUST be partitioned and divided into EXACTLY ${numFlats} INDEPENDENT APARTMENTS (${numFlats} Apartment Units):
${itemizedFlatRoster}

CRITICAL SPATIAL RULES:
1. TOTAL VISIBLE APARTMENTS: Exactly ${numFlats} distinct private flats on the floor plan (${flatLabelsList}). DO NOT reduce or default to 3 or 4 units!
2. PERIMETER FACADE ALLOCATION: Distribute all ${numFlats} flats along the outer perimeter facade of the ${shapeName} building so that every bedroom and living room captures direct exterior windows and natural ventilation.
3. CENTRAL EGRESS & CIRCULATION: Central service core with 2× Passenger Elevators and 2× Fire Stairwells with step treads. A continuous common corridor provides private front door entrances (with visible door swing arcs) to all ${numFlats} units.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 PRESENTATION BOARD COMPOSITION & MULTI-VIEW FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The image is a professional, high-resolution architectural presentation board sheet on a subtle warm sand/cream background, divided into four clean panels:

1. 🌟 MAIN 2D FLOOR PLAN (LEFT 70% OF SHEET):
   - A complete, highly detailed top-down 2D architectural CAD floor plan layout.
   - OUTER FOOTPRINT & GEOMETRY: Sculpted into the exact ${shapeName} silhouette with dramatic, authentic negative space outside the perimeter.
   - Visible Internal Partitioning: EXACTLY ${numFlats} independent residential apartment units (${flatLabelsList}) arranged around the core.
   - Architectural Textures & Materials: Polished cream travertine / Italian calacatta marble floor tiles in living and dining rooms, warm honey oak herringbone hardwood in master bedrooms, textured light porcelain in kitchens and bathrooms.
   - Designer Vector CAD Furniture:
     • Master Suites: King-size beds with floating nightstands, glass walk-in wardrobe closets, ensuite spa bathrooms with double vanities, freestanding bathtubs, and glass shower partitions.
     • Secondary Bedrooms: Queen/single beds with study workstations and built-in wardrobes.
     • Living & Dining Lounges: Deep curved / L-shaped Italian designer sectional sofas, round travertine coffee tables, slim TV media consoles, and marble dining tables.
     • Modular Chef's Kitchens: Sleek quartz island breakfast counters with barstools, double undermount sinks, and gas cooktops.
     • Wrap-around Facade Balconies: Floor-to-ceiling sliding glass doors opening seamlessly onto continuous curved balconies with teak wood decking, outdoor lounge seating, and lush tropical green planter boxes.
   - Central Core: Central fire staircase with realistic step treads & UP/DN arrows, and 2× Passenger Lifts with clear elevator car doors.
   - Callout leader lines and labels for every single unit: ${flatLabelsList}, with a distinct North Arrow indicator in the top-left.

2. 🏙️ TOP-RIGHT PANEL — "TOP VIEW (BUILDING FORM)":
   - Realistic 3D aerial architectural massing render of the roof plate from directly above.
   - Must show the EXACT SAME ${shapeName} silhouette as the 2D floor plan, with landscaped rooftop sky terrace, solar canopy, and architectural crown.

3. 🏢 MIDDLE-RIGHT PANEL — "3D VIEW (BUILDING FORM)":
   - Photorealistic 3D isometric perspective architectural render of the complete tower elevation.
   - Rising in the EXACT SAME ${shapeName} geometry with floor-to-floor curved glass curtain walls, cantilevered wrap-around balcony slabs with warm LED under-soffit lighting, and a sculpted aerodynamic crown.

4. 📊 BOTTOM-RIGHT CARD — "FLOOR PLAN SUMMARY" & "FLAT LEGEND":
   - Elegant architectural summary card with clean typography:
     • Title: ${shapeName} LUXURY RESIDENTIAL TOWER
     • Dimension: ${widthM}m × ${lengthM}m
     • Total Unit Mix: EXACTLY ${numFlats} APARTMENT UNITS
     • Central Staircase & Dual Elevator Core
     • Color-coded Flat Legend key table matching all ${numFlats} flats with distinct pastel chips.
     • Footnote: "NOTE: PLAN IS CONCEPTUAL AND CAN BE MODIFIED AS PER SITE CONDITIONS".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILDING SPECIFICATIONS:
• TARGET CONCEPT: "${userPrompt}" (${shapeName})
• DIMENSIONS: ${widthM}m Width × ${lengthM}m Length
AESTHETICS:
Crisp architectural CAD linework, warm cream and sand presentation backdrop, ultra-clean publication-ready presentation board layout, photorealistic rendering.`;
}

// ── Resolve reference image URL (optional user upload) ─────────────────────────

async function getUploadedReferenceUrl(customBase64?: string | null): Promise<string | null> {
  if (customBase64 && customBase64.length > 50) {
    const base64Data = customBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const file = new File([new Blob([buffer], { type: 'image/png' })], 'user_ref.png', { type: 'image/png' });
    return await fal.storage.upload(file);
  }
  return null;
}

async function compileArchitecturalPromptWithAgent(opts: {
  userPrompt: string;
  widthM: number;
  lengthM: number;
  numFlats: number;
  hasDividers?: boolean;
}): Promise<string> {
  const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
  if (!openRouterKey) {
    return buildPrompt({ isSingle: false, buildingType: 'multi-residential', numFlats: opts.numFlats, hasDividers: !!opts.hasDividers, hasCore: true, roomItems: '', roomListLabelHint: '', verifyChecks: '', widthM: opts.widthM, lengthM: opts.lengthM, userPrompt: opts.userPrompt });
  }

  const systemMessage = `You are a Principal Architectural Prompt Engineer for high-end master presentation boards.
Your mission is to write a single, ultra-detailed, laser-focused prompt for an image diffusion model (OpenAI GPT-Image-2) to generate a complete master architectural presentation board.

STRICT DESIGN RULES:
1. FOCUS 100% EXCLUSIVELY ON THIS ONE SHAPE:
   - Identify the user's specific requested building shape from the brief (e.g. Arc/Crescent, Stepped-L, Hexagon, Batman, etc.).
   - Write explicit geometric contour directives ONLY for this exact shape. Do NOT mention, describe, or mix with other unrelated shapes.
   - AUTHENTIC NEGATIVE SPACE: Open void/air outside the shape must clearly show clean presentation board background. NEVER draw a solid rectangular box or barrel.
2. CRITICAL UNIT SEPARATION & DEMISING WALLS:
   - Partition the 2D floor plan into EXACTLY ${opts.numFlats} INDEPENDENT APARTMENT UNITS (FLAT 01 to FLAT ${String(opts.numFlats).padStart(2, '0')}).
   - SOLID SEPARATING PARTY WALLS: Every single flat MUST be bounded by thick, visible, continuous 200mm solid structural demising party walls. Zero room bleeding or chaotic overlapping between adjacent units!
   - INDEPENDENT APARTMENT BOXES: Each flat is a complete self-contained private unit with its own front entrance door (with visible door swing arc) opening from a common circulation corridor.
   - ROOM ANATOMY PER FLAT: Each flat contains its own private Living Lounge, Modular Kitchen, Ensuite Bedrooms, Bathrooms, and its own private Attached Facade Balcony (natural luxury mixed apartment density).

3. 🌬️ NATURAL VENTILATION, DAYLIGHT & LIVING ROOM BALCONY INTEGRATION:
   - LIVING ROOM BALCONY CONNECTION: Every single Living Room MUST be positioned directly along the exterior perimeter facade, seamlessly connected to a wide, expansive curved/wrap-around balcony via full-height sliding glass doors.
   - NATURAL CROSS-VENTILATION & DAYLIGHT: All living rooms, dining lounges, and bedrooms MUST sit along the building's exterior perimeter with large operable windows to ensure abundant natural daylight, fresh air circulation, and outdoor garden views.
   - NEVER place a living room or bedroom in an interior windowless dark pocket — every habitable room must touch the exterior facade!
   - Balconies feature teak wood decking, glass balustrades, outdoor lounge chairs, and lush planter boxes.

4. 4-PANEL PRESENTATION BOARD COMPOSITION:
   - Panel 1 (Left 70%): Full 2D top-down CAD master floor plan with warm travertine/marble flooring, furnished rooms, central core (2 elevators + 2 stairwells), and callout labels for every single unit (FLAT 01 to FLAT ${String(opts.numFlats).padStart(2, '0')}).
   - Panel 2 (Top-Right 30%): "TOP VIEW (BUILDING FORM)" - 3D aerial roof massing render of that EXACT shape from directly above.
   - Panel 3 (Middle-Right 30%): "3D VIEW (BUILDING FORM)" - Photorealistic 3D isometric perspective tower elevation rising in that EXACT shape with matching floor slabs and wrap-around glass balconies.
   - Panel 4 (Bottom-Right 30%): "FLOOR PLAN SUMMARY" & "FLAT LEGEND" card displaying Title, Dimensions (${opts.widthM}m × ${opts.lengthM}m), Total Unit Mix (${opts.numFlats} APARTMENT UNITS), and color-coded legend table.
${opts.hasDividers ? '5. USER-DRAWN PARTITIONS: The user has supplied a custom mask with dividing partition cut lines. Respect these cuts as solid demising walls and place separate external flat units in each divided zone with exterior balcony access.' : ''}

Return ONLY the raw prompt text to send to the image generation model. No conversational introductory or concluding remarks.`;

  try {
    console.log('[ConceptGenerator] Calling AI Architectural Prompt Compiler Agent...');
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://projectx.app',
        'X-Title': 'Project X Architectural Prompt Compiler Agent',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: `USER ARCHITECTURAL BRIEF: "${opts.userPrompt}"\nBUILDING DIMENSIONS: ${opts.widthM}m × ${opts.lengthM}m\nEXACT FLATS PER FLOOR: ${opts.numFlats} APARTMENT UNITS${opts.hasDividers ? '\nCUSTOM PARTITION CUTS DETECTED: YES' : ''}` }
        ],
        temperature: 0.2,
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const json = await res.json();
      const compiledText = json.choices?.[0]?.message?.content?.trim();
      if (compiledText && compiledText.length > 200) {
        console.log('[ConceptGenerator] AI Prompt Compiler Agent generated customized prompt successfully!');
        return compiledText;
      }
    }
  } catch (err: any) {
    console.warn('[ConceptGenerator] Prompt Compiler Agent failed, using algorithmic fallback:', err.message);
  }

  return buildPrompt({ isSingle: false, buildingType: 'multi-residential', numFlats: opts.numFlats, hasDividers: !!opts.hasDividers, hasCore: true, roomItems: '', roomListLabelHint: '', verifyChecks: '', widthM: opts.widthM, lengthM: opts.lengthM, userPrompt: opts.userPrompt });
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const {
      traceCanvasBase64, referenceImageBase64, userPrompt, widthM = 80, lengthM = 80,
      buildingType = 'multi-residential', roomConfig = '2bhk',
      workflow = 'gpt-solo', flatCount = 'auto', numFlats: reqNumFlats, hasDividers = false,
      hasCore = false, numRegions = 1
    } = await req.json();

    // Check if user provided a custom sketch/reference image
    const customUserRefUrl = await getUploadedReferenceUrl(referenceImageBase64 || traceCanvasBase64);
    const hasCustomRef = !!customUserRefUrl;

    // If custom image is provided, use image edit model; otherwise, use pure Text-to-Image gpt-image-2
    let stage1Model = hasCustomRef ? 'openai/gpt-image-2/edit' : 'openai/gpt-image-2';
    
    // Map custom workflow if explicitly passed
    if (workflow === 'grok-gpt') {
      stage1Model = 'xai/grok-imagine-image/edit';
    } else if (workflow === 'gemini-solo') {
      stage1Model = 'fal-ai/gemini-3.1-flash-image-preview/edit';
    } else if (workflow === 'flux-klein-gpt') {
      stage1Model = 'fal-ai/flux-2/klein/9b/edit';
    }

    console.log(`[ConceptGenerator] Mode: ${hasCustomRef ? 'IMAGE-TO-IMAGE (Custom Sketch)' : 'TEXT-TO-IMAGE (Master Presentation Board)'} | Model: ${stage1Model}`);

    const isSingle = buildingType === 'single-residential';
    const numFlats = isSingle ? 1 : (reqNumFlats ? Math.max(1, Math.min(10, Number(reqNumFlats))) : (flatCount && flatCount !== 'auto' ? Math.max(1, Math.min(10, parseInt(flatCount, 10))) : 6));

    // ── STAGE 1: Compile Hyper-Specialized Prompt via AI Architectural Compiler Agent ──
    const stage1Prompt = await compileArchitecturalPromptWithAgent({
      userPrompt: userPrompt || '',
      widthM,
      lengthM,
      numFlats,
      hasDividers,
    });

    console.log('[ConceptGenerator] Final Prompt length:', stage1Prompt.length);

    // ── Run 4 Parallel Candidate Presentation Boards with quality=low ──
    const stage1Input = buildFalInput(stage1Model, customUserRefUrl, stage1Prompt);
    console.log(`[ConceptGenerator] Generating 4 parallel candidate presentation boards with ${stage1Model} (quality=low)...`);

    const candidatePromises = [1, 2, 3, 4].map(async (idx) => {
      try {
        const url = await runModel(stage1Model, stage1Input);
        const b64 = await fetchToBase64(url);
        return b64;
      } catch (err: any) {
        console.warn(`[ConceptGenerator] Candidate #${idx} failed:`, err.message);
        return null;
      }
    });

    const settled = await Promise.allSettled(candidatePromises);
    const candidateImages = settled
      .filter((r): r is PromiseFulfilledResult<string | null> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value!);

    if (candidateImages.length === 0) {
      throw new Error('Failed to generate concept candidates');
    }

    console.log(`[ConceptGenerator] Successfully generated ${candidateImages.length}/4 candidate presentation boards!`);

    return NextResponse.json({
      imageUrls: candidateImages,
      stage1ImageUrl: candidateImages[0],
      systemPrompt: stage1Prompt,
      userPrompt: `Concept Studio | MODEL: ${stage1Model} (4 Candidates)`,
    });

  } catch (err: any) {
    console.error('[ConceptGenerator] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Concept generation failed' }, { status: 500 });
  }
}
