async function run() {
  const fs = await import('fs');
  const dummyImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  try {
    console.log("Calling localhost API...");
    const res = await fetch('http://localhost:3000/api/edit-floorplan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentFloorPlanBase64: dummyImage,
        editInstruction: "Test",
        collectedParameters: {},
        isInpaint: false,
        skipTranslation: true
      })
    });
    console.log("Status:", res.status);
    const data = await res.text();
    console.log("Response:", data.substring(0, 500));
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
