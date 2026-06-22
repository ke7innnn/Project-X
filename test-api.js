async function test() {
  console.log("Calling API...");
  try {
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
        customImageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        customImageDescription: "Palm tree"
      })
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch(e) {
    console.log("Error:", e);
  }
}
test();
