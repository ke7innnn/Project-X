import { NextResponse } from 'next/server';
import { EDIT_FLOORPLAN_PROMPT } from '@/lib/prompts';

const FAL_KEY = process.env.FAL_KEY!;

export const maxDuration = 120;

/**
 * Calls fal.ai for professional floor plan edits.
 * Includes automatic retry with exponential backoff.
 */
async function callFalGeminiEdit(params: {
  currentFloorPlanBase64: string;
  editInstruction: string;
  collectedParameters: any;
}, maxRetries = 3): Promise<string> {
  const prompt = EDIT_FLOORPLAN_PROMPT(params.editInstruction, params.collectedParameters);

  const floorPlanDataUri = params.currentFloorPlanBase64.startsWith('data:')
    ? params.currentFloorPlanBase64
    : `data:image/png;base64,${params.currentFloorPlanBase64}`;

  const body = {
    prompt,
    image_urls: [floorPlanDataUri]
  };

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[edit-floorplan] Attempt ${attempt + 1}/${maxRetries + 1}...`);

      const response = await fetch('https://fal.run/xai/grok-imagine-image/edit', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(55000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => 'unknown');
        throw new Error(`fal.ai error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const imageUrl = data?.images?.[0]?.url;
      if (!imageUrl) throw new Error('fal.ai returned no image URL');

      // Download the resulting image
      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
      if (!imgRes.ok) throw new Error(`Failed to download edited image (status ${imgRes.status})`);
      const imgBuffer = await imgRes.arrayBuffer();
      console.log(`[edit-floorplan] Success on attempt ${attempt + 1}`);
      return Buffer.from(imgBuffer).toString('base64');

    } catch (e: any) {
      lastError = e;
      if (attempt < maxRetries) {
        const delay = 1500 * Math.pow(2, attempt); // 1.5s, 3s, 6s
        console.warn(`[edit-floorplan] Attempt ${attempt + 1} failed: ${e.message}. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}


export async function POST(request: Request) {
  try {
    const { currentFloorPlanBase64, editInstruction, collectedParameters } = await request.json();

    if (!currentFloorPlanBase64) {
      return NextResponse.json({ error: 'Missing current floor plan image' }, { status: 400 });
    }

    console.log(`[edit-floorplan] Editing. Instruction: "${editInstruction}"`);
    const editedFloorPlan = await callFalGeminiEdit({
      currentFloorPlanBase64,
      editInstruction,
      collectedParameters,
    });

    return NextResponse.json({ editedFloorPlan, modelUsed: 'grok-imagine-image/edit' });
  } catch (error: any) {
    console.error('[edit-floorplan] All retries failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
