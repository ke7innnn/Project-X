const fs = require('fs');

async function test() {
  console.log("Calling API...");
  try {
    // Generate a massive string to simulate 3MB image
    const largeBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=".repeat(50000); // ~4MB

    const res = await fetch('http://localhost:3000/api/generate-floorplan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collectedParameters: {
          plotWidth: 100,
          plotHeight: 70,
          orientation: "North",
          rooms: ["2BHK"],
          vastuRules: ["northeast entrance", "southeast kitchen"],
          aspectRatio: "16:9"
        },
        customImageBase64: largeBase64,
        customImageDescription: "Palm tree"
      })
    });
    console.log("Status:", res.status);
    if (!res.ok) {
       const text = await res.text();
       console.log("Error text:", text);
    } else {
       console.log("Success");
    }
  } catch(e) {
    console.log("Network Error:", e.message);
  }
}
test();
