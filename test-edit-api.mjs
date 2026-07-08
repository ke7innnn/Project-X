import { fal } from '@fal-ai/client';

fal.config({ credentials: process.env.FAL_KEY });

async function run() {
  try {
    const result = await fal.subscribe("openai/gpt-image-2/edit", {
      input: {
        prompt: "Make it a living room",
        image_urls: ["https://v3b.fal.media/files/b/0a8691af/9Se_1_VX1wzTjjTOpWbs9_bb39c2eb-1a41-4749-b1d0-cf134abc8bbf.png"]
      }
    });
    console.log("SUCCESS:", result);
  } catch (e) {
    console.error("ERROR:", e);
  }
}
run();
