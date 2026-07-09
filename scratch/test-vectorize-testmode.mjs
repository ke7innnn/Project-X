import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const apiId = 'vkc2p2fj5fxgayd';
const apiSecret = '95ilkohubjk43q1g8qnr0heqhnsqia1norbgh3lmgvl39j3l74t3';
const basicAuth = 'Basic ' + Buffer.from(`${apiId}:${apiSecret}`).toString('base64');

async function testWithImage() {
  console.log('Testing Vectorizer.ai with real image and mode=test...');
  try {
    const fileBuffer = readFileSync('scratch/halloween_bat.jpg');
    const safeArrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    );
    const processedBlob = new Blob([safeArrayBuffer], { type: 'image/jpeg' });
    
    const vectorizerForm = new FormData();
    vectorizerForm.append('image', processedBlob, 'halloween_bat.jpg');
    vectorizerForm.append('output.file_format', 'svg');
    vectorizerForm.append('mode', 'test');
    vectorizerForm.append('processing.max_colors', '2');

    const res = await fetch('https://api.vectorizer.ai/api/v1/vectorize', {
      method: 'POST',
      headers: { Authorization: basicAuth },
      body: vectorizerForm
    });

    console.log('HTTP Status:', res.status);
    const text = await res.text();
    console.log('Response:', text.slice(0, 500));
  } catch (err) {
    console.error('Error:', err);
  }
}

testWithImage();
