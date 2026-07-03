import { NextResponse } from 'next/server';
import { callGemini } from '@/lib/gemini';
import { FLOORPLAN_GENERATION_PROMPT } from '@/lib/prompts';
import sharp from 'sharp';

export const maxDuration = 120;

/**
 * Fetch raw image bytes from a URL.
 */
async function fetchImageBuffer(url: string): Promise<Buffer> {
  const fetchWithProxy = async (targetUrl: string) => {
    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://www.pexels.com/',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  };

  try {
    return await fetchWithProxy(url);
  } catch (err: any) {
    console.warn(`[generate-floorplan] Direct fetch failed (${err.message}), retrying with proxy...`);
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    return await fetchWithProxy(proxyUrl);
  }
}

/**
 * Resize a reference photo to standard size for faster transfer and lower cost.
 */
async function resizeImage(buffer: Buffer): Promise<{ data: string; mimeType: string }> {
  try {
    const resizedBuffer = await sharp(buffer)
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { data: resizedBuffer.toString('base64'), mimeType: 'image/jpeg' };
  } catch (err: any) {
    console.error('[generate-floorplan] Sharp resize failed, using original:', err.message);
    return { data: buffer.toString('base64'), mimeType: 'image/jpeg' };
  }
}

/** 
 * Models to try in order for image generation.
 * MUST be shape-aware models — 2.5-flash cannot accurately trace organic shapes.
 * Each model is attempted with retries before moving to next.
 */
const IMAGE_GEN_MODELS = [
  'gemini-3-pro-image',             // Primary: highest quality shape precision
  'gemini-3.1-flash-image-preview', // Fallback: faster, still strong shape tracing
] as const;

/**
 * Generate a single floor plan image with retries across models.
 */
async function generateSingleFloorPlan(parts: any[], variationIndex: number): Promise<string> {
  let lastError: any;

  for (const model of IMAGE_GEN_MODELS) {
    // Try each model up to 2 times
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`[generate-floorplan] Var ${variationIndex}: trying ${model}, attempt ${attempt + 1}`);
        
        const res = await callGemini({
          model,
          message: undefined,
          temperature: 0.9,
          responseModalities: ['image', 'text'],
          timeoutMs: 50000,
          _customContents: [{ role: 'user', parts }],
        } as any);

        const part = res.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
        if (!part?.inlineData?.data) {
          throw new Error(`No image in ${model} response`);
        }

        console.log(`[generate-floorplan] Var ${variationIndex}: success with ${model}`);
        return part.inlineData.data;

      } catch (e: any) {
        lastError = e;
        console.warn(`[generate-floorplan] Var ${variationIndex} / ${model} attempt ${attempt + 1} failed: ${e.message}`);
        
        // Small delay before retry
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
  }

  throw lastError || new Error('All models exhausted for floor plan generation');
}

export async function POST(request: Request) {
  try {
    const {
      collectedParameters,
      natureImageUrl,
      natureImageDescription,
      customImageBase64,
      customImageDescription,
      manualPlotImage
    } = await request.json();

    collectedParameters.plotWidth = collectedParameters.plotWidth || 10;
    collectedParameters.plotHeight = collectedParameters.plotHeight || 10;
    collectedParameters.hasManualPlot = !!manualPlotImage;
    // Flag so the prompt knows if any visual reference image will be attached
    collectedParameters.hasImage = !!(customImageBase64 || natureImageUrl || manualPlotImage);
    collectedParameters.hasRefImage = !!(customImageBase64 || natureImageUrl);

    const descriptionToUse = customImageDescription || natureImageDescription || 'organic geometric shape';
    const prompt = FLOORPLAN_GENERATION_PROMPT(collectedParameters, descriptionToUse);

    console.log('[generate-floorplan] Nature URL:', natureImageUrl);
    console.log('[generate-floorplan] Custom image provided:', !!customImageBase64);
    console.log('[generate-floorplan] hasImage:', collectedParameters.hasImage, '| buildingShape:', collectedParameters.buildingShape || 'none');

    // ── Step 1: Get raw image bytes ─────────────────────────────────────────
    let rawBuffer: Buffer | null = null;

    if (customImageBase64) {
      const raw = customImageBase64.includes(',')
        ? customImageBase64.split(',')[1]
        : customImageBase64;
      rawBuffer = Buffer.from(raw, 'base64');
      console.log('[generate-floorplan] Using uploaded custom image');
    } else if (natureImageUrl) {
      try {
        rawBuffer = await fetchImageBuffer(natureImageUrl);
        console.log('[generate-floorplan] Fetched nature image, size:', rawBuffer.length);
      } catch (err: any) {
        console.error('[generate-floorplan] Failed to fetch nature image:', err.message);
      }
    }

    // ── Step 2: Resize image ────────────────────────────────────────────────
    let imagePart: any | undefined;
    let manualPlotPart: any | undefined;

    if (rawBuffer) {
      const resized = await resizeImage(rawBuffer);
      imagePart = { inlineData: { mimeType: resized.mimeType, data: resized.data } };
      console.log('[generate-floorplan] Image resized and ready');
    } else {
      console.warn('[generate-floorplan] No reference image available — generating without shape reference');
    }

    if (manualPlotImage) {
      const raw = manualPlotImage.includes(',') ? manualPlotImage.split(',')[1] : manualPlotImage;
      const plotBuffer = Buffer.from(raw, 'base64');
      const resizedPlot = await resizeImage(plotBuffer);
      manualPlotPart = { inlineData: { mimeType: resizedPlot.mimeType, data: resizedPlot.data } };
      console.log('[generate-floorplan] Manual plot image resized and ready');
    }

    // ── Step 3: Build prompt parts ──────────────────────────────────────────
    const buildParts = () => {
      const parts: any[] = [];

      if (manualPlotPart) {
        // Manual plot is labeled as SECONDARY IMAGE (MANUAL PLOT BOUNDARY) — matches Rule 1.5 wording exactly
        parts.push({ text: "SECONDARY IMAGE (MANUAL PLOT BOUNDARY):" });
        parts.push(manualPlotPart);
      }

      if (imagePart) {
        // Nature/uploaded image is the PRIMARY layout reference
        parts.push({ text: "PRIMARY IMAGE (INTERNAL LAYOUT SHAPE REFERENCE):" });
        parts.push(imagePart);
      }

      parts.push({ text: prompt });
      return parts;
    };

    // ── Step 4: Generate 2 variations in parallel ───────────────────────────
    // Diagnostic: log exactly what images are being sent to the model
    const sampleParts = buildParts();
    const partSummary = sampleParts
      .filter((p: any) => p.text)
      .map((p: any) => `"${p.text.substring(0, 60)}..."`)
      .join(' | ');
    console.log(`[generate-floorplan] Part structure → ${partSummary}`);
    console.log(`[generate-floorplan] hasManualPlot=${!!manualPlotPart}, hasRefImage=${!!imagePart}`);
    // Each variation has its own model fallback chain, so we won't fail entirely
    // unless both APIs are completely down.
    const promises = [0, 1].map((i) =>
      // Stagger starts by 200ms to avoid simultaneous rate limits
      new Promise<string>((resolve, reject) =>
        setTimeout(async () => {
          try {
            const result = await generateSingleFloorPlan(buildParts(), i);
            resolve(result);
          } catch (e) {
            reject(e);
          }
        }, i * 200)
      )
    );

    const results = await Promise.allSettled(promises);
    const options = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map(r => r.value);

    if (options.length === 0) {
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map(r => r.reason?.message || String(r.reason));
      throw new Error(`Floor plan generation failed. Details: ${JSON.stringify(errors)}`);
    }

    console.log(`[generate-floorplan] Done — returning ${options.length} option(s)`);
    return NextResponse.json({ options });

  } catch (error: any) {
    console.error('[generate-floorplan] Fatal error:', error.message);
    return NextResponse.json({ error: error.message, retry: true }, { status: 500 });
  }
}
