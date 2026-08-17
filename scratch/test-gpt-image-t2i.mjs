import { fal } from '@fal-ai/client';
import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf-8');
const match = envText.match(/FAL_KEY=["']?([^"'\r\n]+)/);
const falKey = match ? match[1] : process.env.FAL_KEY;
fal.config({ credentials: falKey });

async function main() {
  console.log('Testing openai/gpt-image-2 text-to-image on FAL...');
  try {
    const result = await fal.subscribe('openai/gpt-image-2', {
      input: {
        prompt: 'Architectural presentation board floor plan drawing of an arc shaped building, 2D floor plan on left, 3D top view and 3D perspective tower view on right, summary card at bottom right, ultra detailed, modern presentation board.',
        quality: 'low'
      }
    });
    console.log('Result:', result);
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
