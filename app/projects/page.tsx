'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useArchitectStore } from '@/store/useArchitectStore';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Folder, MapPin, Plus, Clock, Search, Map, Trash2, Sparkles, Building, Layers } from 'lucide-react';

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
    return (
      <img 
        src={thumb.startsWith('data:image/') ? thumb : `data:image/jpeg;base64,${thumb}`} 
        alt={projectName} 
        className="w-full h-full object-cover opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" 
      />
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center gap-2 opacity-30 group-hover:opacity-60 transition-opacity">
      <Building size={36} className="text-cyan-400" />
      <span className="text-[9px] tracking-widest text-cyan-500 uppercase">NO BLUEPRINT IMAGE</span>
    </div>
  );
}

export default function ProjectsDashboard() {
  const router = useRouter();
  const switchSession = useArchitectStore(state => state.switchSession);
  
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newPlaceName, setNewPlaceName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const fetchPromise = supabase
        .from('projects')
        .select('session_id, updated_at, state')
        .order('updated_at', { ascending: false })
        .limit(50); 
        
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Supabase request timed out')), 8000)
      );
      
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;

      if (error) throw error;
      
      // Filter out soft-deleted projects
      const activeProjects = (data || []).filter((p: any) => !p.state?.isDeleted);
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
    const insertPromise = supabase.from('projects').insert({
      session_id: newSessionId,
      state: {
        phase: 'search',
        projectName: newProjectName,
        placeName: newPlaceName,
        isDeleted: false
      }
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Supabase request timed out')), 5000)
    );
    
    try {
      await Promise.race([insertPromise, timeoutPromise]);
    } catch (err) {
      console.warn('Supabase insert timed out or failed, proceeding locally', err);
    }

    router.push('/idea-generation');
  };
  
  const handleOpenProject = (project: ProjectRow) => {
    const pName = (project as any).projectName || project.state?.projectName || 'Untitled Project';
    const pPlace = (project as any).placeName || project.state?.placeName || 'Unknown Location';
    
    switchSession(project.session_id, pName, pPlace);
    router.push('/idea-generation');
  };

  const confirmDeleteProject = async () => {
    if (!deleteConfirmId) return;
    const sessId = deleteConfirmId;
    
    setDeleteConfirmId(null);
    setProjects(prev => prev.filter(p => p.session_id !== sessId));
    
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

  // Filter projects by search query
  const filteredProjects = projects.filter((p: any) => {
    const name = (p.projectName || p.state?.projectName || 'Untitled Project').toLowerCase();
    const place = (p.placeName || p.state?.placeName || '').toLowerCase();
    const q = searchQuery.toLowerCase().trim();
    return !q || name.includes(q) || place.includes(q);
  });

  return (
    <div className="min-h-screen bg-[#0a0a0f] font-mono text-cyan-400 p-6 md:p-10 relative overflow-x-hidden">
      {/* Background Grid & Vignette overlays matching main app theme */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(0,240,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none z-0" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,#0a0a0f_95%)] pointer-events-none z-0" />

      {/* Header Bar */}
      <header className="relative z-10 max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8 border-b border-cyan-500/20 pb-6 select-none">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/jarvis')}
            className="flex items-center justify-center w-10 h-10 rounded-xl border border-cyan-500/30 bg-cyan-950/20 text-cyan-400 hover:border-cyan-400 hover:bg-cyan-500/10 transition-all cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.1)]"
            title="Back to Command Center"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-[3px] uppercase text-white drop-shadow-[0_0_12px_rgba(0,240,255,0.3)] flex items-center gap-3">
              <Folder className="text-cyan-400 w-6 h-6" /> PROJECT ARCHIVE
            </h1>
            <span className="text-[10px] tracking-[2.5px] text-cyan-500/60 uppercase block mt-0.5">
              SECURE BLUEPRINT & SCHEMATIC REPOSITORY
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Search bar */}
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cyan-500/50" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full bg-black/40 border border-cyan-500/20 focus:border-cyan-400 focus:outline-none rounded-lg pl-9 pr-3 py-2 text-[11px] text-cyan-300 placeholder-cyan-500/30 transition-colors"
            />
          </div>

          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 hover:border-cyan-400 text-[#00f0ff] font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-[0_0_20px_rgba(0,240,255,0.15)] cursor-pointer whitespace-nowrap"
          >
            <Plus size={16} /> INITIALIZE PROJECT
          </button>
          
          {projects.length > 0 && (
            <button
              onClick={() => setIsClearingAll(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500 font-bold uppercase tracking-wider rounded-lg transition-all text-[11px] cursor-pointer"
              title="Clear All Projects"
            >
              <Trash2 size={14} /> Clear
            </button>
          )}
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="relative z-10 max-w-7xl mx-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 opacity-70">
            <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-4" />
            <p className="tracking-widest uppercase text-xs text-cyan-400">ACCESSING ARCHIVE DATABASE...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 border border-cyan-500/20 rounded-2xl bg-cyan-950/10 backdrop-blur text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-center mb-5 text-cyan-400 shadow-[0_0_25px_rgba(0,240,255,0.1)]">
              <Folder size={32} />
            </div>
            <h2 className="text-base tracking-[3px] uppercase text-white font-bold mb-2">
              {searchQuery ? 'No matching projects found' : 'No active projects archived'}
            </h2>
            <p className="text-[11px] tracking-wider uppercase text-cyan-500/60 mb-6 max-w-md">
              {searchQuery ? `No blueprints match your filter "${searchQuery}". Try a different keyword.` : 'Initialize your first high-density architectural tower project to start generating plans.'}
            </p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="px-6 py-2.5 bg-cyan-500/20 border border-cyan-400 text-cyan-300 hover:bg-cyan-500/30 font-bold text-xs uppercase tracking-widest rounded-lg transition-all cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.15)]"
            >
              + Create First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredProjects.map((proj: any) => {
              const name = proj.projectName || proj.state?.projectName || 'Untitled Project';
              const place = proj.placeName || proj.state?.placeName || 'Unknown Location';
              const date = new Date(proj.updated_at).toLocaleDateString();

              return (
                <div 
                  key={proj.session_id}
                  onClick={() => handleOpenProject(proj)}
                  className="group bg-[#0d0d14]/90 backdrop-blur border border-cyan-500/20 hover:border-cyan-400 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 shadow-[0_0_20px_rgba(0,0,0,0.4)] hover:shadow-[0_0_30px_rgba(0,240,255,0.15)] flex flex-col"
                >
                  {/* Thumbnail Banner */}
                  <div className="relative aspect-[16/10] bg-[#050508] flex items-center justify-center border-b border-cyan-500/15 overflow-hidden">
                    <ProjectThumbnail session_id={proj.session_id} projectName={name} />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d14] via-transparent to-transparent opacity-90" />
                    
                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(proj.session_id);
                      }}
                      className="absolute top-2.5 right-2.5 z-20 flex items-center justify-center w-7 h-7 rounded-lg border border-red-500/30 bg-[#0a0a0f]/80 text-red-400 hover:text-white hover:border-red-500 hover:bg-red-500/20 transition-all cursor-pointer shadow-md"
                      title="Delete Project"
                    >
                      <Trash2 size={13} />
                    </button>

                    {/* Date Badge */}
                    <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 text-[9px] text-cyan-300 font-bold tracking-widest uppercase bg-cyan-950/80 border border-cyan-500/30 px-2 py-0.5 rounded backdrop-blur">
                      <Clock size={10} className="text-cyan-400" /> {date}
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1.5 group-hover:text-cyan-400 transition-colors line-clamp-1">
                        {name}
                      </h3>
                      <p className="flex items-center gap-1.5 text-[10px] text-cyan-500/60 tracking-wider uppercase line-clamp-1">
                        <MapPin size={11} className="text-cyan-400/80 shrink-0" /> {place}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[9px] text-cyan-500/40 tracking-wider uppercase font-semibold">
                      <span>BLUEPRINT ACTIVE</span>
                      <span className="text-cyan-400 group-hover:translate-x-0.5 transition-transform">OPEN →</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f]/90 backdrop-blur-sm p-4">
          <div className="bg-[#0d0d14] border border-red-500/40 rounded-2xl p-6 max-w-sm w-full shadow-[0_0_60px_rgba(239,68,68,0.2)] relative text-center animate-fadeIn">
            <div className="w-12 h-12 rounded-xl bg-red-950/30 border border-red-500/30 flex items-center justify-center mx-auto mb-4 text-red-400">
              <Trash2 size={24} />
            </div>
            <h2 className="text-lg font-bold uppercase tracking-[3px] text-white mb-2">Delete Project?</h2>
            <p className="text-cyan-500/70 mb-6 uppercase tracking-wider text-[11px] leading-relaxed">
              This action is permanent and cannot be reversed. Are you sure you want to purge this project?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 uppercase tracking-wider font-bold rounded-lg text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteProject}
                className="flex-1 py-2.5 bg-red-500/80 text-white hover:bg-red-500 uppercase tracking-wider font-bold rounded-lg text-xs transition-colors cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.3)]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Projects Modal */}
      {isClearingAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f]/90 backdrop-blur-sm p-4">
          <div className="bg-[#0d0d14] border border-red-500/60 rounded-2xl p-6 max-w-sm w-full shadow-[0_0_80px_rgba(239,68,68,0.25)] relative text-center animate-fadeIn">
            <div className="w-12 h-12 rounded-xl bg-red-950/40 border border-red-500/50 flex items-center justify-center mx-auto mb-4 text-red-500">
              <Trash2 size={24} />
            </div>
            <h2 className="text-lg font-bold uppercase tracking-[3px] text-red-400 mb-2">Clear Entire Archive?</h2>
            <p className="text-slate-300 mb-6 uppercase tracking-wider text-[11px] leading-relaxed">
              WARNING: You are about to wipe your entire project archive. All drafted floor plans will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsClearingAll(false)}
                className="flex-1 py-2.5 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 uppercase tracking-wider font-bold rounded-lg text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={confirmClearAll}
                className="flex-1 py-2.5 bg-red-600 text-white hover:bg-red-500 uppercase tracking-wider font-bold rounded-lg text-xs transition-colors cursor-pointer shadow-[0_0_20px_rgba(220,38,38,0.4)]"
              >
                Wipe Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f]/90 backdrop-blur-sm p-4">
          <div className="bg-[#0d0d14] border border-cyan-500/40 rounded-2xl p-6 max-w-sm w-full shadow-[0_0_50px_rgba(0,240,255,0.15)] relative animate-fadeIn">
            <div className="flex items-center gap-2 mb-4 border-b border-cyan-500/20 pb-3">
              <Building className="w-5 h-5 text-cyan-400" />
              <h2 className="text-base font-bold uppercase tracking-[3px] text-white">Initialize Project</h2>
            </div>
            
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-cyan-500/70 mb-1.5 font-mono">
                  Project Designation (Name)
                </label>
                <input 
                  autoFocus
                  type="text" 
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="E.g. Horizon Arc Tower"
                  className="w-full bg-black/50 border border-cyan-500/30 rounded-lg p-2.5 text-xs text-cyan-300 placeholder-cyan-500/30 focus:outline-none focus:border-cyan-400 transition-colors uppercase tracking-wider font-mono"
                  required
                />
              </div>
              
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-cyan-500/70 mb-1.5 font-mono">
                  Geographic Location
                </label>
                <input 
                  type="text" 
                  value={newPlaceName}
                  onChange={(e) => setNewPlaceName(e.target.value)}
                  placeholder="E.g. Downtown Sector 4"
                  className="w-full bg-black/50 border border-cyan-500/30 rounded-lg p-2.5 text-xs text-cyan-300 placeholder-cyan-500/30 focus:outline-none focus:border-cyan-400 transition-colors uppercase tracking-wider font-mono"
                />
              </div>

              <div className="flex gap-3 pt-3 border-t border-white/5">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 uppercase tracking-wider font-bold rounded-lg text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={!newProjectName.trim()}
                  className="flex-1 py-2.5 bg-cyan-500/20 border border-cyan-400 text-cyan-300 hover:bg-cyan-500/30 uppercase tracking-wider font-bold rounded-lg text-xs transition-colors disabled:opacity-40 cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.15)]"
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
