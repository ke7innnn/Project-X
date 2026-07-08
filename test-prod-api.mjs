async function run() {
  const dummyImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  try {
    console.log("Calling production API with translation enabled...");
    const res = await fetch('https://project-x-mu-eight.vercel.app/api/edit-floorplan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentFloorPlanBase64: dummyImage,
        editInstruction: "MERGE THE NOOK AND THE KITCHEN INTO A SINGLE LARGE MODERN KITCHEN SPACE, AND REPLACE THE PATIO WITH A GLASS GREENHOUSE.",
        collectedParameters: {},
        isInpaint: false,
        skipTranslation: false
      })
    });
    console.log("Status:", res.status);
    const data = await res.text();
    console.log("Response:", data);
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
