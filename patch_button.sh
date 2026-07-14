#!/bin/bash
sed -i '' '/const getButtonText = () => {/i\
  const handleRestartStep1 = () => {\
    setDebugStep1OutputUrl('"''"');\
    setDebugStep1BaseImage('"''"');\
    setDebugStep1MaskImage('"''"');\
    setDebugStep2TraceImage('"''"');\
    setDebugStep1Prompt('"''"');\
    setDebugStep2SystemPrompt('"''"');\
    setDebugStep2UserPrompt('"''"');\
    generateFloorPlanImage(roomSchedule!);\
  };\
' app/smart-planner/page.tsx

sed -i '' '/Resume from Failure/a\
                    </button>\
                  )}\
                  {debugStep1OutputUrl && !isGeneratingImage && (\
                    <button\
                      onClick={handleRestartStep1}\
                      disabled={isGeneratingImage}\
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest bg-red-600 border border-red-400 text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-lg shadow-red-900/30 transition-all"\
                    >\
                      <RefreshCw size={13} />\
                      Restart from Step 1\
' app/smart-planner/page.tsx
