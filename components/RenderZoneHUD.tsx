'use client';

import { useArchitectStore } from '@/store/useArchitectStore';
import { Phase } from '@/types';
import { Building2, Pencil, Map, Box, Video, ChevronLeft } from 'lucide-react';

const STAGES = [
  { id: 'concept', label: 'Concept', icon: Building2 },
  { id: 'edit', label: 'Edit', icon: Pencil },
  { id: 'autocad', label: 'AutoCAD', icon: Map },
  { id: '3d-render', label: '3D Render', icon: Box },
  { id: 'flythrough', label: 'Flythrough', icon: Video },
];

export default function RenderZoneHUD() {
  const { phase } = useArchitectStore();
  
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

  return (
    <div className="w-full h-20 bg-[#0a0a0a] border-b border-[#222] flex items-center px-8 relative shrink-0 z-20 shadow-[0_4px_30px_rgba(0,0,0,0.8)] font-mono">
      {/* Background HUD texture */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20 pointer-events-none" />
      
      {/* Exit Button */}
      <button 
        onClick={() => useArchitectStore.getState().setIsAppStarted(false)}
        className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[#666] hover:text-[#FFB000] transition-colors z-20 group"
      >
        <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-[10px] uppercase tracking-[2px] font-bold hidden md:inline">Exit</span>
      </button>

      <div className="flex-1 flex justify-between items-center relative max-w-5xl mx-auto px-12">
        
        {/* Connecting Line */}
        <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-[#222] z-0" />
        
        {/* Active Line Fill */}
        <div 
          className="absolute top-1/2 left-0 h-[2px] -translate-y-1/2 bg-[#FFB000] shadow-[0_0_8px_#FFB000] z-0 transition-all duration-700 ease-in-out" 
          style={{ width: `${(currentIndex / (STAGES.length - 1)) * 100}%` }}
        />

        {STAGES.map((stage, idx) => {
          const isActive = idx === currentIndex;
          const isPast = idx < currentIndex;
          const Icon = stage.icon;

          return (
            <div key={stage.id} className="relative z-10 flex flex-col items-center gap-2 group">
              <div 
                className={`w-10 h-10 rounded flex items-center justify-center border-2 transition-all duration-500 ${
                  isActive 
                    ? 'bg-[#1a1405] border-[#FFB000] text-[#FFB000] shadow-[0_0_20px_rgba(255,176,0,0.4)] scale-110' 
                    : isPast 
                      ? 'bg-[#111] border-[#FFB000]/40 text-[#FFB000]/60' 
                      : 'bg-[#0d0d0d] border-[#333] text-[#444]'
                }`}
                style={{ transform: isActive ? 'rotate(45deg)' : 'rotate(0deg)' }}
              >
                <div style={{ transform: isActive ? 'rotate(-45deg)' : 'rotate(0deg)' }}>
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} className="transition-all duration-500" />
                </div>
              </div>
              <span 
                className={`absolute -bottom-6 text-[10px] uppercase tracking-[2px] font-bold whitespace-nowrap transition-colors duration-500 ${
                  isActive ? 'text-[#FFB000]' : isPast ? 'text-[#FFB000]/60' : 'text-[#444]'
                }`}
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
