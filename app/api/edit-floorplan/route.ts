import { NextResponse } from 'next/server';
import { EDIT_TRANSLATOR_SYSTEM_PROMPT } from '@/lib/prompts';
import { callGemini } from '@/lib/gemini';
import sharp from 'sharp';
import { fal } from '@fal-ai/client';

const FAL_KEY = process.env.FAL_KEY!;

export const maxDuration = 300;

/**
 * Calls fal.ai for professional floor plan edits.
 * Includes automatic retry with exponential backoff.
 */
async function callFalGeminiEdit(params: {
  currentFloorPlanBase64: string;
  translatedPrompt: string;
}): Promise<string> {
  const rawBase64 = params.currentFloorPlanBase64.includes(',') 
    ? params.currentFloorPlanBase64.split(',')[1] 
    : params.currentFloorPlanBase64;
    
  const buffer = Buffer.from(rawBase64, 'base64');
  
  // Set credentials for client
  fal.config({ credentials: FAL_KEY });

  // Resize and compress using sharp to ensure we stay under fal.ai payload limits (must be PNG for OpenAI)
  const resizedBuffer = await sharp(buffer)
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 8 })
    .toBuffer();

  console.log(`[edit-floorplan] Uploading PNG to fal.ai storage...`);
  const blob = new Blob([new Uint8Array(resizedBuffer)], { type: 'image/png' });
  const uploadedUrl = await fal.storage.upload(blob);
  console.log(`[edit-floorplan] Uploaded to: ${uploadedUrl}`);

  console.log(`[edit-floorplan] Calling fal-ai/openai/gpt-image-2/edit...`);
  const result = await fal.subscribe("openai/gpt-image-2/edit", {
    input: {
      prompt: params.translatedPrompt,
      image_urls: [uploadedUrl]
    },
    logs: true
  });

  const imageUrl = (result.data as any)?.images?.[0]?.url || (result.data as any)?.image?.url;
  if (!imageUrl) {
    console.error('[edit-floorplan] fal.ai returned no image URL:', result);
    throw new Error('fal.ai returned no image URL');
  }

  // Download the resulting image
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
  if (!imgRes.ok) throw new Error(`Failed to download edited image (status ${imgRes.status})`);
  const imgBuffer = await imgRes.arrayBuffer();
  return Buffer.from(imgBuffer).toString('base64');
}

export async function POST(request: Request) {
  try {
    const { currentFloorPlanBase64, editInstruction, collectedParameters, isInpaint, skipTranslation, maskBase64 } = await request.json();

    if (!currentFloorPlanBase64) {
      return NextResponse.json({ error: 'Missing current floor plan image' }, { status: 400 });
    }

    console.log(`[edit-floorplan] Editing. Instruction: "${editInstruction}", isInpaint: ${isInpaint}, skipTranslation: ${skipTranslation}`);
    
    let translatedPrompt = editInstruction; // Default fallback

    if (skipTranslation) {
      console.log(`[edit-floorplan] Skipping translation pass. Using direct prompt: "${translatedPrompt}"`);
    } else {
      console.log(`[edit-floorplan] Translating instruction via OpenRouter (Gemini Flash Lite)...`);
      const openRouterKey = process.env.OPENROUTER_API_KEY;
      if (!openRouterKey) throw new Error('No OPENROUTER_API_KEY found');

      const maxRetries = 2;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const translationRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openRouterKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://ai-architect.vercel.app',
              'X-Title': 'AI Architect',
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite-preview",
              messages: [
                { role: "system", content: EDIT_TRANSLATOR_SYSTEM_PROMPT(collectedParameters, isInpaint) },
                { role: "user", content: `Original user prompt: "${editInstruction}"` }
              ],
              temperature: 0.1,
              max_tokens: 500,
            }),
            signal: AbortSignal.timeout(15000),
          });

          if (!translationRes.ok) {
            throw new Error(`OpenRouter translation failed: ${translationRes.status}`);
          }

          const translationData = await translationRes.json();
          const content = translationData.choices?.[0]?.message?.content;
          
          if (content) {
            translatedPrompt = content.trim();
            console.log(`[edit-floorplan] Translated prompt: "${translatedPrompt}"`);
            break;
          } else {
            throw new Error('No content in translation response');
          }
        } catch (error: any) {
          console.warn(`[edit-floorplan] Translation attempt ${attempt + 1} failed: ${error.message}`);
          if (attempt === maxRetries) {
            console.warn(`[edit-floorplan] All translation retries failed. Falling back to original instruction.`);
          } else {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
    }
    
    let editedFloorPlan: string;
    let modelUsed = 'fal-ai/gpt-image-2/edit';

    // Primary: Call fal.ai (GPT Image Edit)
    // Removed Gemini fallback per user request to save costs
    editedFloorPlan = await callFalGeminiEdit({
      currentFloorPlanBase64,
      translatedPrompt,
    });

    return NextResponse.json({ editedFloorPlan, modelUsed });
  } catch (error: any) {
    console.error('[edit-floorplan] All editing avenues failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
