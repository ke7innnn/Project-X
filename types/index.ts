export type Phase =
  | 'search'
  | 'concept'
  | 'parameters'
  | 'vastu'
  | 'generate'
  | 'measure'
  | 'edit'
  | 'export'
  | 'reimport';

export interface RenderHistoryItem {
  id: string;
  base64: string;
  style: string;
  sunpath: string;
}

export interface NatureImage {
  id: string;
  url: string;
  thumbUrl: string;
  description: string;
  photographer: string;
}

export interface ConversationMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
  customType?: 'image-grid' | 'parameters-summary' | 'download-button' | 'upload-prompt' | 'selected-image' | 'floorplan-drafts' | 'floorplan-edit' | 'uploaded-image';
  customData?: any;
}

export interface CollectedParameters {
  plotWidth: number | null;
  plotHeight: number | null;
  plotArea: number | null;
  orientation: string | null;
  rooms: string[];
  vastuRules: string[];
  sunPath: string | null;
  garden: boolean;
  parking: boolean;
  floors: number;
  surroundings: string | null;
  additionalNotes: string[];
  aspectRatio: string | null;
  isPlotBurned?: boolean;
}

export interface ArchitectStore {
  projectName: string | null;
  placeName: string | null;
  phase: Phase;
  conversationHistory: ConversationMessage[];
  selectedNatureImage: NatureImage | null;
  hoveredNatureImage: NatureImage | null;
  lastUploadedImage: string | null;
  lastUploadedImageDescription: string | null;
  collectedParameters: CollectedParameters;
  generatedOptions: string[];
  selectedOptionIndex: number | null;
  selectedOptionUrl: string | null;
  roomLabels: Record<string, string>;
  roomDimensions: Record<string, string>;
  currentFloorPlan: string | null;
  previousFloorPlan: string | null;
  finalRender: string | null;
  isLoading: boolean;
  loadingMessage: string;
  isAppStarted: boolean;
  sessionId: string | null;
  isRestored: boolean;
  isAuthenticated: boolean;
  selectedStyle: string;
  sunpath: string;
  customSunpath: string;
  renderHistory: RenderHistoryItem[];
  viewingHistoryId: string | null;
  setPhase: (phase: Phase) => void;
  addMessage: (message: ConversationMessage) => void;
  updateHistory: (history: ConversationMessage[]) => void;
  setSelectedNatureImage: (image: NatureImage | null) => void;
  setHoveredNatureImage: (image: NatureImage | null) => void;
  updateParameters: (params: Partial<CollectedParameters>) => void;
  setGeneratedOptions: (options: string[]) => void;
  setSelectedOption: (index: number | null, url: string | null) => void;
  setRoomLabels: (labels: Record<string, string>) => void;
  setRoomDimensions: (dimensions: Record<string, string>) => void;
  setCurrentFloorPlan: (planUrl: string | null) => void;
  setPreviousFloorPlan: (planUrl: string | null) => void;
  setFinalRender: (renderUrl: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setLoadingMessage: (message: string) => void;
  setLastUploadedImage: (base64: string | null, description: string | null) => void;
  setIsAppStarted: (started: boolean) => void;
  setSessionId: (id: string) => void;
  setIsRestored: (restored: boolean) => void;
  setIsAuthenticated: (auth: boolean) => void;
  setSelectedStyle: (style: string) => void;
  setSunpath: (sunpath: string) => void;
  setCustomSunpath: (customSunpath: string) => void;
  setRenderHistory: (history: RenderHistoryItem[]) => void;
  setViewingHistoryId: (id: string | null) => void;
  addRenderHistoryItem: (item: RenderHistoryItem) => void;
  replaceState: (state: Partial<ArchitectStore>) => void;
  resetStore: () => void;
  switchSession: (sessionId: string, projectName: string, placeName: string) => void;
}
