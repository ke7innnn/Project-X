const apiId = 'vkc2p2fj5fxgayd';
const apiSecret = '95ilkohubjk43q1g8qnr0heqhnsqia1norbgh3lmgvl39j3l74t3';
const basicAuth = 'Basic ' + Buffer.from(`${apiId}:${apiSecret}`).toString('base64');

async function check() {
  console.log('Testing Vectorizer.ai API credentials...');
  try {
    // We send an empty request or a dummy file to see if we get a 401 Unauthorized or 402 Payment Required or 429 Rate Limit
    const res = await fetch('https://api.vectorizer.ai/api/v1/vectorize', {
      method: 'POST',
      headers: { Authorization: basicAuth }
    });
    console.log('HTTP Status:', res.status);
    console.log('Response headers:', Object.fromEntries(res.headers.entries()));
    const text = await res.text();
    console.log('Response body:', text);
  } catch (err) {
    console.error('Network/request error:', err);
  }
}

check();
