import { ConversationMessage } from '@/types';
import LoadingIndicator from './LoadingIndicator';
import ParametersSummary from './ParametersSummary';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';

interface ChatMessageProps {
  message: ConversationMessage;
  isCustomType?: 'image-grid' | 'parameters-summary' | 'download-button' | 'upload-prompt' | 'loading' | 'selected-image' | 'floorplan-drafts' | 'floorplan-edit' | 'uploaded-image';
  customData?: any;
}

export default function ChatMessage({ message, isCustomType, customData }: ChatMessageProps) {
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
          customImageDescription: store.lastUploadedImageDescription
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
          className="flex items-center gap-2 bg-[#FFB000] hover:bg-[#D8B78D] text-black font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
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

  if (isCustomType === 'uploaded-image') {
    const imgData = message.customData || customData;
    if (!imgData) return null;
    
    if (!imgData.base64) {
      return (
        <div className="flex justify-start my-4 w-full">
          <div className="bg-[#0A0E1A] border border-gray-800 rounded-xl p-4 shadow-xl max-w-[85%] w-full">
             <span className="text-[10px] text-[#FFB000] tracking-wider uppercase font-bold mb-2 block">🖼️ Uploaded Design Reference</span>
             <p className="text-xs text-white font-semibold">{imgData.description || 'Custom reference image'}</p>
             <p className="text-[10px] text-gray-500 mt-2 italic">[Image data removed from archive to optimize storage limit]</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-start my-4 w-full">
        <div className="bg-[#0A0E1A] border border-gray-800 rounded-xl overflow-hidden shadow-xl max-w-[85%] w-full">
          <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-[#0d0d15]">
            <span className="text-[10px] text-[#FFB000] tracking-wider uppercase font-bold">🖼️ Uploaded Design Reference</span>
          </div>
          <img 
            src={`data:image/jpeg;base64,${imgData.base64}`} 
            alt={imgData.description || 'Reference Image'}
            className="w-full max-h-60 object-contain bg-neutral-900"
          />
          <div className="p-3 bg-[#0a0a0f]/60 backdrop-blur">
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
        <div className="bg-[#0A0E1A] border border-gray-800 rounded-xl overflow-hidden shadow-xl max-w-[85%] w-full">
          <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-[#0d0d15]">
            <span className="text-[10px] text-[#FFB000] tracking-wider uppercase font-bold">🌿 Selected Nature Reference</span>
          </div>
          <img 
            src={img.url || img.thumbUrl} 
            alt={img.description}
            className="w-full max-h-48 object-cover"
          />
          <div className="p-3 bg-[#0a0a0f]/60 backdrop-blur">
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
      <div className="flex justify-start my-4 w-full font-mono">
        <div className="bg-[#0A0E1A] border border-gray-800 rounded-xl overflow-hidden shadow-xl w-full">
          <div className="p-3 border-b border-gray-800 bg-[#0d0d15]">
            <span className="text-[10px] text-[#FFB000] tracking-wider uppercase font-bold">📐 Generated Concept Layouts</span>
          </div>
          <div className="grid grid-cols-2 gap-3 p-3 bg-[#0a0a0f]/40">
            {options.map((optUrl, idx) => {
              const isActive = currentFloorPlan === optUrl;
              return (
                <div key={idx} className={`relative rounded-lg overflow-hidden border ${isActive ? 'border-[#FFB000]' : 'border-gray-800 bg-white/5'}`}>
                  <img 
                    src={`data:image/jpeg;base64,${optUrl}`} 
                    alt={`Option ${idx + 1}`} 
                    className="w-full aspect-square object-contain bg-white"
                  />
                  <div className="p-2 flex flex-col gap-1.5 bg-[#0a0a0f]/90 border-t border-gray-800">
                    <button
                      onClick={() => {
                        setSelectedOption(idx, optUrl);
                        setPhase('measure');
                      }}
                      className={`w-full py-1 text-[10px] uppercase font-bold tracking-wider rounded transition-colors ${
                        isActive 
                          ? 'bg-[#FFB000] text-black' 
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
          <div className="p-3 border-t border-gray-800 bg-[#0d0d15] flex flex-col gap-2">
            {/* Enter Edit Section — only visible once one option is selected */}
            {hasSelection && (
              <button
                onClick={() => {
                  setPhase('edit');
                }}
                className="w-full py-2.5 bg-[#FFB000] hover:bg-[#e6a000] text-black text-[11px] uppercase font-black tracking-widest rounded transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,176,0,0.3)] hover:shadow-[0_0_30px_rgba(255,176,0,0.5)] cursor-pointer"
              >
                ✏️ Enter Edit Section
              </button>
            )}
            <button
              onClick={handleGenerateMore}
              disabled={isLoading}
              className="w-full py-2 bg-transparent hover:bg-[#FFB000]/10 border border-[#FFB000]/40 hover:border-[#FFB000] text-[#FFB000] hover:text-white text-[10px] uppercase font-bold tracking-widest rounded transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer font-mono"
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
      <div className="flex justify-start my-4 w-full font-mono">
        <div className="bg-[#0A0E1A] border border-gray-800 rounded-xl overflow-hidden shadow-xl max-w-[85%] w-full">
          <div className="p-3 border-b border-gray-800 bg-[#0d0d15]">
            <span className="text-[10px] text-cyan-400 tracking-wider uppercase font-bold">✏️ Floor Plan Modification</span>
          </div>
          <div className="p-3 bg-[#0a0a0f]/40 flex flex-col gap-3">
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
              className={`w-full py-1.5 text-[10px] uppercase font-bold tracking-wider rounded transition-colors ${
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
            ? 'bg-[#FFB000] text-black rounded-tr-sm' 
            : 'glass text-gray-200 rounded-tl-sm'
        }`}
      >
        <div className="whitespace-pre-wrap">{text}</div>
      </div>
    </div>
  );
}
