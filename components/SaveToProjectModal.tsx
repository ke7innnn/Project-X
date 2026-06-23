'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useArchitectStore } from '@/store/useArchitectStore';
import { v4 as uuidv4 } from 'uuid';
import { X, Search, Folder, Plus, MapPin, Loader2, Check } from 'lucide-react';

interface ProjectRow {
  session_id: string;
  updated_at: string;
  state: any;
}

interface SaveToProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageBase64: string | null;
  imageType: 'floorPlan' | 'finalRender';
  theme: 'cyan' | 'gold';
  /** Which Supabase table to save to. Defaults to 'projects' (Render Zone). */
  tableName?: 'projects' | 'edit_projects' | 'render3d_projects';
  onSaveSuccess?: (projectName: string) => void;
}

export default function SaveToProjectModal({
  isOpen,
  onClose,
  currentImageBase64,
  imageType,
  theme,
  tableName = 'projects',
  onSaveSuccess,
}: SaveToProjectModalProps) {
  const switchSession = useArchitectStore((state) => state.switchSession);
  
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Create New Project Form State
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newPlaceName, setNewPlaceName] = useState('');

  // Styles based on theme
  const colors = {
    cyan: {
      text: 'text-cyan-500',
      textMuted: 'text-cyan-500/60',
      border: 'border-cyan-500/30',
      borderHover: 'hover:border-cyan-400',
      borderFocus: 'focus:border-cyan-400',
      bgHover: 'hover:bg-cyan-500/10',
      bgActive: 'bg-cyan-500/10',
      btn: 'bg-cyan-500 text-black hover:bg-cyan-400',
      btnGhost: 'border border-cyan-500/50 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10',
      shadow: 'shadow-[0_0_50px_rgba(6,182,212,0.15)]',
      accentGlow: 'shadow-[0_0_15px_rgba(6,182,212,0.3)]',
    },
    gold: {
      text: 'text-[#FFB000]',
      textMuted: 'text-[#FFB000]/60',
      border: 'border-[#FFB000]/30',
      borderHover: 'hover:border-[#FFB000]',
      borderFocus: 'focus:border-[#FFB000]',
      bgHover: 'hover:bg-[#FFB000]/10',
      bgActive: 'bg-[#FFB000]/10',
      btn: 'bg-[#FFB000] text-black hover:bg-[#e09c00]',
      btnGhost: 'border border-[#FFB000]/50 text-[#FFB000] hover:text-yellow-400 hover:bg-[#FFB000]/10',
      shadow: 'shadow-[0_0_50px_rgba(255,176,0,0.15)]',
      accentGlow: 'shadow-[0_0_15px_rgba(255,176,0,0.3)]',
    },
  }[theme];

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
      setIsCreatingNew(false);
      setNewProjectName('');
      setNewPlaceName('');
      setSearchQuery('');
    }
  }, [isOpen]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const { data, error } = await supabase
        .from(tableName)
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

  const handleSaveToProject = async (projSessionId: string, projName: string, projPlace: string) => {
    if (!currentImageBase64) return;
    setIsSaving(true);

    try {
      // 1. Fetch current project state to merge and preserve everything else
      const { data, error } = await supabase
        .from(tableName)
        .select('state')
        .eq('session_id', projSessionId)
        .single();

      let existingState = {};
      if (!error && data?.state) {
        existingState = data.state;
      }

      // Clean the base64 string
      let cleanImage = currentImageBase64;
      if (cleanImage.includes(';base64,')) {
        cleanImage = cleanImage.split(';base64,')[1];
      }

      const mergedState: any = {
        ...existingState,
        projectName: projName,
        placeName: projPlace,
      };

      if (imageType === 'floorPlan') {
        mergedState.currentFloorPlan = cleanImage;
        mergedState.phase = 'edit';
      } else if (imageType === 'finalRender') {
        mergedState.finalRender = cleanImage;
        mergedState.phase = 'export';
      }

      // 2. Upsert back to database
      const { error: upsertError } = await supabase
        .from(tableName)
        .upsert({
          session_id: projSessionId,
          state: mergedState
        }, { onConflict: 'session_id' });

      if (upsertError) throw upsertError;

      // 3. Switch the session in the store
      switchSession(projSessionId, projName, projPlace);
      
      // Update state fields directly so they match the newly saved state
      useArchitectStore.setState({
        projectName: projName,
        placeName: projPlace,
        isRestored: true,
        phase: imageType === 'floorPlan' ? 'edit' : 'export'
      });

      if (imageType === 'floorPlan') {
        useArchitectStore.setState({ currentFloorPlan: cleanImage });
      } else if (imageType === 'finalRender') {
        useArchitectStore.setState({ finalRender: cleanImage });
      }

      if (onSaveSuccess) {
        onSaveSuccess(projName);
      }
      onClose();
    } catch (err) {
      console.error('Error saving project:', err);
      alert('Error updating database. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    
    const newSessionId = uuidv4();
    await handleSaveToProject(newSessionId, newProjectName, newPlaceName);
  };

  const filteredProjects = projects.filter((p) => {
    const name = (p.state?.projectName || 'Untitled Project').toLowerCase();
    const place = (p.state?.placeName || '').toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || place.includes(query);
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fadeIn">
      <div className={`bg-[#0f0f18] border ${colors.border} rounded-xl p-8 max-w-lg w-full ${colors.shadow} relative overflow-hidden flex flex-col max-h-[85vh]`}>
        {/* Subtle grid accent inside modal */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-5 pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800 z-10">
          <h2 className="text-xl font-bold uppercase tracking-[3px] text-white flex items-center gap-2">
            <Folder className={colors.text} size={20} />
            Save To Project Archive
          </h2>
          <button 
            onClick={onClose}
            className={`p-1.5 rounded-full border border-zinc-800 text-zinc-500 hover:text-white transition-all`}
          >
            <X size={16} />
          </button>
        </div>

        {isSaving ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 z-10">
            <Loader2 className={`w-12 h-12 ${colors.text} animate-spin mb-4`} />
            <p className={`tracking-widest uppercase text-xs font-bold ${colors.text} animate-pulse`}>
              Archiving assets...
            </p>
          </div>
        ) : isCreatingNew ? (
          /* Create New Project Form */
          <form onSubmit={handleCreateProject} className="space-y-6 pt-6 z-10">
            <div>
              <label className="block text-xs uppercase tracking-widest text-zinc-400 mb-2">Project Designation (Name)</label>
              <input 
                autoFocus
                type="text" 
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="E.g. Wayne Manor Redesign"
                className={`w-full bg-[#0a0a0f] border ${colors.border} rounded p-3 text-white focus:outline-none ${colors.borderFocus} transition-colors uppercase tracking-wider text-xs font-mono`}
                required
              />
            </div>
            
            <div>
              <label className="block text-xs uppercase tracking-widest text-zinc-400 mb-2">Geographic Location</label>
              <input 
                type="text" 
                value={newPlaceName}
                onChange={(e) => setNewPlaceName(e.target.value)}
                placeholder="E.g. Gotham City"
                className={`w-full bg-[#0a0a0f] border ${colors.border} rounded p-3 text-white focus:outline-none ${colors.borderFocus} transition-colors uppercase tracking-wider text-xs font-mono`}
              />
            </div>

            <div className="flex gap-4 pt-4">
              <button 
                type="button"
                onClick={() => setIsCreatingNew(false)}
                className={`flex-1 py-3 border border-zinc-800 text-zinc-400 hover:text-white uppercase tracking-widest text-xs font-bold rounded transition-colors`}
              >
                Back to Archive
              </button>
              <button 
                type="submit"
                disabled={!newProjectName.trim()}
                className={`flex-1 py-3 ${colors.btn} uppercase tracking-widest text-xs font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Initialize & Save
              </button>
            </div>
          </form>
        ) : (
          /* Select Existing Project list */
          <div className="flex-grow flex flex-col min-h-0 pt-6 z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1">
                <Search className={`absolute left-3 top-2.5 w-4 h-4 text-zinc-500`} />
                <input 
                  type="text"
                  placeholder="SEARCH ARCHIVE..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full bg-[#0a0a0f] border border-zinc-800 rounded pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none ${colors.borderFocus} transition-colors uppercase font-mono tracking-wider`}
                />
              </div>

              <button 
                onClick={() => setIsCreatingNew(true)}
                className={`flex items-center gap-2 px-4 py-2.5 ${colors.btnGhost} uppercase tracking-widest text-xs font-bold rounded transition-colors`}
              >
                <Plus size={14} /> New
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar border border-zinc-800/80 rounded bg-[#0a0a0f]/50 pr-1 max-h-[30vh]">
              {loadingProjects ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
                </div>
              ) : filteredProjects.length === 0 ? (
                <p className="text-center py-12 text-xs uppercase tracking-widest text-zinc-600">
                  No matching projects found
                </p>
              ) : (
                <div className="divide-y divide-zinc-900">
                  {filteredProjects.map((proj) => {
                    const name = proj.state?.projectName || 'Untitled Project';
                    const place = proj.state?.placeName || 'Unknown Location';
                    const hasAsset = imageType === 'floorPlan' ? !!proj.state?.currentFloorPlan : !!proj.state?.finalRender;

                    return (
                      <button
                        key={proj.session_id}
                        onClick={() => handleSaveToProject(proj.session_id, name, place)}
                        className={`w-full p-4 flex items-center justify-between text-left transition-colors ${colors.bgHover}`}
                      >
                        <div className="min-w-0 pr-4">
                          <h4 className="text-white text-xs font-bold uppercase tracking-wider truncate mb-1">
                            {name}
                          </h4>
                          <span className="flex items-center gap-1 text-[10px] text-zinc-500 uppercase tracking-widest">
                            <MapPin size={10} /> {place}
                          </span>
                        </div>
                        {hasAsset && (
                          <span className={`text-[8px] uppercase tracking-widest px-1.5 py-0.5 border ${colors.border} ${colors.text} font-bold rounded bg-zinc-950/60 flex items-center gap-1`}>
                            <Check size={8} /> Overwrite
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-zinc-800 flex justify-end mt-4">
              <button 
                onClick={onClose}
                className="px-6 py-2.5 bg-zinc-800 text-white hover:bg-zinc-700 uppercase tracking-widest text-xs font-bold rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
