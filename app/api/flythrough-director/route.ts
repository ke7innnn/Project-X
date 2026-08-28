import { NextResponse } from 'next/server';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a world-class Architectural Cinematographer & Film Director.
Your job is to take reference images of a building and plan a breathtaking, commercial-grade architectural flythrough film shotlist.

The user will provide:
- Duration in seconds (e.g. 60s for 1 min, 120s for 2 min, 180s for 3 min)
- Number of shots needed (10s per shot: 6 shots for 60s, 12 shots for 120s, 18 shots for 180s)
- Architectural theme / atmosphere / time of day
- Building description / context

You MUST output a structured JSON object with the following schema:
{
  "filmTitle": "A catchy luxury project title (e.g. The Grand Horizon — Architectural Showcase)",
  "narrativeArc": "A 1-2 sentence description of the visual journey (Act I: Arrival, Act II: Facade & Details, Act III: Zenith & Skyline)",
  "recommendedAudioMood": "luxury_orchestral" | "sunset_piano" | "modern_ambient" | "lofi_architecture",
  "shots": [
    {
      "shotNumber": 1,
      "startTime": "00:00",
      "endTime": "00:10",
      "duration": 10,
      "title": "Short title (e.g. Street Arrival & Landscaped Boulevard)",
      "cameraMotion": "dolly_in" | "crane_up" | "orbit_left" | "orbit_right" | "lateral_tracking" | "aerial_pullback" | "push_in_zenith",
      "angleType": "street_level" | "hero_45" | "vertical_facade" | "rooftop_crown" | "drone_overhead" | "side_elevation" | "podium_detail" | "penthouse_close",
      "prompt": "Detailed architectural camera prompt for the AI video generator, describing camera movement, lighting, reflections, materials, and atmosphere. Keep it concise, descriptive, and focused on smooth cinema physics.",
      "focalLength": "35mm Wide" | "50mm Cinematic" | "85mm Telephoto" | "24mm Ultra-Wide"
    }
  ]
}

Ensure the shots flow seamlessly in a professional architectural showreel progression:
1. Opening: Grand street-level arrival, palm trees, entrance, retail podium, human scale.
2. Middle: Dynamic upward jib/crane shots tracking facade textures, balcony rhythms, low-iron glass reflections, sun glints, and mid-tower perspectives.
3. Climax & Finale: High-altitude 45-degree drone orbits around the pitched roof pavilions/crown, pulling back to show the full building silhouette against the sunset/sky.

Output strictly valid JSON with no markdown wrapping.`;

export async function POST(req: Request) {
  try {
    const {
      duration = 60, // 60, 120, or 180
      theme = 'luxury_modern',
      timeOfDay = 'day',
      buildingNotes = 'High-rise modern residential tower with terracotta/sandstone facade, repetitive balconies, ground retail podium, and pitched roof crown pavilions.',
    } = await req.json();

    const shotCount = Math.max(3, Math.round(Number(duration) / 10)); // 6 for 60s, 12 for 120s, 18 for 180s

    const groqKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;

    const userPrompt = `Please plan an architectural flythrough film shotlist with EXACTLY ${shotCount} shots (each 10 seconds, total duration ${duration}s).
Atmosphere/Theme: ${theme}, Time of Day: ${timeOfDay}.
Building Description: ${buildingNotes}.`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    let rawText = '';

    // 1. Try Groq (Fastest)
    if (groqKey) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages,
            temperature: 0.7,
            max_tokens: 2500,
            response_format: { type: 'json_object' },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          rawText = data.choices?.[0]?.message?.content || '';
        }
      } catch (err) {
        console.warn('[FlythroughDirector] Groq failed, trying fallback...', err);
      }
    }

    // 2. Try OpenRouter (Gemini Flash)
    if (!rawText && openRouterKey) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.0-flash-001',
            messages,
            temperature: 0.7,
            max_tokens: 2500,
            response_format: { type: 'json_object' },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          rawText = data.choices?.[0]?.message?.content || '';
        }
      } catch (err) {
        console.warn('[FlythroughDirector] OpenRouter failed, trying fallback...', err);
      }
    }

    // 3. Try OpenAI (GPT-4o-mini)
    if (!rawText && openaiKey) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
            temperature: 0.7,
            max_tokens: 2500,
            response_format: { type: 'json_object' },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          rawText = data.choices?.[0]?.message?.content || '';
        }
      } catch (err) {
        console.error('[FlythroughDirector] OpenAI failed:', err);
      }
    }

    if (!rawText) {
      // Robust Fallback Script if LLMs fail
      const fallbackShots = Array.from({ length: shotCount }).map((_, i) => {
        const startSec = i * 10;
        const endSec = (i + 1) * 10;
        const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
        
        const angleTypes = ['street_level', 'podium_detail', 'vertical_facade', 'hero_45', 'side_elevation', 'rooftop_crown', 'drone_overhead', 'penthouse_close'];
        const angle = angleTypes[i % angleTypes.length];
        
        return {
          shotNumber: i + 1,
          startTime: fmt(startSec),
          endTime: fmt(endSec),
          duration: 10,
          title: `Shot #${i + 1} — ${angle.replace('_', ' ').toUpperCase()}`,
          cameraMotion: i % 2 === 0 ? 'crane_up' : 'orbit_right',
          angleType: angle,
          prompt: `Cinematic 8K architectural camera movement showing ${angle.replace('_', ' ')} of the tower. Smooth motion, 24fps, realistic sunlight and reflections.`,
          focalLength: '35mm Wide',
        };
      });

      return NextResponse.json({
        filmTitle: 'Architectural Vision Showcase',
        narrativeArc: `A complete ${duration}-second cinematic flythrough exploring street presence, facade articulation, and skyline silhouette.`,
        recommendedAudioMood: 'luxury_orchestral',
        shots: fallbackShots,
      });
    }

    const parsed = JSON.parse(rawText);
    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('[FlythroughDirector Error]', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to generate flythrough shotlist.' },
      { status: 500 }
    );
  }
}
