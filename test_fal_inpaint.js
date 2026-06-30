const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) {
    console.error("NO FAL KEY"); return;
  }
  
  // Create dummy image and mask data uris (1x1 transparent pngs for testing if endpoint exists)
  const image_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const mask_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

  const body = {
    prompt: "a cat",
    image_url: image_url,
    mask_url: mask_url
  };

  const res = await fetch('https://fal.run/fal-ai/flux-pro/v1/fill', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await res.text();
  console.log(res.status, data);
}

run();
