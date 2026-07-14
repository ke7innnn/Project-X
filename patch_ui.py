import re

with open('app/smart-planner/page.tsx', 'r') as f:
    content = f.read()

# Add handleRestartStep1 function before handleGenerate
content = content.replace(
    '  const handleGenerate = async (resume = false) => {',
    '''  const handleRestartStep1 = () => {
    setDebugStep1OutputUrl('');
    setDebugStep1BaseImage('');
    setDebugStep1MaskImage('');
    setDebugStep2TraceImage('');
    setDebugStep15Schematic('');
    setDebugStep35Prompt('');
    setDebugStep4OutputUrl('');
    handleGenerate();
  };

  const handleGenerate = async (resume = false) => {'''
)

ui_buttons = """                {!generatedImageUrl && (
                  <div className="flex flex-col gap-2 w-full mt-4">
                    <button
                      onClick={() => handleGenerate()}
                      disabled={isGeneratingImage}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-widest bg-purple-600 border border-purple-400 text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-lg shadow-purple-900/30 transition-all animate-pulse"
                    >
                      {isGeneratingImage ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          Generating Floor Plan Image...
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} />
                          Approve & Generate Floor Plan
                        </>
                      )}
                    </button>
                    {(generationError || debugStep1OutputUrl) && !isGeneratingImage && (
                      <button
                        onClick={() => handleGenerate(true)}
                        disabled={isGeneratingImage}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest bg-yellow-600 border border-yellow-400 text-white hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-lg shadow-yellow-900/30 transition-all"
                      >
                        Resume from Failure
                      </button>
                    )}
                    {debugStep1OutputUrl && !isGeneratingImage && (
                      <button
                        onClick={handleRestartStep1}
                        disabled={isGeneratingImage}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest bg-red-600 border border-red-400 text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-lg shadow-red-900/30 transition-all"
                      >
                        Restart from Step 1
                      </button>
                    )}
                  </div>
                )}"""

content = re.sub(
    r'                \{\!generatedImageUrl && \(\n                  <button\n                    onClick=\{.*?Approve & Generate Floor Plan\n                      </>\n                    \)\}\n                  </button>\n                \)\}',
    ui_buttons,
    content,
    flags=re.DOTALL
)

with open('app/smart-planner/page.tsx', 'w') as f:
    f.write(content)
