import { NextResponse } from 'next/server';
import { EDIT_FLOORPLAN_PROMPT } from '@/lib/prompts';

const FAL_KEY = process.env.FAL_KEY!;


/**
 * Calls fal-ai/gemini-25-flash-image/edit (Nano Banana) for professional CAD floor plan edits.
 */
async function callFalGeminiEdit(params: {
  currentFloorPlanBase64: string;
  editInstruction: string;
  collectedParameters: any;
}): Promise<string> {
  const prompt = EDIT_FLOORPLAN_PROMPT(params.editInstruction, params.collectedParameters);

  // Send only the current floor plan — fal.ai edit will apply the change to it
  const floorPlanDataUri = params.currentFloorPlanBase64.startsWith('data:')
    ? params.currentFloorPlanBase64
    : `data:image/png;base64,${params.currentFloorPlanBase64}`;

  const body = {
    prompt,
    image_urls: [floorPlanDataUri]
  };

  const response = await fetch('https://fal.run/xai/grok-imagine-image/edit', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`fal-ai/gemini-25-flash-image/edit error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const imageUrl = data?.images?.[0]?.url;
  if (!imageUrl) throw new Error('fal-ai/gemini-25-flash-image/edit returned no image URL');

  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
  if (!imgRes.ok) throw new Error('Failed to download edited image from fal.ai CDN');
  const imgBuffer = await imgRes.arrayBuffer();
  return Buffer.from(imgBuffer).toString('base64');
}


export async function POST(request: Request) {
  try {
    const { currentFloorPlanBase64, editInstruction, collectedParameters } = await request.json();

    if (!currentFloorPlanBase64) {
      throw new Error('Missing current floor plan image');
    }

    console.log(`[fal-ai/gemini-25-flash-image/edit] Editing. Instruction: "${editInstruction}"`);
    const editedFloorPlan = await callFalGeminiEdit({
      currentFloorPlanBase64,
      editInstruction,
      collectedParameters,
    });

    return NextResponse.json({ editedFloorPlan, modelUsed: 'gemini-25-flash-image-edit' });
  } catch (error: any) {
    console.error('[edit-floorplan] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

