const fs = require('fs');
const file = 'app/idea-generation/page.tsx';
let code = fs.readFileSync(file, 'utf8');

const promptStart = `        const promptText = \`Generate a top-down 2D architectural CAD floor plan viewed from above.

BUILDING SPEC:
- \${styleName} residential tower, \${overallWidth}m x \${overallLength}m footprint.`;

const replacePromptStart = `        const promptText = \`Generate a top-down 2D architectural CAD floor plan viewed from above.

BUILDING SPEC:
- Residential tower, \${overallWidth}m x \${overallLength}m footprint.`;

code = code.replace(promptStart, replacePromptStart);

const coreSpecOld = `        // Build optional constraint lines
        const optionalLines: string[] = [];
        if (useVaastu) optionalLines.push('- Vaastu: kitchens SE, master bedrooms SW, entrance NE.');
        if (useFireSafety) optionalLines.push('- Fire safety: two independent escape routes per floor.');
        if (staircases >= 2) optionalLines.push('- Corridors must end in a staircase where possible (dead-end corridor limit).');
        if (customPrompt.trim()) optionalLines.push(\`- Notes: \${customPrompt.trim()}\`);
        const optionalBlock = optionalLines.length > 0 ? optionalLines.join('\\n') : '';
        
        const promptText = \`Generate a top-down 2D architectural CAD floor plan viewed from above.

BUILDING SPEC:
- \${styleName} residential tower, \${overallWidth}m x \${overallLength}m footprint.`;

const replaceCoreSpecOld = `        // Build optional constraint lines
        const optionalLines: string[] = [];
        if (useVaastu) optionalLines.push('- Vaastu: kitchens SE, master bedrooms SW, entrance NE.');
        if (useFireSafety) optionalLines.push('- Fire safety: two independent escape routes per floor.');
        if (staircases >= 2) optionalLines.push('- Corridors must end in a staircase where possible (dead-end corridor limit).');
        if (customPrompt.trim()) optionalLines.push(\`- Notes: \${customPrompt.trim()}\`);
        const optionalBlock = optionalLines.length > 0 ? optionalLines.join('\\n') : '';
        
        const promptText = \`Generate a top-down 2D architectural CAD floor plan viewed from above.

BUILDING SPEC:
- Residential tower, \${overallWidth}m x \${overallLength}m footprint.`;

code = code.replace(coreSpecOld, replaceCoreSpecOld);

fs.writeFileSync(file, code);
