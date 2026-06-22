const fs = require('fs');
const readline = require('readline');

async function main() {
  const fileStream = fs.createReadStream('/Users/kevinpimenta/.gemini/antigravity-ide/brain/e884ace4-dcf2-4ec8-9be1-208b34ca61fe/.system_generated/logs/transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let index = 0;
  for await (const line of rl) {
    if (line.includes('MAIN MENU') || line.includes('System Interface') || line.includes('arkham-skew')) {
      console.log(`Match at line ${index}: ${line.substring(0, 500)}...`);
      fs.writeFileSync(`/Users/kevinpimenta/Desktop/Project X/scratch/match_${index}.txt`, line);
    }
    index++;
  }
  console.log("Done searching.");
}

main();
