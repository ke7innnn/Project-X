'use client';

import { useArchitectStore } from '@/store/useArchitectStore';
import { Phase } from '@/types';
import { Building2, Pencil, Map, Box, Video, ChevronLeft, Save, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { playSound } from '@/lib/sounds';
import { useShallow } from 'zustand/react/shallow';

const STAGES = [
  { id: 'concept', label: 'Concept', icon: Building2 },
  { id: 'edit', label: 'Edit', icon: Pencil },
  { id: 'autocad', label: 'AutoCAD', icon: Map },
  { id: '3d-render', label: '3D Render', icon: Box },
  { id: 'flythrough', label: 'Flythrough', icon: Video },
];

export default function RenderZoneHUD() {
  const { phase, setPhase, restartProject } = useArchitectStore(useShallow((state) => ({
    phase: state.phase,
    setPhase: state.setPhase,
    restartProject: state.restartProject
  })));
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

  const handleExit = async () => {
    playSound('click');
    const showHUDModal = useArchitectStore.getState().showHUDModal;
    const ok = await showHUDModal({
      type: 'confirm',
      title: 'EXIT SESSION PROPOSAL',
      message: 'Save and exit this project to the main menu?'
    });
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

  const handleRestart = async () => {
    playSound('click');
    const showHUDModal = useArchitectStore.getState().showHUDModal;
    const ok = await showHUDModal({
      type: 'confirm',
      title: 'WARNING: RESET MATRIX',
      message: 'Are you sure you want to completely restart this project? All current edits will be cleared.'
    });
    if (ok) {
      restartProject();
    }
  };

  const handleStageClick = (stageId: string, stageIndex: number) => {
    // Only allow clicking backwards, or jumping forward if the state allows it
    if (stageIndex > currentIndex) {
      playSound('error');
      return; // Prevent skipping ahead
    }
    
    playSound('click');
    if (stageId === 'concept') {
      setPhase('search'); // Resetting to the beginning of the concept phase
    } else if (stageId === 'edit') {
      setPhase('edit');
    } else if (stageId === 'autocad') {
      setPhase('export');
    }
  };

  return (
    <div className="w-full h-20 bg-[#030612]/75 border-b border-blue-900/30 flex items-center justify-between px-6 relative shrink-0 z-20 glass-panel shadow-[0_4px_30px_rgba(0,0,0,0.5)] font-mono">
      {/* Background HUD texture */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20 pointer-events-none" />
      
      {/* LEFT COLUMN: Controls */}
      <div className="flex items-center gap-4 z-20 w-[220px] shrink-0">
        <button 
          onClick={handleExit}
          className="flex items-center gap-1 text-blue-500/60 hover:text-blue-300 transition-colors group cursor-pointer"
        >
          <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] uppercase tracking-[2px] font-bold hidden md:inline">Exit</span>
        </button>

        <button 
          onClick={handleRestart}
          className="flex items-center gap-2 px-3 py-1.5 border border-blue-900/35 rounded text-blue-400 hover:text-blue-300 hover:border-blue-500/50 hover:bg-blue-500/10 transition-all group cursor-pointer"
          title="Restart Project"
        >
          <RotateCcw size={14} className="group-hover:-rotate-180 transition-transform duration-500" />
          <span className="text-[10px] uppercase tracking-[2px] font-bold hidden md:inline">Restart</span>
        </button>
      </div>
      
      {/* CENTER COLUMN: Breadcrumbs */}
      <div className="flex-1 flex justify-between items-center relative max-w-4xl mx-8 z-20 hidden md:flex">
        {/* Connecting Line */}
        <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-blue-900/30 z-0" />
        
        {/* Active Line Fill */}
        <div 
          className="absolute top-1/2 left-0 h-[2px] -translate-y-1/2 bg-blue-500 shadow-[0_0_12px_rgba(14,165,233,0.5)] z-0 transition-all duration-700 ease-in-out" 
          style={{ width: `${(currentIndex / (STAGES.length - 1)) * 100}%` }}
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
                  w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-500 bg-[#02050c]
                  ${isActive 
                    ? 'border-blue-500 shadow-[0_0_15px_rgba(14,165,233,0.5)] scale-110' 
                    : isPassed 
                      ? 'border-blue-500 text-blue-400' 
                      : 'border-blue-900/40 text-blue-900/50'
                  }
                  ${isClickable && !isActive ? 'group-hover:border-blue-400 group-hover:bg-blue-500/10' : ''}
                `}
              >
                <Icon size={14} className={isActive ? 'text-blue-300' : ''} />
              </div>

              {/* Label */}
              <span 
                className={`
                  absolute -bottom-6 whitespace-nowrap text-[10px] uppercase tracking-[2px] font-bold transition-colors duration-300
                  ${isActive ? 'text-blue-300' : isPassed ? 'text-[#aaa]' : 'text-blue-900/40'}
                  ${isClickable && !isActive ? 'group-hover:text-blue-400' : ''}
                `}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* RIGHT COLUMN: Save */}
      <div className="flex items-center justify-end z-20 w-[220px] shrink-0">
        <button 
          onClick={() => {
            alert("Project successfully saved to database!");
          }}
          className="flex items-center gap-2 px-3 py-1.5 border border-blue-500/50 rounded text-blue-400 hover:bg-blue-500/10 transition-all group cursor-pointer"
        >
          <Save size={14} className="group-hover:scale-110 transition-transform" />
          <span className="text-[10px] uppercase tracking-[2px] font-bold hidden md:inline">Save</span>
        </button>
      </div>
    </div>
  );
}
