const fs = require('fs');
const file = 'app/idea-generation/page.tsx';
let code = fs.readFileSync(file, 'utf8');

const handleGenSig = `  const handleGenerate = async (e?: React.FormEvent, aiOpts?: { tracerImageBase64?: string; canvasW?: number; canvasH?: number }) => {`;
const replaceHandleGenSig = `  const handleGenerate = async (e?: React.FormEvent, aiOpts?: { tracerImageBase64?: string; canvasW?: number; canvasH?: number; isShapeModified?: boolean }) => {`;
code = code.replace(handleGenSig, replaceHandleGenSig);

const styleNameTarget = `      const styleName = footprintShape === 'custom'
        ? customFootprintText.trim().toUpperCase()
        : (FOOTPRINT_PRESETS.find(f => f.id === footprintShape)?.name || 'X-SHAPE');`;

const replaceStyleNameTarget = `      const isShapeModified = aiOpts?.isShapeModified || advisorRef.current?.getShapeModifiedState() || false;
      const styleName = isShapeModified
        ? "CUSTOM GEOMETRIC"
        : footprintShape === 'custom'
          ? customFootprintText.trim().toUpperCase()
          : (FOOTPRINT_PRESETS.find(f => f.id === footprintShape)?.name || 'X-SHAPE');`;

code = code.replace(styleNameTarget, replaceStyleNameTarget);

const handleGenTrigTarget = `  const handleGenerateTrigger = useCallback((opts?: { tracerImageBase64?: string; canvasW?: number; canvasH?: number }) => {`;
const replaceHandleGenTrigTarget = `  const handleGenerateTrigger = useCallback((opts?: { tracerImageBase64?: string; canvasW?: number; canvasH?: number; isShapeModified?: boolean }) => {`;
code = code.replace(handleGenTrigTarget, replaceHandleGenTrigTarget);

fs.writeFileSync(file, code);
