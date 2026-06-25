const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const inputPath = path.join(__dirname, '../public/cad-style-reference.png');
const artifactDir = '/Users/kevinpimenta/.gemini/antigravity-ide/brain/ecc59c89-fbd6-4eb5-9698-b8125adb8a6a';

async function testNoThreshold() {
  console.log('Running test with no thresholding...');
  try {
    const inputBuffer = fs.readFileSync(inputPath);
    const metadata = await sharp(inputBuffer).metadata();
    const origWidth = metadata.width || 1000;

    // Test 8: Upscale 3x + Grayscale + Normalize (No threshold)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .png()
      .toFile(path.join(artifactDir, 'test_8_no_threshold.png'));
    console.log('Test 8 complete.');

    // Test 9: Upscale 3x + Grayscale + Normalize + Mild Sharpen (No threshold)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .sharpen({ sigma: 1, m1: 0.5, m2: 1.0 })
      .png()
      .toFile(path.join(artifactDir, 'test_9_sharpen.png'));
    console.log('Test 9 complete.');

    // Test 10: Upscale 3x + Grayscale + Normalize + Strong Sharpen (No threshold)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .sharpen({ sigma: 1.5, m1: 1.5, m2: 2.0 })
      .png()
      .toFile(path.join(artifactDir, 'test_10_strong_sharpen.png'));
    console.log('Test 10 complete.');

    console.log('No-threshold tests completed.');
  } catch (error) {
    console.error('Error:', error);
  }
}

testNoThreshold();
