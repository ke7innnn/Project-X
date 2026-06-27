import { NextResponse } from 'next/server';
import { EDIT_FLOORPLAN_PROMPT } from '@/lib/prompts';
import { callGemini } from '@/lib/gemini';

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
}, maxRetries = 2): Promise<string> {
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
        const delay = 1000 * Math.pow(2, attempt); // 1s, 2s
        console.warn(`[edit-floorplan] Attempt ${attempt + 1} failed: ${e.message}. Retrying...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Fallback: Call Google Gemini's multimodal image-to-image pipeline.
 * Tries gemini-3.1-flash-image-preview, falling back to gemini-3-pro-image.
 */
async function callGeminiEdit(params: {
  currentFloorPlanBase64: string;
  editInstruction: string;
  collectedParameters: any;
}): Promise<string> {
  const prompt = EDIT_FLOORPLAN_PROMPT(params.editInstruction, params.collectedParameters);
  
  // Clean base64 header if present
  const rawBase64 = params.currentFloorPlanBase64.includes(',')
    ? params.currentFloorPlanBase64.split(',')[1]
    : params.currentFloorPlanBase64;
    
  const parts = [
    {
      inlineData: {
        mimeType: 'image/png',
        data: rawBase64
      }
    },
    { text: prompt }
  ];

  const models = ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image'] as const;
  let lastError: any;

  for (const model of models) {
    try {
      console.log(`[edit-floorplan-fallback] Trying Gemini model: ${model}...`);
      const res = await callGemini({
        model,
        message: undefined,
        temperature: 0.9,
        responseModalities: ['image', 'text'],
        timeoutMs: 50000,
        _customContents: [{ role: 'user', parts }]
      } as any);

      const part = res.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
      if (!part?.inlineData?.data) {
        throw new Error(`No image returned from Gemini model ${model}`);
      }

      console.log(`[edit-floorplan-fallback] Success using ${model}`);
      return part.inlineData.data;
    } catch (e: any) {
      lastError = e;
      console.warn(`[edit-floorplan-fallback] ${model} failed: ${e.message}`);
    }
  }

  throw lastError || new Error('All Gemini fallback models failed to edit floorplan');
}


export async function POST(request: Request) {
  try {
    const { currentFloorPlanBase64, editInstruction, collectedParameters } = await request.json();

    if (!currentFloorPlanBase64) {
      return NextResponse.json({ error: 'Missing current floor plan image' }, { status: 400 });
    }

    console.log(`[edit-floorplan] Editing. Instruction: "${editInstruction}"`);
    
    let editedFloorPlan: string;
    let modelUsed = 'grok-imagine-image/edit';

    try {
      // Primary: Call fal.ai (Grok Imagine Image Edit)
      editedFloorPlan = await callFalGeminiEdit({
        currentFloorPlanBase64,
        editInstruction,
        collectedParameters,
      });
    } catch (falError: any) {
      console.warn(`[edit-floorplan] Fal.ai edit failed (${falError.message}). Falling back to Google Gemini...`);
      // Fallback: Use Gemini Image-to-Image pipeline
      editedFloorPlan = await callGeminiEdit({
        currentFloorPlanBase64,
        editInstruction,
        collectedParameters,
      });
      modelUsed = 'gemini-edit-fallback';
    }

    return NextResponse.json({ editedFloorPlan, modelUsed });
  } catch (error: any) {
    console.error('[edit-floorplan] All editing avenues failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
