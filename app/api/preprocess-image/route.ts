import { NextResponse } from 'next/server';
import sharp from 'sharp';

export const maxDuration = 30;

/**
 * POST /api/preprocess-image
 * Body: multipart/form-data with field "image" (file)
 * Returns: the pre-processed PNG as a base64 data URL for live preview
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

    // Same pipeline as png-to-dxf route
    const processedBuffer = await sharp(inputBuffer)
      .greyscale()
      .median(3)
      .sharpen({ sigma: 3, m1: 1.5, m2: 2.5 })
      .normalise()
      .linear(1.8, -30)
      .threshold(140)
      .png()
      .toBuffer();

    // Return as base64 data URL so the browser can display it directly
    const base64 = processedBuffer.toString('base64');
    return NextResponse.json({ dataUrl: `data:image/png;base64,${base64}` });
  } catch (error: any) {
    console.error('[preprocess-image] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
