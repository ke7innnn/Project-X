const fs = require('fs');
const path = require('path');

const artifactDir = '/Users/kevinpimenta/.gemini/antigravity-ide/brain/ecc59c89-fbd6-4eb5-9698-b8125adb8a6a';
const files = [
  'vector_1_baseline.svg',
  'vector_2_upscale4x.svg',
  'vector_4_threshold180.svg',
  'vector_6_sharpen_threshold180.svg'
];

files.forEach(file => {
  const p = path.join(artifactDir, file);
  if (!fs.existsSync(p)) {
    console.log(`${file} does not exist.`);
    return;
  }
  const content = fs.readFileSync(p, 'utf8');
  const size = fs.statSync(p).size;
  
  // Count path elements
  const pathsCount = (content.match(/<path/g) || []).length;
  // Count total path command characters (M, C, L, Z etc.)
  const commandsCount = (content.match(/[MCScz]/g) || []).length;
  
  console.log(`File: ${file}`);
  console.log(`  Size: ${(size / 1024).toFixed(2)} KB`);
  console.log(`  Paths: ${pathsCount}`);
  console.log(`  Path Commands: ${commandsCount}`);
});
