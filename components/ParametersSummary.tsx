'use client';

import { useArchitectStore } from '@/store/useArchitectStore';

export default function ParametersSummary() {
  const { collectedParameters, selectedNatureImage } = useArchitectStore();
  const params = collectedParameters;

  return (
    <div className="glass rounded-xl p-4 my-2 text-sm text-gray-200 border-[#FFB000]/30 border">
      <h3 className="text-[#FFB000] font-semibold mb-2 flex items-center">
        <span className="mr-2">📐</span> Your Design Brief
      </h3>
      <div className="space-y-1.5 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-gray-400">Plot:</span>
          <span>{params.plotWidth}m × {params.plotHeight}m = {params.plotArea} sq.m</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Orientation:</span>
          <span className="capitalize">{params.orientation || 'Not specified'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Floors:</span>
          <span>{params.floors}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Rooms:</span>
          <span className="text-right ml-4">{params.rooms.length > 0 ? params.rooms.join(', ') : 'Not specified'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Vastu:</span>
          <span className="text-right ml-4">{params.vastuRules.length > 0 ? params.vastuRules.join(', ') : 'Not specified'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Garden:</span>
          <span>{params.garden ? 'Yes' : 'No'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Parking:</span>
          <span>{params.parking ? 'Yes' : 'No'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Aspect Ratio:</span>
          <span>{params.aspectRatio || '1:1'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Nature ref:</span>
          <span className="truncate ml-4 max-w-[150px] text-right">
            {selectedNatureImage?.description || 'None'}
          </span>
        </div>
      </div>
    </div>
  );
}
