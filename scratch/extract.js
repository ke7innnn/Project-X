const fs = require('fs');
const readline = require('readline');

async function main() {
  const fileStream = fs.createReadStream('/Users/kevinpimenta/.gemini/antigravity-ide/brain/e884ace4-dcf2-4ec8-9be1-208b34ca61fe/.system_generated/logs/transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const obj = JSON.parse(line);
        if (obj.step_index === 2177) {
          fs.writeFileSync('/Users/kevinpimenta/Desktop/Project X/scratch/extracted_request.txt', obj.content);
          console.log("Successfully wrote extracted request to scratch/extracted_request.txt");
          break;
        }
      } catch (e) {
        // ignore malformed lines
      }
    }
  }
}

main();
