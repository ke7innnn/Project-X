const fs = require('fs');
const file = 'components/ArchitectAdvisorPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

const interfaceStr = `interface Props {`;
const replaceInterface = `export interface ArchitectAdvisorRef {
  exportCanvasBase64: () => string | null;
}

interface Props {`;

code = code.replace(interfaceStr, replaceInterface);

const componentDef = `export default function ArchitectAdvisorPanel({ onParamsApplied, onGenerateTrigger, selectedModel, onModelChange }: Props) {`;
const replaceComponentDef = `import { forwardRef, useImperativeHandle } from 'react';

const ArchitectAdvisorPanel = forwardRef<ArchitectAdvisorRef, Props>(({ onParamsApplied, onGenerateTrigger, selectedModel, onModelChange }, ref) => {`;

code = code.replace(componentDef, replaceComponentDef);

const hooksEnd = `  // Draw canvas`;
const replaceHooksEnd = `  useImperativeHandle(ref, () => ({
    exportCanvasBase64: () => exportForAI()
  }));

  // Draw canvas`;

code = code.replace(hooksEnd, replaceHooksEnd);

const exportDef = `// ─── Main Component ───────────────────────────────────────────────────────────
import { forwardRef, useImperativeHandle } from 'react';

const ArchitectAdvisorPanel = forwardRef<ArchitectAdvisorRef, Props>(({ onParamsApplied, onGenerateTrigger, selectedModel, onModelChange }, ref) => {`;

// We just need to add export default ArchitectAdvisorPanel at the end of the file.
const endOfFile = `}
`;
const replaceEndOfFile = `});

export default ArchitectAdvisorPanel;
`;

code = code.substring(0, code.lastIndexOf('}')) + replaceEndOfFile;

fs.writeFileSync(file, code);
