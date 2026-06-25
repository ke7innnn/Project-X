const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const inputPath = path.join(__dirname, '../public/cad-style-reference.png');
const artifactDir = '/Users/kevinpimenta/.gemini/antigravity-ide/brain/ecc59c89-fbd6-4eb5-9698-b8125adb8a6a';

async function testSmoothLine() {
  console.log('Running smooth line pipeline tests...');
  try {
    const inputBuffer = fs.readFileSync(inputPath);
    const metadata = await sharp(inputBuffer).metadata();
    const origWidth = metadata.width || 1000;

    // Test 16: Upscale 3x + Grayscale + Normalize + Blur(0.5) + Linear(2.0, -128)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .blur(0.5)
      .linear(2.0, -128)
      .png()
      .toFile(path.join(artifactDir, 'test_16_smooth_blur0.5_contrast2.0.png'));
    console.log('Test 16 complete.');

    // Test 17: Upscale 3x + Grayscale + Normalize + Blur(0.8) + Linear(2.2, -153)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .blur(0.8)
      .linear(2.2, -153)
      .png()
      .toFile(path.join(artifactDir, 'test_17_smooth_blur0.8_contrast2.2.png'));
    console.log('Test 17 complete.');

    // Test 18: Upscale 3x + Grayscale + Normalize + Blur(1.0) + Linear(2.5, -192)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .blur(1.0)
      .linear(2.5, -192)
      .png()
      .toFile(path.join(artifactDir, 'test_18_smooth_blur1.0_contrast2.5.png'));
    console.log('Test 18 complete.');

    // Test 19: Upscale 3x + Grayscale + Normalize + Blur(1.2) + Linear(3.0, -256)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .blur(1.2)
      .linear(3.0, -256)
      .png()
      .toFile(path.join(artifactDir, 'test_19_smooth_blur1.2_contrast3.0.png'));
    console.log('Test 19 complete.');

    console.log('Smooth line pipeline tests completed.');
  } catch (error) {
    console.error('Error:', error);
  }
}

testSmoothLine();
