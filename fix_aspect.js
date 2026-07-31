const fs = require('fs');
const file = 'app/idea-generation/page.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `        const activePreset = FOOTPRINT_PRESETS.find(f => f.id === footprintShape);
        const imageSize = (aiOpts?.tracerImageBase64 || fallbackBase64) ? 'square_hd' : (activePreset?.recommendedImageSize || 'square_hd');`;

const replacement = `        const activePreset = FOOTPRINT_PRESETS.find(f => f.id === footprintShape);
        
        let dynamicImageSize = 'square_hd';
        if (aiOpts?.canvasW && aiOpts?.canvasH) {
          const ratio = aiOpts.canvasW / aiOpts.canvasH;
          if (ratio > 1.2) dynamicImageSize = 'landscape_16_9';
          else if (ratio < 0.8) dynamicImageSize = 'portrait_16_9';
        }

        const imageSize = (aiOpts?.tracerImageBase64 || fallbackBase64) ? dynamicImageSize : (activePreset?.recommendedImageSize || 'square_hd');`;

code = code.replace(target, replacement);

fs.writeFileSync(file, code);
