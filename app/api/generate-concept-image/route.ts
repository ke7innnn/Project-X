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
    return { prompt, quality: 'medium' };
  } else if (isGptImage2Edit) {
    return { image_urls: [imageUrl], prompt, quality: 'medium' };
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
  widthM?: number; lengthM?: number; roomConfig?: string; userPrompt?: string;
}): string {
  const { isSingle, numFlats = 6, roomConfig = '2bhk', userPrompt = '', widthM = 80, lengthM = 80 } = opts;

  const { shapeName, directives: geometricDirectives } = getShapeGeometricDirectives(userPrompt, numFlats);
  const bhkLabel = roomConfig === '1bhk' ? '1 BHK' : roomConfig === '2bhk' ? '2 BHK' : roomConfig === '3bhk' ? '3 BHK' : roomConfig === '4bhk' ? '4 BHK' : '2 BHK';

  const flatLabelsList = Array.from({ length: numFlats }, (_, i) => `"FLAT ${String(i + 1).padStart(2, '0')} - ${bhkLabel}"`).join(', ');

  const itemizedFlatRoster = Array.from({ length: numFlats }, (_, i) => 
    `• FLAT ${String(i + 1).padStart(2, '0')} (${bhkLabel}): ${getFlatRoomAnatomy(roomConfig)}`
  ).join('\n');

  return `High-end MASTER ARCHITECTURAL PRESENTATION BOARD floor plan drawing of a luxury residential building.

${geometricDirectives}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 MANDATORY APARTMENT PARTITIONING SCHEDULE (EXACTLY ${numFlats} × ${bhkLabel} UNITS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The 2D floor plan plate MUST be partitioned and divided into EXACTLY ${numFlats} INDEPENDENT APARTMENTS (${numFlats}× ${bhkLabel} Units):
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
     • Total Unit Mix: EXACTLY ${numFlats} × ${bhkLabel} FLATS
     • Central Staircase & Dual Elevator Core
     • Color-coded Flat Legend key table matching all ${numFlats} flats with distinct pastel chips.
     • Footnote: "NOTE: PLAN IS CONCEPTUAL AND CAN BE MODIFIED AS PER SITE CONDITIONS".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILDING SPECIFICATIONS:
• TARGET CONCEPT: "${userPrompt}" (${shapeName})
• DIMENSIONS: ${widthM}m Width × ${lengthM}m Length
• EXACT CAPACITY: ${numFlats} × ${bhkLabel} Flats

AESTHETICS:
Crisp architectural CAD linework, warm cream and sand presentation backdrop, ultra-clean publication-ready presentation board layout, photorealistic rendering.`;
}

function buildRefinementPrompt(opts: {
  isSingle: boolean; buildingType: string; numFlats: number; roomConfig: string;
  roomItems: string;
}): string {
  const { isSingle, buildingType, numFlats, roomConfig, roomItems } = opts;

  let countedRooms: string[] = [];
  if (roomConfig === '1bhk') {
    countedRooms = ['1x Living Room', '1x Kitchen', '1x Bedroom', '1x Bathroom'];
  } else if (roomConfig === '2bhk') {
    countedRooms = ['1x Living Room', '1x Kitchen', '2x Bedrooms', '2x Bathrooms'];
  } else if (roomConfig === '3bhk') {
    countedRooms = ['1x Living Room', '1x Kitchen', '3x Bedrooms', '3x Bathrooms'];
  } else if (isSingle) {
    countedRooms = ['1x Foyer', '1x Living Room', '1x Kitchen', '2x Bedrooms', '2x Bathrooms', '1x Utility'];
  } else if (buildingType === 'office') {
    countedRooms = ['1x Reception', '1x Open Workspace', '3x Cabins', '1x Meeting Room', '1x Pantry', '2x Toilets'];
  } else if (buildingType === 'healthcare') {
    countedRooms = ['1x Reception/Waiting', '2x Consultation Rooms', '1x Nurse Station', '2x Patient Wards', '1x Pharmacy', '1x Laboratory', '2x Toilets'];
  } else {
    countedRooms = roomItems.split('\n').map(line => line.split(' = ')[1]?.trim()).filter(Boolean).map(r => `1x ${r}`);
  }

  const countedRoomsStr = countedRooms.join(', ');

  let perFlatChecklist = '';
  if (!isSingle && buildingType === 'multi-residential') {
    for (let i = 1; i <= numFlats; i++) {
      perFlatChecklist += `\nFlat ${i}: ${countedRoomsStr}`;
    }
  }

  return `You are an expert architectural drafter. The image you received is a CAD floor plan generated by AI.

YOUR TASK: Redesign the interior of this floor plan while keeping the exterior building boundary exactly as shown, producing a code-aware, dimensioned 2D floor plan.

PRIORITY ORDER (highest to lowest):
1. Preserve the uploaded exterior footprint exactly.
2. Life safety: correct means of egress.
3. Every room meets minimum habitable size.
4. All required rooms present, labeled, and dimensioned.
5. Realistic circulation, adjacency, ventilation, and Vaastu.
6. Clean professional presentation.

CRITICAL RULE #1 — EXTERIOR FOOTPRINT:
Preserve the uploaded exterior footprint exactly. Outer wall polyline, angles, proportions, and building shape remain unchanged. Modify only interior partitions.

CRITICAL RULE #2 — EGRESS (LIFE SAFETY, NON-NEGOTIABLE):
Any floor with 3 or more apartments MUST have TWO separate staircases. Every apartment entrance must reach at least one staircase via the common corridor.

CRITICAL RULE #3 — MINIMUM ROOM SIZES (NON-NEGOTIABLE):
- Bedroom: min 9.5 sq.m, min width 2.4 m
- Master Bedroom: min 11 sq.m
- Living Room: min 11 sq.m
- Kitchen: min 5 sq.m, min width 1.8 m
- Bathroom/Toilet: min 1.8 sq.m, min width 1.2 m
- Corridor width: min 1.0 m

CRITICAL RULE #5 — ROOM COMPLETENESS:
Each apartment must visibly contain its labeled Living Room, Kitchen, Bedroom(s), Bathroom(s), and Entrance.
${perFlatChecklist}

DRAWING & ANNOTATION REQUIREMENTS:
- Thick black exterior walls, thin interior partitions.
- Swing doors shown with arc; window ticks on exterior walls.
- Room labels prefixed with flat number (F1-Living, F1-Kitchen).
- White background, clean professional 2D CAD style.

Output the redesigned floor plan image only.`;
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

    // Room definitions
    let roomItems = '', roomListLabelHint = '', verifyChecks = '';
    if (isSingle) {
      roomItems = 'L = Living\nK = Kitchen\nMB = Master Bedroom\nB2 = Bedroom 2\nT1 = Master Toilet\nT2 = Common Toilet\nFOY = Foyer\nUTI = Utility';
      roomListLabelHint = 'L K MB B2 T1 T2 FOY UTI';
      verifyChecks = '- Exactly 1 Foyer.\n- Exactly 1 Living room.\n- Exactly 1 Kitchen.\n- Exactly 2 Bedrooms.\n- Exactly 2 Bathrooms.';
    } else {
      if (roomConfig === '1bhk') {
        roomItems = 'L-i = Living\nK-i = Kitchen\nB-i = Bedroom\nT-i = Bathroom';
        roomListLabelHint = 'L-i K-i B-i T-i';
        verifyChecks = `- Exactly ${numFlats} Living rooms.\n- Exactly ${numFlats} Kitchens.\n- Exactly ${numFlats} Bedrooms.\n- Exactly ${numFlats} Bathrooms.`;
      } else if (roomConfig === '2bhk') {
        roomItems = 'L-i = Living\nK-i = Kitchen\nB1-i = Master Bedroom\nB2-i = Bedroom 2\nT1-i = Master Bathroom\nT2-i = Common Bathroom';
        roomListLabelHint = 'L-i K-i B1-i B2-i T1-i T2-i';
        verifyChecks = `- Exactly ${numFlats} Living rooms.\n- Exactly ${numFlats} Kitchens.\n- Exactly ${numFlats * 2} Bedrooms.\n- Exactly ${numFlats * 2} Bathrooms.`;
      } else if (roomConfig === '3bhk') {
        roomItems = 'L-i = Living\nK-i = Kitchen\nB1-i = Master Bedroom\nB2-i = Bedroom 2\nB3-i = Bedroom 3\nT1-i = Master Bathroom\nT2-i = Bathroom 2\nT3-i = Common Bathroom';
        roomListLabelHint = 'L-i K-i B1-i B2-i B3-i T1-i T2-i T3-i';
        verifyChecks = `- Exactly ${numFlats} Living rooms.\n- Exactly ${numFlats} Kitchens.\n- Exactly ${numFlats * 3} Bedrooms.\n- Exactly ${numFlats * 3} Bathrooms.`;
      } else {
        roomItems = 'L-i = Living\nK-i = Kitchen\nB-i = Bedroom\nT-i = Bathroom';
        roomListLabelHint = 'L-i K-i B-i T-i';
        verifyChecks = `- Exactly ${numFlats} Living rooms.\n- Exactly ${numFlats} Kitchens.\n- Exactly ${numFlats * 4} Bedrooms.\n- Exactly ${numFlats * 4} Bathrooms.`;
      }
    }

    const promptOpts = { 
      isSingle, 
      buildingType, 
      numFlats, 
      hasDividers, 
      hasCore, 
      roomItems, 
      roomListLabelHint, 
      verifyChecks,
      widthM,
      lengthM,
      roomConfig,
      userPrompt
    };
    const stage1Prompt = buildPrompt(promptOpts);

    // ── STAGE 1: Run Text-to-Image (or Image-to-Image if custom sketch uploaded) ──
    const stage1Input = buildFalInput(stage1Model, customUserRefUrl, stage1Prompt);
    console.log('[ConceptGenerator] Stage 1 input keys:', Object.keys(stage1Input));
    const stage1Url = await runModel(stage1Model, stage1Input);
    console.log('[ConceptGenerator] Stage 1 output URL:', stage1Url);

    const stage1Base64 = await fetchToBase64(stage1Url);

    return NextResponse.json({
      imageUrls: [stage1Base64],
      stage1ImageUrl: stage1Base64,
      systemPrompt: stage1Prompt,
      userPrompt: `Concept Studio | MODEL: ${stage1Model}`,
    });

  } catch (err: any) {
    console.error('[ConceptGenerator] Error:', err.message || err);
    return NextResponse.json({ error: err.message || 'Concept generation failed' }, { status: 500 });
  }
}
