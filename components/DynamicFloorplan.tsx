import React from 'react';

export interface RoomLayout {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string; // Optional color for visual differentiation
}

export interface FloorplanLayout {
  exterior_shell: { width: number; height: number };
  rooms: RoomLayout[];
}

interface DynamicFloorplanProps {
  layout: FloorplanLayout | null;
  rawSvg: string | null;
}

const ROOM_COLORS = [
  'rgba(59, 130, 246, 0.15)', // blue-500
  'rgba(16, 185, 129, 0.15)', // emerald-500
  'rgba(245, 158, 11, 0.15)', // amber-500
  'rgba(239, 68, 68, 0.15)',  // red-500
  'rgba(139, 92, 246, 0.15)', // violet-500
  'rgba(236, 72, 153, 0.15)', // pink-500
];

const ROOM_STROKE_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
];

export default function DynamicFloorplan({ layout, rawSvg }: DynamicFloorplanProps) {
  if (!layout || !layout.exterior_shell) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400 font-mono text-sm border-2 border-dashed border-gray-800 rounded-xl">
        No Layout Data Available
      </div>
    );
  }

  const { exterior_shell, rooms } = layout;

  return (
    <div className="w-full h-full relative overflow-hidden bg-black flex items-center justify-center p-4">
      <svg
        viewBox={`0 0 ${exterior_shell.width} ${exterior_shell.height}`}
        className="max-w-full max-h-full drop-shadow-2xl"
        style={{
          border: '4px solid #333', // Thicker border to represent the rigid exterior shell
          backgroundColor: '#111',
          borderRadius: '8px'
        }}
      >
        {/* Render Potrace Background Shell (Solid Vector Blueprint Walls) */}
        {rawSvg && (
          <g
            dangerouslySetInnerHTML={{
              __html: rawSvg
                .replace(/<svg[^>]*>|<\/svg>/g, '')
                .replace(/fill="[^"]*"/g, 'fill="#1e293b"') // Slate blueprint color
                .replace(/stroke="[^"]*"/g, 'stroke="none"')
            }}
            opacity={0.8}
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Render Rooms Overlaid on Top of Traced Walls */}
        {rooms.map((room, i) => {
          const strokeColor = ROOM_STROKE_COLORS[i % ROOM_STROKE_COLORS.length];
          const fillColor = room.color || ROOM_COLORS[i % ROOM_COLORS.length];
          return (
            <g key={room.id} className="transition-all duration-500 ease-in-out">
              <rect
                x={room.x}
                y={room.y}
                width={room.width}
                height={room.height}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth="2"
                rx={4}
                className="hover:stroke-white transition-colors duration-200"
              />
              {/* Center Text Label */}
              <text
                x={room.x + room.width / 2}
                y={room.y + room.height / 2}
                textAnchor="middle"
                alignmentBaseline="middle"
                fill="#ffffff"
                fontSize={Math.max(10, Math.min(room.width, room.height) * 0.12)} // Dynamically scale text
                fontWeight="600"
                fontFamily="system-ui, sans-serif"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {room.label}
              </text>
              
              {/* Dimension Label (Meters) */}
              <text
                x={room.x + room.width / 2}
                y={room.y + room.height / 2 + (Math.max(12, Math.min(room.width, room.height) * 0.12))}
                textAnchor="middle"
                alignmentBaseline="middle"
                fill="rgba(255,255,255,0.5)"
                fontSize={Math.max(8, Math.min(room.width, room.height) * 0.08)}
                fontFamily="system-ui, sans-serif"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {Math.round(room.width)}x{Math.round(room.height)} px
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
