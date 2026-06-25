const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const inputPath = path.join(__dirname, '../public/cad-style-reference.png');
const artifactDir = '/Users/kevinpimenta/.gemini/antigravity-ide/brain/ecc59c89-fbd6-4eb5-9698-b8125adb8a6a';

async function testPipelines() {
  console.log('Starting image preprocessing tests...');
  try {
    const inputBuffer = fs.readFileSync(inputPath);
    const metadata = await sharp(inputBuffer).metadata();
    const origWidth = metadata.width || 1000;
    console.log(`Original image dimensions: ${origWidth}x${metadata.height}`);

    // Test 1: Baseline (Upscale 2x + Grayscale + Normalize)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 2, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .png()
      .toFile(path.join(artifactDir, 'test_1_baseline.png'));
    console.log('Test 1 complete.');

    // Test 2: Upscale 4x with Lanczos3 + Grayscale + Normalize (No threshold)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 4, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .png()
      .toFile(path.join(artifactDir, 'test_2_upscale4x.png'));
    console.log('Test 2 complete.');

    // Test 3: Upscale 4x with Lanczos3 + Grayscale + Normalize + Threshold (128)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 4, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .threshold(128)
      .png()
      .toFile(path.join(artifactDir, 'test_3_threshold128.png'));
    console.log('Test 3 complete.');

    // Test 4: Upscale 4x with Lanczos3 + Grayscale + Normalize + Threshold (180)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 4, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .threshold(180)
      .png()
      .toFile(path.join(artifactDir, 'test_4_threshold180.png'));
    console.log('Test 4 complete.');

    // Test 5: Upscale 4x with Lanczos3 + Grayscale + Normalize + Threshold (210)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 4, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .threshold(210)
      .png()
      .toFile(path.join(artifactDir, 'test_5_threshold210.png'));
    console.log('Test 5 complete.');

    // Test 6: Upscale 4x + Sharpen + Grayscale + Normalize + Threshold (180)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 4, kernel: sharp.kernel.lanczos3 })
      .sharpen()
      .greyscale()
      .normalise()
      .threshold(180)
      .png()
      .toFile(path.join(artifactDir, 'test_6_sharpen_threshold180.png'));
    console.log('Test 6 complete.');

    // Test 7: Upscale 4x + Grayscale + CLAHE + Threshold (180)
    try {
      await sharp(inputBuffer)
        .resize({ width: origWidth * 4, kernel: sharp.kernel.lanczos3 })
        .greyscale()
        .clahe({ width: 10, height: 10 })
        .threshold(180)
        .png()
        .toFile(path.join(artifactDir, 'test_7_clahe_threshold180.png'));
      console.log('Test 7 complete.');
    } catch (e) {
      console.log('Test 7 (CLAHE) failed or not supported in this sharp version:', e.message);
    }

    console.log('All tests finished successfully.');
  } catch (error) {
    console.error('Error during preprocessing tests:', error);
  }
}

testPipelines();
