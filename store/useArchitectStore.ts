import { create } from 'zustand';
import { ArchitectStore, Phase, ConversationMessage, NatureImage, CollectedParameters } from '@/types';

/** Single source of truth for deriving the flat vault[] list from a project's assets. */
function computeVault(project: any): any[] {
  if (!project?.assets) return [];
  const vault: any[] = [];
  const { floorPlans = [], hero, angles = [], dxf, flythrough, uploads = [] } = project.assets;
  const ts = project.updatedAt;

  floorPlans.forEach((fp: any) => {
    if (fp.url) vault.push({ id: fp.id, type: 'floor_plan', url: fp.url, addedAt: ts });
  });
  if (hero) vault.push({ id: 'hero', type: 'hero_render', url: hero, addedAt: ts });
  angles.forEach((ang: any) => {
    if (ang.url) vault.push({ id: ang.id, type: 'angle', url: ang.url, addedAt: ts });
  });
  if (dxf) vault.push({ id: 'dxf', type: 'dxf', url: dxf, addedAt: ts });
  if (flythrough) {
    const url = flythrough.videoUrl || flythrough.stillUrl;
    if (url) vault.push({ id: 'flythrough', type: 'flythrough', url, addedAt: ts });
  }
  uploads.forEach((up: any) => {
    if (up.url) vault.push({ id: up.id, type: 'hero_render', url: up.url, addedAt: up.addedAt });
  });
  return vault;
}


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
  buildingShape: null,
};

export const useArchitectStore = create<ArchitectStore>((set) => ({
  projectName: null,
  placeName: null,
  phase: 'search',
  onboardingMode: 'select',
  conversationHistory: [{
    role: 'model',
    parts: [{ text: "Welcome! I'm your AI Architect Assistant 🏛️ How would you like to define your plot boundary?" }],
    customType: 'plot-trace-options'
  }],
  selectedNatureImage: null,
  hoveredNatureImage: null,
  lastUploadedImage: null,
  lastUploadedImageDescription: null,
  manualPlotImage: null,
  collectedParameters: { ...defaultParameters },
  generatedOptions: [],
  selectedOptionIndex: null,
  selectedOptionUrl: null,
  roomLabels: {},
  roomDimensions: {},
  currentFloorPlan: null,
  previousFloorPlan: null,
  floorPlanHistory: [],
  finalRender: null,
  isLoading: false,
  loadingMessage: '',
  isAppStarted: false,
  sessionId: null,
  isRestored: false,
  isAuthenticated: false,
  selectedStyle: 'Normal',
  sunpath: 'North',
  customSunpath: '',
  renderHistory: [],
  viewingHistoryId: null,
  inpaintActive: false,
  paintedFloorPlan: null,
  inpaintMask: null,
  inpaintRenderActive: false,
  paintedRender: null,
  activeProjectId: null,
  activeProject: null,
  vault: [],
  hudModal: null,

  setActiveProjectId: (id) => set({ activeProjectId: id, sessionId: id }),
  setActiveProject: (project) => set((state) => {
    if (!project) return { activeProject: null, vault: [] };
    return { activeProject: project, vault: computeVault(project), projectName: project.name };
  }),

  updateActiveProjectConfig: (configUpdates) => set((state) => {
    if (!state.activeProject) return {};
    const updatedProject = {
      ...state.activeProject,
      updatedAt: Date.now(),
      config: {
        ...state.activeProject.config,
        ...configUpdates
      }
    };
    return { activeProject: updatedProject };
  }),

  addProjectAsset: (type, assetData) => set((state) => {
    if (!state.activeProject) return {};
    const assets = { ...state.activeProject.assets };
    
    if (type === 'floorPlans') {
      const isPrimary = assets.floorPlans.length === 0 || assetData.isPrimary;
      if (isPrimary) {
        assets.floorPlans = assets.floorPlans.map(fp => ({ ...fp, isPrimary: false }));
      }
      assets.floorPlans.push({
        id: assetData.id || crypto.randomUUID(),
        url: assetData.url,
        isPrimary,
        source: assetData.source || 'generated'
      });
    } else if (type === 'hero') {
      assets.hero = assetData;
    } else if (type === 'angles') {
      // Avoid duplicate angles by label/url
      if (!assets.angles.some(a => a.url === assetData.url)) {
        assets.angles.push({
          id: assetData.id || crypto.randomUUID(),
          label: assetData.label || 'ANGLE',
          url: assetData.url
        });
      }
    } else if (type === 'dxf') {
      assets.dxf = assetData;
    } else if (type === 'flythrough') {
      assets.flythrough = {
        ...assets.flythrough,
        ...assetData
      };
    } else if (type === 'uploads') {
      assets.uploads.push({
        id: assetData.id || crypto.randomUUID(),
        url: assetData.url,
        source: 'uploaded',
        addedAt: Date.now()
      });
    }

    const updatedProject = {
      ...state.activeProject,
      updatedAt: Date.now(),
      assets
    };
    return { activeProject: updatedProject, vault: computeVault(updatedProject) };
  }),

  removeProjectAsset: (type, assetId) => set((state) => {
    if (!state.activeProject) return {};
    const assets = { ...state.activeProject.assets };

    if (type === 'floorPlans') {
      assets.floorPlans = assets.floorPlans.filter(fp => fp.id !== assetId);
      // Ensure one is primary if left
      if (assets.floorPlans.length > 0 && !assets.floorPlans.some(fp => fp.isPrimary)) {
        assets.floorPlans[0].isPrimary = true;
      }
    } else if (type === 'angles') {
      assets.angles = assets.angles.filter(ang => ang.id !== assetId);
    } else if (type === 'uploads') {
      assets.uploads = assets.uploads.filter(up => up.id !== assetId);
    }

    const updatedProject = {
      ...state.activeProject,
      updatedAt: Date.now(),
      assets
    };
    return { activeProject: updatedProject, vault: computeVault(updatedProject) };
  }),

  setPrimaryFloorPlan: (assetId) => set((state) => {
    if (!state.activeProject) return {};
    const floorPlans = state.activeProject.assets.floorPlans.map(fp => ({
      ...fp,
      isPrimary: fp.id === assetId
    }));
    const updatedProject = {
      ...state.activeProject,
      updatedAt: Date.now(),
      assets: {
        ...state.activeProject.assets,
        floorPlans
      }
    };
    return { activeProject: updatedProject };
  }),

  setOnboardingMode: (mode) => set({ onboardingMode: mode }),

  setLastUploadedImage: (base64, description) => set({ lastUploadedImage: base64, lastUploadedImageDescription: description }),
  setManualPlotImage: (base64) => set({ manualPlotImage: base64 }),

  setPhase: (phase) => set({ phase }),
  
  addMessage: (message) => set((state) => ({ 
    conversationHistory: [...state.conversationHistory, message] 
  })),

  updateHistory: (history) => set({ conversationHistory: history }),
  
  restartProject: () => set((state) => ({
    projectName: null,
    placeName: null,
    phase: 'search',
    onboardingMode: 'select',
    conversationHistory: [{
      role: 'model',
      parts: [{ text: "Welcome! I'm your AI Architect Assistant 🏛️ How would you like to define your plot boundary?" }],
      customType: 'plot-trace-options'
    }],
    selectedNatureImage: null,
    hoveredNatureImage: null,
    lastUploadedImage: null,
    lastUploadedImageDescription: null,
    manualPlotImage: null,
    collectedParameters: {
      plotWidth: null, plotHeight: null, plotArea: null, orientation: null,
      rooms: [], vastuRules: [], sunPath: null, garden: false, parking: false,
      floors: 1, surroundings: null, additionalNotes: [], aspectRatio: null, buildingShape: null
    },
    generatedOptions: [],
    selectedOptionIndex: null,
    selectedOptionUrl: null,
    roomLabels: {},
    roomDimensions: {},
    currentFloorPlan: null,
    previousFloorPlan: null,
    floorPlanHistory: [],
    finalRender: null,
    isLoading: false,
    loadingMessage: '',
    selectedStyle: 'Normal',
    sunpath: 'North',
    customSunpath: '',
    renderHistory: [],
    viewingHistoryId: null,
    inpaintActive: false,
    paintedFloorPlan: null,
    inpaintRenderActive: false,
    paintedRender: null,
    activeProjectId: null,
    activeProject: null,
    vault: [],
  })),
  
  setSelectedNatureImage: (image) => set((state) => {
    const nextPhase = state.phase === 'search' && image ? 'concept' : state.phase;
    const nextHistory = [...state.conversationHistory];

    if (state.phase === 'search' && image) {
      nextHistory.push({
        role: 'user',
        parts: [{ text: `Selected nature inspiration: ${image.description}` }],
        customType: 'selected-image',
        customData: image
      });

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
  
  setCurrentFloorPlan: (planUrl) => set((state) => {
    if (!planUrl) return { currentFloorPlan: null };
    const newHistory = [...state.floorPlanHistory];
    if (newHistory.length === 0 || newHistory[newHistory.length - 1] !== planUrl) {
      newHistory.push(planUrl);
    }
    return {
      currentFloorPlan: planUrl,
      floorPlanHistory: newHistory
    };
  }),
  
  setPreviousFloorPlan: (planUrl) => set({ previousFloorPlan: planUrl }),
  
  setFinalRender: (renderUrl) => set({ finalRender: renderUrl }),
  
  setIsLoading: (isLoading) => set({ isLoading }),
  
  setLoadingMessage: (loadingMessage) => set({ loadingMessage }),

  setIsAppStarted: (started) => set({ isAppStarted: started }),

  setSessionId: (id) => set({ sessionId: id }),
  
  setIsRestored: (restored) => set({ isRestored: restored }),
  
  setIsAuthenticated: (auth) => set({ isAuthenticated: auth }),
  
  setSelectedStyle: (selectedStyle) => set({ selectedStyle }),
  setSunpath: (sunpath) => set({ sunpath }),
  setCustomSunpath: (customSunpath) => set({ customSunpath }),
  setRenderHistory: (renderHistory) => set({ renderHistory }),
  setViewingHistoryId: (viewingHistoryId) => set({ viewingHistoryId }),
  addRenderHistoryItem: (item) => set((state) => ({ renderHistory: [...state.renderHistory, item] })),
  setInpaintActive: (active) => set({ inpaintActive: active }),
  setPaintedFloorPlan: (paintedFloorPlan) => set({ paintedFloorPlan }),
  setInpaintMask: (inpaintMask) => set({ inpaintMask }),
  setInpaintRenderActive: (active) => set({ inpaintRenderActive: active }),
  setPaintedRender: (paintedRender) => set({ paintedRender }),
  
  replaceState: (newState) => set((state) => {
    const updatedState = { ...state, ...newState } as any;
    
    // If activeProjectId is set but activeProject is missing or needs self-healing
    if (updatedState.activeProjectId && !updatedState.activeProject) {
      updatedState.activeProject = {
        id: updatedState.activeProjectId,
        name: updatedState.projectName || `Untitled Project — ${new Date().toLocaleString()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        config: {
          footprintShape: updatedState.collectedParameters?.buildingShape || '',
          width: updatedState.collectedParameters?.plotWidth?.toString() || '',
          length: updatedState.collectedParameters?.plotHeight?.toString() || '',
          stories: updatedState.collectedParameters?.floors?.toString() || '',
          unitMix: '',
          designNotes: updatedState.collectedParameters?.additionalNotes?.join(', ') || ''
        },
        assets: {
          floorPlans: updatedState.currentFloorPlan ? [{
            id: crypto.randomUUID(),
            url: updatedState.currentFloorPlan,
            isPrimary: true,
            source: 'generated'
          }] : [],
          hero: updatedState.finalRender || null,
          angles: [],
          dxf: null,
          flythrough: null,
          uploads: []
        },
        status: 'active'
      };
    }
    
    // Sync vault helper array from activeProject
    if (updatedState.activeProject) {
      const project = updatedState.activeProject;
      // Defensive normalization for partially-migrated data
      if (!project.assets) {
        project.assets = { floorPlans: [], hero: null, angles: [], dxf: null, flythrough: null, uploads: [] };
      }
      if (!project.assets.floorPlans) project.assets.floorPlans = [];
      if (!project.assets.angles) project.assets.angles = [];
      if (!project.assets.uploads) project.assets.uploads = [];
      // Ensure IDs exist (self-heal old data)
      project.assets.floorPlans.forEach((fp: any) => { if (!fp.id) fp.id = crypto.randomUUID(); });
      project.assets.angles.forEach((ang: any) => { if (!ang.id) ang.id = crypto.randomUUID(); });
      project.assets.uploads.forEach((up: any) => { if (!up.id) up.id = crypto.randomUUID(); });
      updatedState.vault = computeVault(project);
    }

    return updatedState;
  }),

  switchSession: (sessionId, projectName, placeName) => {
    const defaultProj = {
      id: sessionId,
      name: projectName || `Untitled Project — ${new Date().toLocaleString()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      config: {
        footprintShape: '',
        width: '',
        length: '',
        stories: '',
        unitMix: '',
        designNotes: ''
      },
      assets: {
        floorPlans: [],
        hero: null,
        angles: [],
        dxf: null,
        flythrough: null,
        uploads: []
      },
      status: 'active'
    };

    set({
      projectName,
      placeName,
      phase: 'search',
      conversationHistory: [{
        role: 'model',
        parts: [{ text: "Welcome! I'm your AI Architect Assistant 🏛️ How would you like to define your plot boundary?" }],
        customType: 'plot-trace-options'
      }],
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
      isAppStarted: true,
      sessionId,
      activeProjectId: sessionId,
      activeProject: defaultProj,
      isRestored: false,
      selectedStyle: 'Normal',
      sunpath: 'North',
      customSunpath: '',
      renderHistory: [],
      viewingHistoryId: null,
      inpaintActive: false,
      paintedFloorPlan: null,
      vault: [],
    });
  },

  resetStore: () => set({
    projectName: null,
    placeName: null,
    phase: 'search',
    conversationHistory: [{
      role: 'model',
      parts: [{ text: "Welcome! I'm your AI Architect Assistant 🏛️ How would you like to define your plot boundary?" }],
      customType: 'plot-trace-options'
    }],
    selectedNatureImage: null,
    hoveredNatureImage: null,
    manualPlotImage: null,
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
    selectedStyle: 'Normal',
    sunpath: 'North',
    customSunpath: '',
    renderHistory: [],
    viewingHistoryId: null,
    inpaintActive: false,
    paintedFloorPlan: null,
    inpaintMask: null,
    inpaintRenderActive: false,
    paintedRender: null,
    activeProjectId: null,
    activeProject: null,
    vault: [],
    hudModal: null,
  }),

  showHUDModal: (modal) => new Promise((resolve) => {
    set({
      hudModal: {
        ...modal,
        isOpen: true,
        onResolve: (res) => {
          resolve(res);
          set({ hudModal: null });
        }
      }
    });
  }),

  closeHUDModal: (result) => set((state) => {
    if (state.hudModal) {
      state.hudModal.onResolve(result);
    }
    return { hudModal: null };
  }),
}));
