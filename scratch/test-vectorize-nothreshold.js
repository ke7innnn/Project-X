const fs = require('fs');
const path = require('path');

const apiId = 'vkc2p2fj5fxgayd';
const apiSecret = '95ilkohubjk43q1g8qnr0heqhnsqia1norbgh3lmgvl39j3l74t3';
const basicAuth = 'Basic ' + Buffer.from(`${apiId}:${apiSecret}`).toString('base64');

const artifactDir = '/Users/kevinpimenta/.gemini/antigravity-ide/brain/ecc59c89-fbd6-4eb5-9698-b8125adb8a6a';

async function vectorizeFile(filename, outName) {
  console.log(`Vectorizing ${filename}...`);
  const filePath = path.join(artifactDir, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`File ${filename} does not exist.`);
    return;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const safeArrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  );
  const processedBlob = new Blob([safeArrayBuffer], { type: 'image/png' });
  const vectorizerForm = new FormData();
  vectorizerForm.append('image', processedBlob, 'preprocessed.png');
  vectorizerForm.append('output.file_format', 'svg');
  vectorizerForm.append('mode', 'test');
  vectorizerForm.append('processing.max_colors', '2');

  try {
    const res = await fetch('https://api.vectorizer.ai/api/v1/vectorize', {
      method: 'POST',
      headers: { Authorization: basicAuth },
      body: vectorizerForm
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Error vectorizing ${filename}:`, res.status, errText);
      return;
    }

    const svgText = await res.text();
    fs.writeFileSync(path.join(artifactDir, outName), svgText);
    console.log(`Saved SVG to ${outName}`);
  } catch (error) {
    console.error(`Failed to vectorize ${filename}:`, error);
  }
}

async function run() {
  await vectorizeFile('test_8_no_threshold.png', 'vector_8_no_threshold.svg');
  await vectorizeFile('test_9_sharpen.png', 'vector_9_sharpen.svg');
  await vectorizeFile('test_10_strong_sharpen.png', 'vector_10_strong_sharpen.svg');
  console.log('All vectorizations completed.');
}

run();
