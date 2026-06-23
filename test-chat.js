const fetch = require('node-fetch');

async function test() {
  const res = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: "hello",
      conversationHistory: [],
      collectedParameters: {},
      phase: "concept"
    })
  });
  console.log(res.status);
  console.log(await res.text());
}
test();
