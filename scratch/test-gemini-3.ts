import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

// Manually extract key from .env.local
const envFile = fs.readFileSync('.env.local', 'utf-8');
const keyLine = envFile.split('\n').find(line => line.startsWith('GEMINI_API_KEY='));
const apiKey = keyLine ? keyLine.split('=')[1].replace(/"/g, '').trim() : '';

const genAI = new GoogleGenerativeAI(apiKey);

async function main() {
  console.log("Testing gemini-3.1-pro-preview with key:", apiKey ? "FOUND (Starts with " + apiKey.substring(0, 5) + "...)" : "MISSING");
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });
    
    // Test with simple text first
    const result = await model.generateContent("Hello, are you Gemini 3.1 Pro? Respond with yes/no and your name.");
    console.log("SUCCESS:", result.response.text());
  } catch (e: any) {
    console.error("ERROR:", e.message || e);
  }
}

main();
