'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useArchitectStore } from '@/store/useArchitectStore';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Folder, MapPin, Plus, Clock, Search, Map, Trash2 } from 'lucide-react';

interface ProjectRow {
  session_id: string;
  updated_at: string;
  state: any;
}

// Lazy loading thumbnail component for modern projects where images are stored separately
function ProjectThumbnail({ session_id, projectName }: { session_id: string, projectName: string }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (!thumb && !isFetching) {
      setIsFetching(true);
      
      const fetchThumb = async () => {
        try {
          // First try project_images (new projects)
          const { data } = await supabase
            .from('project_images')
            .select('final_render, current_floor_plan')
            .eq('session_id', session_id)
            .single();

          if (data && (data.final_render || data.current_floor_plan)) {
            setThumb(data.final_render || data.current_floor_plan);
          } else {
            // Fallback for old projects: fetch massive blob specifically for this one row
            const { data: oldData } = await supabase
              .from('projects')
              .select('finalRender:state->>finalRender, currentFloorPlan:state->>currentFloorPlan')
              .eq('session_id', session_id)
              .single();
              
            if (oldData) {
              setThumb(oldData.finalRender || oldData.currentFloorPlan);
            }
          }
        } catch (err) {
          console.error("Error fetching thumbnail:", err);
        } finally {
          setIsFetching(false);
        }
      };

      fetchThumb();
    }
  }, [session_id, thumb, isFetching]);

  if (thumb) {
    return <img src={thumb.startsWith('data:image/') ? thumb : `data:image/jpeg;base64,${thumb}`} alt={projectName} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />;
  }
  
  return <Map size={48} className="text-[#FFB000]/20" />;
}

export default function ProjectsDashboard() {
  const router = useRouter();
  const switchSession = useArchitectStore(state => state.switchSession);
  
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newPlaceName, setNewPlaceName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);

  useEffect(() => {
    fetchProjects();
    // Removed 3-second polling interval to prevent massive database overload & timeouts
  }, []);

  const fetchProjects = async () => {
    try {
      const fetchPromise = supabase
        .from('projects')
        .select('session_id, updated_at, project_name, place_name, is_deleted')
        .order('updated_at', { ascending: false })
        .limit(50); 
        
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Supabase request timed out')), 8000)
      );
      
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;

      if (error) throw error;
      
      // Filter out soft-deleted projects
      const activeProjects = (data || []).filter(p => !p.is_deleted);
      setProjects(activeProjects as any);
    } catch (err) {
      console.error('Error fetching projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    const newSessionId = uuidv4();
    switchSession(newSessionId, newProjectName, newPlaceName);

    // Explicitly insert an initial shell into Supabase so it appears instantly
    await supabase.from('projects').insert({
      session_id: newSessionId,
      project_name: newProjectName,
      place_name: newPlaceName,
      state: {
        phase: 'search'
      }
    });

    router.push('/workspace/' + newSessionId);
  };
  
  const handleOpenProject = (project: ProjectRow) => {
    const pName = (project as any).projectName || project.state?.projectName || 'Untitled Project';
    const pPlace = (project as any).placeName || project.state?.placeName || 'Unknown Location';
    
    switchSession(project.session_id, pName, pPlace);
    router.push('/workspace/' + project.session_id);
  };

  const confirmDeleteProject = async () => {
    if (!deleteConfirmId) return;
    const sessId = deleteConfirmId;
    
    // OPTIMISTIC UPDATE: Remove instantly from UI
    setDeleteConfirmId(null);
    setProjects(prev => prev.filter(p => p.session_id !== sessId));
    
    // Clear session from store if it was the active session
    const store = useArchitectStore.getState();
    if (store.sessionId === sessId) {
      store.replaceState({ sessionId: null, isRestored: false, projectName: null, placeName: null });
    }

    try {
      await fetch('/api/delete-project', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessId }),
      });
    } catch (err: any) {
      console.error('Error deleting project:', err);
    }
  };

  const confirmClearAll = async () => {
    // OPTIMISTIC UPDATE: Remove instantly from UI
    setIsClearingAll(false);
    setProjects([]);
    
    const store = useArchitectStore.getState();
    store.replaceState({ sessionId: null, isRestored: false, projectName: null, placeName: null });

    try {
      await fetch('/api/delete-project', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } catch (err: any) {
      console.error('Error clearing all projects:', err);
    }
  };


  return (
    <div className="h-screen overflow-y-auto bg-[#0a0a0f] font-mono text-[#FFB000] p-8">
      {/* Background grid texture */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-10 pointer-events-none z-0 fixed" />

      {/* Header */}
      <header className="relative z-10 max-w-7xl mx-auto flex items-center justify-between mb-12 border-b border-[#FFB000]/20 pb-6">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => router.push('/')}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-[#FFB000]/30 hover:border-[#FFB000] hover:bg-[#FFB000]/10 transition-all group"
          >
            <ArrowLeft className="text-[#FFB000]/70 group-hover:text-[#FFB000]" size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-[4px] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] flex items-center gap-3">
              <Folder className="text-[#FFB000]" /> Project Archive
            </h1>
            <span className="text-xs tracking-[3px] text-[#FFB000]/60 uppercase">
              Secure Storage Facility
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-[#FFB000] text-[#0a0a0f] hover:bg-[#D8B78D] font-bold uppercase tracking-widest rounded-lg transition-all shadow-[0_0_20px_rgba(255,176,0,0.3)] hover:shadow-[0_0_30px_rgba(255,176,0,0.5)]"
          >
            <Plus size={18} /> Initialize Project
          </button>
          {projects.length > 0 && (
            <button
              onClick={() => setIsClearingAll(true)}
              className="flex items-center gap-2 px-4 py-3 border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500 font-bold uppercase tracking-widest rounded-lg transition-all text-xs"
            >
              <Trash2 size={16} /> Clear All
            </button>
          )}
        </div>
      </header>

      {/* Main Grid */}
      <main className="relative z-10 max-w-7xl mx-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 opacity-50">
             <div className="w-12 h-12 border-4 border-[#FFB000] border-t-transparent rounded-full animate-spin mb-4" />
             <p className="tracking-widest uppercase">Accessing secure database...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-[#FFB000]/20 rounded-xl bg-[#0f0f18]/50 backdrop-blur">
            <Folder size={64} className="text-[#FFB000]/30 mb-6" />
            <h2 className="text-xl tracking-widest uppercase text-white mb-2">No active projects found</h2>
            <p className="text-sm tracking-widest uppercase text-[#FFB000]/60 mb-8">Initialize a new project to begin drafting</p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="px-8 py-3 bg-transparent border border-[#FFB000] text-[#FFB000] hover:bg-[#FFB000] hover:text-[#0a0a0f] font-bold uppercase tracking-widest transition-all"
            >
              Create First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {projects.map((proj: any) => {
              const name = proj.projectName || proj.state?.projectName || 'Untitled Project';
              const place = proj.placeName || proj.state?.placeName || 'Unknown Location';
              const date = new Date(proj.updated_at).toLocaleDateString();

              return (
                <div 
                  key={proj.session_id}
                  onClick={() => handleOpenProject(proj)}
                  className="group bg-[#0f0f18]/80 backdrop-blur border border-[#FFB000]/20 hover:border-[#FFB000] rounded-xl overflow-hidden cursor-pointer transition-all duration-300 shadow-lg hover:shadow-[0_0_30px_rgba(255,176,0,0.2)] flex flex-col"
                >
                  <div className="relative aspect-video bg-[#0a0a0f] flex items-center justify-center border-b border-[#FFB000]/10 overflow-hidden">
                    <ProjectThumbnail session_id={proj.session_id} projectName={name} />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f18] to-transparent opacity-80" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(proj.session_id);
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
                      <h3 className="text-lg font-bold text-white uppercase tracking-wider mb-2 group-hover:text-[#FFB000] transition-colors">{name}</h3>
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

      {/* Delete Single Project Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f]/90 backdrop-blur-sm">
          <div className="bg-[#1a1212] border border-red-500/30 rounded-xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(239,68,68,0.15)] relative text-center">
            <Trash2 size={48} className="text-red-500/50 mx-auto mb-6" />
            <h2 className="text-2xl font-bold uppercase tracking-[4px] text-white mb-4">Delete Project?</h2>
            <p className="text-[#FFB000]/70 mb-8 uppercase tracking-widest text-sm">This action is permanent and cannot be reversed. Are you sure you want to delete this project?</p>
            <div className="flex gap-4">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-3 border border-[#FFB000]/50 text-[#FFB000]/80 hover:text-[#FFB000] hover:bg-[#FFB000]/10 uppercase tracking-widest font-bold rounded transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteProject}
                className="flex-1 py-3 bg-red-500/80 text-white hover:bg-red-500 uppercase tracking-widest font-bold rounded transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Projects Modal */}
      {isClearingAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f]/90 backdrop-blur-sm">
          <div className="bg-[#1a1212] border border-red-500/50 rounded-xl p-8 max-w-md w-full shadow-[0_0_80px_rgba(239,68,68,0.2)] relative text-center">
            <Trash2 size={48} className="text-red-500/80 mx-auto mb-6" />
            <h2 className="text-2xl font-bold uppercase tracking-[4px] text-red-500 mb-4">Clear All Projects?</h2>
            <p className="text-white/70 mb-8 uppercase tracking-widest text-sm leading-relaxed">WARNING: You are about to wipe your entire project archive. This will permanently destroy all drafted floor plans.</p>
            <div className="flex gap-4">
              <button 
                onClick={() => setIsClearingAll(false)}
                className="flex-1 py-3 border border-[#FFB000]/50 text-[#FFB000]/80 hover:text-[#FFB000] hover:bg-[#FFB000]/10 uppercase tracking-widest font-bold rounded transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmClearAll}
                className="flex-1 py-3 bg-red-600 text-white hover:bg-red-500 uppercase tracking-widest font-bold rounded transition-colors shadow-[0_0_20px_rgba(220,38,38,0.5)]"
              >
                Wipe Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f]/90 backdrop-blur-sm">
          <div className="bg-[#0f0f18] border border-[#FFB000]/30 rounded-xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(255,176,0,0.15)] relative">
            <h2 className="text-2xl font-bold uppercase tracking-[4px] text-white mb-6">Initialize Project</h2>
            
            <form onSubmit={handleCreateProject} className="space-y-6">
              <div>
                <label className="block text-xs uppercase tracking-widest text-[#FFB000]/80 mb-2">Project Designation (Name)</label>
                <input 
                  autoFocus
                  type="text" 
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="E.g. Wayne Manor Redesign"
                  className="w-full bg-[#0a0a0f] border border-[#FFB000]/30 rounded p-3 text-white focus:outline-none focus:border-[#FFB000] transition-colors uppercase tracking-wider"
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
                  className="w-full bg-[#0a0a0f] border border-[#FFB000]/30 rounded p-3 text-white focus:outline-none focus:border-[#FFB000] transition-colors uppercase tracking-wider"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 border border-[#FFB000]/50 text-[#FFB000]/80 hover:text-[#FFB000] hover:bg-[#FFB000]/10 uppercase tracking-widest font-bold rounded transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={!newProjectName.trim()}
                  className="flex-1 py-3 bg-[#FFB000] text-[#0a0a0f] hover:bg-[#D8B78D] uppercase tracking-widest font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Initialize
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
