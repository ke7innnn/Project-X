import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { layout, title, subtitle, projectName, activeProjectConfig } = await request.json();

    const apiKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        suggestion: `Architectural specifications and design parameters configured for ${projectName || 'this project'}. The layout structure optimizes usable floor area, guarantees natural ventilation, and complies with safety setbacks.`
      });
    }

    const prompt = `You are a professional senior residential architect writing content for a premium client pitch presentation deck.
Project Name: ${projectName || 'Untitled Project'}
Slide Layout: ${layout}
Slide Title: ${title || 'Slide Title'}
Slide Subtitle: ${subtitle || 'Slide Subtitle'}
Project Config: ${JSON.stringify(activeProjectConfig || {})}

Write a highly detailed, professional, and persuasive description (1-2 short paragraphs) to fill the body of this slide. Focus on structural feasibility, space efficiency, daylight access, Vastu rules where applicable, and high-end visual appeal.
Do NOT use markdown bold/italics, headers or bullet lists. Return ONLY the plain text description (around 50-80 words).`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 250,
        temperature: 0.7,
      })
    });

    if (!res.ok) {
      throw new Error(`Groq API returned ${res.status}`);
    }

    const data = await res.json();
    const suggestion = data.choices?.[0]?.message?.content || '';
    return NextResponse.json({ suggestion: suggestion.trim() });
  } catch (error: any) {
    console.error('AI Suggestion API error:', error);
    return NextResponse.json({
      suggestion: 'Comprehensive space layout planning designed according to professional zoning and circulation efficiency protocols.'
    });
  }
}
