'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Box, Download, Settings2, Sparkles, Loader2, UploadCloud, Folder, Search, Plus, MapPin, Clock, Trash2, Map } from 'lucide-react';
import CinematicIntro from '@/components/CinematicIntro';
import { RenderHistoryItem } from '@/types';
import SaveToProjectModal from '@/components/SaveToProjectModal';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

export default function Render3DPage() {
  const router = useRouter();
  const { currentFloorPlan, setCurrentFloorPlan, finalRender, setFinalRender, collectedParameters, projectName, placeName } = useArchitectStore();
  const switchSession = useArchitectStore(state => state.switchSession);
  const { replaceState, sessionId } = useArchitectStore();

  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sunpath, setSunpath] = useState('North');
  const [customSunpath, setCustomSunpath] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('Normal');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renderHistory, setRenderHistory] = useState<RenderHistoryItem[]>([]);
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Render image editing state
  const [editRenderPrompt, setEditRenderPrompt] = useState('');
  const [isEditingRender, setIsEditingRender] = useState(false);
  const [editedRenderBase64, setEditedRenderBase64] = useState<string | null>(null);
  const [editRenderError, setEditRenderError] = useState<string | null>(null);
  const editPromptRef = useRef<HTMLTextAreaElement>(null);

  // Pre-page Project Selection Dashboard state
  const [showSelector, setShowSelector] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newPlaceName, setNewPlaceName] = useState('');

  useEffect(() => {
    if (sessionId) {
      setShowSelector(false);
    }
  }, [sessionId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (showSelector) {
      fetchProjects();
      interval = setInterval(fetchProjects, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showSelector]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const { data, error } = await supabase
        .from('render3d_projects')
        .select('session_id, state, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setProjects(data || []);
    } catch (err) {
      console.error('Error fetching projects:', err);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleGenerateRender = async () => {
    if (!currentFloorPlan || isRendering) return;
    
    setIsRendering(true);
    setError(null);
    const directionToUse = sunpath === 'custom' ? customSunpath : sunpath;
    
    try {
      const res = await fetch('/api/final-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorPlanBase64: currentFloorPlan,
          collectedParameters,
          renderStyle: selectedStyle,
          sunpathDirection: directionToUse
        })
      });
      const data = await res.json();
      if (data.render) {
        const newItem: RenderHistoryItem = {
          id: Math.random().toString(),
          base64: data.render,
          style: selectedStyle,
          sunpath: directionToUse
        };
        setRenderHistory(prev => [...prev, newItem]);
        setViewingHistoryId(newItem.id); // Open inspect view
        setFinalRender(data.render); // Save in store
      } else {
        setError(data.error || '3D render failed. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsRendering(false);
    }
  };

  const handleEditRender = async (sourceBase64: string) => {
    if (!editRenderPrompt.trim() || isEditingRender) return;
    setIsEditingRender(true);
    setEditedRenderBase64(null);
    setEditRenderError(null);
    try {
      const res = await fetch('/api/edit-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renderBase64: sourceBase64, editPrompt: editRenderPrompt })
      });
      const data = await res.json();
      if (data.editedRender) {
        setEditedRenderBase64(data.editedRender);
        // Also push to render history
        const newItem: RenderHistoryItem = {
          id: Math.random().toString(),
          base64: data.editedRender,
          style: selectedStyle + ' (Edited)',
          sunpath: sunpath
        };
        setRenderHistory(prev => [...prev, newItem]);
        setFinalRender(data.editedRender);
      } else {
        setEditRenderError(data.error || 'Edit failed. Please try again.');
      }
    } catch (err) {
      setEditRenderError('Network error. Please try again.');
    } finally {
      setIsEditingRender(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setCurrentFloorPlan(base64);
        setFinalRender(null); // Reset render when a new plan is uploaded
        setRenderHistory([]); // Clear local renders history
        setViewingHistoryId(null);
      }
    };
    reader.readAsDataURL(file);
    
    // Reset input so the same file can be uploaded again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const downloadImageDirect = (base64Data: string, filename: string) => {
    const a = document.createElement('a');
    a.href = `data:image/jpeg;base64,${base64Data}`;
    a.download = filename;
    a.click();
  };

  const downloadFloorPlan = () => {
    if (!currentFloorPlan) return;
    const a = document.createElement('a');
    a.href = currentFloorPlan;
    a.download = 'floorplan.png';
    a.click();
  };

  return (
    <main className="flex flex-col w-full h-screen bg-[#0a0a0f] text-[#FFB000] font-mono overflow-hidden relative">
      <CinematicIntro 
        videoPath="/stage videos/Chapter 3 - 3D Render.mp4" 
        title="Chapter 3 - THE RENDER" 
      />

      {/* Subtle animated background gradient */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-10 pointer-events-none z-0" />

      {/* Top Bar */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-[#1e1810] bg-[#0f0f18]/80 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => {
              if (sessionId) {
                router.push(`/workspace/${sessionId}`);
              } else {
                router.push('/');
              }
            }}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-[#FFB000]/30 hover:border-[#FFB000] hover:bg-[#FFB000]/10 transition-all group cursor-pointer"
          >
            <ArrowLeft className="text-[#FFB000]/70 group-hover:text-[#FFB000]" size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-[4px] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
              3D Render Matrix
            </h1>
            <span className="text-[10px] tracking-[3px] text-[#FFB000]/60 uppercase">
              {projectName ? `Project: ${projectName} (${placeName || 'Unknown Location'})` : 'Photorealistic Generation Engine'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest bg-[#1e1810] border border-[#FFB000]/30 text-[#FFB000] hover:bg-[#FFB000]/10 hover:border-[#FFB000] font-bold rounded transition-colors cursor-pointer"
          >
            <UploadCloud size={14} /> Upload Plan
          </button>

          {finalRender && (
            <button 
              onClick={() => setIsSaveModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest bg-[#1e1810] border border-[#FFB000]/30 text-[#FFB000] hover:bg-[#FFB000]/10 hover:border-[#FFB000] font-bold rounded transition-colors cursor-pointer"
            >
              <Folder size={14} /> Save to Project
            </button>
          )}

          <button 
            onClick={() => setShowSelector(true)}
            className="px-4 py-2 text-[10px] uppercase tracking-widest border border-[#FFB000]/50 text-[#FFB000] hover:bg-[#FFB000]/10 rounded transition-colors cursor-pointer"
          >
            Switch Project
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex flex-1 overflow-hidden">
        
        {/* Left Side: Viewport & Render History */}
        <div className="flex-1 flex flex-col p-8 overflow-y-auto relative custom-scrollbar">
          {currentFloorPlan ? (
            <div className="flex flex-col gap-6 w-full mb-8">
              {/* 2D Blueprint Image Viewport */}
              <div className="flex justify-between items-center pb-4 border-b border-[#1e1810]">
                <h3 className="text-sm font-bold tracking-[3px] text-white uppercase">2D Blueprint View</h3>
                <button 
                  onClick={downloadFloorPlan}
                  className="flex items-center gap-2 bg-[#1e1810] hover:bg-[#FFB000]/10 border border-[#FFB000]/30 text-[#FFB000] px-4 py-2 rounded text-[10px] uppercase tracking-widest font-bold transition-all cursor-pointer"
                >
                  <Download size={12} /> Download Plan
                </button>
              </div>
              
              <div className="w-full max-h-[50vh] flex items-center justify-center bg-white p-6 rounded-xl border border-zinc-800 shadow-2xl">
                <img 
                  src={currentFloorPlan.startsWith('data:image/') ? currentFloorPlan : `data:image/jpeg;base64,${currentFloorPlan}`} 
                  alt="Draft Floor Plan" 
                  className="max-w-full max-h-[45vh] object-contain rounded"
                />
              </div>

              {/* RENDER HISTORY SECTION */}
              <div className="w-full mt-6">
                <h3 className="text-sm font-bold tracking-[3px] text-white uppercase mb-4">Generated 3D Renders History</h3>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  {renderHistory.map((item) => (
                    <div key={item.id} className="bg-[#0f0f18] border border-zinc-800 rounded-xl overflow-hidden hover:border-[#FFB000]/50 transition-all flex flex-col shadow-lg">
                      <div className="aspect-video relative overflow-hidden bg-black/40">
                        <img src={item.base64.startsWith('data:image/') ? item.base64 : `data:image/jpeg;base64,${item.base64}`} alt="Render Thumb" className="w-full h-full object-cover" />
                      </div>
                      <div className="p-3 flex-1 flex flex-col justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-bold text-[#FFB000] uppercase truncate">{item.style}</div>
                          <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Sun: {item.sunpath}</div>
                        </div>
                        
                        <div className="flex gap-1.5 mt-2">
                          <button
                            onClick={() => {
                            setEditedRenderBase64(null);
                            setEditRenderPrompt('');
                            setEditRenderError(null);
                            setViewingHistoryId(item.id);
                          }}
                            className="flex-1 py-1.5 bg-[#FFB000]/10 border border-[#FFB000]/30 hover:border-[#FFB000] text-[#FFB000] hover:text-[#0a0a0f] hover:bg-[#FFB000] font-bold uppercase tracking-widest text-[8px] rounded transition-all cursor-pointer font-mono"
                          >
                            Inspect
                          </button>
                          <button
                            onClick={() => downloadImageDirect(item.base64, `render-${item.style.replace(/\s+/g, '-')}.png`)}
                            className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-[8px] transition-colors cursor-pointer"
                            title="Download"
                          >
                            <Download size={12} />
                          </button>
                          <button
                            onClick={() => {
                              setRenderHistory(prev => prev.filter(h => h.id !== item.id));
                              if (viewingHistoryId === item.id) setViewingHistoryId(null);
                            }}
                            className="px-2 py-1.5 bg-red-950/20 hover:bg-red-900/50 text-red-400 rounded text-[8px] transition-colors cursor-pointer"
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* GENERATING LOADING CARD */}
                  {isRendering && (
                    <div className="bg-[#0f0f18] border border-[#FFB000]/40 rounded-xl overflow-hidden animate-pulse flex flex-col justify-center items-center p-6 min-h-[160px]">
                      <div className="w-8 h-8 border-3 border-[#FFB000] border-t-transparent rounded-full animate-spin mb-3" />
                      <span className="text-[9px] text-[#FFB000] tracking-widest uppercase text-center font-bold">Generating Render...</span>
                    </div>
                  )}

                  {!isRendering && renderHistory.length === 0 && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-xl bg-black/10 text-zinc-500">
                      <span className="text-xs uppercase tracking-widest">No Renders Generated Yet</span>
                      <span className="text-[9px] uppercase tracking-widest mt-1 text-zinc-600">Select a style and sunpath on the right to start</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-[#FFB000]/40 p-12 border-2 border-dashed border-[#FFB000]/20 rounded-xl bg-[#0f0f18]/30">
              <UploadCloud size={64} className="mb-6 opacity-50 text-[#FFB000]" />
              <h2 className="text-xl tracking-[4px] font-bold text-white uppercase mb-2">Upload Floor Plan</h2>
              <p className="text-[#FFB000]/60 tracking-[2px] text-xs uppercase max-w-md text-center mb-8">
                Upload a 2D floor plan image to initialize the photorealistic 3D generation sequence.
              </p>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3 px-8 py-4 bg-[#FFB000]/10 border border-[#FFB000] text-[#FFB000] hover:bg-[#FFB000] hover:text-[#0a0a0f] uppercase tracking-widest font-bold transition-all cursor-pointer"
              >
                <UploadCloud size={18} /> Select Image
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Filters & Settings */}
        <div className="w-[360px] border-l border-[#1e1810] bg-[#0f0f18]/90 backdrop-blur-md flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
          <div className="p-6 border-b border-[#1e1810]">
            <h2 className="text-sm tracking-[3px] text-[#FFB000] font-bold uppercase flex items-center gap-2">
              <Settings2 size={14} /> Render Filters
            </h2>
            <p className="text-[10px] tracking-wide text-[#FFB000]/60 mt-2 leading-relaxed">
              Configure lighting, environment, and material aesthetics.
            </p>
          </div>

          <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
            {error && (
              <div className="p-3 border border-red-500/40 bg-red-500/10 text-red-400 text-[10px] uppercase tracking-wide rounded">
                ⚠️ {error}
              </div>
            )}

            {currentFloorPlan ? (
              <div className="flex flex-col gap-6">
                {/* Architectural Style Selector */}
                <div className="p-4 border border-zinc-800 bg-[#07070a] rounded flex flex-col gap-3">
                  <span className="text-[10px] font-bold tracking-[2px] uppercase text-white">Architectural Style</span>
                  <p className="text-[9px] text-zinc-500 uppercase tracking-wider leading-relaxed">
                    Choose an architectural aesthetic theme for the generated 3D render.
                  </p>
                  
                  <div className="space-y-2">
                    <select
                      value={selectedStyle}
                      onChange={(e) => setSelectedStyle(e.target.value)}
                      disabled={isRendering}
                      className="w-full bg-black text-xs border border-gray-700 text-white rounded px-3 py-2.5 focus:outline-none focus:border-[#FFB000] uppercase font-mono cursor-pointer"
                    >
                      <option value="Normal">Style: Normal / Default</option>
                      <optgroup label="Minimalist">
                        <option value="Minimalist Modern">Minimalist Modern</option>
                        <option value="Japandi">Japandi</option>
                        <option value="Scandinavian">Scandinavian</option>
                        <option value="Bauhaus">Bauhaus</option>
                      </optgroup>
                      <optgroup label="Industrial">
                        <option value="Industrial Loft">Industrial Loft</option>
                        <option value="Brutalist">Brutalist</option>
                        <option value="Warehouse Conversion">Warehouse Conversion</option>
                        <option value="Steampunk">Steampunk</option>
                      </optgroup>
                      <optgroup label="Modern">
                        <option value="Contemporary">Contemporary</option>
                        <option value="Mid-Century Modern">Mid-Century Modern</option>
                        <option value="Hi-Tech">Hi-Tech</option>
                        <option value="Parametric/Deconstructivist">Parametric/Deconstructivist</option>
                      </optgroup>
                      <optgroup label="Organic/Natural">
                        <option value="Biophilic">Biophilic</option>
                        <option value="Earthen/Adobe">Earthen/Adobe</option>
                        <option value="Blob Architecture">Blob Architecture</option>
                        <option value="Mediterranean">Mediterranean</option>
                      </optgroup>
                      <optgroup label="Historic/Classical">
                        <option value="Gothic">Gothic</option>
                        <option value="Renaissance">Renaissance</option>
                        <option value="Neoclassical">Neoclassical</option>
                        <option value="Victorian">Victorian</option>
                      </optgroup>
                      <optgroup label="Futuristic/Speculative">
                        <option value="Cyberpunk">Cyberpunk</option>
                        <option value="Sci-Fi">Sci-Fi</option>
                        <option value="Afrofuturist">Afrofuturist</option>
                        <option value="Solarpunk">Solarpunk</option>
                      </optgroup>
                      <optgroup label="Luxury/Decorative">
                        <option value="Contemporary Luxury">Contemporary Luxury</option>
                        <option value="Art Deco">Art Deco</option>
                        <option value="Maximalist">Maximalist</option>
                        <option value="Tropical Luxury">Tropical Luxury</option>
                      </optgroup>
                    </select>
                  </div>
                </div>

                {/* Sunpath Controller */}
                <div className="p-4 border border-[#FFB000]/30 bg-[#FFB000]/5 rounded flex flex-col gap-3">
                  <span className="text-[10px] font-bold tracking-[2px] uppercase text-[#FFB000]">Shadows (Sunpath)</span>
                  <p className="text-[9px] text-[#FFB000]/60 uppercase tracking-wider leading-relaxed">
                    Shift the position of the sun. Extremely faint, diffuse shadows will project on the opposite side.
                  </p>
                  
                  <div className="space-y-2">
                    <label className="block text-[9px] uppercase tracking-widest text-zinc-400">Direction</label>
                    <select
                      value={sunpath}
                      onChange={(e) => {
                        setSunpath(e.target.value);
                        if (e.target.value !== 'custom') setCustomSunpath('');
                      }}
                      disabled={isRendering}
                      className="w-full bg-black text-xs border border-gray-700 text-white rounded px-3 py-2.5 focus:outline-none focus:border-[#FFB000] uppercase font-mono cursor-pointer"
                    >
                      <option value="North">North (Shadows South)</option>
                      <option value="South">South (Shadows North)</option>
                      <option value="East">East (Shadows West)</option>
                      <option value="West">West (Shadows East)</option>
                      <option value="North-East">North-East (Shadows South-West)</option>
                      <option value="North-West">North-West (Shadows South-East)</option>
                      <option value="South-East">South-East (Shadows North-West)</option>
                      <option value="South-West">South-West (Shadows North-East)</option>
                      <option value="custom">Custom Direction...</option>
                    </select>
                  </div>

                  {sunpath === 'custom' && (
                    <div className="space-y-2">
                      <label className="block text-[9px] uppercase tracking-widest text-zinc-400">Custom Position</label>
                      <input
                        type="text"
                        value={customSunpath}
                        onChange={(e) => setCustomSunpath(e.target.value)}
                        disabled={isRendering}
                        placeholder="E.G. LOW ON THE WESTERN HORIZON"
                        className="w-full bg-black text-xs border border-gray-700 text-white rounded px-3 py-2.5 focus:outline-none focus:border-[#FFB000] uppercase font-mono tracking-wider"
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={handleGenerateRender}
                  disabled={isRendering}
                  className="w-full py-4 bg-[#FFB000] text-black font-bold uppercase tracking-widest text-xs rounded hover:bg-[#e09c00] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(255,176,0,0.15)]"
                >
                  {isRendering && <Loader2 size={14} className="animate-spin" />}
                  {isRendering ? 'Generating Concept...' : 'Generate 3D Render'}
                </button>
              </div>
            ) : (
              <p className="text-[9px] tracking-widest uppercase text-zinc-500 text-center py-4">
                Upload floor plan to unlock filters
              </p>
            )}

            {/* Filter Placeholders */}
            <div className="space-y-4 opacity-30 pointer-events-none">
              <div className="flex justify-between items-center pb-2 border-b border-[#1e1810]">
                <span className="text-[10px] tracking-[2px] uppercase text-white">Time of Day</span>
                <span className="text-[9px] tracking-widest text-[#FFB000]">Coming Soon</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-[#1e1810]">
                <span className="text-[10px] tracking-[2px] uppercase text-white">Atmosphere</span>
                <span className="text-[9px] tracking-widest text-[#FFB000]">Coming Soon</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-[#1e1810]">
                <span className="text-[10px] tracking-[2px] uppercase text-white">Material Style</span>
                <span className="text-[9px] tracking-widest text-[#FFB000]">Coming Soon</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-[#1e1810]">
                <span className="text-[10px] tracking-[2px] uppercase text-white">Camera Angle</span>
                <span className="text-[9px] tracking-widest text-[#FFB000]">Coming Soon</span>
              </div>
            </div>

            <div className="mt-auto p-4 border border-[#FFB000]/20 bg-[#FFB000]/5 rounded">
              <p className="text-[9px] tracking-widest uppercase text-[#FFB000]/80 leading-relaxed text-center">
                Advanced structural filtering modules are currently offline pending authorization.
              </p>
            </div>
          </div>
        </div>

      </main>

      {/* DETAILED CONCEPT INSPECT MODAL OVERLAY */}
      {viewingHistoryId && (() => {
        const activeItem = renderHistory.find(h => h.id === viewingHistoryId);
        if (!activeItem) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 md:p-8 animate-fadeIn">
            <div className="bg-[#0A0E1A] border border-[#FFB000]/30 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
              {/* Modal Header */}
              <div className="flex justify-between items-center p-4 border-b border-zinc-800 bg-[#07070d]">
                <div>
                  <h3 className="text-[#FFB000] text-sm font-semibold uppercase tracking-wider">Viewing Rendered Concept</h3>
                  <span className="text-[10px] text-zinc-400 uppercase tracking-widest block mt-0.5">
                    Style: {activeItem.style} | Shadows: {activeItem.sunpath}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => downloadImageDirect(activeItem.base64, `render-${activeItem.style.replace(/\s+/g, '-')}.png`)}
                    className="flex items-center gap-2 bg-[#1F2937] hover:bg-[#374151] px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer text-white font-mono"
                  >
                    <Download size={14} /> Download PNG
                  </button>
                  <button 
                    onClick={() => setViewingHistoryId(null)}
                    className="flex items-center gap-2 bg-[#FFB000] hover:bg-[#e09c00] text-black font-bold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer font-mono"
                  >
                    Close
                  </button>
                </div>
              </div>
              
              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto bg-black/40 flex flex-col min-h-0">
                {/* Render image */}
                <div className="flex items-center justify-center p-6">
                  <img 
                    src={(editedRenderBase64 || activeItem.base64).startsWith('data:image/') ? (editedRenderBase64 || activeItem.base64) : `data:image/jpeg;base64,${editedRenderBase64 || activeItem.base64}`} 
                    alt="Detailed 3D Render" 
                    className="max-w-full max-h-[55vh] object-contain rounded-lg shadow-2xl border border-zinc-800" 
                  />
                </div>

                {/* Edit panel */}
                <div className="border-t border-zinc-800 bg-[#07070d] p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={13} className="text-[#FFB000]" />
                    <span className="text-[10px] font-bold uppercase tracking-[3px] text-[#FFB000]">Edit This Render with Grok</span>
                  </div>
                  <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Describe what to change — lighting, materials, landscaping, time of day, colours, etc.</p>

                  {editRenderError && (
                    <div className="text-red-400 text-[9px] uppercase tracking-wide border border-red-500/30 bg-red-500/10 rounded px-3 py-2">
                      ⚠️ {editRenderError}
                    </div>
                  )}
                  {editedRenderBase64 && !isEditingRender && (
                    <div className="text-green-400 text-[9px] uppercase tracking-wide border border-green-500/30 bg-green-500/10 rounded px-3 py-2">
                      ✓ Edit applied — saved to render history
                    </div>
                  )}

                  <div className="flex gap-2 items-end">
                    <textarea
                      ref={editPromptRef}
                      value={editRenderPrompt}
                      onChange={e => setEditRenderPrompt(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleEditRender(editedRenderBase64 || activeItem.base64);
                        }
                      }}
                      placeholder="E.G. change the sky to golden hour sunset, add lush greenery around the building..."
                      rows={2}
                      disabled={isEditingRender}
                      className="flex-1 bg-[#0a0a0f] border border-zinc-700 focus:border-[#FFB000] text-white text-xs rounded-lg px-3 py-2.5 resize-none outline-none font-mono placeholder:text-zinc-600 transition-colors disabled:opacity-50"
                    />
                    <button
                      onClick={() => handleEditRender(editedRenderBase64 || activeItem.base64)}
                      disabled={!editRenderPrompt.trim() || isEditingRender}
                      className="flex items-center gap-2 px-4 py-2.5 bg-[#FFB000] hover:bg-[#e09c00] text-black font-black uppercase tracking-widest text-[10px] rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_12px_rgba(255,176,0,0.3)] cursor-pointer whitespace-nowrap"
                    >
                      {isEditingRender ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      {isEditingRender ? 'Editing...' : 'Apply Edit'}
                    </button>
                  </div>

                  {isEditingRender && (
                    <div className="flex items-center gap-2 text-[#FFB000] text-[9px] uppercase tracking-widest animate-pulse">
                      <Loader2 size={11} className="animate-spin" />
                      Grok is processing your edit...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}


      {/* Selector view insertion */}
      {showSelector && (
        <div className="fixed inset-0 z-40 bg-[#0a0a0f] text-[#FFB000] overflow-y-auto">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-10 pointer-events-none z-0 fixed" />
          
          <header className="relative z-10 max-w-7xl mx-auto flex items-center justify-between p-8 border-b border-[#FFB000]/20">
            <div className="flex items-center gap-6">
              <button 
                onClick={() => {
                  if (sessionId) {
                    router.push(`/workspace/${sessionId}`);
                  } else {
                    router.push('/');
                  }
                }}
                className="flex items-center justify-center w-10 h-10 rounded-full border border-[#FFB000]/30 hover:border-[#FFB000] hover:bg-[#FFB000]/10 transition-all group cursor-pointer"
              >
                <ArrowLeft className="text-[#FFB000]/70 group-hover:text-[#FFB000]" size={18} />
              </button>
              <div>
                <h1 className="text-2xl font-bold tracking-[4px] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
                  3D Render Project Matrix
                </h1>
                <span className="text-xs tracking-[3px] text-[#FFB000]/60 uppercase">
                  Select a project for photorealistic generation
                </span>
              </div>
            </div>
            
            <div className="flex gap-4">
              {sessionId && (
                <button 
                  onClick={() => setShowSelector(false)}
                  className="px-6 py-3 border border-[#FFB000]/50 text-[#FFB000] hover:text-yellow-400 hover:bg-[#FFB000]/10 font-bold uppercase tracking-widest rounded-lg text-xs transition-colors cursor-pointer"
                >
                  Resume Current Project
                </button>
              )}
              <button 
                onClick={() => setIsNewProjectModalOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-[#FFB000] text-black hover:bg-[#e09c00] font-bold uppercase tracking-widest rounded-lg transition-all shadow-[0_0_20px_rgba(255,176,0,0.3)] cursor-pointer"
              >
                <Plus size={18} /> Initialize Project
              </button>
            </div>
          </header>

          <main className="relative z-10 max-w-7xl mx-auto p-8">
            <div className="relative max-w-md mb-8">
              <Search className="absolute left-3 top-3 text-[#FFB000]/50 w-5 h-5" />
              <input 
                type="text"
                placeholder="SEARCH PROJECT ARCHIVES..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0f0f18] border border-[#FFB000]/30 rounded pl-11 pr-4 py-3 text-white focus:outline-none focus:border-[#FFB000] transition-colors uppercase font-mono tracking-wider text-sm"
              />
            </div>

            {loadingProjects ? (
              <div className="flex flex-col items-center justify-center py-32 opacity-50">
                 <div className="w-12 h-12 border-4 border-[#FFB000] border-t-transparent rounded-full animate-spin mb-4" />
                 <p className="tracking-widest uppercase">Querying secure node...</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-[#FFB000]/20 rounded-xl bg-[#0f0f18]/50 backdrop-blur">
                <Folder size={64} className="text-[#FFB000]/30 mb-6" />
                <h2 className="text-xl tracking-widest uppercase text-white mb-2">No active projects found</h2>
                <p className="text-sm tracking-widest uppercase text-[#FFB000]/60 mb-8">Initialize a new project to begin rendering</p>
                <button 
                  onClick={() => setIsNewProjectModalOpen(true)}
                  className="px-8 py-3 bg-transparent border border-[#FFB000] text-[#FFB000] hover:bg-[#FFB000] hover:text-black font-bold uppercase tracking-widest transition-all cursor-pointer"
                >
                  Create Project
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {projects.filter(p => {
                  const name = (p.state?.projectName || 'Untitled Project').toLowerCase();
                  const place = (p.state?.placeName || '').toLowerCase();
                  return name.includes(searchQuery.toLowerCase()) || place.includes(searchQuery.toLowerCase());
                }).map((proj) => {
                  const name = proj.state?.projectName || 'Untitled Project';
                  const place = proj.state?.placeName || 'Unknown Location';
                  const thumb = proj.state?.finalRender || proj.state?.currentFloorPlan;
                  const date = new Date(proj.updated_at).toLocaleDateString();

                  return (
                    <div 
                      key={proj.session_id}
                      onClick={() => {
                        switchSession(proj.session_id, name, place);
                        setShowSelector(false);
                      }}
                      className="group bg-[#0f0f18]/80 backdrop-blur border border-[#FFB000]/20 hover:border-[#FFB000] rounded-xl overflow-hidden cursor-pointer transition-all duration-300 shadow-lg hover:shadow-[0_0_30px_rgba(255,176,0,0.2)] flex flex-col"
                    >
                      <div className="relative aspect-video bg-[#0a0a0f] flex items-center justify-center border-b border-[#FFB000]/10 overflow-hidden">
                        {thumb ? (
                          <img 
                            src={thumb.startsWith('data:image/') ? thumb : `data:image/jpeg;base64,${thumb}`} 
                            alt={name} 
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" 
                          />
                        ) : (
                          <Map size={48} className="text-[#FFB000]/20" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f18] to-transparent opacity-80" />
                        
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ok = window.confirm("Are you sure you want to delete this project?");
                            if (!ok) return;
                            try {
                              const { error } = await supabase.from('render3d_projects').delete().eq('session_id', proj.session_id);
                              if (error) throw error;
                              setProjects(prev => prev.filter(p => p.session_id !== proj.session_id));
                              if (sessionId === proj.session_id) {
                                replaceState({ sessionId: null, projectName: null, placeName: null });
                                localStorage.removeItem('architect_session_id');
                              }
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className="absolute top-3 right-3 z-20 flex items-center justify-center w-8 h-8 rounded-full border border-red-500/30 bg-[#0a0a0f]/80 text-red-500/70 hover:text-red-500 hover:border-red-500 hover:bg-red-500/10 transition-all shadow-md cursor-pointer"
                          title="Delete Project"
                        >
                          <Trash2 size={14} />
                        </button>

                        <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[10px] text-[#FFB000] font-bold tracking-widest uppercase bg-[#0a0a0f]/80 px-2 py-1 rounded backdrop-blur">
                          <Clock size={12} /> {date}
                        </div>
                      </div>
                      <div className="p-5 flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2 group-hover:text-[#FFB000] transition-colors">{name}</h3>
                          <p className="flex items-center gap-2 text-xs text-[#FFB000]/60 tracking-widest uppercase">
                            <MapPin size={12} /> {place}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      )}

      {/* Create Project Modal */}
      {isNewProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f]/90 backdrop-blur-sm">
          <div className="bg-[#0f0f18] border border-[#FFB000]/30 rounded-xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(255,176,0,0.15)] relative">
            <h2 className="text-xl font-bold uppercase tracking-[3px] text-white mb-6">Initialize Render Project</h2>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!newProjectName.trim()) return;
              const newSessionId = uuidv4();
              switchSession(newSessionId, newProjectName, newPlaceName);
              
              // Save empty structure to supabase
              await supabase.from('render3d_projects').insert({
                session_id: newSessionId,
                state: {
                  projectName: newProjectName,
                  placeName: newPlaceName,
                  phase: 'export'
                }
              });
              
              setShowSelector(false);
              setIsNewProjectModalOpen(false);
            }} className="space-y-6">
              <div>
                <label className="block text-xs uppercase tracking-widest text-[#FFB000]/80 mb-2">Project Designation (Name)</label>
                <input 
                  autoFocus
                  type="text" 
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="E.g. Wayne Manor Redesign"
                  className="w-full bg-[#0a0a0f] border border-[#FFB000]/30 rounded p-3 text-white focus:outline-none focus:border-[#FFB000] transition-colors uppercase tracking-wider text-xs font-mono"
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs uppercase tracking-widest text-[#FFB000]/80 mb-2">Geographic Location</label>
                <input 
                  type="text" 
                  value={newPlaceName}
                  onChange={(e) => setNewPlaceName(e.target.value)}
                  placeholder="E.g. Gotham City"
                  className="w-full bg-[#0a0a0f] border border-[#FFB000]/30 rounded p-3 text-white focus:outline-none focus:border-[#FFB000] transition-colors uppercase tracking-wider text-xs font-mono"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsNewProjectModalOpen(false)}
                  className="flex-1 py-3 border border-[#FFB000]/50 text-[#FFB000] hover:text-yellow-400 hover:bg-[#FFB000]/10 uppercase tracking-widest font-bold rounded text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={!newProjectName.trim()}
                  className="flex-1 py-3 bg-[#FFB000] text-black hover:bg-[#e09c00] uppercase tracking-widest font-bold rounded text-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Initialize
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <SaveToProjectModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        currentImageBase64={finalRender}
        imageType="finalRender"
        theme="gold"
        tableName="render3d_projects"
        onSaveSuccess={(name) => {
          setSaveSuccessMsg(name);
          setTimeout(() => setSaveSuccessMsg(null), 3000);
        }}
      />
    </main>
  );
}
