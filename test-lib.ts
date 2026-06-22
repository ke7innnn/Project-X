import { callGemini } from './lib/gemini';

async function run() {
  try {
    const res = await callGemini({
      model: 'gemini-2.5-flash-image',
      message: 'Generate a floor plan for a 100x20 North-facing modern house.',
      responseModalities: ['image', 'text'],
      temperature: 0.9,
      timeoutMs: 40000
    });
    
    console.log("Success!");
    const part = res.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (part) {
        console.log("Got image data:", part.inlineData.data.substring(0, 50) + "...");
    } else {
        console.log("No image data found:", JSON.stringify(res, null, 2));
    }
  } catch (err) {
    console.error("Error calling gemini wrapper:", err);
  }
}
run();
