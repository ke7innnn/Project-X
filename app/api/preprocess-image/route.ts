import { NextResponse } from 'next/server';
import sharp from 'sharp';

const FAL_KEY = process.env.FAL_KEY!;

export const maxDuration = 60;

/**
 * POST /api/preprocess-image
 * Body: multipart/form-data with field "image" (file)
 * Returns: the pre-processed PNG as a base64 data URL
 *
 * Pipeline:
 * 1. Sharp: Grayscale, Normalize, resize to max 1500px, Sharpen, Gentle Contrast
 * 2. FAL SeedVR: AI upscaling via base64 data URL (verified working)
 *    IMPORTANT: SeedVR DOES accept base64 data URLs — but we must keep
 *    the input image reasonably sized (<5MB encoded) or the request body
 *    will be rejected by Vercel/FAL.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: 'No image file provided.' }, { status: 400 });
    }

    const originalArrayBuffer = await imageFile.arrayBuffer();
    const inputBuffer = Buffer.from(originalArrayBuffer);

    // Step 1: Sharp preprocessing
    // Cap at 1500px — SeedVR will 2x this to 3000px which is more than enough
    // A 1500px PNG grayscale image is ~0.5-2MB encoded, safely within FAL limits
    const MAX_SEED_VR_INPUT_PX = 1500;

    const processedBuffer = await sharp(inputBuffer)
      .resize({ width: MAX_SEED_VR_INPUT_PX, withoutEnlargement: false, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .sharpen({ sigma: 0.8, m1: 0.5, m2: 1.0 })
      .linear(1.15, -19)
      .png()
      .toBuffer();

    const base64Preprocessed = processedBuffer.toString('base64');
    const fallbackDataUrl = `data:image/png;base64,${base64Preprocessed}`;

    // Quick sanity check: log the payload size
    const payloadMB = (base64Preprocessed.length / 1024 / 1024).toFixed(2);
    console.log(`[preprocess-image] Sharp output: ${processedBuffer.length} bytes, base64: ${payloadMB}MB`);

    // If no FAL key, return the sharp-processed image
    if (!FAL_KEY) {
      console.warn('[preprocess-image] FAL_KEY not configured. Returning local upscale.');
      return NextResponse.json({ dataUrl: fallbackDataUrl });
    }

    // Step 2: Send to FAL SeedVR as a base64 data URL
    // SeedVR accepts data:image/png;base64,... directly — confirmed working
    try {
      console.log('[preprocess-image] Sending to fal-ai/seedvr/upscale/image...');

      const response = await fetch('https://fal.run/fal-ai/seedvr/upscale/image', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: fallbackDataUrl,
          upscale_factor: 2.0,
          output_format: 'png',
        }),
        signal: AbortSignal.timeout(50000),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[preprocess-image] SeedVR error ${response.status}: ${errText}`);
        return NextResponse.json({ dataUrl: fallbackDataUrl });
      }

      const data = await response.json();
      const upscaledUrl = data?.image?.url;
      if (!upscaledUrl) {
        console.error('[preprocess-image] SeedVR did not return image URL:', JSON.stringify(data));
        return NextResponse.json({ dataUrl: fallbackDataUrl });
      }

      console.log('[preprocess-image] SeedVR succeeded:', upscaledUrl);

      // Download the upscaled image from FAL CDN and return as base64
      const imgRes = await fetch(upscaledUrl, { signal: AbortSignal.timeout(15000) });
      if (!imgRes.ok) {
        console.error('[preprocess-image] FAL CDN download failed:', imgRes.statusText);
        return NextResponse.json({ dataUrl: fallbackDataUrl });
      }

      const imgBuffer = await imgRes.arrayBuffer();
      const upscaledBase64 = Buffer.from(imgBuffer).toString('base64');
      const finalDataUrl = `data:image/png;base64,${upscaledBase64}`;

      console.log('[preprocess-image] AI upscale complete. Final size:', (imgBuffer.byteLength / 1024 / 1024).toFixed(2), 'MB');
      return NextResponse.json({ dataUrl: finalDataUrl });

    } catch (falError: any) {
      console.error('[preprocess-image] SeedVR failed, using Sharp fallback:', falError.message);
      return NextResponse.json({ dataUrl: fallbackDataUrl });
    }

  } catch (error: any) {
    console.error('[preprocess-image] General error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
