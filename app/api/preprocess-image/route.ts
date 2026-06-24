import { NextResponse } from 'next/server';
import sharp from 'sharp';

const FAL_KEY = process.env.FAL_KEY!;

export const maxDuration = 60; // 60s timeout for Vercel functions/FAL AI calls

/**
 * POST /api/preprocess-image
 * Body: multipart/form-data with field "image" (file)
 * Returns: the pre-processed PNG as a base64 data URL for live preview
 *
 * Pipeline:
 * 1. Local Sharp (Grayscale, Normalize, Upscale 3x, Sharpen, Gentle Contrast)
 * 2. FAL-AI SeedVR Upscale (Secondary AI upscaling for perfect lines and 100% resolution)
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

    const image = sharp(inputBuffer);
    const metadata = await image.metadata();
    const targetWidth = Math.min(4096, Math.max(3000, (metadata.width || 1000) * 3));

    // Step 1: High-quality hardcoded preprocessing
    const processedBuffer = await image
      // Upscale 3x+ with smooth Lanczos3 interpolation
      .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 })
      // Grayscale
      .greyscale()
      // Normalize to stretch contrast naturally
      .normalise()
      // Sharpen to make lines and details extremely crisp without diffusing or erasing them
      .sharpen({ sigma: 0.8, m1: 0.5, m2: 1.0 })
      // Very gentle contrast stretch to clean the background without eroding thin/dashed lines
      .linear(1.15, -19)
      // Output PNG — lossless
      .png()
      .toBuffer();

    const base64Preprocessed = processedBuffer.toString('base64');
    const fallbackDataUrl = `data:image/png;base64,${base64Preprocessed}`;

    // Step 2: Send to FAL-AI seedvr/upscale/image for secondary AI upscaling
    if (!FAL_KEY) {
      console.warn('[preprocess-image] FAL_KEY not configured. Returning local upscale.');
      return NextResponse.json({ dataUrl: fallbackDataUrl });
    }

    try {
      console.log('[preprocess-image] Triggering fal-ai/seedvr/upscale/image...');
      const response = await fetch('https://fal.run/fal-ai/seedvr/upscale/image', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: fallbackDataUrl,
          upscale_mode: 'factor',
          upscale_factor: 2.0,
          output_format: 'png',
        }),
        signal: AbortSignal.timeout(45000), // 45s timeout for FAL AI
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[preprocess-image] FAL AI error ${response.status}: ${errText}`);
        return NextResponse.json({ dataUrl: fallbackDataUrl }); // Fallback to local sharp output
      }

      const data = await response.json();
      const upscaledUrl = data?.image?.url;
      if (!upscaledUrl) {
        console.error('[preprocess-image] FAL AI response did not contain image URL:', data);
        return NextResponse.json({ dataUrl: fallbackDataUrl });
      }

      console.log('[preprocess-image] Downloading AI upscaled image from FAL CDN:', upscaledUrl);
      const imgRes = await fetch(upscaledUrl, { signal: AbortSignal.timeout(10000) });
      if (!imgRes.ok) {
        console.error('[preprocess-image] Failed to download image from FAL CDN:', imgRes.statusText);
        return NextResponse.json({ dataUrl: fallbackDataUrl });
      }

      const imgBuffer = await imgRes.arrayBuffer();
      const upscaledBase64 = Buffer.from(imgBuffer).toString('base64');
      const finalDataUrl = `data:image/png;base64,${upscaledBase64}`;

      console.log('[preprocess-image] 100% upscaled image successfully generated.');
      return NextResponse.json({ dataUrl: finalDataUrl });
    } catch (falError: any) {
      console.error('[preprocess-image] FAL AI processing failed, falling back to sharp output:', falError.message);
      return NextResponse.json({ dataUrl: fallbackDataUrl });
    }
  } catch (error: any) {
    console.error('[preprocess-image] General error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
