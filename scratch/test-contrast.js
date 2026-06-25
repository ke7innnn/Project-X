const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const inputPath = path.join(__dirname, '../public/cad-style-reference.png');
const artifactDir = '/Users/kevinpimenta/.gemini/antigravity-ide/brain/ecc59c89-fbd6-4eb5-9698-b8125adb8a6a';

async function testContrast() {
  console.log('Running linear contrast tests...');
  try {
    const inputBuffer = fs.readFileSync(inputPath);
    const metadata = await sharp(inputBuffer).metadata();
    const origWidth = metadata.width || 1000;

    // Test 11: Upscale 3x + Grayscale + Normalize + Linear Contrast (Factor 1.5)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .linear(1.5, -64)
      .png()
      .toFile(path.join(artifactDir, 'test_11_contrast1.5.png'));
    console.log('Test 11 complete.');

    // Test 12: Upscale 3x + Grayscale + Normalize + Linear Contrast (Factor 2.0)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .linear(2.0, -128)
      .png()
      .toFile(path.join(artifactDir, 'test_12_contrast2.0.png'));
    console.log('Test 12 complete.');

    // Test 13: Upscale 3x + Grayscale + Normalize + Linear Contrast (Factor 2.5)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .linear(2.5, -192)
      .png()
      .toFile(path.join(artifactDir, 'test_13_contrast2.5.png'));
    console.log('Test 13 complete.');

    console.log('Contrast tests completed.');
  } catch (error) {
    console.error('Error:', error);
  }
}

testContrast();
