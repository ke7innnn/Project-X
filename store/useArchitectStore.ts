import { create } from 'zustand';
import { ArchitectStore, Phase, ConversationMessage, NatureImage, CollectedParameters } from '@/types';



const defaultParameters: CollectedParameters = {
  plotWidth: null,
  plotHeight: null,
  plotArea: null,
  orientation: null,
  rooms: [],
  vastuRules: [],
  sunPath: null,
  garden: false,
  parking: false,
  floors: 1,
  surroundings: null,
  additionalNotes: [],
  aspectRatio: null,
};

export const useArchitectStore = create<ArchitectStore>((set) => ({
  phase: 'search',
  conversationHistory: [],
  selectedNatureImage: null,
  hoveredNatureImage: null,
  lastUploadedImage: null,
  lastUploadedImageDescription: null,
  collectedParameters: { ...defaultParameters },
  generatedOptions: [],
  selectedOptionIndex: null,
  selectedOptionUrl: null,
  roomLabels: {},
  roomDimensions: {},
  currentFloorPlan: null,
  previousFloorPlan: null,
  finalRender: null,
  isLoading: false,
  loadingMessage: '',
  isAppStarted: false,

  setLastUploadedImage: (base64, description) => set({ lastUploadedImage: base64, lastUploadedImageDescription: description }),

  setPhase: (phase) => set({ phase }),
  
  addMessage: (message) => set((state) => ({ 
    conversationHistory: [...state.conversationHistory, message] 
  })),

  updateHistory: (history) => set({ conversationHistory: history }),
  
  setSelectedNatureImage: (image) => set((state) => {
    const nextPhase = state.phase === 'search' && image ? 'concept' : state.phase;
    const nextHistory = [...state.conversationHistory];

    if (state.phase === 'search' && image) {
      nextHistory.push({
        role: 'model',
        parts: [{
          text: `Great choice! I have saved this nature reference ("${image.description}") as our design inspiration. ✦

Let's begin the **Concept** phase. Could you please tell me about:
1. Your **plot dimensions** (width and height in meters)?
2. The **plot orientation** (e.g., North-facing, East-facing)?
3. The **rooms/spaces** you want to include (e.g., 3 bedrooms, double-height living room, kitchen, etc.)?`
        }]
      });
    }

    return {
      selectedNatureImage: image,
      phase: nextPhase,
      conversationHistory: nextHistory
    };
  }),
  
  setHoveredNatureImage: (image) => set({ hoveredNatureImage: image }),
  
  updateParameters: (params) => set((state) => ({
    collectedParameters: { ...state.collectedParameters, ...params }
  })),
  
  setGeneratedOptions: (options) => set({ generatedOptions: options }),
  
  setSelectedOption: (index, url) => set({ 
    selectedOptionIndex: index, 
    selectedOptionUrl: url,
    currentFloorPlan: url,
    previousFloorPlan: null
  }),
  
  setRoomLabels: (labels) => set({ roomLabels: labels }),
  
  setRoomDimensions: (dimensions) => set({ roomDimensions: dimensions }),
  
  setCurrentFloorPlan: (planUrl) => set((state) => ({ 
    previousFloorPlan: state.currentFloorPlan,
    currentFloorPlan: planUrl 
  })),
  
  setPreviousFloorPlan: (planUrl) => set({ previousFloorPlan: planUrl }),
  
  setFinalRender: (renderUrl) => set({ finalRender: renderUrl }),
  
  setIsLoading: (isLoading) => set({ isLoading }),
  
  setLoadingMessage: (loadingMessage) => set({ loadingMessage }),

  setIsAppStarted: (started) => set({ isAppStarted: started }),

  resetStore: () => set({
    phase: 'search',
    conversationHistory: [],
    selectedNatureImage: null,
    hoveredNatureImage: null,
    collectedParameters: { ...defaultParameters },
    generatedOptions: [],
    selectedOptionIndex: null,
    selectedOptionUrl: null,
    roomLabels: {},
    roomDimensions: {},
    currentFloorPlan: null,
    previousFloorPlan: null,
    finalRender: null,
    isLoading: false,
    loadingMessage: '',
  })
}));
