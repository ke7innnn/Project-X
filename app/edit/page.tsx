'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, PenTool, Loader2, UploadCloud, Folder, Search, Plus, MapPin, Clock, Trash2, Map } from 'lucide-react';
import CinematicIntro from '@/components/CinematicIntro';
import SaveToProjectModal from '@/components/SaveToProjectModal';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

export default function EditPage() {
  const router = useRouter();
  const { currentFloorPlan, previousFloorPlan, setCurrentFloorPlan, setPreviousFloorPlan, collectedParameters, roomDimensions, sessionId, projectName, placeName } = useArchitectStore();
  const switchSession = useArchitectStore(state => state.switchSession);
  const { replaceState } = useArchitectStore();

  const [prompt, setPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

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
    if (showSelector) {
      fetchProjects();
    }
  }, [showSelector]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const { data, error } = await supabase
        .from('projects')
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

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !currentFloorPlan || isEditing) return;

    setIsEditing(true);
    setError(null);
    
    try {
      const editRes = await fetch('/api/edit-floorplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currentFloorPlanBase64: currentFloorPlan,
          editInstruction: prompt,
          collectedParameters,
          roomDimensions
        })
      });
      const editData = await editRes.json();
      
      if (editData.editedFloorPlan) {
        setCurrentFloorPlan(editData.editedFloorPlan);
        setPrompt('');
      } else {
        setError('Edit failed. Please try a different instruction.');
      }
    } catch (err) {
      setError('An error occurred while connecting to Groq. Please try again.');
    } finally {
      setIsEditing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setPreviousFloorPlan(currentFloorPlan); // Save current state for undo
        setCurrentFloorPlan(base64);
        setPrompt('');
      }
    };
    reader.readAsDataURL(file);
    
    // Reset input so the same file can be uploaded again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUndo = () => {
    if (previousFloorPlan) {
      setCurrentFloorPlan(previousFloorPlan);
      setPreviousFloorPlan(null);
    }
  };

  return (
    <main className="flex flex-col w-full h-screen bg-[#0a0a0f] text-cyan-500 font-mono overflow-hidden relative">
      <CinematicIntro 
        videoPath="/stage videos/Chapter 2 - 'THE TRANSFORMATION INTO ARCHITECTURE'.mp4" 
        title="Chapter 2 - THE TRANSFORMATION INTO ARCHITECTURE" 
      />

      {/* Subtle animated background gradient */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-10 pointer-events-none z-0" />

      {/* Top Bar */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-[#1e1810] bg-[#0f0f18]/80 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => router.push('/')}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-cyan-500/30 hover:border-cyan-400 hover:bg-cyan-500/10 transition-all group"
          >
            <ArrowLeft className="text-cyan-500/70 group-hover:text-cyan-400" size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-[4px] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
              Edit Matrix
            </h1>
            <span className="text-[10px] tracking-[3px] text-cyan-500/60 uppercase">
              {projectName ? `Project: ${projectName} (${placeName || 'Unknown Location'})` : 'Powered by Groq Vision'}
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
            className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest bg-[#1e1810] border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400 font-bold rounded transition-colors"
          >
            <UploadCloud size={14} /> Upload Plan
          </button>

          {currentFloorPlan && (
            <button 
              onClick={() => setIsSaveModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest bg-[#1e1810] border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400 font-bold rounded transition-colors"
            >
              <Folder size={14} /> Save to Project
            </button>
          )}

          <button 
            onClick={() => setShowSelector(true)}
            className="px-4 py-2 text-[10px] uppercase tracking-widest border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
          >
            Switch Project
          </button>
          
          {previousFloorPlan && (
            <button 
              onClick={handleUndo}
              className="px-4 py-2 text-[10px] uppercase tracking-widest border border-[#c8a84b]/40 text-[#c8a84b] hover:bg-[#c8a84b]/10 rounded transition-colors"
            >
              Undo Last Edit
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex flex-1 overflow-hidden">
        
        {/* Left Side: Canvas / Image Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
          {currentFloorPlan ? (
            <div className="relative w-full max-w-4xl aspect-square bg-white rounded-xl shadow-2xl overflow-hidden border-2 border-cyan-500/20 group">
              <img 
                src={currentFloorPlan.startsWith('data:image/') ? currentFloorPlan : `data:image/jpeg;base64,${currentFloorPlan}`} 
                alt="Current Floor Plan" 
                className={`w-full h-full object-contain transition-opacity duration-300 ${isEditing ? 'opacity-50 blur-sm' : 'opacity-100'}`}
              />
              {isEditing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0f]/60 backdrop-blur-sm z-20">
                  <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mb-4" />
                  <p className="text-cyan-400 font-mono tracking-[2px] uppercase text-sm animate-pulse">
                    Grok is analyzing & editing...
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-cyan-500/40 p-12 border-2 border-dashed border-cyan-500/20 rounded-xl bg-[#0f0f18]/30">
              <UploadCloud size={64} className="mb-6 opacity-50 text-cyan-500" />
              <h2 className="text-xl tracking-[4px] font-bold text-white uppercase mb-2">Upload Floor Plan</h2>
              <p className="text-cyan-500/60 tracking-[2px] text-xs uppercase max-w-md text-center mb-8">
                Upload a 2D floor plan image to initialize the Grok editing sequence.
              </p>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3 px-8 py-4 bg-cyan-500/10 border border-cyan-500 text-cyan-400 hover:bg-cyan-500 hover:text-[#0a0a0f] uppercase tracking-widest font-bold transition-all"
              >
                <UploadCloud size={18} /> Select Image
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Command Prompt */}
        <div className="w-[400px] border-l border-[#1e1810] bg-[#0f0f18]/90 backdrop-blur-md flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
          <div className="p-6 border-b border-[#1e1810]">
            <h2 className="text-sm tracking-[3px] text-cyan-400 font-bold uppercase flex items-center gap-2">
              <PenTool size={14} /> Modification Protocols
            </h2>
            <p className="text-[10px] tracking-wide text-cyan-500/60 mt-2 leading-relaxed">
              Instruct the Groq Vision model to modify specific elements of your floor plan. E.g., "Add a pool to the backyard" or "Expand the master bedroom."
            </p>
          </div>

          <div className="flex-1 p-6 flex flex-col justify-end">
            {error && (
              <div className="mb-4 p-3 border border-red-500/40 bg-red-500/10 text-red-400 text-[10px] uppercase tracking-wide rounded">
                ⚠️ {error}
              </div>
            )}
            
            <form onSubmit={handleEdit} className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="ENTER EDIT INSTRUCTION..."
                disabled={isEditing || !currentFloorPlan}
                className="w-full h-32 bg-[#0a0a0f] border border-cyan-500/30 focus:border-cyan-400 rounded p-4 text-xs text-white placeholder-cyan-500/30 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 resize-none custom-scrollbar transition-all uppercase tracking-wide disabled:opacity-50"
              />
              <button 
                type="submit"
                disabled={isEditing || !currentFloorPlan || !prompt.trim()}
                className="absolute bottom-4 right-4 bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-400 p-2 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isEditing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Success alert toast */}
      {saveSuccessMsg && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-[#0f0f18] border border-cyan-500 rounded-lg px-6 py-3 text-cyan-400 uppercase tracking-widest text-xs font-bold shadow-[0_0_30px_rgba(6,182,212,0.25)] animate-bounce">
          ✓ Saved to project: {saveSuccessMsg}
        </div>
      )}


      {/* Selector view insertion */}
      {showSelector && (
        <div className="fixed inset-0 z-40 bg-[#0a0a0f] text-cyan-400 overflow-y-auto">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-10 pointer-events-none z-0 fixed" />
          
          <header className="relative z-10 max-w-7xl mx-auto flex items-center justify-between p-8 border-b border-cyan-500/20">
            <div className="flex items-center gap-6">
              <button 
                onClick={() => router.push('/')}
                className="flex items-center justify-center w-10 h-10 rounded-full border border-cyan-500/30 hover:border-cyan-400 hover:bg-cyan-500/10 transition-all group"
              >
                <ArrowLeft className="text-cyan-500/70 group-hover:text-cyan-400" size={18} />
              </button>
              <div>
                <h1 className="text-2xl font-bold tracking-[4px] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
                  Edit Project Matrix
                </h1>
                <span className="text-xs tracking-[3px] text-cyan-500/60 uppercase">
                  Select a project to apply modifications
                </span>
              </div>
            </div>
            
            <div className="flex gap-4">
              {sessionId && (
                <button 
                  onClick={() => setShowSelector(false)}
                  className="px-6 py-3 border border-cyan-500/50 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 font-bold uppercase tracking-widest rounded-lg text-xs transition-colors"
                >
                  Resume Current Project
                </button>
              )}
              <button 
                onClick={() => setIsNewProjectModalOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-black hover:bg-cyan-400 font-bold uppercase tracking-widest rounded-lg transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)]"
              >
                <Plus size={18} /> Initialize Project
              </button>
            </div>
          </header>

          <main className="relative z-10 max-w-7xl mx-auto p-8">
            <div className="relative max-w-md mb-8">
              <Search className="absolute left-3 top-3 text-cyan-500/50 w-5 h-5" />
              <input 
                type="text"
                placeholder="SEARCH PROJECT ARCHIVES..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0f0f18] border border-cyan-500/30 rounded pl-11 pr-4 py-3 text-white focus:outline-none focus:border-cyan-400 transition-colors uppercase font-mono tracking-wider text-sm"
              />
            </div>

            {loadingProjects ? (
              <div className="flex flex-col items-center justify-center py-32 opacity-50">
                 <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
                 <p className="tracking-widest uppercase">Querying secure node...</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-cyan-500/20 rounded-xl bg-[#0f0f18]/50 backdrop-blur">
                <Folder size={64} className="text-cyan-500/30 mb-6" />
                <h2 className="text-xl tracking-widest uppercase text-white mb-2">No active projects found</h2>
                <p className="text-sm tracking-widest uppercase text-cyan-500/60 mb-8">Initialize a new project to begin editing</p>
                <button 
                  onClick={() => setIsNewProjectModalOpen(true)}
                  className="px-8 py-3 bg-transparent border border-cyan-500 text-cyan-400 hover:bg-cyan-500 hover:text-black font-bold uppercase tracking-widest transition-all"
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
                  const thumb = proj.state?.currentFloorPlan || proj.state?.finalRender;
                  const date = new Date(proj.updated_at).toLocaleDateString();

                  return (
                    <div 
                      key={proj.session_id}
                      onClick={() => {
                        switchSession(proj.session_id, name, place);
                        setShowSelector(false);
                      }}
                      className="group bg-[#0f0f18]/80 backdrop-blur border border-cyan-500/20 hover:border-cyan-400 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 shadow-lg hover:shadow-[0_0_30px_rgba(6,182,212,0.2)] flex flex-col"
                    >
                      <div className="relative aspect-video bg-[#0a0a0f] flex items-center justify-center border-b border-cyan-500/10 overflow-hidden">
                        {thumb ? (
                          <img 
                            src={thumb.startsWith('data:image/') ? thumb : `data:image/jpeg;base64,${thumb}`} 
                            alt={name} 
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" 
                          />
                        ) : (
                          <Map size={48} className="text-cyan-500/20" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f18] to-transparent opacity-80" />
                        
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ok = window.confirm("Are you sure you want to delete this project?");
                            if (!ok) return;
                            try {
                              const { error } = await supabase.from('projects').delete().eq('session_id', proj.session_id);
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

                        <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[10px] text-cyan-400 font-bold tracking-widest uppercase bg-[#0a0a0f]/80 px-2 py-1 rounded backdrop-blur">
                          <Clock size={12} /> {date}
                        </div>
                      </div>
                      <div className="p-5 flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2 group-hover:text-cyan-400 transition-colors">{name}</h3>
                          <p className="flex items-center gap-2 text-xs text-cyan-500/60 tracking-widest uppercase">
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
          <div className="bg-[#0f0f18] border border-cyan-500/30 rounded-xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(6,182,212,0.15)] relative">
            <h2 className="text-xl font-bold uppercase tracking-[3px] text-white mb-6">Initialize Edit Project</h2>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!newProjectName.trim()) return;
              const newSessionId = uuidv4();
              switchSession(newSessionId, newProjectName, newPlaceName);
              
              // Save empty structure to supabase
              await supabase.from('projects').insert({
                session_id: newSessionId,
                state: {
                  projectName: newProjectName,
                  placeName: newPlaceName,
                  phase: 'edit'
                }
              });
              
              setShowSelector(false);
              setIsNewProjectModalOpen(false);
            }} className="space-y-6">
              <div>
                <label className="block text-xs uppercase tracking-widest text-cyan-400/80 mb-2">Project Designation (Name)</label>
                <input 
                  autoFocus
                  type="text" 
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="E.g. Wayne Manor Redesign"
                  className="w-full bg-[#0a0a0f] border border-cyan-500/30 rounded p-3 text-white focus:outline-none focus:border-cyan-400 transition-colors uppercase tracking-wider text-xs font-mono"
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs uppercase tracking-widest text-cyan-400/80 mb-2">Geographic Location</label>
                <input 
                  type="text" 
                  value={newPlaceName}
                  onChange={(e) => setNewPlaceName(e.target.value)}
                  placeholder="E.g. Gotham City"
                  className="w-full bg-[#0a0a0f] border border-cyan-500/30 rounded p-3 text-white focus:outline-none focus:border-cyan-400 transition-colors uppercase tracking-wider text-xs font-mono"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsNewProjectModalOpen(false)}
                  className="flex-1 py-3 border border-cyan-500/50 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 uppercase tracking-widest font-bold rounded text-xs transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={!newProjectName.trim()}
                  className="flex-1 py-3 bg-cyan-500 text-black hover:bg-cyan-400 uppercase tracking-widest font-bold rounded text-xs transition-colors disabled:opacity-50"
                >
                  Initialize
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
