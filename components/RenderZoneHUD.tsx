'use client';

import { useArchitectStore } from '@/store/useArchitectStore';
import { Phase } from '@/types';
import { Building2, Pencil, Map, Box, Video, ChevronLeft, Save, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';

const STAGES = [
  { id: 'concept', label: 'Concept', icon: Building2 },
  { id: 'edit', label: 'Edit', icon: Pencil },
  { id: 'autocad', label: 'AutoCAD', icon: Map },
  { id: '3d-render', label: '3D Render', icon: Box },
  { id: 'flythrough', label: 'Flythrough', icon: Video },
];

export default function RenderZoneHUD() {
  const { phase, setPhase, restartProject } = useArchitectStore();
  const router = useRouter();
  
  // Map internal phases to the 5 UI stages
  const getStageIndex = (currentPhase: Phase) => {
    switch (currentPhase) {
      case 'search':
      case 'concept':
      case 'parameters':
      case 'vastu':
        return 0; // Concept
      case 'generate':
      case 'edit':
      case 'measure':
        return 1; // Edit
      case 'export':
        return 2; // AutoCAD (export phase)
      default:
        return 0;
    }
  };

  const currentIndex = getStageIndex(phase);

  const handleExit = () => {
    const ok = window.confirm("Save and exit this project to the main menu?");
    if (!ok) return;

    const store = useArchitectStore.getState();
    
    // Clear all project specific states and session metadata
    store.setIsAppStarted(false);
    store.resetStore();
    store.replaceState({
      sessionId: null,
      isRestored: false,
      isAppStarted: false,
    });
    
    localStorage.removeItem('architect_session_id');
    
    // Redirect to home screen
    router.push('/');
  };

  const handleRestart = () => {
    const ok = window.confirm("Are you sure you want to completely restart this project? All current edits will be cleared.");
    if (ok) {
      restartProject();
    }
  };

  const handleStageClick = (stageId: string, stageIndex: number) => {
    // Only allow clicking backwards, or jumping forward if the state allows it
    if (stageIndex > currentIndex) return; // Prevent skipping ahead
    
    if (stageId === 'concept') {
      setPhase('search'); // Resetting to the beginning of the concept phase
    } else if (stageId === 'edit') {
      setPhase('edit');
    } else if (stageId === 'autocad') {
      setPhase('export');
    }
  };

  return (
    <div className="w-full h-20 bg-[#0a0a0a] border-b border-[#222] flex items-center px-8 relative shrink-0 z-20 shadow-[0_4px_30px_rgba(0,0,0,0.8)] font-mono">
      {/* Background HUD texture */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20 pointer-events-none" />
      
      {/* Exit Button */}
      <button 
        onClick={handleExit}
        className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[#666] hover:text-[#FFB000] transition-colors z-20 group"
      >
        <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-[10px] uppercase tracking-[2px] font-bold hidden md:inline">Exit</span>
      </button>

      {/* Restart Button */}
      <button 
        onClick={handleRestart}
        className="absolute left-24 top-1/2 -translate-y-1/2 flex items-center gap-2 px-3 py-1.5 border border-[#333] rounded text-[#888] hover:text-[#FFB000] hover:border-[#FFB000]/50 hover:bg-[#FFB000]/10 transition-all z-20 group"
        title="Restart Project"
      >
        <RotateCcw size={14} className="group-hover:-rotate-180 transition-transform duration-500" />
        <span className="text-[10px] uppercase tracking-[2px] font-bold hidden md:inline">Restart</span>
      </button>
      
      {/* Save Button (Right side) */}
      <button 
        onClick={() => {
          // It auto-saves, so this is primarily for peace of mind
          alert("Project successfully saved to database!");
        }}
        className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2 px-3 py-1.5 border border-[#FFB000]/50 rounded text-[#FFB000] hover:bg-[#FFB000]/10 transition-all z-20 group"
      >
        <Save size={14} className="group-hover:scale-110 transition-transform" />
        <span className="text-[10px] uppercase tracking-[2px] font-bold hidden md:inline">Save</span>
      </button>
      
      <div className="flex-1 flex justify-between items-center relative max-w-5xl mx-auto px-12 mt-0 ml-16">
        
        {/* Connecting Line */}
        <div className="absolute top-1/2 left-12 right-12 h-[2px] -translate-y-1/2 bg-[#222] z-0" />
        
        {/* Active Line Fill */}
        <div 
          className="absolute top-1/2 left-12 h-[2px] -translate-y-1/2 bg-[#FFB000] shadow-[0_0_8px_#FFB000] z-0 transition-all duration-700 ease-in-out" 
          style={{ width: `calc(${(currentIndex / (STAGES.length - 1)) * 100}% - 3rem)` }}
        />

        {STAGES.map((stage, idx) => {
          const isActive = idx === currentIndex;
          const isPassed = idx <= currentIndex;
          const isClickable = idx <= currentIndex;
          const Icon = stage.icon;

          return (
            <div 
              key={stage.id} 
              className={`flex flex-col items-center gap-2 z-10 relative ${isClickable ? 'cursor-pointer group' : 'cursor-not-allowed opacity-50'}`}
              onClick={() => isClickable && handleStageClick(stage.id, idx)}
            >
              {/* Node Point */}
              <div 
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-500
                  ${isActive 
                    ? 'bg-[#FFB000] border-[#FFB000] shadow-[0_0_15px_rgba(255,176,0,0.5)] scale-110' 
                    : isPassed 
                      ? 'bg-[#222] border-[#FFB000] text-[#FFB000]' 
                      : 'bg-[#0a0a0a] border-[#333] text-[#555]'
                  }
                  ${isClickable && !isActive ? 'group-hover:border-[#FFB000] group-hover:bg-[#FFB000]/20' : ''}
                `}
              >
                <Icon size={14} className={isActive ? 'text-black' : ''} />
              </div>

              {/* Label */}
              <span 
                className={`
                  absolute -bottom-6 whitespace-nowrap text-[10px] uppercase tracking-[2px] font-bold transition-colors duration-300
                  ${isActive ? 'text-[#FFB000]' : isPassed ? 'text-[#aaa]' : 'text-[#444]'}
                  ${isClickable && !isActive ? 'group-hover:text-[#FFB000]' : ''}
                `}
              >
                {stage.label}
              </span>
            </div>
          );
        })}

      </div>
    </div>
  );
}
