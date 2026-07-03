import { NextResponse } from 'next/server';
import { EDIT_TRANSLATOR_SYSTEM_PROMPT } from '@/lib/prompts';
import { callGemini } from '@/lib/gemini';

const FAL_KEY = process.env.FAL_KEY!;

export const maxDuration = 120;

/**
 * Calls fal.ai for professional floor plan edits.
 * Includes automatic retry with exponential backoff.
 */
async function callFalGeminiEdit(params: {
  currentFloorPlanBase64: string;
  translatedPrompt: string;
}, maxRetries = 2): Promise<string> {
  const floorPlanDataUri = params.currentFloorPlanBase64.startsWith('data:')
    ? params.currentFloorPlanBase64
    : `data:image/png;base64,${params.currentFloorPlanBase64}`;

  const body = {
    prompt: params.translatedPrompt,
    image_url: floorPlanDataUri
  };

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[edit-floorplan] Attempt ${attempt + 1}/${maxRetries + 1}...`);

      const response = await fetch('https://fal.run/openai/gpt-image-2/edit', {
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
      const imageUrl = data?.images?.[0]?.url || data?.image?.url;
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
  translatedPrompt: string;
}): Promise<string> {
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
    { text: params.translatedPrompt }
  ];

  const models = ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image'] as const;
  
  let lastError: any;

  for (const model of models) {
    try {
      console.log(`[edit-floorplan-fallback] Trying ${model}...`);
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
    let modelUsed = 'grok-imagine-image/edit';

    try {
      // Primary: Call fal.ai (Grok Imagine Image Edit)
      editedFloorPlan = await callFalGeminiEdit({
        currentFloorPlanBase64,
        translatedPrompt,
      });
    } catch (falError: any) {
      console.warn(`[edit-floorplan] Fal.ai edit failed (${falError.message}). Falling back to Google Gemini...`);
      // Fallback: Use Gemini Image-to-Image pipeline
      editedFloorPlan = await callGeminiEdit({
        currentFloorPlanBase64,
        translatedPrompt,
      });
      modelUsed = 'gemini-edit-fallback';
    }

    return NextResponse.json({ editedFloorPlan, modelUsed });
  } catch (error: any) {
    console.error('[edit-floorplan] All editing avenues failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
