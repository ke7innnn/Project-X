import { NextResponse } from 'next/server';
import { callGemini } from '@/lib/gemini';
import sharp from 'sharp';
import { fal } from '@fal-ai/client';

const FAL_KEY = process.env.FAL_KEY!;

export const maxDuration = 300;

const ENHANCE_PROMPT = `A professionally enhanced 2D architectural CAD floor plan. Clean, crisp, high-contrast black lines on a pure white background. Refine and straighten all walls, door arc symbols, and window lines. Square off and clean up the exterior boundary walls to improve and straighten the overall exterior shape of the plan. Maintain the room positions, layout structure, furniture placements, and text labels. Make it look like a clean, master-level engineering blueprint.`;

/**
 * Primary: Call fal.ai (GPT-Image-2 Edit)
 */
async function callFalEnhance(currentFloorPlanBase64: string): Promise<string> {
  const rawBase64 = currentFloorPlanBase64.includes(',') 
    ? currentFloorPlanBase64.split(',')[1] 
    : currentFloorPlanBase64;
    
  const buffer = Buffer.from(rawBase64, 'base64');
  
  // Set credentials for client
  fal.config({ credentials: FAL_KEY });

  // Resize and compress using sharp to ensure we stay under fal.ai payload limits (must be PNG for OpenAI)
  const resizedBuffer = await sharp(buffer)
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 8 })
    .toBuffer();

  console.log(`[enhance-floorplan] Uploading PNG to fal.ai storage...`);
  const blob = new Blob([new Uint8Array(resizedBuffer)], { type: 'image/png' });
  const uploadedUrl = await fal.storage.upload(blob);
  console.log(`[enhance-floorplan] Uploaded to: ${uploadedUrl}`);

  console.log(`[enhance-floorplan] Calling fal-ai/xai/grok-imagine-image/edit...`);
  const result = await fal.subscribe("xai/grok-imagine-image/edit", {
    input: {
      prompt: ENHANCE_PROMPT,
      image_url: uploadedUrl
    } as any,
    logs: true
  });

  const imageUrl = (result.data as any)?.images?.[0]?.url || (result.data as any)?.image?.url;
  if (!imageUrl) {
    console.error('[enhance-floorplan] fal.ai returned no image URL:', result);
    throw new Error('fal.ai returned no image URL');
  }

  // Download the resulting image
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
  if (!imgRes.ok) throw new Error(`Failed to download enhanced image (status ${imgRes.status})`);
  const imgBuffer = await imgRes.arrayBuffer();
  return Buffer.from(imgBuffer).toString('base64');
}

/**
 * Fallback: Call Google Gemini's multimodal image-to-image pipeline.
 */
async function callGeminiEnhance(currentFloorPlanBase64: string): Promise<string> {
  const rawBase64 = currentFloorPlanBase64.includes(',')
    ? currentFloorPlanBase64.split(',')[1]
    : currentFloorPlanBase64;
    
  const parts = [
    {
      inlineData: {
        mimeType: 'image/png',
        data: rawBase64
      }
    },
    { text: ENHANCE_PROMPT }
  ];

  const models = ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image'] as const;
  
  let lastError: any;

  for (const model of models) {
    try {
      console.log(`[enhance-floorplan-fallback] Trying ${model}...`);
      const response = await callGemini({
        model,
        message: 'Execute edit',
        history: [{ role: 'user', parts, isFloorPlan: false }],
        responseModalities: ['image', 'text'],
        timeoutMs: 45000
      } as any);

      const dataStr = typeof response === 'string' ? response : JSON.stringify(response);
      const data = JSON.parse(dataStr);
      const candidates = data.candidates || [];
      const part = candidates[0]?.content?.parts?.find((p: any) => p.inlineData);
      
      if (!part?.inlineData?.data) {
        throw new Error(`Model ${model} returned no image data`);
      }
      
      console.log(`[enhance-floorplan-fallback] Success using ${model}`);
      return part.inlineData.data;
    } catch (e: any) {
      lastError = e;
      console.warn(`[enhance-floorplan-fallback] ${model} failed: ${e.message}`);
    }
  }

  throw lastError || new Error('All Gemini fallback models failed to enhance floorplan');
}

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'Missing imageBase64 in request body' }, { status: 400 });
    }

    if (!FAL_KEY) {
      return NextResponse.json({ error: 'FAL_KEY not configured on server' }, { status: 500 });
    }

    let enhancedFloorPlan: string;
    let modelUsed = 'xai/grok-imagine-image/edit';

    // Primary: Call fal.ai
    // Removed Gemini fallback per user request to save costs
    enhancedFloorPlan = await callFalEnhance(imageBase64);

    return NextResponse.json({ enhancedFloorPlan, modelUsed });

  } catch (error: any) {
    console.error('[enhance-floorplan] All enhancement avenues failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
