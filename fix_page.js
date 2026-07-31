const fs = require('fs');
const file = 'app/idea-generation/page.tsx';
let code = fs.readFileSync(file, 'utf8');

const importTarget = `import ArchitectAdvisorPanel from '@/components/ArchitectAdvisorPanel';`;
const replaceImportTarget = `import ArchitectAdvisorPanel, { ArchitectAdvisorRef } from '@/components/ArchitectAdvisorPanel';`;
code = code.replace(importTarget, replaceImportTarget);

const refDef = `  const [staircases, setStaircases] = useState(2);`;
const replaceRefDef = `  const [staircases, setStaircases] = useState(2);
  const advisorRef = useRef<ArchitectAdvisorRef>(null);`;
code = code.replace(refDef, replaceRefDef);

const handleGenStart = `  const handleGenerate = async (e?: React.FormEvent, aiOpts?: { tracerImageBase64?: string; canvasW?: number; canvasH?: number }) => {
    if (e) e.preventDefault();`;
const replaceHandleGenStart = `  const handleGenerate = async (e?: React.FormEvent, aiOpts?: { tracerImageBase64?: string; canvasW?: number; canvasH?: number }) => {
    if (e) e.preventDefault();
    const fallbackBase64 = advisorRef.current?.exportCanvasBase64() || undefined;`;
code = code.replace(handleGenStart, replaceHandleGenStart);

const debugPayloadTarget = `        setDebugPayload({
          prompt: promptText,
          imageBase64: aiOpts?.tracerImageBase64
        });`;
const replaceDebugPayloadTarget = `        setDebugPayload({
          prompt: promptText,
          imageBase64: aiOpts?.tracerImageBase64 || fallbackBase64
        });`;
code = code.replace(debugPayloadTarget, replaceDebugPayloadTarget);

const generatePayloadTarget = `            inputImageBase64: aiOpts?.tracerImageBase64,`;
const replaceGeneratePayloadTarget = `            inputImageBase64: aiOpts?.tracerImageBase64 || fallbackBase64,`;
code = code.replace(generatePayloadTarget, replaceGeneratePayloadTarget);

const panelTarget = `<ArchitectAdvisorPanel
              onParamsApplied={handleParamsApplied}
              onGenerateTrigger={handleGenerateTrigger}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />`;
const replacePanelTarget = `<ArchitectAdvisorPanel
              ref={advisorRef}
              onParamsApplied={handleParamsApplied}
              onGenerateTrigger={handleGenerateTrigger}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />`;
code = code.replace(panelTarget, replacePanelTarget);

fs.writeFileSync(file, code);
