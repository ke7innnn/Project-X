import { NextResponse } from 'next/server';

function extractJsonFromText(text: string): string {
  const firstBrace = text.indexOf('{');
  if (firstBrace !== -1) {
    let openBraces = 0;
    for (let i = firstBrace; i < text.length; i++) {
      if (text[i] === '{') openBraces++;
      if (text[i] === '}') {
        openBraces--;
        if (openBraces === 0) {
          return text.substring(firstBrace, i + 1);
        }
      }
    }
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace !== -1) {
      return text.substring(firstBrace, lastBrace + 1);
    }
  }
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  return text;
}

export async function POST(request: Request) {
  let requestData: any = {};
  try {
    requestData = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { images, topic } = requestData;

  if (!images || !Array.isArray(images) || images.length < 1) {
    return NextResponse.json({ error: 'Missing images' }, { status: 400 });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const groqKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;

  // 1. Try Vision AI if OpenRouter key is configured
  if (openRouterKey) {
    const textPrompt = `You are a professional residential presentation generation AI.
Create a premium presentation deck structure based on the provided images.
Topic / Title: ${topic || 'Architectural Showcase'}

Generate a themed pitch deck of up to 10 slides. Utilize the provided image placeholders (e.g., "image_0", "image_1", etc.) in the slide "imageUrls" array.
Return a valid JSON object matching this schema structure:
{
  "theme": "cream",
  "accentColor": "#00d9ff",
  "slides": [
    {
      "layout": "cover",
      "title": "Topic Title",
      "subtitle": "Branded subtitle",
      "body": "Slide description paragraphs detailing materials, spaces, or client briefs",
      "imageUrls": []
    },
    {
      "layout": "image+text",
      "title": "Floor layout / Elevation name",
      "subtitle": "Subtitle details",
      "body": "Persuasive architectural commentary",
      "imageUrls": ["image_0"]
    }
  ]
}

Available image placeholders you must map to:
${images.map((_, i) => `"image_${i}"`).join(', ')}

Ensure every image is assigned to at least one slide. Return ONLY valid JSON. No explanations, no markdown blocks.`;

    const contentParts: any[] = [
      { type: 'text', text: textPrompt }
    ];

    images.forEach((img: string, idx: number) => {
      contentParts.push({
        type: 'text',
        text: `This image corresponds to placeholder "image_${idx}":`
      });
      contentParts.push({
        type: 'image_url',
        image_url: { url: img }
      });
    });

    const runCall = async (model: string): Promise<any> => {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Architect AI Deck Generator',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: contentParts }],
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(60000)
      });

      if (!res.ok) {
        throw new Error(`OpenRouter returned status ${res.status}`);
      }

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || '{}';
      return JSON.parse(extractJsonFromText(raw));
    };

    try {
      const parsedData = await runCall('google/gemini-2.5-flash');
      if (parsedData && Array.isArray(parsedData.slides)) {
        return NextResponse.json(parsedData);
      }
    } catch (err: any) {
      console.warn('[generate-smart-deck] Gemini call failed, retrying with Haiku...', err.message);
      try {
        const parsedData = await runCall('anthropic/claude-3-haiku');
        if (parsedData && Array.isArray(parsedData.slides)) {
          return NextResponse.json(parsedData);
        }
      } catch (retryErr) {
        console.error('[generate-smart-deck] Vision models failed.');
      }
    }
  }

  // 2. Fallback to Llama 3.3 Text-only Generation using Groq API (extremely reliable and contextual!)
  if (groqKey) {
    try {
      console.log('[generate-smart-deck] Utilizing Groq Llama 3.3 to build presentation descriptions...');
      const textPrompt = `You are a professional senior residential architect writing a themed presentation deck.
Topic / Project Context: "${topic || 'Architectural Showcase'}"
Available Image Placeholders: ${images.map((_, i) => `"image_${i}"`).join(', ')}

Please generate up to 10 slides for this presentation. Assign the image placeholders to the slides.
Ensure each slide has a completely unique title, subtitle, and body description tailored specifically to the project context "${topic}".
Return a valid JSON object matching this schema layout:
{
  "theme": "cream" or "dark",
  "accentColor": "#00d9ff",
  "slides": [
    {
      "layout": "cover",
      "title": "Main Project Cover Title",
      "subtitle": "Subtitle description",
      "body": "Overview and context brief",
      "imageUrls": []
    },
    {
      "layout": "image+text",
      "title": "Slide Title (e.g. Living Area, Elevation view, etc.)",
      "subtitle": "Subtitle details",
      "body": "Distinct architectural details, space planning and aesthetic features specific to this slide context.",
      "imageUrls": ["image_0"]
    }
  ]
}

Return ONLY valid JSON. Do not include markdown code block syntax, explanation text, or notes.`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: textPrompt }],
          temperature: 0.7,
          max_tokens: 1500,
        })
      });

      if (res.ok) {
        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(extractJsonFromText(raw));
        if (parsed && Array.isArray(parsed.slides) && parsed.slides.length > 0) {
          return NextResponse.json(parsed);
        }
      }
    } catch (e: any) {
      console.warn('[generate-smart-deck] Groq text-generation fallback failed:', e.message);
    }
  }

  // 3. Absolute offline static fallback with highly varied titles and descriptions
  console.log('[generate-smart-deck] All APIs failed, invoking static varied fallback engine.');
  return NextResponse.json(generateFallbackDeck(images, topic));
}

// Fallback layout generation with rich variations
function generateFallbackDeck(images: string[], topic: string) {
  const slides: any[] = [
    {
      layout: 'cover',
      title: (topic || 'ARCHITECTURAL CONCEPT').toUpperCase(),
      subtitle: 'AI GENERATED DESIGN PROPOSAL',
      body: 'Pinnacle Studios • Custom Showcase',
      imageUrls: []
    }
  ];

  const titles = [
    "SITE DEVELOPMENT PLAN",
    "ZONING & CIRCULATION ANALYSIS",
    "EXTERIOR FACADE & CLADDING",
    "LIVING AREA CROSS-VENTILATION",
    "SUNPATH & DAYLIGHT OPTIMIZATION",
    "LANDSCAPE & DRAINAGE LAYOUT",
    "TERRAIN INTEGRATION ELEVATION",
    "INTERNAL SPATIAL ERGONOMICS",
    "PREMIUM TEXTURES & HARD JOINERY",
    "STRUCTURAL FRAMING GRID"
  ];

  const subtitles = [
    "SETBACK & BORDER CLEARANCES",
    "FLOW AND ACCESS SCHEMATICS",
    "AESTHETIC HARMONY & GLAZING",
    "NATURAL COOLING CHANNELS",
    "SOLAR PROTECTION FILTERS",
    "GREEN SPACES INTEGRATION",
    "PERSPECTIVE SHADOW CASTS",
    "VERTICAL LEVEL CONNECTIONS",
    "MATERIAL SPECIFICATIONS",
    "LOAD-BEARING PARAMETERS"
  ];

  const descriptions = [
    "Zoning setbacks and boundary parameters configured to maximize internal space allocation while maintaining structural buffer codes.",
    "Detailed flow layout plan mapping the primary dwelling zones, separating active recreation areas from private bedroom partitions.",
    "Stunning exterior facade design combining natural limestone cladding with double-glazed floor-to-ceiling glass screens.",
    "Air circulation and space orientation specifically planned to benefit from cross-breezes and passive cooling channels.",
    "Daylight ingress study outlining sun visor overhang placements to cast shadows during peak heat hours while keeping spaces bright.",
    "Sustainable landscaping layout featuring integrated green hardscapes, local trees, and run-off rainwater catchment zones.",
    "Elevated perspective illustrating the architectural geometry merging with the site's natural contours and soil grading.",
    "Internal floor heights and room dimensions configured to present spacious double-volume ceilings and open-floor plans.",
    "Premium materials catalog mapping solid oak hardwood fixtures, brushed brass accents, and custom steel frames.",
    "Structural grid framing mapping reinforced concrete columns and foundation loads to guarantee code compliance."
  ];

  images.forEach((_, idx) => {
    const listIndex = idx % titles.length;
    slides.push({
      layout: 'image+text',
      title: titles[listIndex],
      subtitle: subtitles[listIndex],
      body: descriptions[listIndex],
      imageUrls: [`image_${idx}`]
    });
  });

  return {
    theme: 'cream',
    accentColor: '#00d9ff',
    slides
  };
}
