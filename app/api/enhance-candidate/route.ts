import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import fs from 'fs';
import path from 'path';

export const maxDuration = 300; // 5 min timeout for Stage 2 enhancement

fal.config({ credentials: process.env.FAL_KEY });

async function runModel(falModel: string, input: Record<string, any>): Promise<{ url: string; seed?: number }> {
  const result = await fal.subscribe(falModel, { input });
  const data = (result as any)?.data || result;
  const images = data?.images;
  if (!images || images.length === 0) throw new Error(`${falModel} returned no images`);
  const seed = data?.seed ?? (result as any)?.seed;
  return { url: images[0].url, seed };
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
  const file = new File([blob], 'stage1_candidate.png', { type: 'image/png' });
  return fal.storage.upload(file);
}

async function loadReferenceToFalStorage(bhkType: string): Promise<string | null> {
  try {
    const candidatePaths = [
      path.join(process.cwd(), 'public', 'references', `${bhkType}.png`),
      path.join(process.cwd(), 'public', 'references', `ref-${bhkType}.png`),
      path.join(process.cwd(), 'public', 'references', 'master_cad_ref.png'),
    ];

    let refPath: string | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        refPath = p;
        break;
      }
    }

    if (!refPath) return null;

    const buffer = fs.readFileSync(refPath);
    const blob = new Blob([buffer], { type: 'image/png' });
    const file = new File([blob], `${bhkType}_ref.png`, { type: 'image/png' });
    return await fal.storage.upload(file);
  } catch (err: any) {
    console.warn(`[EnhanceCandidate] Failed to load reference image:`, err.message);
    return null;
  }
}

function detectDominantBHK(u1: number, u2: number, u3: number, u4: number): string {
  const counts = [
    { type: '1bhk', count: u1 },
    { type: '2bhk', count: u2 },
    { type: '3bhk', count: u3 },
    { type: '4bhk', count: u4 },
  ];
  counts.sort((a, b) => b.count - a.count);
  return counts[0].count > 0 ? counts[0].type : '2bhk';
}

function buildStage2Prompt(opts: {
  numFlats: number;
  bhkType: string;
  units1BHK?: number;
  units2BHK?: number;
  units3BHK?: number;
  units4BHK?: number;
  passengerLifts: number;
  staircases: number;
  hasReferenceImage: boolean;
}): string {
  const { numFlats, bhkType, units1BHK = 0, units2BHK = 0, units3BHK = 0, units4BHK = 0, passengerLifts, staircases, hasReferenceImage } = opts;

  const flatLabelsArray = Array.from({ length: numFlats }, (_, i) => `F${i + 1}`);
  const flatLabels = flatLabelsArray.join(', ');

  const mixLines: string[] = [];
  let flatIndex = 1;
  if (units1BHK > 0) {
    const list = Array.from({ length: units1BHK }, () => `F${flatIndex++}`).join(', ');
    mixLines.push(`• ${list}: 1 BHK (Living Room in main remaining area + 1 Attached BALCONY + 1 Kitchen + 1 Bedroom + 1 Toilet in exterior boxes)`);
  }
  if (units2BHK > 0) {
    const list = Array.from({ length: units2BHK }, () => `F${flatIndex++}`).join(', ');
    mixLines.push(`• ${list}: 2 BHK (Living Room + Dining in main remaining area + 1 Attached BALCONY + 1 Kitchen + 2 Bedrooms [Master Bed + Bed 2] + 1 Master Toilet in exterior boxes)`);
  }
  if (units3BHK > 0) {
    const list = Array.from({ length: units3BHK }, () => `F${flatIndex++}`).join(', ');
    mixLines.push(`• ${list}: 3 BHK (Living Room + Dining in main remaining area + 1 Attached BALCONY + 1 Kitchen + 3 Bedrooms [Master Bed + Bed 2 + Bed 3] + 1 Master Toilet in exterior boxes)`);
  }
  if (units4BHK > 0) {
    const list = Array.from({ length: units4BHK }, () => `F${flatIndex++}`).join(', ');
    mixLines.push(`• ${list}: 4 BHK (Living Room + Dining in main remaining area + 1 Attached BALCONY + 1 Kitchen + 4 Bedrooms + 1 Master Toilet in exterior boxes)`);
  }

  const mixDescription = mixLines.length > 0
    ? mixLines.join('\n')
    : `• Every flat zone (${flatLabels}): ${bhkType.toUpperCase()} layout with Living Room in main area + Attached BALCONY + Bedrooms + Kitchen + Toilet in exterior boxes`;

  const liftsStr = passengerLifts > 0 ? `${passengerLifts} elevator shaft(s)` : '1 elevator shaft';
  const stairsStr = staircases > 0 ? `${staircases} fire staircase flight(s)` : '2 fire staircase flights';

  return `You are a licensed senior 2D CAD architectural blueprint enhancer and detailer. EDIT THE FIRST UPLOADED IMAGE ONLY.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIMARY DIRECTIVE — PRESERVE 100% COMPOSITION (ENHANCE ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• THE ARCHITECTURAL COMPOSITION IN IMAGE 1 IS 100% LOCKED AND PERFECT:
  - DO NOT change, shift, move, resize, add, or delete ANY walls, rooms, corridors, or core boxes.
  - Keep 100% of the exact room geometry, partition lines, central CORE, and colored unit boundaries (${flatLabels}) from IMAGE 1.
• YOUR ONLY MISSION: Transform IMAGE 1 into a crisp, high-end, publication-quality 2D CAD architectural floor plan blueprint by adding architectural linework detailing, standard CAD doors/windows, and elegant top-down furniture and decor.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#1 — IMMUTABLE LOCKED GEOMETRY & COMPOSITION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• OUTER BUILDING SILHOUETTE: 100% LOCKED. Keep the exact outer perimeter contour.
• CIRCULATION CORE & CORRIDORS: 100% LOCKED. Detail the interior of the core box with ${liftsStr}, ${stairsStr}, and a utility shaft.
• ROOM PARTITION WALLS: 100% LOCKED. Retain every existing room box and wall from IMAGE 1.
• UNIT BOUNDARIES (${flatLabels}): LOCKED with their distinct vivid boundary colors preserved from IMAGE 1.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#2 — ARCHITECTURAL CAD LINEWORK & OPENINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• WALLS: Crisp, sharp, solid black 2D CAD partition lines.
• DOORS: Standard quarter-circle door swing arcs showing clear opening direction into each room.
• WINDOWS: Clean double-line architectural window symbols along all exterior walls.
• SEAMLESS LIVING-TO-BALCONY SLIDER: The connection between the Living Room and Attached Balcony is drawn strictly as a full-width SLIDING GLASS DOOR / glazed threshold (thin double line / dashed slider with NO solid brick/masonry wall).
• BALCONY RAILING: Clean double-line glass/metal railing along the outer balcony edge.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#3 — ARCHITECTURAL FURNITURE, FIXTURES & ROOM DECORATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• LIVING ROOM: L-shaped sectional / sofa set facing TV console, coffee table, 4-6 seater dining table with chairs.
• BEDROOMS: Master king bed / queen bed with 2 bedside nightstands, wardrobe closet along wall, en-suite bathroom door.
• KITCHEN: L-shaped or parallel modular granite countertop with dual-bowl sink, cooking hob, refrigerator, overhead cabinet linework.
• TOILETS / BATHROOMS: WC commode, wash basin vanity counter, glass shower partition enclosure.
• CORRIDORS: Clean, clear circulation pathway with foyer drop-off.
• BALCONY: Outdoor deck tiles with small coffee seating table & 2 chairs.

${hasReferenceImage ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#4 — BHK TYPOLOGY INFILL FROM REFERENCE (IMAGE 2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Refer to IMAGE 2 for graphic linework standards, furniture scales, and CAD door swings.
${mixDescription}` : ''}

OUTPUT: A stunning, publication-grade, professional 2D CAD architectural floor plan blueprint with furniture detailing inside the EXACT layout of IMAGE 1.`;
}

export async function POST(req: Request) {
  try {
    const {
      candidateBase64,
      candidateIndex = 0,
      units1BHK = 0,
      units2BHK = 0,
      units3BHK = 0,
      units4BHK = 0,
      passengerLifts = 2,
      staircases = 2,
      apiKey,
    } = await req.json();

    if (!candidateBase64) {
      return NextResponse.json({ error: 'Candidate image Base64 is required.' }, { status: 400 });
    }

    const activeApiKey = apiKey || process.env.FAL_KEY;
    if (!activeApiKey) {
      return NextResponse.json({ error: 'FAL_KEY is missing.' }, { status: 400 });
    }

    const cleanApiKey = activeApiKey.replace(/\s+/g, '').replace(/[^a-zA-Z0-9:-]/g, '');
    fal.config({ credentials: cleanApiKey });

    console.log(`[EnhanceCandidate] Uploading Candidate #${candidateIndex + 1} to fal storage...`);
    const uploadedCandidateUrl = await urlToFalStorage(candidateBase64);

    const totalUnits = units1BHK + units2BHK + units3BHK + units4BHK;
    const numFlats = Math.max(1, totalUnits);
    const dominantBHK = detectDominantBHK(units1BHK, units2BHK, units3BHK, units4BHK);

    const referenceStorageUrl = await loadReferenceToFalStorage(dominantBHK);
    const hasReferenceImage = !!referenceStorageUrl;

    const refinementPrompt = buildStage2Prompt({
      numFlats,
      bhkType: dominantBHK,
      units1BHK,
      units2BHK,
      units3BHK,
      units4BHK,
      passengerLifts,
      staircases,
      hasReferenceImage,
    });

    const stage2ImageUrls: string[] = [uploadedCandidateUrl];
    if (referenceStorageUrl) {
      stage2ImageUrls.push(referenceStorageUrl);
    }

    console.log(`[EnhanceCandidate] Enhancing Candidate #${candidateIndex + 1} with openai/gpt-image-2/edit [Medium]...`);
    const gptRes = await runModel('openai/gpt-image-2/edit', {
      image_urls: stage2ImageUrls,
      prompt: refinementPrompt,
      quality: 'medium',
    });

    const stage2Base64 = await fetchToBase64(gptRes.url);
    console.log(`[EnhanceCandidate] Candidate #${candidateIndex + 1} enhanced successfully!`);

    return NextResponse.json({
      success: true,
      candidateIndex,
      stage2ImageUrl: stage2Base64,
      stage2Seed: gptRes.seed,
      refinementPrompt,
    });
  } catch (err: any) {
    console.error('[EnhanceCandidate] Error enhancing candidate:', err);
    return NextResponse.json({ error: err.message || 'Failed to enhance candidate in Step 2' }, { status: 500 });
  }
}
