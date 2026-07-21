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
    return NextResponse.json({ error: 'Missing images list' }, { status: 400 });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const groqKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;

  const storyboardPrompt = `You are a cinematic presentation director. You are given a set of images (each with an imageId and a type) and a topic. Create an ANIMATED storyboard that tells the story of this property, moving from the 2D floor plan to the full 3D building.

Order the scenes as a narrative:
open title → the floor plan → a dramatic transition from the plan to the built form (hero) → a montage of exterior angles → detail moments → flythrough climax (if a flythrough image exists) → closing.
If there is no floor plan, instead build a cinematic montage of the images.

For each scene assign:
- sceneType
- imageIds (1 normally; [] for a title/closing card)
- title (max 6 words) and a 1-line caption, grounded in the image and topic
- transitionIn, chosen from: ["fade","maskWipe","scaleMorph","whipPan","parallaxSlide","lightSweep","push"]
- motion, chosen from: ["kenBurnsIn","kenBurnsOut","panLeft","panRight","parallax","still"]
- durationMs, between 2500 and 4000

The single most important scene is the plan→building transition — use "scaleMorph" or "maskWipe" there. Use "lightSweep" at most twice in the whole deck.

Available image elements:
${images.map((img: any) => `- ID: "${img.imageId}", Type: "${img.type}"`).join('\n')}

Return ONLY valid JSON in this schema, no prose, no markdown:
{
  "title": "${topic || 'Architectural Showcase'}",
  "audioMood": "ambient-cinematic",
  "scenes": [
    {
      "sceneType": "open",
      "imageIds": [],
      "title": "Open Presentation Title",
      "caption": "Project Briefing and overview details",
      "transitionIn": "fade",
      "motion": "still",
      "durationMs": 3000
    }
  ]
}`;

  // 1. Try Gemini 2.5 Flash on OpenRouter
  if (openRouterKey) {
    try {
      const contentParts: any[] = [
        { type: 'text', text: storyboardPrompt }
      ];

      // Attach relevant base64 image strings to assist AI Vision
      images.slice(0, 8).forEach((img: any) => {
        if (img.url && img.url.startsWith('data:image')) {
          contentParts.push({
            type: 'text',
            text: `Image representing imageId "${img.imageId}" of type "${img.type}":`
          });
          contentParts.push({
            type: 'image_url',
            image_url: { url: img.url }
          });
        }
      });

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Architect AI Storyboard Generator',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: contentParts }],
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(60000)
      });

      if (res.ok) {
        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(extractJsonFromText(raw));
        if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
          return NextResponse.json(parsed);
        }
      }
    } catch (err: any) {
      console.warn('[generate-storyboard] Gemini call failed, trying Haiku fallback: ', err.message);
    }
  }

  // 2. Try Groq Llama 3.3 Text Fallback
  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: storyboardPrompt }],
          temperature: 0.7,
          max_tokens: 2000,
        })
      });

      if (res.ok) {
        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(extractJsonFromText(raw));
        if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
          return NextResponse.json(parsed);
        }
      }
    } catch (e: any) {
      console.warn('[generate-storyboard] Groq fallback failed:', e.message);
    }
  }

  // 3. Absolute offline static fallback generator
  console.log('[generate-storyboard] All storyboarding model APIs failed, generating default story path.');
  return NextResponse.json(generateDefaultStoryboard(images, topic));
}

function generateDefaultStoryboard(images: any[], topic: string) {
  const scenes: any[] = [];
  const title = topic || 'Architectural Showcase';

  // 1. Open scene
  scenes.push({
    sceneType: 'open',
    imageIds: [],
    title: title.toUpperCase(),
    caption: 'AI GENERATED DESIGN TIMELINE PROPOSAL',
    transitionIn: 'fade',
    motion: 'still',
    durationMs: 3000
  });

  // Find Floor Plan, Hero Render, Exterior angles
  const floorPlanImg = images.find(img => img.type === 'floorPlan' || img.type === 'floor_plan');
  const heroImg = images.find(img => img.type === 'hero' || img.type === 'hero_render');
  const angleImgs = images.filter(img => img.type === 'angle' || img.type === 'exterior_angle');
  const remainingImgs = images.filter(img => img !== floorPlanImg && img !== heroImg && !angleImgs.includes(img));

  // 2. Floor plan slide
  if (floorPlanImg) {
    scenes.push({
      sceneType: 'plan',
      imageIds: [floorPlanImg.imageId],
      title: 'PRIMARY SITE FLOOR PLAN',
      caption: 'Detailed zoning alignments and spatial flows configuration.',
      transitionIn: 'fade',
      motion: 'panLeft',
      durationMs: 3500
    });
  }

  // 3. Plan to Hero Transition Slide (Morph)
  if (floorPlanImg && heroImg) {
    scenes.push({
      sceneType: 'morph',
      imageIds: [heroImg.imageId],
      title: '2D PLAN TO 3D BUILT FORM',
      caption: 'Direct scale morph showing the digital blueprint translated to exterior geometry.',
      transitionIn: 'scaleMorph',
      motion: 'kenBurnsIn',
      durationMs: 3800
    });
  } else if (heroImg) {
    scenes.push({
      sceneType: 'hero',
      imageIds: [heroImg.imageId],
      title: 'HERO DESIGN ELEVATION',
      caption: 'Primary design facade visualizing materials cladding parameters.',
      transitionIn: 'fade',
      motion: 'kenBurnsIn',
      durationMs: 3500
    });
  }

  // 4. Angle cuts
  angleImgs.forEach((img, idx) => {
    scenes.push({
      sceneType: 'angle',
      imageIds: [img.imageId],
      title: `EXTERIOR PERSPECTIVE — VIEW ${idx + 1}`,
      caption: 'High fidelity shadow study and context integration view.',
      transitionIn: 'whipPan',
      motion: 'panRight',
      durationMs: 2800
    });
  });

  // 5. Remaining images
  remainingImgs.forEach((img, idx) => {
    scenes.push({
      sceneType: 'detail',
      imageIds: [img.imageId],
      title: `DETAIL ANGLE moment — ${idx + 1}`,
      caption: 'Detailed specs showing closeups with structural materials grid.',
      transitionIn: 'push',
      motion: 'kenBurnsOut',
      durationMs: 3200
    });
  });

  // 6. Closing slide
  scenes.push({
    sceneType: 'closing',
    imageIds: [],
    title: 'PINNACLE DESIGN GROUP',
    caption: 'Full conceptual layouts subject to professional verify.',
    transitionIn: 'fade',
    motion: 'still',
    durationMs: 3000
  });

  return {
    title,
    audioMood: 'ambient-cinematic',
    scenes
  };
}
