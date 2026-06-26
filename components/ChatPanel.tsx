'use client';

import { useEffect, useRef, useState } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import ImageGrid from './ImageGrid';
import { Loader2 } from 'lucide-react';
import { RenderHistoryItem } from '@/types';

export default function ChatPanel() {
  const { 
    conversationHistory, 
    addMessage, 
    updateHistory,
    phase, 
    setPhase, 
    collectedParameters,
    isLoading,
    setIsLoading,
    finalRender,
    setFinalRender,
    currentFloorPlan,
    selectedStyle,
    sunpath,
    setSunpath,
    customSunpath,
    setCustomSunpath,
    addRenderHistoryItem,
    setViewingHistoryId
  } = useArchitectStore();

  const [isLocalRenderLoading, setIsLocalRenderLoading] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  // Track last edit instruction so we can retry on failure
  const lastEditInstructionRef = useRef<string>('');

  // Welcome message is now initialized directly in the Zustand store to prevent Strict Mode double-firing

  const prevHistoryLengthRef = useRef(conversationHistory.length);

  useEffect(() => {
    if (scrollRef.current) {
      if (conversationHistory.length > prevHistoryLengthRef.current || isLoading) {
        // Small timeout to allow the DOM to update
        setTimeout(() => {
          const lastMessageNode = scrollRef.current?.querySelector('#latest-message');
          if (lastMessageNode) {
            lastMessageNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 100);
        prevHistoryLengthRef.current = conversationHistory.length;
      }
    }
  }, [conversationHistory.length, isLoading]);

  const handleApplySunpathEdit = async () => {
    if (!currentFloorPlan || isLocalRenderLoading) return;
    
    const direction = sunpath === 'custom' ? customSunpath : sunpath;
    if (!direction.trim()) {
      addMessage({ role: 'model', parts: [{ text: "Please specify a custom direction for the sunpath." }] });
      return;
    }

    try {
      setIsLocalRenderLoading(true);
      const res = await fetch('/api/final-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorPlanBase64: currentFloorPlan,
          renderStyle: selectedStyle,
          sunpathDirection: direction,
          collectedParameters
        })
      });
      const data = await res.json();
      if (data.render) {
        const newItem: RenderHistoryItem = {
          id: Math.random().toString(),
          base64: data.render,
          style: selectedStyle,
          sunpath: direction
        };
        addRenderHistoryItem(newItem);
        setViewingHistoryId(newItem.id);
        setFinalRender(data.render);
        addMessage({ 
          role: 'model', 
          parts: [{ text: `Successfully generated a new 3D render using the ${selectedStyle} style and ${direction} sunpath direction.` }] 
        });
      } else {
        addMessage({ role: 'model', parts: [{ text: `Failed to edit sunpath: ${data.error || 'Unknown error'}` }] });
      }
    } catch (err) {
      addMessage({ role: 'model', parts: [{ text: "Network error occurred while updating the sunpath. Please try again." }] });
    } finally {
      setIsLocalRenderLoading(false);
    }
  };

  const handleSend = async (text: string, file?: File | null) => {
    // Prevent double submissions synchronously
    if (useArchitectStore.getState().isLoading) return;
    
    // Handle custom uploaded image/drawing directly in search phase
    if (phase === 'search' && file) {
      try {
        setIsLoading(true);
        // Resize and compress the image
        const base64Image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              const maxDim = 800; // 800px is plenty for reference
              
              if (width > height && width > maxDim) {
                height *= maxDim / width;
                width = maxDim;
              } else if (height > maxDim) {
                width *= maxDim / height;
                height = maxDim;
              }
              
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, width, height);
              
              const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
              resolve(dataUrl.split(',')[1]);
            };
            img.onerror = reject;
            img.src = e.target?.result as string;
          };
          reader.readAsDataURL(file);
        });
        
        // Save uploaded image in store
        useArchitectStore.getState().setLastUploadedImage(base64Image, text || "Custom uploaded reference image");
        useArchitectStore.setState({ selectedNatureImage: null });
        
        // Transition to concept phase with history update
        const updatedHistory = [...conversationHistory];
        updatedHistory.push({
          role: 'user',
          parts: [{ text: text || "Uploaded reference image" }],
          customType: 'uploaded-image',
          customData: { base64: base64Image, description: text || 'Custom reference image' }
        });
        updatedHistory.push({
          role: 'model',
          parts: [{
            text: `Excellent! I have saved your uploaded image/drawing as our design reference. ✦\n\nLet's begin the **Concept** phase. Could you please tell me about:\n1. Your **plot dimensions** (width and height in meters)?\n2. The **plot orientation** (e.g., North-facing, East-facing)?\n3. The **rooms/spaces** you want to include (e.g., 3 bedrooms, double-height living room, kitchen, etc.)?`
          }]
        });
        
        useArchitectStore.getState().updateHistory(updatedHistory);
        useArchitectStore.getState().setPhase('concept');
      } catch (err) {
        console.error("Failed to process uploaded reference image:", err);
        addMessage({ 
          role: 'model', 
          parts: [{ text: "Failed to process the uploaded image. Please make sure it's a valid image file and try again." }] 
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const userMsg = { role: 'user' as const, parts: [{ text }] };
    addMessage(userMsg);
    
    if (phase === 'search' && text.length > 0 && !file) {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/search-images?query=${encodeURIComponent(text)}&page=1&_t=${Date.now()}`);
        const data = await res.json();
        
        if (data.images && data.images.length > 0) {
          addMessage({ 
            role: 'model', 
            parts: [{ text: 'Here are some references from Pexels. You can also search Google Images below if you need something more specific:' }],
            customType: 'image-grid',
            customData: { images: data.images, query: text }
          });
        } else {
          // Even with no Pexels results, show the grid with Google fallback options
          addMessage({ 
            role: 'model', 
            parts: [{ text: `No results found on Pexels for "${text}". Try searching on Google Images below:` }],
            customType: 'image-grid',
            customData: { images: [], query: text }
          });
        }
      } catch (err) {
        addMessage({ role: 'model', parts: [{ text: "Failed to search images. Please try again." }] });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // ── "Generate more" shortcut ──────────────────────────────────────────────
    // If the user says "generate more", "more designs", "more options", "more drafts", etc.
    // we bypass the chat LLM and trigger the generation API directly.
    const textLower = text.toLowerCase().trim();
    const isGenerateMoreRequest = 
      (textLower.includes('generate') && (textLower.includes('more') || textLower.includes('new') || textLower.includes('another') || textLower.includes('other'))) ||
      (textLower.includes('more') && (textLower.includes('design') || textLower.includes('draft') || textLower.includes('option') || textLower.includes('layout') || textLower.includes('version'))) ||
      (textLower === 'more') || 
      (textLower === 'generate more');

    if (isGenerateMoreRequest && phase !== 'search') {
      try {
        setIsLoading(true);
        // Clear option index to keep UI clean
        useArchitectStore.getState().setSelectedOption(null as any, null as any);
        useArchitectStore.getState().setPhase('generate');
        
        addMessage({
          role: 'model',
          parts: [{ text: "I will start generating more floor plan options for you right away!" }]
        });
        
        useArchitectStore.getState().setLoadingMessage('Generating floor plans...');
        
        const genRes = await fetch('/api/generate-floorplan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            collectedParameters: useArchitectStore.getState().collectedParameters,
            natureImageUrl: useArchitectStore.getState().selectedNatureImage?.url || useArchitectStore.getState().selectedNatureImage?.thumbUrl,
            natureImageDescription: useArchitectStore.getState().selectedNatureImage?.description,
            customImageBase64: useArchitectStore.getState().lastUploadedImage,
            customImageDescription: useArchitectStore.getState().lastUploadedImageDescription
          })
        });
        const genData = await genRes.json();
        
        if (genData.options && genData.options.length > 0) {
          useArchitectStore.getState().setGeneratedOptions(genData.options);
          
          addMessage({
            role: 'model',
            parts: [{ text: "Here are the new generated concept layouts based on your design requirements:" }],
            customType: 'floorplan-drafts',
            customData: { options: genData.options }
          });
        } else {
          console.error("Floor plan generation failed:", genData);
          addMessage({ role: 'model', parts: [{ text: "I hit a snag generating the images. Let's try again." }] });
        }
      } catch (e) {
        console.error("Floor plan generation failed:", e);
        addMessage({ role: 'model', parts: [{ text: "Generation encountered an error." }] });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      setIsLoading(true);
      
      let base64Image: string | undefined;
      if (file) {
        // Resize and compress the image to prevent hitting the 4MB Gemini API payload limit
        base64Image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              const maxDim = 800; // 800px is plenty for a reference shape
              
              if (width > height && width > maxDim) {
                height *= maxDim / width;
                width = maxDim;
              } else if (height > maxDim) {
                width *= maxDim / height;
                height = maxDim;
              }
              
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, width, height);
              
              // Compress as JPEG
              const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
              resolve(dataUrl.split(',')[1]);
            };
            img.onerror = reject;
            img.src = e.target?.result as string;
          };
          reader.readAsDataURL(file);
        });
        
        // Save the uploaded image in store so generation API can use it as reference
        useArchitectStore.getState().setLastUploadedImage(base64Image, text || "Custom uploaded reference image");
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          imageBase64: base64Image,
          conversationHistory: [...conversationHistory, userMsg],
          collectedParameters,
          phase
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 429) {
           alert(errData.reply || "The system is overloaded right now. Please wait a moment and try again.");
           return;
        }
        throw new Error(errData.error || `Chat request failed with status ${res.status}`);
      }

      const data = await res.json();
      
      if (data.reply) {
        updateHistory(data.updatedHistory);
      }
      
      if (data.updatedParameters) {
        useArchitectStore.getState().updateParameters(data.updatedParameters);
      }

      if (data.newPhase && data.newPhase !== phase) {
        setPhase(data.newPhase);
      }
      
      const targetPhase = data.newPhase || phase;

      // Only allow generation if we are NOT already in edit/measure phase.
      // This prevents "yes try again" in edit mode from resetting the user back to concept selection.
      const alreadyEditing = phase === 'edit' || phase === 'measure';
      const textLower = text.toLowerCase();
      const conceptPhases = ['concept', 'parameters', 'vastu', 'generate'];
      const triggersRegen = textLower.includes('yes') || textLower.includes('try again') || textLower.includes('show more') || textLower.includes('regenerate') || textLower.includes('go ahead') || textLower.includes('show me') || textLower.includes('generate') || textLower.includes('create') || textLower.includes('perfect');
      const phaseJumpedToGenerate = data.newPhase === 'generate';
      const stayedInGenerateWithTrigger = data.newPhase === null && targetPhase === 'generate' && triggersRegen;
      const wasInConceptAndTriggered = !alreadyEditing && conceptPhases.includes(phase) && triggersRegen && data.newPhase === null;
      if (!alreadyEditing && (phaseJumpedToGenerate || stayedInGenerateWithTrigger)) {
        useArchitectStore.getState().setLoadingMessage('Generating floor plans...');
        try {
          const genRes = await fetch('/api/generate-floorplan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              collectedParameters: useArchitectStore.getState().collectedParameters,
              // Always prefer the full-resolution URL over the thumbnail — Gemini needs to clearly see the shape
              natureImageUrl: useArchitectStore.getState().selectedNatureImage?.url || useArchitectStore.getState().selectedNatureImage?.thumbUrl,
              natureImageDescription: useArchitectStore.getState().selectedNatureImage?.description,
              customImageBase64: useArchitectStore.getState().lastUploadedImage,
              customImageDescription: useArchitectStore.getState().lastUploadedImageDescription
            })
          });
          const genData = await genRes.json();
          
          if (genData.options && genData.options.length > 0) {
            useArchitectStore.getState().setGeneratedOptions(genData.options);
            
            // Append generated drafts to chat history
            addMessage({
              role: 'model',
              parts: [{ text: "Here are the generated concept layouts based on your design requirements:" }],
              customType: 'floorplan-drafts',
              customData: { options: genData.options }
            });
          } else {
             console.error("Floor plan generation failed:", genData);
             addMessage({ role: 'model', parts: [{ text: "I hit a snag generating the images. Let's try again." }] });
          }
        } catch (e) {
          console.error("Floor plan generation failed:", e);
          addMessage({ role: 'model', parts: [{ text: "Generation encountered an error." }] });
        }
      }

      // Determine if we should run an edit:
      // - Normal case: user is in edit/measure and isEditCommand is true
      // - Retry case: user is in edit/measure and says "try again" / "retry" after a failed edit
      const lowerText = text.toLowerCase().trim();
      const isRetryEdit = alreadyEditing && !data.isEditCommand && lastEditInstructionRef.current &&
        (lowerText.includes('try again') || lowerText.includes('retry') || lowerText.includes('yes try') || lowerText === 'yes');
      const effectiveEditInstruction = isRetryEdit ? lastEditInstructionRef.current : text;

      if ((targetPhase === 'edit' || targetPhase === 'measure') && data.newPhase !== 'export' && (data.isEditCommand || isRetryEdit) && effectiveEditInstruction.trim().length > 0) {
        // Save instruction so we can retry if it fails
        if (data.isEditCommand) lastEditInstructionRef.current = text;
        useArchitectStore.getState().setLoadingMessage('Editing floor plan...');
        try {
          const editRes = await fetch('/api/edit-floorplan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              currentFloorPlanBase64: useArchitectStore.getState().currentFloorPlan,
              editInstruction: effectiveEditInstruction,
              collectedParameters: useArchitectStore.getState().collectedParameters,
              roomDimensions: useArchitectStore.getState().roomDimensions
            })
          });
          const editData = await editRes.json();
          
          if (editData.editedFloorPlan) {
            useArchitectStore.getState().setCurrentFloorPlan(editData.editedFloorPlan);
            if (useArchitectStore.getState().phase !== 'edit') {
              useArchitectStore.getState().setPhase('edit');
            }
            
            // Append edited floor plan to chat history
            addMessage({
              role: 'model',
              parts: [{ text: `Here is the updated floor plan after applying: "${effectiveEditInstruction}"` }],
              customType: 'floorplan-edit',
              customData: { editedFloorPlan: editData.editedFloorPlan, instruction: effectiveEditInstruction }
            });
          } else {
             console.error("Floor plan edit failed:", editData);
             addMessage({ role: 'model', parts: [{ text: "I hit a snag editing the floor plan. Just say 'try again' and I'll retry the same change." }] });
          }
        } catch (e) {
          console.error("Floor plan edit failed:", e);
          addMessage({ role: 'model', parts: [{ text: "Editing encountered an error. Say 'try again' to retry." }] });
        }
      }
      
      if (data.customMessage) {
        addMessage(data.customMessage);
      }

    } catch (err: any) {
      console.error(err);
      if (err.message !== "429") {
        addMessage({ role: 'model', parts: [{ text: `Error: ${err.message}` }] });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full bg-[#0d0d0d]/80 backdrop-blur flex flex-col shrink-0 h-full relative font-mono">
      {/* Subtle scanline overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.1)_51%)] bg-[length:100%_4px] z-0 opacity-20" />
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 custom-scrollbar relative z-10"
      >
        {conversationHistory.map((msg, idx) => {
          let customDataElement = msg.customData;
          if (msg.customType === 'image-grid' && msg.customData) {
             customDataElement = <ImageGrid initialImages={msg.customData.images} query={msg.customData.query} />;
          }
          const isLast = idx === conversationHistory.length - 1;
          return (
            <div key={idx} id={isLast && !isLoading ? 'latest-message' : undefined}>
              <ChatMessage message={msg} isCustomType={msg.customType} customData={customDataElement} />
            </div>
          );
        })}
        
        {isLoading && (
          <div id="latest-message">
            <ChatMessage message={{ role: 'model', parts: [{ text: '' }] }} isCustomType="loading" />
          </div>
        )}
      </div>
      {/* Sunpath controls if phase is render/export and floorplan exists */}
      {(phase === 'export' || phase === 'reimport') && currentFloorPlan && (
        <div className="mx-4 mb-4 p-3 border border-[#FFB000]/30 bg-[#FFB000]/5 rounded-lg flex flex-col gap-2 relative z-10">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-bold tracking-[2px] uppercase text-[#FFB000]">Sunpath Controller</span>
            {isLocalRenderLoading && <Loader2 size={10} className="animate-spin text-[#FFB000]" />}
          </div>
          
          <div className="flex gap-2">
            <select
              value={sunpath}
              onChange={(e) => {
                setSunpath(e.target.value);
                if (e.target.value !== 'custom') setCustomSunpath('');
              }}
              disabled={isLocalRenderLoading}
              className="flex-1 bg-black text-[10px] border border-gray-700 text-white rounded px-2 py-1.5 focus:outline-none focus:border-[#FFB000] uppercase font-mono"
            >
              <option value="North">North (Shadows S)</option>
              <option value="South">South (Shadows N)</option>
              <option value="East">East (Shadows W)</option>
              <option value="West">West (Shadows E)</option>
              <option value="North-East">NE (Shadows SW)</option>
              <option value="North-West">NW (Shadows SE)</option>
              <option value="South-East">SE (Shadows NW)</option>
              <option value="South-West">SW (Shadows NE)</option>
              <option value="custom">Custom...</option>
            </select>
            
            <button
              onClick={handleApplySunpathEdit}
              disabled={isLocalRenderLoading}
              className="px-3 py-1.5 bg-[#FFB000] hover:bg-[#D8B78D] text-black font-bold uppercase tracking-widest text-[9px] rounded transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isLocalRenderLoading ? 'Modifying...' : 'Apply'}
            </button>
          </div>

          {sunpath === 'custom' && (
            <input
              type="text"
              value={customSunpath}
              onChange={(e) => setCustomSunpath(e.target.value)}
              disabled={isLocalRenderLoading}
              placeholder="E.G. SUN FROM NORTH-WEST"
              className="w-full bg-black text-[9px] border border-gray-700 text-white rounded px-2 py-1.5 focus:outline-none focus:border-[#FFB000] uppercase font-mono tracking-wider"
            />
          )}
        </div>
      )}
      
      <ChatInput onSend={handleSend} disabled={isLoading} />
    </div>
  );
}
