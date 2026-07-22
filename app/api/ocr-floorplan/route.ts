import { NextResponse } from 'next/server';

export const maxDuration = 60;

export interface RoomData {
  name: string;
  dimensions?: string;
  areaSqft?: number;
  label?: string;
}

export interface FloorPlanOCRResult {
  rooms: RoomData[];
  bhkType?: string;
  totalAreaSqft?: number;
  rawText?: string;
  confidence: 'high' | 'medium' | 'low';
}

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json();
    if (!imageBase64) {
      return NextResponse.json({ error: 'Missing imageBase64' }, { status: 400 });
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY || 
                          process.env.GEMINI_API_KEY || 
                          process.env.GROQ_API_KEY || 
                          process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || 
                          process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!openRouterKey) {
      return NextResponse.json({ error: 'No OpenRouter/Gemini API key configured in environment' }, { status: 500 });
    }

    const rawBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const dataUri = `data:image/jpeg;base64,${rawBase64}`;

    console.log('[ocr-floorplan] Sending floor plan to Gemini Vision for OCR...');

    const systemPrompt = `You are an expert architectural plan reader specializing in 2D floor plans.
Your task is to analyze a 2D floor plan image and extract all room information WITH their approximate positions in the image.

EXTRACTION RULES:
1. Read ALL text visible on the floor plan — room labels, dimension annotations, area values
2. For each room/space, extract: its name, any dimensions shown (e.g. "12'x10'"), any area values shown
3. CRITICAL: Estimate the approximate CENTER position of each room as a percentage of the full image width and height.
   - cx: horizontal center of the room label (0.0 = left edge, 1.0 = right edge)
   - cy: vertical center of the room label (0.0 = top edge, 1.0 = bottom edge)
   - Also estimate the room's approximate width and height as a percentage of the image size
   - wPct: estimated width of room as fraction of image width (e.g. 0.2 = 20% of image width)
   - hPct: estimated height of room as fraction of image height
4. BHK type may appear as "2 BHK", "3BHK" etc.
5. If no dimensions shown for a room, leave those fields null

OUTPUT: Return ONLY valid JSON, no other text:
{
  "rooms": [
    { "name": "Living Room", "label": "A - Living Room", "dimensions": "15x12 ft", "areaSqft": 180, "cx": 0.15, "cy": 0.4, "wPct": 0.18, "hPct": 0.22 },
    { "name": "Kitchen", "label": "B - Kitchen", "dimensions": "10x8 ft", "areaSqft": 80, "cx": 0.55, "cy": 0.6, "wPct": 0.14, "hPct": 0.18 }
  ],
  "bhkType": "2 BHK",
  "totalAreaSqft": 600,
  "rawText": "all text you can read from the plan",
  "confidence": "high"
}

Set confidence: "high" if most labels clearly readable, "medium" if partial, "low" if very few visible.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ai-architect.vercel.app',
        'X-Title': 'AI Architect OCR',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUri } },
              { type: 'text', text: 'Analyze this floor plan and extract all room information, dimensions, and area values as JSON.' }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      throw new Error(`OpenRouter OCR failed: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content returned from OCR model');

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse JSON from OCR response');

    const result: FloorPlanOCRResult = JSON.parse(jsonMatch[0]);
    console.log(`[ocr-floorplan] Extracted ${result.rooms?.length ?? 0} rooms. BHK: ${result.bhkType}, Total: ${result.totalAreaSqft} sqft`);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[ocr-floorplan] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
