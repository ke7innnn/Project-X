import { ConversationMessage } from '@/types';
import LoadingIndicator from './LoadingIndicator';
import ParametersSummary from './ParametersSummary';
import React, { useState } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { Download, Upload, Library, Type, PenTool, Map } from 'lucide-react';

interface ChatMessageProps {
  message: ConversationMessage;
  isCustomType?: 'image-grid' | 'parameters-summary' | 'download-button' | 'upload-prompt' | 'loading' | 'selected-image' | 'floorplan-drafts' | 'floorplan-edit' | 'uploaded-image' | 'onboarding-options' | 'plot-trace-options' | 'plot-draw-canvas';
  customData?: any;
}

const ChatMessage = React.memo(function ChatMessage({ message, isCustomType, customData }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const text = message.parts[0]?.text || '';
  const [isDownloading, setIsDownloading] = useState(false);

  const currentFloorPlan = useArchitectStore(state => state.currentFloorPlan);
  const setSelectedOption = useArchitectStore(state => state.setSelectedOption);
  const setCurrentFloorPlan = useArchitectStore(state => state.setCurrentFloorPlan);
  const setPhase = useArchitectStore(state => state.setPhase);
  const isLoading = useArchitectStore(state => state.isLoading);

  const handleGenerateMore = async () => {
    const store = useArchitectStore.getState();
    store.setIsLoading(true);
    store.setLoadingMessage('Generating more floor plans...');
    store.setSelectedOption(null as any, null as any);
    store.setPhase('generate');

    try {
      // Add a user-like message to show they requested more designs
      store.addMessage({
        role: 'user',
        parts: [{ text: "Generate more designs" }]
      });

      const genRes = await fetch('/api/generate-floorplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          collectedParameters: store.collectedParameters,
          natureImageUrl: store.selectedNatureImage?.url || store.selectedNatureImage?.thumbUrl,
          natureImageDescription: store.selectedNatureImage?.description,
          customImageBase64: store.lastUploadedImage,
          customImageDescription: store.lastUploadedImageDescription,
          manualPlotImage: store.manualPlotImage
        })
      });
      const genData = await genRes.json();
      
      if (genData.options && genData.options.length > 0) {
        store.setGeneratedOptions(genData.options);
        
        store.addMessage({
          role: 'model',
          parts: [{ text: "Here are the new generated concept layouts based on your design requirements:" }],
          customType: 'floorplan-drafts',
          customData: { options: genData.options }
        });
      } else {
        console.error("Floor plan generation failed:", genData);
        store.addMessage({ role: 'model', parts: [{ text: "I hit a snag generating the images. Let's try again." }] });
      }
    } catch (e) {
      console.error("Floor plan generation failed:", e);
      store.addMessage({ role: 'model', parts: [{ text: "Generation encountered an error." }] });
    } finally {
      store.setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const { roomDimensions, roomLabels, collectedParameters } = useArchitectStore.getState();
      const res = await fetch('/api/export-dwg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomDimensions, roomLabels, collectedParameters })
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'floorplan.dxf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Failed to download DXF file. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (isCustomType === 'loading') {
    return (
      <div className="flex justify-start my-4">
        <LoadingIndicator />
      </div>
    );
  }

  if (isCustomType === 'parameters-summary') {
    return (
      <div className="flex justify-start my-4 w-full">
        <ParametersSummary />
      </div>
    );
  }

  if (isCustomType === 'image-grid') {
    // Expect customData to contain the ImageGrid element
    return (
      <div className="flex justify-start my-4 w-full">
        {customData}
      </div>
    );
  }

  if (isCustomType === 'download-button') {
    return (
      <div className="flex justify-start my-4">
        <button 
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 border border-blue-400 text-white font-semibold py-2 px-4 rounded-lg hover:from-blue-500 hover:to-cyan-500 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Download size={18} />
          {isDownloading ? 'Downloading...' : text}
        </button>
      </div>
    );
  }

  if (isCustomType === 'upload-prompt') {
    // Treated as a system message
    return (
      <div className="flex justify-start my-4">
        <div className="bg-blue-900/40 border border-blue-500/50 text-blue-100 p-3 rounded-xl max-w-[90%] text-sm">
          {text}
        </div>
      </div>
    );
  }

  if (isCustomType === 'plot-trace-options') {
    return (
      <div className="flex flex-col gap-2 w-full my-4">
        <p className="text-gray-300 text-sm mb-2">How would you like to define your plot boundary?</p>
        <button 
          onClick={() => {
            useArchitectStore.getState().setOnboardingMode('trace-manual');
            useArchitectStore.getState().addMessage({ role: 'user', parts: [{ text: "I want to trace my plot manually." }]});
            useArchitectStore.getState().addMessage({ role: 'model', parts: [{ text: "Let's draw! Use the CAD tools below to trace your plot boundary. When you're done, we'll continue with the setup." }], customType: 'plot-draw-canvas' });
          }}
          className="flex items-center gap-3 bg-black/30 hover:bg-blue-900/10 border border-blue-900/35 text-white p-3 rounded-lg transition-colors text-left glass-card cursor-pointer"
        >
          <div className="bg-[#02050c] p-2 rounded border border-blue-900/20"><PenTool size={16} className="text-blue-300" /></div>
          <div>
            <div className="font-semibold text-sm">Trace Plot Manually</div>
            <div className="text-xs text-gray-500">Use drawing tools to sketch your exact boundary</div>
          </div>
        </button>
        
        <button 
          onClick={() => {
            useArchitectStore.getState().addMessage({ role: 'user', parts: [{ text: "I want to use a reference image or text prompt." }]});
            useArchitectStore.getState().addMessage({ role: 'model', parts: [{ text: "Understood. How would you like to provide the reference shape for your floor plan?" }], customType: 'onboarding-options' });
          }}
          className="flex items-center gap-3 bg-black/30 hover:bg-blue-900/10 border border-blue-900/35 text-white p-3 rounded-lg transition-colors text-left glass-card cursor-pointer"
        >
          <div className="bg-[#02050c] p-2 rounded border border-blue-900/20"><Map size={16} className="text-blue-300" /></div>
          <div>
            <div className="font-semibold text-sm">Use Reference Image / Text</div>
            <div className="text-xs text-gray-500">Upload a photo, search library, or use a text prompt</div>
          </div>
        </button>
      </div>
    );
  }

  if (isCustomType === 'plot-draw-canvas') {
    return (
      <div className="flex justify-start my-4 w-full">
        <div className="bg-blue-900/40 border border-blue-500/50 text-blue-100 p-3 rounded-xl max-w-[90%] text-sm">
          Please use the drawing tools on the right side of the screen to trace your plot boundary. Click &quot;Done Tracing&quot; when you are finished.
        </div>
      </div>
    );
  }

  if (isCustomType === 'onboarding-options') {
    return (
      <div className="flex flex-col gap-2 w-full my-4">
        <p className="text-gray-300 text-sm mb-2">Please select one of the options below to begin:</p>
        <button 
          onClick={() => {
            useArchitectStore.getState().setOnboardingMode('upload');
            useArchitectStore.getState().addMessage({ role: 'user', parts: [{ text: "I want to upload my own reference image." }]});
            useArchitectStore.getState().addMessage({ role: 'model', parts: [{ text: "Great! Please use the attachment (📎) icon below to upload your image or sketch." }]});
          }}
          className="flex items-center gap-3 bg-black/30 hover:bg-blue-900/10 border border-blue-900/35 text-white p-3 rounded-lg transition-colors text-left glass-card cursor-pointer"
        >
          <div className="bg-[#02050c] p-2 rounded border border-blue-900/20"><Upload size={16} className="text-blue-300" /></div>
          <div>
            <div className="font-semibold text-sm">Upload Reference Image</div>
            <div className="text-xs text-gray-500">Upload your own photo or hand-drawn sketch</div>
          </div>
        </button>
        
        <button 
          onClick={() => {
            useArchitectStore.getState().setOnboardingMode('library');
            useArchitectStore.getState().addMessage({ role: 'user', parts: [{ text: "I want to search the App Library." }]});
            useArchitectStore.getState().addMessage({ role: 'model', parts: [{ text: "Awesome! What kind of nature reference are you looking for? (e.g. coral, leaf, honeycomb)" }]});
          }}
          className="flex items-center gap-3 bg-black/30 hover:bg-blue-900/10 border border-blue-900/35 text-white p-3 rounded-lg transition-colors text-left glass-card cursor-pointer"
        >
          <div className="bg-[#02050c] p-2 rounded border border-blue-900/20"><Library size={16} className="text-blue-300" /></div>
          <div>
            <div className="font-semibold text-sm">Search App Library</div>
            <div className="text-xs text-gray-500">Find nature-inspired shapes in our Pexels library</div>
          </div>
        </button>

        <button 
          onClick={() => {
            useArchitectStore.getState().setOnboardingMode('text');
            useArchitectStore.getState().addMessage({ role: 'user', parts: [{ text: "I just want to type a text prompt." }]});
            useArchitectStore.getState().addMessage({ role: 'model', parts: [{ text: "Perfect! Please describe the shape you want for your floor plan (e.g. 'L-shaped', 'clove shaped leaves', 'conch shell')." }]});
          }}
          className="flex items-center gap-3 bg-black/30 hover:bg-blue-900/10 border border-blue-900/35 text-white p-3 rounded-lg transition-colors text-left glass-card cursor-pointer"
        >
          <div className="bg-[#02050c] p-2 rounded border border-blue-900/20"><Type size={16} className="text-blue-300" /></div>
          <div>
            <div className="font-semibold text-sm">Text Prompt Only</div>
            <div className="text-xs text-gray-500">Describe the shape using text only</div>
          </div>
        </button>
      </div>
    );
  }

  if (isCustomType === 'uploaded-image') {
    const imgData = message.customData || customData;
    if (!imgData) return null;
    
    if (!imgData.base64) {
      return (
        <div className="flex justify-start my-4 w-full">
          <div className="bg-[#02050c]/85 border border-blue-900/35 rounded-xl p-4 shadow-xl max-w-[85%] w-full glass-card">
             <span className="text-[10px] text-blue-300 tracking-wider uppercase font-bold mb-2 block">🖼️ Uploaded Design Reference</span>
             <p className="text-xs text-white font-semibold">{imgData.description || 'Custom reference image'}</p>
             <p className="text-[10px] text-gray-500 mt-2 italic">[Image data removed from archive to optimize storage limit]</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-start my-4 w-full">
        <div className="bg-[#02050c]/85 border border-blue-900/35 rounded-xl overflow-hidden shadow-xl max-w-[85%] w-full glass-card">
          <div className="p-3 border-b border-blue-900/25 flex justify-between items-center bg-black/45">
            <span className="text-[10px] text-blue-300 tracking-wider uppercase font-bold">🖼️ Uploaded Design Reference</span>
          </div>
          <img 
            src={`data:image/jpeg;base64,${imgData.base64}`} 
            alt={imgData.description || 'Reference Image'}
            className="w-full max-h-60 object-contain bg-neutral-900"
          />
          <div className="p-3 bg-black/40 backdrop-blur">
            <p className="text-xs text-white font-semibold">{imgData.description || 'Custom reference image'}</p>
          </div>
        </div>
      </div>
    );
  }

  if (isCustomType === 'selected-image') {
    const img = message.customData || customData;
    if (!img) return null;
    return (
      <div className="flex justify-start my-4 w-full">
        <div className="bg-[#02050c]/85 border border-blue-900/35 rounded-xl overflow-hidden shadow-xl max-w-[85%] w-full glass-card">
          <div className="p-3 border-b border-blue-900/25 flex justify-between items-center bg-black/45">
            <span className="text-[10px] text-blue-300 tracking-wider uppercase font-bold">🌿 Selected Nature Reference</span>
          </div>
          <img 
            src={img.url || img.thumbUrl} 
            alt={img.description}
            className="w-full max-h-48 object-cover"
          />
          <div className="p-3 bg-black/40 backdrop-blur">
            <p className="text-xs text-white font-semibold truncate">{img.description}</p>
            <p className="text-[10px] text-gray-500 mt-1">Photo by {img.photographer || 'Unsplash'}</p>
          </div>
        </div>
      </div>
    );
  }

  if (isCustomType === 'floorplan-drafts') {
    const options = (message.customData?.options || customData?.options) as string[] | undefined;
    if (!options || options.length === 0) {
      return (
        <div className={`flex justify-start my-4`}>
          <div className="max-w-[85%] rounded-2xl p-3 text-sm glass text-gray-200 rounded-tl-sm">
            <div className="whitespace-pre-wrap">{text}</div>
            <div className="text-[10px] text-gray-500 mt-2 italic">[Archived draft images have been removed to optimize database storage. Generate new ones to view!]</div>
          </div>
        </div>
      );
    }

    // Check if any option in this particular message is currently the active floor plan
    const selectedIndex = options.findIndex(opt => opt === currentFloorPlan);
    const hasSelection = selectedIndex !== -1;

    return (
      <div className="flex justify-start my-4 w-full font-sans">
        <div className="bg-[#02050c]/85 border border-blue-900/35 rounded-xl overflow-hidden shadow-xl w-full glass-panel">
          <div className="p-3 border-b border-blue-900/25 bg-black/45">
            <span className="text-[10px] text-blue-300 tracking-wider uppercase font-bold">📐 Generated Concept Layouts</span>
          </div>
          <div className="grid grid-cols-2 gap-3 p-3 bg-[#02050c]/40">
            {options.map((optUrl, idx) => {
              const isActive = currentFloorPlan === optUrl;
              return (
                <div key={idx} className={`relative rounded-lg overflow-hidden border ${isActive ? 'border-blue-500 shadow-[0_0_12px_rgba(14,165,233,0.3)]' : 'border-blue-900/25 bg-white/5'}`}>
                  <img 
                    src={`data:image/jpeg;base64,${optUrl}`} 
                    alt={`Option ${idx + 1}`} 
                    className="w-full aspect-square object-contain bg-white"
                  />
                  <div className="p-2 flex flex-col gap-1.5 bg-black/90 border-t border-blue-900/25">
                    <button
                      onClick={() => {
                        setSelectedOption(idx, optUrl);
                        setPhase('measure');
                      }}
                      className={`w-full py-1 text-[10px] uppercase font-bold tracking-wider rounded transition-colors cursor-pointer ${
                        isActive 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-transparent border border-gray-700 text-gray-400 hover:text-white hover:border-white'
                      }`}
                    >
                      {isActive ? 'Active Option ✓' : `Select Option ${idx + 1}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom action buttons */}
          <div className="p-3 border-t border-blue-900/25 bg-black/45 flex flex-col gap-2">
            {/* Enter Edit Section — only visible once one option is selected */}
            {hasSelection && (
              <button
                onClick={() => {
                  setPhase('edit');
                }}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 border border-blue-400 text-white text-[11px] uppercase font-black tracking-widest rounded transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(14,165,233,0.3)] hover:shadow-[0_0_30px_rgba(14,165,233,0.5)] cursor-pointer"
              >
                ✏️ Enter Edit Section
              </button>
            )}
            <button
              onClick={handleGenerateMore}
              disabled={isLoading}
              className="w-full py-2 bg-transparent hover:bg-blue-950/20 border border-blue-500/40 hover:border-blue-500 text-blue-400 hover:text-white text-[10px] uppercase font-bold tracking-widest rounded transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer font-sans"
            >
              🔄 Generate More Options
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isCustomType === 'floorplan-edit') {
    const editPlan = message.customData?.editedFloorPlan || customData?.editedFloorPlan;
    const instruction = message.customData?.instruction || customData?.instruction || 'Edit';
    if (!editPlan) {
      return (
        <div className={`flex justify-start my-4`}>
          <div className="max-w-[85%] rounded-2xl p-3 text-sm glass text-gray-200 rounded-tl-sm">
            <div className="whitespace-pre-wrap">{text}</div>
            <div className="text-[10px] text-gray-400 mt-2">Instruction: "{instruction}"</div>
            <div className="text-[10px] text-gray-500 mt-1 italic">[Archived edit image removed to optimize storage]</div>
          </div>
        </div>
      );
    }

    const isActive = currentFloorPlan === editPlan;

    return (
      <div className="flex justify-start my-4 w-full font-sans">
        <div className="bg-[#02050c]/85 border border-blue-900/35 rounded-xl overflow-hidden shadow-xl max-w-[85%] w-full glass-card">
          <div className="p-3 border-b border-blue-900/25 bg-black/45">
            <span className="text-[10px] text-cyan-400 tracking-wider uppercase font-bold">✏️ Floor Plan Modification</span>
          </div>
          <div className="p-3 bg-black/40 flex flex-col gap-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider leading-relaxed">
              Instruction: <span className="text-white">"{instruction}"</span>
            </p>
            <div className={`relative rounded-lg overflow-hidden border ${isActive ? 'border-cyan-400' : 'border-gray-800 bg-white/5'}`}>
              <img 
                src={`data:image/jpeg;base64,${editPlan}`} 
                alt="Edited Floor Plan" 
                className="w-full aspect-square object-contain bg-white"
              />
            </div>
            <button
              onClick={() => {
                setCurrentFloorPlan(editPlan);
                setPhase('edit');
              }}
              className={`w-full py-1.5 text-[10px] uppercase font-bold tracking-wider rounded transition-colors cursor-pointer ${
                isActive 
                  ? 'bg-cyan-500 text-black' 
                  : 'bg-transparent border border-gray-700 text-cyan-400 hover:text-cyan-300 hover:border-cyan-500'
              }`}
            >
              {isActive ? 'Active Plan ✓' : 'Restore as Active'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-4`}>
      <div 
        className={`max-w-[85%] rounded-2xl p-3 text-sm ${
          isUser 
            ? 'bg-blue-600 text-white rounded-tr-sm shadow-md' 
            : 'glass text-gray-200 rounded-tl-sm border border-blue-900/25 shadow-lg bg-black/25'
        }`}
      >
        <div className="whitespace-pre-wrap">{text}</div>
      </div>
    </div>
  );
});

export default ChatMessage;
