import { fal } from '@fal-ai/client';
import { readFileSync } from 'fs';

fal.config({ credentials: process.env.FAL_KEY });

const refs = [
  { name: 'ref4_single_flat.png',    label: 'REF4_SINGLE_FLAT_URL' },
  { name: 'ref5_corridor_flats.png', label: 'REF5_CORRIDOR_FLATS_URL' },
  { name: 'ref6_full_building.png',  label: 'REF6_FULL_BUILDING_URL' },
];

for (const ref of refs) {
  const buf = readFileSync(`public/references/${ref.name}`);
  const file = new File([buf], ref.name, { type: 'image/png' });
  const url = await fal.storage.upload(file);
  console.log(`${ref.label}="${url}"`);
}
