'use client';

import { useArchitectStore } from '@/store/useArchitectStore';
import { Phase } from '@/types';

const PHASES: { id: Phase; label: string }[] = [
  { id: 'search', label: 'Search' },
  { id: 'concept', label: 'Concept' },
  { id: 'parameters', label: 'Parameters' },
  { id: 'vastu', label: 'Vastu' },
  { id: 'generate', label: 'Generate' },
  { id: 'measure', label: 'Measure' },
  { id: 'edit', label: 'Edit' },
  { id: 'export', label: 'Export' },
];

export default function PhaseIndicator() {
  const { phase } = useArchitectStore();
  
  const currentIndex = PHASES.findIndex((p) => p.id === phase) || 0;

  return (
    <div className="w-full px-4 py-3 border-b border-gray-800 bg-[#0A0E1A] shrink-0">
      <div className="flex justify-between mb-2 gap-1 select-none">
        {PHASES.map((p, idx) => (
          <div
            key={p.id}
            className={`text-[9px] uppercase tracking-tighter font-bold transition-colors ${
              idx === currentIndex
                ? 'text-[#C4A882]'
                : idx < currentIndex
                ? 'text-gray-400'
                : 'text-gray-700'
            }`}
          >
            {p.label}
          </div>
        ))}
      </div>
      <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden flex">
        {PHASES.map((p, idx) => (
          <div
            key={p.id}
            className={`h-full flex-1 first:rounded-l-full last:rounded-r-full ${
              idx <= currentIndex ? 'bg-[#C4A882]' : 'bg-transparent'
            } ${idx < currentIndex ? 'opacity-50' : ''}`}
          />
        ))}
      </div>
    </div>
  );
}
