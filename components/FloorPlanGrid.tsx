'use client';

import { useArchitectStore } from '@/store/useArchitectStore';

export default function FloorPlanGrid() {
  const { generatedOptions, selectedOptionIndex, setSelectedOption, setPhase } = useArchitectStore();

  if (!generatedOptions || generatedOptions.length === 0) return null;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-[#0A0E1A]">
      <h2 className="text-2xl text-[#FFB000] mb-6 font-semibold">Select a Concept Layout</h2>
      <div className="grid grid-cols-2 gap-6 w-full max-w-4xl">
        {generatedOptions.map((optUrl, idx) => (
          <div 
            key={idx} 
            className={`relative rounded-xl overflow-hidden border-2 transition-all ${
              selectedOptionIndex === idx ? 'border-[#FFB000] shadow-[0_0_15px_rgba(196,168,130,0.4)]' : 'border-gray-700 hover:border-gray-500'
            }`}
          >
            <img 
              src={`data:image/jpeg;base64,${optUrl}`} 
              alt={`Option ${idx + 1}`} 
              className="w-full aspect-square object-contain bg-white"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
              <button
                onClick={() => {
                  setSelectedOption(idx, optUrl);
                  setPhase('measure');
                }}
                className="bg-[#FFB000] hover:bg-[#D8B78D] text-black font-semibold py-2 px-6 rounded-lg transition-colors"
              >
                Select Option {idx + 1}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
