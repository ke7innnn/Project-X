const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const inputPath = path.join(__dirname, '../public/cad-style-reference.png');
const artifactDir = '/Users/kevinpimenta/.gemini/antigravity-ide/brain/ecc59c89-fbd6-4eb5-9698-b8125adb8a6a';

async function testCombo() {
  console.log('Running combined pipeline tests...');
  try {
    const inputBuffer = fs.readFileSync(inputPath);
    const metadata = await sharp(inputBuffer).metadata();
    const origWidth = metadata.width || 1000;

    // Test 14: Upscale 3x + Grayscale + Normalize + Linear(1.5, -64) + Sharpen(sigma=0.8)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .linear(1.5, -64)
      .sharpen({ sigma: 0.8 })
      .png()
      .toFile(path.join(artifactDir, 'test_14_combo1.5.png'));
    console.log('Test 14 complete.');

    // Test 15: Upscale 3x + Grayscale + Normalize + Linear(2.0, -128) + Sharpen(sigma=0.8)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .linear(2.0, -128)
      .sharpen({ sigma: 0.8 })
      .png()
      .toFile(path.join(artifactDir, 'test_15_combo2.0.png'));
    console.log('Test 15 complete.');

    console.log('Combined pipeline tests completed.');
  } catch (error) {
    console.error('Error:', error);
  }
}

testCombo();
