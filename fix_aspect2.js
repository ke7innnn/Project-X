const fs = require('fs');
const file = 'app/idea-generation/page.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `        let dynamicImageSize = 'square_hd';
        if (aiOpts?.canvasW && aiOpts?.canvasH) {
          const ratio = aiOpts.canvasW / aiOpts.canvasH;
          if (ratio > 1.2) dynamicImageSize = 'landscape_16_9';
          else if (ratio < 0.8) dynamicImageSize = 'portrait_16_9';
        }`;

const replacement = `        let dynamicImageSize = 'square_hd';
        const cDim = advisorRef.current?.getCanvasDimensions();
        const finalW = aiOpts?.canvasW || cDim?.w || 1024;
        const finalH = aiOpts?.canvasH || cDim?.h || 1024;
        
        if (finalW && finalH) {
          const ratio = finalW / finalH;
          if (ratio > 1.2) dynamicImageSize = 'landscape_16_9';
          else if (ratio < 0.8) dynamicImageSize = 'portrait_16_9';
        }`;

code = code.replace(target, replacement);

fs.writeFileSync(file, code);
