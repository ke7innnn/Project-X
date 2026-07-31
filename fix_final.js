const fs = require('fs');
const file = 'app/idea-generation/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// Fix 1: coreSpecLine -> coreSpecStr
code = code.replace(/\$\{coreSpecLine\}/g, '\\${coreSpecStr}');

// Fix 2: Add styleName back because it's used elsewhere for the UI
const addStyleNameTarget = `      const isShapeModified = aiOpts?.isShapeModified || advisorRef.current?.getShapeModifiedState() || false;`;

const addStyleNameReplacement = `      const isShapeModified = aiOpts?.isShapeModified || advisorRef.current?.getShapeModifiedState() || false;
      const styleName = isShapeModified
        ? "CUSTOM GEOMETRIC"
        : footprintShape === 'custom'
          ? customFootprintText.trim().toUpperCase()
          : (FOOTPRINT_PRESETS.find(f => f.id === footprintShape)?.name || 'X-SHAPE');`;

if (!code.includes('const styleName =')) {
    code = code.replace(addStyleNameTarget, addStyleNameReplacement);
}

fs.writeFileSync(file, code);
