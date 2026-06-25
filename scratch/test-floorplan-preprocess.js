const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const inputPath = '/Users/kevinpimenta/.gemini/antigravity-ide/brain/ecc59c89-fbd6-4eb5-9698-b8125adb8a6a/media__1782329634348.png';
const artifactDir = '/Users/kevinpimenta/.gemini/antigravity-ide/brain/ecc59c89-fbd6-4eb5-9698-b8125adb8a6a';

async function testFloorplan() {
  console.log('Testing preprocessing options on the actual floor plan image...');
  if (!fs.existsSync(inputPath)) {
    console.error('Input floor plan image not found at ' + inputPath);
    return;
  }

  try {
    const inputBuffer = fs.readFileSync(inputPath);
    const metadata = await sharp(inputBuffer).metadata();
    const origWidth = metadata.width || 1000;
    console.log(`Original dimensions: ${origWidth}x${metadata.height}`);

    // Option A (Current): Upscale 3x + Normalize + Blur(0.8) + Linear(2.2, -153)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .blur(0.8)
      .linear(2.2, -153)
      .png()
      .toFile(path.join(artifactDir, 'opt_a_current_blur_contrast.png'));
    console.log('Option A complete.');

    // Option B: Upscale 3x + Normalize + Mild Sharpen (No blur, no linear contrast offset)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .sharpen({ sigma: 1.0, m1: 0.5, m2: 1.0 })
      .png()
      .toFile(path.join(artifactDir, 'opt_b_sharpen_only.png'));
    console.log('Option B complete.');

    // Option C: Upscale 3x + Normalize + Sharpen + Gentle Linear (Factor 1.3, offset -38)
    // Formula: 1.3 * value - 38. Midpoint 128 maps to 128.4. Clean background without erasing thin lines.
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .sharpen({ sigma: 0.8 })
      .linear(1.3, -38)
      .png()
      .toFile(path.join(artifactDir, 'opt_c_gentle_contrast.png'));
    console.log('Option C complete.');

    // Option D: Upscale 3x + Normalize + CLAHE + Sharpen (No linear contrast clipping)
    await sharp(inputBuffer)
      .resize({ width: origWidth * 3, kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalise()
      .clahe({ width: 15, height: 15 })
      .sharpen({ sigma: 0.8 })
      .png()
      .toFile(path.join(artifactDir, 'opt_d_clahe_sharpen.png'));
    console.log('Option D complete.');

    console.log('All option files generated.');
  } catch (error) {
    console.error('Error during floorplan tests:', error);
  }
}

testFloorplan();
