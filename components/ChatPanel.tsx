'use client';

import { useEffect, useRef, useState } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import InpaintInput from './InpaintInput';
import ImageGrid from './ImageGrid';
import { Loader2 } from 'lucide-react';
import { RenderHistoryItem } from '@/types';
import { playSound } from '@/lib/sounds';

import { useShallow } from 'zustand/react/shallow';

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
      img.src = src;
    } else {
      img.src = `data:image/png;base64,${src}`;
    }
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
  });
};

const blendImagesWithBWMask = (
  originalImg: HTMLImageElement,
  editedImg: HTMLImageElement,
  maskImg: HTMLImageElement
): string => {
  const canvas = document.createElement('canvas');
  canvas.width = originalImg.naturalWidth;
  canvas.height = originalImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 1. Draw the original image first
  ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height);

  // 2. Create offscreen canvas for the black and white mask, with blur filter for smooth blending
  const maskTempCanvas = document.createElement('canvas');
  maskTempCanvas.width = canvas.width;
  maskTempCanvas.height = canvas.height;
  const maskTempCtx = maskTempCanvas.getContext('2d');
  if (maskTempCtx) {
    maskTempCtx.filter = 'blur(25px)';
    maskTempCtx.drawImage(maskImg, 0, 0, maskTempCanvas.width, maskTempCanvas.height);
  }

  // 3. Create offscreen canvas for the edited image
  const editedTempCanvas = document.createElement('canvas');
  editedTempCanvas.width = canvas.width;
  editedTempCanvas.height = canvas.height;
  const editedTempCtx = editedTempCanvas.getContext('2d');
  if (editedTempCtx) {
    editedTempCtx.drawImage(editedImg, 0, 0, editedTempCanvas.width, editedTempCanvas.height);
  }

  // 4. Perform pixel-level blending
  const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const maskData = maskTempCtx ? maskTempCtx.getImageData(0, 0, canvas.width, canvas.height) : null;
  const editedData = editedTempCtx ? editedTempCtx.getImageData(0, 0, canvas.width, canvas.height) : null;

  if (maskData && editedData) {
    const pixels = originalData.data;
    const maskPixels = maskData.data;
    const editedPixels = editedData.data;

    for (let i = 0; i < pixels.length; i += 4) {
      // In B&W mask: white represents the strokes (red channel > 0)
      const maskVal = maskPixels[i]; 
      
      // If the dilated mask has even a tiny bit of brightness (> 5), we copy the edited pixels
      if (maskVal > 5) {
        pixels[i] = editedPixels[i];
        pixels[i + 1] = editedPixels[i + 1];
        pixels[i + 2] = editedPixels[i + 2];
        pixels[i + 3] = editedPixels[i + 3];
      }
    }
    ctx.putImageData(originalData, 0, 0);
  }

  return canvas.toDataURL('image/jpeg', 0.95);
};

const getRoomSpecificCADInstructions = (userInput: string) => {
  const clean = userInput.toLowerCase();
  
  if (clean.includes('pool') || clean.includes('swimming')) {
    return 'Draw a detailed 2D plan view architectural swimming pool layout inside the green area. Use standard black blueprint drawing symbols: show the pool outline, steps/stairs, water depth lines, and an optional wood deck or tile coping border surrounding the pool. Keep it strictly in the black and white 2D drafting style.';
  }
  if (clean.includes('kitchen')) {
    return 'Draw a standard 2D kitchen layout inside the green area: countertops, kitchen sink basin, range/stove burners, refrigerator space, and cabinets in black CAD outline style.';
  }
  if (clean.includes('bath') || clean.includes('toilet') || clean.includes('washroom')) {
    return 'Draw bathroom details in 2D plan view: a bathtub, toilet, washbasin, and shower cabinet using standard black blueprint CAD symbols.';
  }
  if (clean.includes('bed')) {
    return 'Draw a detailed bedroom layout: double or single bed outlines with pillows, bedside tables, wardrobes, and closets in black line art.';
  }
  if (clean.includes('living') || clean.includes('lounge') || clean.includes('hall')) {
    return 'Draw living room furniture configurations: couch/sofa outlines, a coffee table, media console, and armchairs in clean black CAD lines.';
  }
  if (clean.includes('garden') || clean.includes('yard') || clean.includes('lawn') || clean.includes('outdoor') || clean.includes('patio')) {
    return 'Draw outdoor landscaping features inside the green area: paving stones grid, circular tree/shrub blueprint symbols, grass hatch texturing, and simple patio furniture symbols.';
  }
  if (clean.includes('parking') || clean.includes('garage') || clean.includes('car')) {
    return 'Draw car parking layouts: parking spaces with clean 2D outline symbols of parked cars.';
  }
  if (clean === 'empty' || clean === 'empty room' || clean === 'no furniture') {
    return 'Completely vacate the space. Erase all furniture, fixtures, appliances, text labels, and structural details from inside this room, leaving it entirely blank/empty. Keep only the outer bounding walls and doors.';
  }
  
  return `Erase the existing contents and draw a clean, detailed 2D plan view layout for a "${userInput}" inside this room. Use standard architectural CAD blueprint furniture symbols.`;
};

const getRoomSpecific3DRenderInstructions = (userInput: string) => {
  const clean = userInput.toLowerCase();
  
  if (clean.includes('pool') || clean.includes('swimming')) {
    return 'Generate a photorealistic swimming pool with clear glowing blue water, ripples, steps, and modern surrounding decking or stone tiles matching the outdoor environment.';
  }
  if (clean.includes('kitchen')) {
    return 'Generate a luxury modern kitchen setup: clean stone/marble countertops, modern faucet, oven/stove, cabinets, refrigerator, and elegant fixtures matching the architecture.';
  }
  if (clean.includes('bath') || clean.includes('toilet') || clean.includes('washroom') || clean.includes('shower')) {
    return 'Generate a photorealistic bathroom interior: modern vanity, sink, mirror, glass shower cabin, toilet, and premium tile finishes matching the surrounding style.';
  }
  if (clean.includes('bed')) {
    return 'Generate a photorealistic bedroom setup: double or single bed with premium sheets/pillows, modern bedside tables with table lamps, and a wardrobe.';
  }
  if (clean.includes('living') || clean.includes('lounge') || clean.includes('hall') || clean.includes('couch') || clean.includes('sofa')) {
    return 'Generate a cozy living room setup: modern sofa/couch, matching throw pillows, coffee table, carpet, and a TV console or artwork.';
  }
  if (clean.includes('garden') || clean.includes('yard') || clean.includes('lawn') || clean.includes('outdoor') || clean.includes('patio')) {
    return 'Generate beautiful outdoor landscaping: manicured green lawn grass, flowers, shrubs, garden beds, and optional outdoor patio table and chairs.';
  }
  if (clean.includes('parking') || clean.includes('garage')) {
    return 'Generate a clean car parking space or garage area with premium paving or concrete floors.';
  }
  if (clean === 'empty' || clean === 'empty room' || clean === 'no furniture') {
    return 'Completely vacate this room/area. Erase all furniture, decor, clutter, appliances, and items, leaving the space entirely empty with only the clean floor and walls matching the surrounding textures.';
  }
  
  return `Erase the existing contents in this highlighted region and generate a photorealistic "${userInput}" setup matching the perspective, lighting, shadows, and style of the surrounding render.`;
};

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
    setViewingHistoryId,
    inpaintActive,
    paintedFloorPlan,
    setInpaintActive,
    setPaintedFloorPlan,
    viewingHistoryId,
    renderHistory,
    inpaintRenderActive,
    paintedRender,
    setInpaintRenderActive,
    setPaintedRender
  } = useArchitectStore(useShallow((state) => ({
    conversationHistory: state.conversationHistory,
    addMessage: state.addMessage,
    updateHistory: state.updateHistory,
    phase: state.phase,
    setPhase: state.setPhase,
    collectedParameters: state.collectedParameters,
    isLoading: state.isLoading,
    setIsLoading: state.setIsLoading,
    finalRender: state.finalRender,
    setFinalRender: state.setFinalRender,
    currentFloorPlan: state.currentFloorPlan,
    selectedStyle: state.selectedStyle,
    sunpath: state.sunpath,
    setSunpath: state.setSunpath,
    customSunpath: state.customSunpath,
    setCustomSunpath: state.setCustomSunpath,
    addRenderHistoryItem: state.addRenderHistoryItem,
    setViewingHistoryId: state.setViewingHistoryId,
    inpaintActive: state.inpaintActive,
    paintedFloorPlan: state.paintedFloorPlan,
    setInpaintActive: state.setInpaintActive,
    setPaintedFloorPlan: state.setPaintedFloorPlan,
    viewingHistoryId: state.viewingHistoryId,
    renderHistory: state.renderHistory,
    inpaintRenderActive: state.inpaintRenderActive,
    paintedRender: state.paintedRender,
    setInpaintRenderActive: state.setInpaintRenderActive,
    setPaintedRender: state.setPaintedRender
  })));

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

        useArchitectStore.getState().setLastUploadedImage(base64Image, text || 'Custom reference image');
        
        // Add it to the UI history so the user sees it
        const userMsg = {
          role: 'user' as const,
          parts: [{ text: text || "Uploaded reference image" }],
          customType: 'uploaded-image' as const,
          customData: { base64: base64Image, description: text || 'Custom reference image' }
        };
        addMessage(userMsg);

        // Then call the chat API just like a normal message, but include the image
        const currentParams = useArchitectStore.getState().collectedParameters;
        
        // We use the raw text if provided, or empty so the LLM can just process the image
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: text, 
            imageBase64: base64Image,
            conversationHistory: useArchitectStore.getState().conversationHistory.slice(0, -1), // Don't send the custom uploaded-image message object directly to the API, we send it inside imageBase64
            collectedParameters: currentParams,
            phase
          }),
        });
        
        const data = await res.json();
        
        if (data.updatedParameters) {
          useArchitectStore.getState().updateParameters(data.updatedParameters);
        }
        
        if (data.newPhase) {
          useArchitectStore.getState().setPhase(data.newPhase);
        }
        
        if (data.updatedHistory) {
          // The updatedHistory from the API doesn't have our uploaded-image object, because we stripped it above.
          // We need to inject our custom uploaded-image object into the updated history array at the right spot.
          const finalHistory = [...data.updatedHistory];
          finalHistory.splice(finalHistory.length - 1, 0, userMsg);
          useArchitectStore.getState().updateHistory(finalHistory);
        }
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

    // We removed the hardcoded search bypass so the LLM can interpret if the user wants to search or not.

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
      const MAX_GEN_RETRIES = 3;
      let genSuccess = false;

      for (let genAttempt = 0; genAttempt < MAX_GEN_RETRIES && !genSuccess; genAttempt++) {
        try {
          if (genAttempt === 0) setIsLoading(true);
          useArchitectStore.getState().setSelectedOption(null as any, null as any);
          useArchitectStore.getState().setPhase('generate');

          if (genAttempt === 0) {
            addMessage({
              role: 'model',
              parts: [{ text: "I will start generating more floor plan options for you right away!" }]
            });
          }

          useArchitectStore.getState().setLoadingMessage(
            genAttempt > 0 ? `Retrying... (attempt ${genAttempt + 1})` : 'Generating floor plans...'
          );

          const genRes = await fetch('/api/generate-floorplan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              collectedParameters: useArchitectStore.getState().collectedParameters,
              natureImageUrl: useArchitectStore.getState().selectedNatureImage?.url || useArchitectStore.getState().selectedNatureImage?.thumbUrl,
              natureImageDescription: useArchitectStore.getState().selectedNatureImage?.description,
              customImageBase64: useArchitectStore.getState().lastUploadedImage,
              customImageDescription: useArchitectStore.getState().lastUploadedImageDescription,
              manualPlotImage: useArchitectStore.getState().manualPlotImage
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
            genSuccess = true;
          } else {
            console.error(`[generate-more] Attempt ${genAttempt + 1} returned no options:`, genData);
            if (genAttempt === MAX_GEN_RETRIES - 1) {
              addMessage({ role: 'model', parts: [{ text: "Generation took too long this time. Please say 'generate more' to try again." }] });
            }
          }
        } catch (e) {
          console.error(`[generate-more] Attempt ${genAttempt + 1} threw:`, e);
          if (genAttempt === MAX_GEN_RETRIES - 1) {
            addMessage({ role: 'model', parts: [{ text: "Generation encountered a network error. Please try again." }] });
          }
        }
      }

      setIsLoading(false);
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
            img.onerror = () => reject(new Error('Failed to load image. Ensure it is a valid format (e.g. JPG, PNG).'));
            img.src = e.target?.result as string;
          };
          reader.readAsDataURL(file);
        });
        
        // Save the uploaded image in store so generation API can use it as reference
        useArchitectStore.getState().setLastUploadedImage(base64Image, text || "Custom uploaded reference image");
      }

      let data: any;
      
      if (inpaintActive || inpaintRenderActive) {
        // Completely bypass the conversational LLM when an inpaint mask is active
        const replyText = `Processing inpaint modification: "${text}"...`;
        data = {
          reply: replyText,
          newPhase: null,
          isEditCommand: true,
          updatedHistory: [...conversationHistory, userMsg, { role: 'model', parts: [{ text: replyText }] }]
        };
      } else {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            imageBase64: base64Image,
            conversationHistory: [...conversationHistory, userMsg],
            collectedParameters,
            phase,
            onboardingMode: useArchitectStore.getState().onboardingMode,
            inpaintActive,
            inpaintRenderActive
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 429) {
            alert(errData.reply || "The system is overloaded right now. Please wait a moment and try again.");
            setIsLoading(false);
            return;
          }
          throw new Error(errData.error || `Chat request failed with status ${res.status}`);
        }

        data = await res.json();
      }
      
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

      if (data.searchQuery) {
        try {
          useArchitectStore.getState().setLoadingMessage('Searching Pexels...');
          const searchRes = await fetch(`/api/search-images?query=${encodeURIComponent(data.searchQuery)}&page=1&_t=${Date.now()}`);
          const searchData = await searchRes.json();
          
          if (searchData.images && searchData.images.length > 0) {
            addMessage({ 
              role: 'model', 
              parts: [{ text: 'Here are some references from Pexels. You can also search Google Images below if you need something more specific:' }],
              customType: 'image-grid',
              customData: { images: searchData.images, query: data.searchQuery }
            });
          } else {
            addMessage({ 
              role: 'model', 
              parts: [{ text: `No results found on Pexels for "${data.searchQuery}". Try searching on Google Images below:` }],
              customType: 'image-grid',
              customData: { images: [], query: data.searchQuery }
            });
          }
        } catch (err) {
          console.error("Search failed:", err);
          addMessage({ role: 'model', parts: [{ text: "Failed to search images. Please try again." }] });
        }
      }

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
        const MAX_GEN_RETRIES = 3;
        let genSuccess = false;

        for (let genAttempt = 0; genAttempt < MAX_GEN_RETRIES && !genSuccess; genAttempt++) {
          try {
            useArchitectStore.getState().setLoadingMessage(
              genAttempt > 0 ? `Retrying generation... (attempt ${genAttempt + 1})` : 'Generating floor plans...'
            );

            const genRes = await fetch('/api/generate-floorplan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                collectedParameters: useArchitectStore.getState().collectedParameters,
                natureImageUrl: useArchitectStore.getState().selectedNatureImage?.url || useArchitectStore.getState().selectedNatureImage?.thumbUrl,
                natureImageDescription: useArchitectStore.getState().selectedNatureImage?.description,
                customImageBase64: useArchitectStore.getState().lastUploadedImage,
                customImageDescription: useArchitectStore.getState().lastUploadedImageDescription,
                manualPlotImage: useArchitectStore.getState().manualPlotImage
              })
            });
            const genData = await genRes.json();

            if (genData.options && genData.options.length > 0) {
              useArchitectStore.getState().setGeneratedOptions(genData.options);
              playSound('woosh');
              addMessage({
                role: 'model',
                parts: [{ text: "Here are the generated concept layouts based on your design requirements:" }],
                customType: 'floorplan-drafts',
                customData: { options: genData.options }
              });
              genSuccess = true;
            } else {
              console.error(`[generate] Attempt ${genAttempt + 1} returned no options:`, genData);
              if (genAttempt === MAX_GEN_RETRIES - 1) {
                addMessage({ role: 'model', parts: [{ text: "Generation took too long. Just say 'generate more' to try again!" }] });
              }
            }
          } catch (e) {
            console.error(`[generate] Attempt ${genAttempt + 1} threw:`, e);
            if (genAttempt === MAX_GEN_RETRIES - 1) {
              addMessage({ role: 'model', parts: [{ text: "Generation encountered a network error. Say 'generate more' to retry." }] });
            }
          }
        }
      }

      // Determine if we should run an edit:
      // - Normal case: user is in edit/measure and isEditCommand is true OR they have drawn an inpaint mask
      // - Retry case: user is in edit/measure and says "try again" / "retry" after a failed edit
      const lowerText = text.toLowerCase().trim();
      const isRetryEdit = alreadyEditing && !data.isEditCommand && lastEditInstructionRef.current &&
        (lowerText.includes('try again') || lowerText.includes('retry') || lowerText.includes('yes try') || lowerText === 'yes');
      const effectiveEditInstruction = isRetryEdit ? lastEditInstructionRef.current : text;
      
      const forceEditDueToInpaint = !!(inpaintActive && paintedFloorPlan) || !!(inpaintRenderActive && paintedRender);
      const shouldRunEdit = data.isEditCommand || isRetryEdit || forceEditDueToInpaint;

      if ((targetPhase === 'edit' || targetPhase === 'measure') && data.newPhase !== 'export' && shouldRunEdit && effectiveEditInstruction.trim().length > 0) {
        // Save instruction so we can retry if it fails
        if (shouldRunEdit && !isRetryEdit) lastEditInstructionRef.current = text;
        
        const MAX_EDIT_RETRIES = 3;
        let editSuccess = false;

        for (let editAttempt = 0; editAttempt < MAX_EDIT_RETRIES && !editSuccess; editAttempt++) {
          useArchitectStore.getState().setLoadingMessage(
            editAttempt > 0 ? `Retrying edit... (attempt ${editAttempt + 1})` : 'Editing floor plan...'
          );
          try {
            const useInpaint = inpaintActive && paintedFloorPlan;
            let finalPrompt = effectiveEditInstruction;
            let skipTranslation = false;

            if (useInpaint) {
              const cleanLower = effectiveEditInstruction.trim().toLowerCase().replace(/^replace\s+green\s+with:\s*/, '').trim();
              const coreInstruction = getRoomSpecificCADInstructions(cleanLower);
              finalPrompt = `
[CRITICAL ARCHITECTURAL BLUEPRINT EDIT DIRECTIVE]
You are a precise CAD software compiler and master architect. The user has uploaded a floor plan image. A specific room/area has been marked with a semi-transparent green paint brush stroke.

YOUR TASK:
1. TARGET ZONE: Modify ONLY the room or outdoor area covered by the green paint. Even if the green paint only covers a part of the room, apply the change to the entire enclosing room.
2. ACTION: ${coreInstruction}
3. CAD STYLE MATCHING: You MUST draw in the exact same 2D blueprint drafting style as the original image: clean black lines on a solid white background. Match the line weights, hatching, labels, and drawing style of the existing plan.
4. STRICT PRESERVATION PROTOCOL: Do not modify, change, shift, or delete ANY walls, doors, windows, labels, layouts, furniture, cars, or details in any other part of the floor plan outside of the green-painted area. The rest of the plan MUST remain 100% identical to the input image down to the pixel.
5. NO COLOR: The output must remain in black and white CAD blueprint style. Remove the green paint overlay completely. No green color or other colors should appear in the final output.
`;
              skipTranslation = true;
            }

            const currentPlan = useArchitectStore.getState().currentFloorPlan;
            const editRes = await fetch('/api/edit-floorplan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                currentFloorPlanBase64: currentPlan,
                editInstruction: finalPrompt,
                collectedParameters: useArchitectStore.getState().collectedParameters,
                roomDimensions: useArchitectStore.getState().roomDimensions,
                isInpaint: !!useInpaint,
                maskBase64: useInpaint ? useArchitectStore.getState().inpaintMask : null,
                skipTranslation
              })
            });
            const editData = await editRes.json();

            if (editData.editedFloorPlan) {
              let blendedPlan = editData.editedFloorPlan;
              if (useInpaint) {
                try {
                  const originalImg = await loadImage(currentPlan!);
                  const editedImg = await loadImage(editData.editedFloorPlan);
                  const maskImg = await loadImage(useArchitectStore.getState().inpaintMask!);
                  const blendedDataUrl = blendImagesWithBWMask(originalImg, editedImg, maskImg);
                  if (blendedDataUrl) {
                    blendedPlan = blendedDataUrl;
                  }
                } catch (blendError) {
                  console.error('Error blending floorplan edit images:', blendError);
                }
              }
              useArchitectStore.getState().setCurrentFloorPlan(blendedPlan);
              if (useArchitectStore.getState().phase !== 'edit') {
                useArchitectStore.getState().setPhase('edit');
              }
              setInpaintActive(false);
              setPaintedFloorPlan(null);
              useArchitectStore.getState().setInpaintMask(null);
              playSound('success');
              addMessage({
                role: 'model',
                parts: [{ text: `Here is the updated floor plan after applying: "${effectiveEditInstruction}"` }],
                customType: 'floorplan-edit',
                customData: { editedFloorPlan: editData.editedFloorPlan, instruction: effectiveEditInstruction }
              });
              editSuccess = true;
            } else {
              console.error(`[edit] Attempt ${editAttempt + 1} returned no image:`, editData);
              if (editAttempt === MAX_EDIT_RETRIES - 1) {
                addMessage({ role: 'model', parts: [{ text: "The edit took too long to process. Say 'try again' to retry the same change." }] });
              }
            }
          } catch (e) {
            console.error(`[edit] Attempt ${editAttempt + 1} threw:`, e);
            if (editAttempt === MAX_EDIT_RETRIES - 1) {
              addMessage({ role: 'model', parts: [{ text: "Editing encountered a network error. Say 'try again' to retry." }] });
            }
          }
        }
      }

      // ── Edit/Inpainting phase for 3D Render ──────────────────────────────────────────────────
      if ((targetPhase === 'export' || targetPhase === 'reimport') && shouldRunEdit && viewingHistoryId && effectiveEditInstruction.trim().length > 0) {
        const activeRender = renderHistory.find(h => h.id === viewingHistoryId);
        if (activeRender) {
          const MAX_RENDER_EDIT_RETRIES = 3;
          let renderEditSuccess = false;

          for (let editAttempt = 0; editAttempt < MAX_RENDER_EDIT_RETRIES && !renderEditSuccess; editAttempt++) {
            useArchitectStore.getState().setLoadingMessage(
              editAttempt > 0 ? `Retrying render edit... (attempt ${editAttempt + 1})` : 'Editing 3D Render...'
            );
            try {
              const useInpaint = inpaintRenderActive && paintedRender;
              let finalPrompt = effectiveEditInstruction;
              let skipTranslation = false;

              if (useInpaint) {
                const cleanLower = effectiveEditInstruction.trim().toLowerCase().replace(/^replace\s+green\s+with:\s*/, '').trim();
                const coreInstruction = getRoomSpecific3DRenderInstructions(cleanLower);
                finalPrompt = `
[CRITICAL 3D ARCHITECTURAL RENDER EDIT DIRECTIVE]
You are a master 3D visualization architect. The user has uploaded a photorealistic 3D render. A specific region or object has been highlighted with semi-transparent green paint brush strokes.

YOUR TASK:
1. TARGET ZONE: Modify ONLY the object, room, or structure covered by the green paint.
2. ACTION: ${coreInstruction}
3. PHOTOREALISTIC BLENDING: You MUST render the requested changes to perfectly match the lighting direction, shadow intensity, materials, perspective, and architectural design style of the surrounding scene.
4. STRICT PRESERVATION PROTOCOL: Do not modify, change, shift, or delete any walls, windows, furniture, landscaping, lighting, or details in any other part of the 3D render outside of the green-painted area. The rest of the render MUST remain 100% identical to the input image down to the pixel.
5. CLEAN OUTPUT: Remove the green paint overlay completely. No green paint residue should appear in the final output.
`;
                skipTranslation = true;
              }

              const editRes = await fetch('/api/edit-render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  renderBase64: useInpaint ? paintedRender : activeRender.base64,
                  editInstruction: finalPrompt,
                  isInpaint: !!useInpaint,
                  collectedParameters: useArchitectStore.getState().collectedParameters,
                  skipTranslation
                })
              });
              const editData = await editRes.json();

              if (editData.editedRender) {
                let blendedRender = editData.editedRender;
                if (useInpaint) {
                  try {
                    const originalImg = await loadImage(activeRender.base64);
                    const editedImg = await loadImage(editData.editedRender);
                    const maskImg = await loadImage(useArchitectStore.getState().inpaintMask!);
                    const blendedDataUrl = blendImagesWithBWMask(originalImg, editedImg, maskImg);
                    if (blendedDataUrl) {
                      blendedRender = blendedDataUrl;
                    }
                  } catch (blendError) {
                    console.error('Error blending render edit images:', blendError);
                  }
                }
                const newItem: RenderHistoryItem = {
                  id: Math.random().toString(36).substr(2, 9),
                  base64: blendedRender,
                  style: activeRender.style + ' (Edited)',
                  sunpath: activeRender.sunpath
                };
                useArchitectStore.getState().addRenderHistoryItem(newItem);
                useArchitectStore.getState().setViewingHistoryId(newItem.id);
                
                setInpaintRenderActive(false);
                setPaintedRender(null);
                useArchitectStore.getState().setInpaintMask(null);
                playSound('success');
                addMessage({
                  role: 'model',
                  parts: [{ text: `Here is the updated 3D Render after applying: "${effectiveEditInstruction}"` }],
                });
                renderEditSuccess = true;
              } else {
                console.error(`[edit-render] Attempt ${editAttempt + 1} returned no image:`, editData);
                if (editAttempt === MAX_RENDER_EDIT_RETRIES - 1) {
                  addMessage({ role: 'model', parts: [{ text: "The render edit took too long to process. Say 'try again' to retry." }] });
                }
              }
            } catch (e) {
              console.error(`[edit-render] Attempt ${editAttempt + 1} threw:`, e);
              if (editAttempt === MAX_RENDER_EDIT_RETRIES - 1) {
                addMessage({ role: 'model', parts: [{ text: "Editing the render encountered a network error. Say 'try again' to retry." }] });
              }
            }
          }
        } else {
          addMessage({ role: 'model', parts: [{ text: "Please select a 3D Render from the history first before asking to edit it." }] });
        }
      }
      
      if (data.customMessage) {
        addMessage(data.customMessage);
      }

    } catch (err: any) {
      console.error(err);
      if (err?.message !== "429") {
        const errorMsg = err?.message || (typeof err === 'string' ? err : 'Unknown error occurred');
        addMessage({ role: 'model', parts: [{ text: `Error: ${errorMsg}` }] });
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
      
      {(inpaintActive || inpaintRenderActive) ? (
        <InpaintInput 
          onSend={(text) => handleSend(text)} 
          disabled={isLoading} 
        />
      ) : (
        <ChatInput 
          onSend={handleSend} 
          disabled={isLoading || (phase === 'search' && useArchitectStore.getState().onboardingMode === 'select')} 
          placeholder={
            phase === 'search' 
              ? (useArchitectStore.getState().onboardingMode === 'select' ? "Please select an option above..." 
                : useArchitectStore.getState().onboardingMode === 'library' ? "What nature reference do you want to search?" 
                : useArchitectStore.getState().onboardingMode === 'text' ? "Describe the shape (e.g. 'clove shape')..."
                : "Click the 📎 icon to upload an image...")
              : "Type your message..."
          }
          hideAttachment={phase === 'search' && (useArchitectStore.getState().onboardingMode === 'library' || useArchitectStore.getState().onboardingMode === 'text')}
        />
      )}
    </div>
  );
}
