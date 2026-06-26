import { NextResponse } from 'next/server';
import sharp from 'sharp';

const FAL_KEY = process.env.FAL_KEY!;

export const maxDuration = 60;

/**
 * POST /api/preprocess-image
 * Body: multipart/form-data with field "image" (file)
 * Returns: the pre-processed PNG as a base64 data URL for live preview
 *
 * Pipeline:
 * 1. Local Sharp (Grayscale, Normalize, Upscale 3x, Sharpen, Gentle Contrast)
 * 2. Upload Sharp output to FAL storage to get a public HTTPS URL
 * 3. FAL-AI SeedVR Upscale using that public URL (data URLs are NOT accepted by FAL)
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

    // Step 1: High-quality hardcoded preprocessing with Sharp
    const processedBuffer = await image
      .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .sharpen({ sigma: 0.8, m1: 0.5, m2: 1.0 })
      .linear(1.15, -19)
      .png()
      .toBuffer();

    const base64Preprocessed = processedBuffer.toString('base64');
    const fallbackDataUrl = `data:image/png;base64,${base64Preprocessed}`;

    // Step 2: Upload processed image to FAL storage to get a public HTTPS URL
    // FAL's SeedVR endpoint requires a real HTTP URL — it rejects base64 data URLs
    if (!FAL_KEY) {
      console.warn('[preprocess-image] FAL_KEY not configured. Returning local upscale.');
      return NextResponse.json({ dataUrl: fallbackDataUrl });
    }

    let publicImageUrl: string;
    try {
      console.log('[preprocess-image] Uploading preprocessed image to FAL storage...');
      const uploadForm = new FormData();
      const blob = new Blob([new Uint8Array(processedBuffer)], { type: 'image/png' });
      uploadForm.append('file', blob, 'floorplan.png');

      const uploadRes = await fetch('https://fal.run/storage/upload', {
        method: 'POST',
        headers: { 'Authorization': `Key ${FAL_KEY}` },
        body: uploadForm,
        signal: AbortSignal.timeout(20000),
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`FAL storage upload failed (${uploadRes.status}): ${errText}`);
      }

      const uploadData = await uploadRes.json();
      publicImageUrl = uploadData?.url;
      if (!publicImageUrl) throw new Error('FAL storage did not return a URL');
      console.log('[preprocess-image] Uploaded to FAL storage:', publicImageUrl);
    } catch (uploadErr: any) {
      console.error('[preprocess-image] FAL storage upload failed, using fallback:', uploadErr.message);
      return NextResponse.json({ dataUrl: fallbackDataUrl });
    }

    // Step 3: Send public URL to SeedVR for AI upscaling
    try {
      console.log('[preprocess-image] Triggering fal-ai/seedvr/upscale/image...');
      const response = await fetch('https://fal.run/fal-ai/seedvr/upscale/image', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: publicImageUrl,
          upscale_mode: 'factor',
          upscale_factor: 2.0,
          output_format: 'png',
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[preprocess-image] SeedVR error ${response.status}: ${errText}`);
        return NextResponse.json({ dataUrl: fallbackDataUrl });
      }

      const data = await response.json();
      const upscaledUrl = data?.image?.url;
      if (!upscaledUrl) {
        console.error('[preprocess-image] SeedVR did not return image URL:', data);
        return NextResponse.json({ dataUrl: fallbackDataUrl });
      }

      console.log('[preprocess-image] Downloading AI upscaled image from FAL CDN:', upscaledUrl);
      const imgRes = await fetch(upscaledUrl, { signal: AbortSignal.timeout(15000) });
      if (!imgRes.ok) {
        console.error('[preprocess-image] Failed to download from FAL CDN:', imgRes.statusText);
        return NextResponse.json({ dataUrl: fallbackDataUrl });
      }

      const imgBuffer = await imgRes.arrayBuffer();
      const upscaledBase64 = Buffer.from(imgBuffer).toString('base64');
      const finalDataUrl = `data:image/png;base64,${upscaledBase64}`;

      console.log('[preprocess-image] SeedVR AI upscale complete.');
      return NextResponse.json({ dataUrl: finalDataUrl });
    } catch (seedvrErr: any) {
      console.error('[preprocess-image] SeedVR failed, using Sharp fallback:', seedvrErr.message);
      return NextResponse.json({ dataUrl: fallbackDataUrl });
    }
  } catch (error: any) {
    console.error('[preprocess-image] General error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
