import { NextResponse } from 'next/server';

const FAL_KEY = process.env.FAL_KEY!;

export async function POST(request: Request) {
  try {
    const { uploadedDrawingBase64, collectedParameters } = await request.json();

    if (!uploadedDrawingBase64) {
      throw new Error('Missing uploaded drawing image for styling');
    }

    const prompt = `Apply a professional architectural drawing style to this floor plan:
- Clean black lines on pure white background
- Show walls as thick black lines (3-4px equivalent)
- Maintain all exact proportions and room layouts
- This should match the architectural presentation standard.`;

    const body = {
      prompt,
      image_urls: [
        uploadedDrawingBase64.startsWith('data:')
          ? uploadedDrawingBase64
          : `data:image/jpeg;base64,${uploadedDrawingBase64}`
      ],
      aspect_ratio: collectedParameters?.aspectRatio || '1:1',
    };

    console.log(`[fal-ai/gemini-25-flash-image/edit] Applying CAD style to drawing.`);

    const response = await fetch('https://fal.run/fal-ai/gemini-25-flash-image/edit', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000), // 60s timeout
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`fal-ai/gemini-25-flash-image/edit style error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const imageUrl = data?.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error('fal-ai/gemini-25-flash-image/edit returned no styled image URL');
    }

    // Download the styled image as base64
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!imgRes.ok) {
      throw new Error('Failed to download styled image from fal.ai CDN');
    }
    const imgBuffer = await imgRes.arrayBuffer();
    const styledFloorPlan = Buffer.from(imgBuffer).toString('base64');

    return NextResponse.json({ styledFloorPlan });
  } catch (error: any) {
    console.error('Apply style error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

