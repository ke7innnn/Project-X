import { fal } from '@fal-ai/client';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

fal.config({ credentials: process.env.FAL_KEY });

const refs = [
  { name: 'ref1_multiflat.png',  label: 'REF1_MULTIFLAT_URL' },
  { name: 'ref2_symbols.png',    label: 'REF2_SYMBOLS_URL' },
  { name: 'ref3_indian3bhk.png', label: 'REF3_INDIAN3BHK_URL' },
];

for (const ref of refs) {
  const buf = readFileSync(join(__dirname, '../public/references', ref.name));
  const file = new File([buf], ref.name, { type: 'image/png' });
  const url = await fal.storage.upload(file);
  console.log(`${ref.label}="${url}"`);
}
