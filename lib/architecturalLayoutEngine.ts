/**
 * Project X — Architectural Typology Layout Engine
 * Provides 5 specialized, tailor-made architectural layout engines:
 * 1. 4-Wing Cross Typology (Batman, Curved-X, H-Shape, Pinwheel, Greek Cross)
 * 2. 3-Wing Triad Typology (Triad Prism, Y-Shape, Shanghai Tower, Water Droplet)
 * 3. 2-Wing Slender Typology (Chevron, Stepped-L, Double-Diamond, Turning Torso)
 * 4. Linear Slab / Double-Spine Typology (Monolithic Rect, Bosco Verticale, Aqua)
 * 5. Multi-Faceted Polygonal Typology (Hexagon, Octagon, Taipei 101, Torre Glòries)
 */

export type ArchitecturalTypology = 
  | 'cross-4wing'
  | 'triad-3wing'
  | 'chevron-2wing'
  | 'linear-slab'
  | 'faceted-tower';

export interface RoomBox {
  name: string;
  icon: string;
  category: 'bedroom' | 'balcony' | 'kitchen' | 'toilet' | 'living';
  color: string;
  pts: Array<{ x: number; y: number }>;
  isBalcony?: boolean;
}

export interface UnitLayout {
  id: string;
  label: string;
  stroke: string;
  fill: string;
  textColor: string;
  boundaryPts: Array<{ x: number; y: number }>;
  livingRoomCenter: { x: number; y: number };
  balconyCenter?: { x: number; y: number };
  entranceDoor: { x: number; y: number };
  rooms: RoomBox[];
}

export interface TypologyLayoutResult {
  typology: ArchitecturalTypology;
  typologyName: string;
  core: {
    x: number;
    y: number;
    width: number;
    length: number;
    lifts: number;
    stairs: number;
  };
  lightShaft?: {
    x: number;
    y: number;
    width: number;
    length: number;
  };
  corridorWalls: Array<Array<{ x: number; y: number }>>;
  units: UnitLayout[];
}

// ── Color Palettes for up to 8 units ─────────────────────────────────────────
export const UNIT_PALETTES = [
  { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.12)', textColor: '#fca5a5', label: 'F1' },
  { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.12)', textColor: '#6ee7b7', label: 'F2' },
  { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.12)', textColor: '#fcd34d', label: 'F3' },
  { stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.12)', textColor: '#67e8f9', label: 'F4' },
  { stroke: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.12)', textColor: '#c4b5fd', label: 'F5' },
  { stroke: '#14b8a6', fill: 'rgba(20, 184, 166, 0.12)', textColor: '#5eead4', label: 'F6' },
  { stroke: '#f43f5e', fill: 'rgba(244, 63, 94, 0.12)', textColor: '#fda4af', label: 'F7' },
  { stroke: '#eab308', fill: 'rgba(234, 179, 8, 0.12)', textColor: '#fde047', label: 'F8' },
];

/**
 * Automatically determine the most optimal architectural typology for any shape
 */
export function getShapeTypology(shapeId: string): ArchitecturalTypology {
  const s = shapeId.toLowerCase();

  // 1. 4-Wing Cross Typologies
  if (
    s.includes('batman') ||
    s.includes('cross') ||
    s.includes('curved-x') ||
    s.includes('pinwheel') ||
    s.includes('h-shape') ||
    s.includes('petronas') ||
    s.includes('clover') ||
    s.includes('chrysler') ||
    s.includes('diamond-quadrant')
  ) {
    return 'cross-4wing';
  }

  // 2. 3-Wing Triad Typologies
  if (
    s.includes('triad') ||
    s.includes('triangular') ||
    s.includes('shanghai') ||
    s.includes('t-shape') ||
    s.includes('droplet') ||
    s.includes('teardrop') ||
    s.includes('honeycomb') ||
    s.includes('flame')
  ) {
    return 'triad-3wing';
  }

  // 3. 2-Wing Slender / Chevron Typologies
  if (
    s.includes('chevron') ||
    s.includes('stepped-l') ||
    s.includes('double-diamond') ||
    s.includes('vesica') ||
    s.includes('torso') ||
    s.includes('leaf') ||
    s.includes('gherkin') ||
    s.includes('scallop') ||
    s.includes('nautilus')
  ) {
    return 'chevron-2wing';
  }

  // 4. Linear Slab / Double-Spine Typologies
  if (
    s.includes('monolithic') ||
    s.includes('rect') ||
    s.includes('bosco') ||
    s.includes('rotterdam') ||
    s.includes('aqua') ||
    s.includes('hamra') ||
    s.includes('monroe') ||
    s.includes('hearst')
  ) {
    return 'linear-slab';
  }

  // 5. Default: Multi-Faceted Polygonal Tower
  return 'faceted-tower';
}

/**
 * Raycast against polygon perimeter from an origin
 */
export function raycastPolygon(
  origin: { x: number; y: number },
  angleRad: number,
  polygonPts: Array<{ x: number; y: number }>
): { x: number; y: number } {
  const dirX = Math.cos(angleRad);
  const dirY = Math.sin(angleRad);
  let closestT = Infinity;
  let hitX = origin.x + dirX * 100;
  let hitY = origin.y + dirY * 100;

  for (let i = 0; i < polygonPts.length; i++) {
    const j = (i + 1) % polygonPts.length;
    const p1 = polygonPts[i];
    const p2 = polygonPts[j];

    const v1x = origin.x - p1.x;
    const v1y = origin.y - p1.y;
    const v2x = p2.x - p1.x;
    const v2y = p2.y - p1.y;
    const v3x = -dirY;
    const v3y = dirX;

    const dot = v2x * v3x + v2y * v3y;
    if (Math.abs(dot) > 0.00001) {
      const t1 = (v2x * v1y - v2y * v1x) / dot;
      const t2 = (v1x * v3x + v1y * v3y) / dot;
      if (t1 > 0 && t2 >= 0 && t2 <= 1) {
        if (t1 < closestT) {
          closestT = t1;
          hitX = origin.x + dirX * t1;
          hitY = origin.y + dirY * t1;
        }
      }
    }
  }
  return { x: hitX, y: hitY };
}

/**
 * Generate a specialized architectural floor plan layout based on shape typology, unit count, and BHK mix
 */
export function generateSpecializedLayout(
  shapeId: string,
  polygonPts: Array<{ x: number; y: number }>,
  widthM: number,
  lengthM: number,
  unitCount: number,
  bhkType: '1bhk' | '2bhk' | '3bhk' | '4bhk'
): TypologyLayoutResult {
  const typology = getShapeTypology(shapeId);
  const cx = widthM / 2;
  const cy = lengthM / 2;
  const numUnits = Math.min(8, Math.max(2, unitCount === 5 ? 4 : unitCount));

  // ── Pro Architectural Rectangular Core Specifications ───────────────────
  // A pro architect uses rectangular cores (e.g. 18m x 8m) instead of square blocks
  // to maximize unobstructed habitable floor area for large flats.
  let coreX = cx;
  let coreY = cy;
  let coreW = Math.max(16, Math.min(22, widthM * 0.22));
  let coreH = Math.max(8, Math.min(11, lengthM * 0.12));

  if (typology === 'chevron-2wing') {
    // For V/L-shapes: Place core in the inner vertex knuckle to free up entire wings
    coreX = cx;
    coreY = cy + lengthM * 0.08;
    coreW = Math.max(14, Math.min(18, widthM * 0.18));
    coreH = Math.max(9, Math.min(12, lengthM * 0.14));
  } else if (typology === 'linear-slab') {
    // For Linear Slabs: Sleek horizontal core spine
    coreX = cx;
    coreY = cy;
    coreW = Math.max(20, Math.min(28, widthM * 0.28));
    coreH = Math.max(7.5, Math.min(9.5, lengthM * 0.10));
  } else if (typology === 'cross-4wing') {
    // For 4-Wing Cross: Compact central nexus core
    coreX = cx;
    coreY = cy;
    coreW = Math.max(15, Math.min(19, widthM * 0.20));
    coreH = Math.max(8.5, Math.min(11, lengthM * 0.12));
  } else if (typology === 'triad-3wing') {
    // For 3-Wing Triad: 3-way central hub
    coreX = cx;
    coreY = cy + lengthM * 0.02;
    coreW = Math.max(14, Math.min(18, widthM * 0.18));
    coreH = Math.max(9, Math.min(12, lengthM * 0.13));
  }

  // Light shaft extending from core to exterior facade
  const lightShaft = {
    x: coreX - 2.25,
    y: coreY + coreH / 2,
    width: 4.5,
    length: lengthM - (coreY + coreH / 2),
  };

  const units: UnitLayout[] = [];
  const corridorWalls: Array<Array<{ x: number; y: number }>> = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. 4-WING CROSS TYPOLOGY (Batman, Curved-X, H-Shape, Pinwheel, Greek Cross)
  // ═══════════════════════════════════════════════════════════════════════════
  if (typology === 'cross-4wing') {
    const wingAngles = [
      -Math.PI / 4,       // Top-Right Wing (F1)
      Math.PI / 4,        // Bottom-Right Wing (F2)
      (3 * Math.PI) / 4,  // Bottom-Left Wing (F3)
      -(3 * Math.PI) / 4, // Top-Left Wing (F4)
    ];

    for (let i = 0; i < numUnits; i++) {
      const palette = UNIT_PALETTES[i % UNIT_PALETTES.length];
      const baseAngle = wingAngles[i % wingAngles.length];
      const hit = raycastPolygon({ x: cx, y: cy }, baseAngle, polygonPts);
      const wingLen = Math.sqrt((hit.x - cx) ** 2 + (hit.y - cy) ** 2);

      // Living Room Centered in Wing
      const livingX = cx + Math.cos(baseAngle) * (wingLen * 0.45);
      const livingY = cy + Math.sin(baseAngle) * (wingLen * 0.45);

      // Balcony at Outer Facade Tip of Wing
      const balconyHit = raycastPolygon({ x: cx, y: cy }, baseAngle, polygonPts);
      const balconyX = cx + Math.cos(baseAngle) * (wingLen - 1.5);
      const balconyY = cy + Math.sin(baseAngle) * (wingLen - 1.5);

      // Entrance Door at Core Nexus
      const entryRadius = Math.max(coreW, coreH) / 2 + 1.5;
      const entryX = cx + Math.cos(baseAngle) * entryRadius;
      const entryY = cy + Math.sin(baseAngle) * entryRadius;

      // Master Bedroom at Wing Flank
      const flankAngle1 = baseAngle - 0.28;
      const flankHit1 = raycastPolygon({ x: cx, y: cy }, flankAngle1, polygonPts);
      const mBedX = cx + Math.cos(flankAngle1) * (wingLen * 0.72);
      const mBedY = cy + Math.sin(flankAngle1) * (wingLen * 0.72);

      // Bedroom 2 / Bed 3 at Opposing Flank
      const flankAngle2 = baseAngle + 0.28;
      const bed2X = cx + Math.cos(flankAngle2) * (wingLen * 0.72);
      const bed2Y = cy + Math.sin(flankAngle2) * (wingLen * 0.72);

      // Kitchen & Toilet on Inner Utility Wall
      const kitchX = cx + Math.cos(flankAngle1) * (wingLen * 0.35);
      const kitchY = cy + Math.sin(flankAngle1) * (wingLen * 0.35);

      const toiletX = cx + Math.cos(flankAngle2) * (wingLen * 0.35);
      const toiletY = cy + Math.sin(flankAngle2) * (wingLen * 0.35);

      const rooms: RoomBox[] = [
        {
          name: 'BALCONY',
          icon: '🌿',
          category: 'balcony',
          color: '#10b981',
          isBalcony: true,
          pts: [{ x: balconyX - 3, y: balconyY - 1 }, { x: balconyX + 3, y: balconyY - 1 }, { x: balconyX + 3, y: balconyY + 1 }, { x: balconyX - 3, y: balconyY + 1 }]
        },
        {
          name: 'MASTER BED',
          icon: '🛏️',
          category: 'bedroom',
          color: '#3b82f6',
          pts: [{ x: mBedX - 3.5, y: mBedY - 2.5 }, { x: mBedX + 3.5, y: mBedY - 2.5 }, { x: mBedX + 3.5, y: mBedY + 2.5 }, { x: mBedX - 3.5, y: mBedY + 2.5 }]
        },
        {
          name: 'BEDROOM 2',
          icon: '🛏️',
          category: 'bedroom',
          color: '#6366f1',
          pts: [{ x: bed2X - 3, y: bed2Y - 2.5 }, { x: bed2X + 3, y: bed2Y - 2.5 }, { x: bed2X + 3, y: bed2Y + 2.5 }, { x: bed2X - 3, y: bed2Y + 2.5 }]
        },
        {
          name: 'KITCHEN',
          icon: '🍳',
          category: 'kitchen',
          color: '#f59e0b',
          pts: [{ x: kitchX - 2.5, y: kitchY - 2 }, { x: kitchX + 2.5, y: kitchY - 2 }, { x: kitchX + 2.5, y: kitchY + 2 }, { x: kitchX - 2.5, y: kitchY + 2 }]
        },
        {
          name: 'TOILET',
          icon: '🚿',
          category: 'toilet',
          color: '#0ea5e9',
          pts: [{ x: toiletX - 2, y: toiletY - 1.8 }, { x: toiletX + 2, y: toiletY - 1.8 }, { x: toiletX + 2, y: toiletY + 1.8 }, { x: toiletX - 2, y: toiletY + 1.8 }]
        },
      ];

      units.push({
        id: `unit-${i + 1}`,
        label: palette.label,
        stroke: palette.stroke,
        fill: palette.fill,
        textColor: palette.textColor,
        boundaryPts: [
          { x: cx, y: cy },
          raycastPolygon({ x: cx, y: cy }, baseAngle - Math.PI / 4, polygonPts),
          balconyHit,
          raycastPolygon({ x: cx, y: cy }, baseAngle + Math.PI / 4, polygonPts),
        ],
        livingRoomCenter: { x: livingX, y: livingY },
        balconyCenter: { x: balconyX, y: balconyY },
        entranceDoor: { x: entryX, y: entryY },
        rooms,
      });
    }

    return {
      typology: 'cross-4wing',
      typologyName: '4-WING CROSS TYPOLOGY (WING SUITES)',
      core: { x: cx, y: cy, width: coreW, length: coreH, lifts: 2, stairs: 2 },
      lightShaft,
      corridorWalls,
      units,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. 3-WING TRIAD TYPOLOGY (Triad Prism, Y-Shape, Shanghai Tower)
  // ═══════════════════════════════════════════════════════════════════════════
  if (typology === 'triad-3wing') {
    const triadAngles = [
      -Math.PI / 2,        // Top North Wing (F1)
      Math.PI / 6,         // South-East Wing (F2)
      (5 * Math.PI) / 6,   // South-West Wing (F3)
    ];

    for (let i = 0; i < numUnits; i++) {
      const palette = UNIT_PALETTES[i % UNIT_PALETTES.length];
      const baseAngle = triadAngles[i % triadAngles.length];
      const hit = raycastPolygon({ x: cx, y: cy }, baseAngle, polygonPts);
      const wingLen = Math.sqrt((hit.x - cx) ** 2 + (hit.y - cy) ** 2);

      const livingX = cx + Math.cos(baseAngle) * (wingLen * 0.45);
      const livingY = cy + Math.sin(baseAngle) * (wingLen * 0.45);

      const balconyX = cx + Math.cos(baseAngle) * (wingLen - 1.5);
      const balconyY = cy + Math.sin(baseAngle) * (wingLen - 1.5);

      const entryRadius = Math.max(coreW, coreH) / 2 + 1.5;
      const entryX = cx + Math.cos(baseAngle) * entryRadius;
      const entryY = cy + Math.sin(baseAngle) * entryRadius;

      const flank1 = baseAngle - 0.35;
      const flank2 = baseAngle + 0.35;
      const mBedX = cx + Math.cos(flank1) * (wingLen * 0.75);
      const mBedY = cy + Math.sin(flank1) * (wingLen * 0.75);

      const bed2X = cx + Math.cos(flank2) * (wingLen * 0.75);
      const bed2Y = cy + Math.sin(flank2) * (wingLen * 0.75);

      const kitchX = cx + Math.cos(flank1) * (wingLen * 0.38);
      const kitchY = cy + Math.sin(flank1) * (wingLen * 0.38);

      const toiletX = cx + Math.cos(flank2) * (wingLen * 0.38);
      const toiletY = cy + Math.sin(flank2) * (wingLen * 0.38);

      const rooms: RoomBox[] = [
        {
          name: 'BALCONY',
          icon: '🌿',
          category: 'balcony',
          color: '#10b981',
          isBalcony: true,
          pts: [{ x: balconyX - 3, y: balconyY - 1 }, { x: balconyX + 3, y: balconyY - 1 }, { x: balconyX + 3, y: balconyY + 1 }, { x: balconyX - 3, y: balconyY + 1 }]
        },
        {
          name: 'MASTER BED',
          icon: '🛏️',
          category: 'bedroom',
          color: '#3b82f6',
          pts: [{ x: mBedX - 3.5, y: mBedY - 2.5 }, { x: mBedX + 3.5, y: mBedY - 2.5 }, { x: mBedX + 3.5, y: mBedY + 2.5 }, { x: mBedX - 3.5, y: mBedY + 2.5 }]
        },
        {
          name: 'BEDROOM 2',
          icon: '🛏️',
          category: 'bedroom',
          color: '#6366f1',
          pts: [{ x: bed2X - 3, y: bed2Y - 2.5 }, { x: bed2X + 3, y: bed2Y - 2.5 }, { x: bed2X + 3, y: bed2Y + 2.5 }, { x: bed2X - 3, y: bed2Y + 2.5 }]
        },
        {
          name: 'KITCHEN',
          icon: '🍳',
          category: 'kitchen',
          color: '#f59e0b',
          pts: [{ x: kitchX - 2.5, y: kitchY - 2 }, { x: kitchX + 2.5, y: kitchY - 2 }, { x: kitchX + 2.5, y: kitchY + 2 }, { x: kitchX - 2.5, y: kitchY + 2 }]
        },
        {
          name: 'TOILET',
          icon: '🚿',
          category: 'toilet',
          color: '#0ea5e9',
          pts: [{ x: toiletX - 2, y: toiletY - 1.8 }, { x: toiletX + 2, y: toiletY - 1.8 }, { x: toiletX + 2, y: toiletY + 1.8 }, { x: toiletX - 2, y: toiletY + 1.8 }]
        },
      ];

      units.push({
        id: `unit-${i + 1}`,
        label: palette.label,
        stroke: palette.stroke,
        fill: palette.fill,
        textColor: palette.textColor,
        boundaryPts: [
          { x: cx, y: cy },
          raycastPolygon({ x: cx, y: cy }, baseAngle - Math.PI / 3, polygonPts),
          hit,
          raycastPolygon({ x: cx, y: cy }, baseAngle + Math.PI / 3, polygonPts),
        ],
        livingRoomCenter: { x: livingX, y: livingY },
        balconyCenter: { x: balconyX, y: balconyY },
        entranceDoor: { x: entryX, y: entryY },
        rooms,
      });
    }

    return {
      typology: 'triad-3wing',
      typologyName: '3-WING TRIAD TYPOLOGY (120° RADIAL PODS)',
      core: { x: cx, y: cy, width: coreW, length: coreH, lifts: 2, stairs: 2 },
      lightShaft,
      corridorWalls,
      units,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. 2-WING SLENDER / CHEVRON TYPOLOGY (Chevron, Stepped-L, Double-Diamond)
  // ═══════════════════════════════════════════════════════════════════════════
  if (typology === 'chevron-2wing') {
    const vAngles = [
      -(3 * Math.PI) / 4, // Left Wing (F1)
      -Math.PI / 4,       // Right Wing (F2)
      Math.PI / 2,        // Apex Center Unit (F3)
      (3 * Math.PI) / 4,  // Bottom Flank (F4)
    ];

    for (let i = 0; i < numUnits; i++) {
      const palette = UNIT_PALETTES[i % UNIT_PALETTES.length];
      const baseAngle = vAngles[i % vAngles.length];
      const hit = raycastPolygon({ x: cx, y: cy }, baseAngle, polygonPts);
      const wingLen = Math.sqrt((hit.x - cx) ** 2 + (hit.y - cy) ** 2);

      const livingX = cx + Math.cos(baseAngle) * (wingLen * 0.45);
      const livingY = cy + Math.sin(baseAngle) * (wingLen * 0.45);

      const balconyX = cx + Math.cos(baseAngle) * (wingLen - 1.5);
      const balconyY = cy + Math.sin(baseAngle) * (wingLen - 1.5);

      const entryRadius = Math.max(coreW, coreH) / 2 + 1.5;
      const entryX = cx + Math.cos(baseAngle) * entryRadius;
      const entryY = cy + Math.sin(baseAngle) * entryRadius;

      const flank1 = baseAngle - 0.25;
      const flank2 = baseAngle + 0.25;
      const mBedX = cx + Math.cos(flank1) * (wingLen * 0.75);
      const mBedY = cy + Math.sin(flank1) * (wingLen * 0.75);

      const bed2X = cx + Math.cos(flank2) * (wingLen * 0.75);
      const bed2Y = cy + Math.sin(flank2) * (wingLen * 0.75);

      const kitchX = cx + Math.cos(flank1) * (wingLen * 0.35);
      const kitchY = cy + Math.sin(flank1) * (wingLen * 0.35);

      const toiletX = cx + Math.cos(flank2) * (wingLen * 0.35);
      const toiletY = cy + Math.sin(flank2) * (wingLen * 0.35);

      const rooms: RoomBox[] = [
        {
          name: 'BALCONY',
          icon: '🌿',
          category: 'balcony',
          color: '#10b981',
          isBalcony: true,
          pts: [{ x: balconyX - 3, y: balconyY - 1 }, { x: balconyX + 3, y: balconyY - 1 }, { x: balconyX + 3, y: balconyY + 1 }, { x: balconyX - 3, y: balconyY + 1 }]
        },
        {
          name: 'MASTER BED',
          icon: '🛏️',
          category: 'bedroom',
          color: '#3b82f6',
          pts: [{ x: mBedX - 3.5, y: mBedY - 2.5 }, { x: mBedX + 3.5, y: mBedY - 2.5 }, { x: mBedX + 3.5, y: mBedY + 2.5 }, { x: mBedX - 3.5, y: mBedY + 2.5 }]
        },
        {
          name: 'BEDROOM 2',
          icon: '🛏️',
          category: 'bedroom',
          color: '#6366f1',
          pts: [{ x: bed2X - 3, y: bed2Y - 2.5 }, { x: bed2X + 3, y: bed2Y - 2.5 }, { x: bed2X + 3, y: bed2Y + 2.5 }, { x: bed2X - 3, y: bed2Y + 2.5 }]
        },
        {
          name: 'KITCHEN',
          icon: '🍳',
          category: 'kitchen',
          color: '#f59e0b',
          pts: [{ x: kitchX - 2.5, y: kitchY - 2 }, { x: kitchX + 2.5, y: kitchY - 2 }, { x: kitchX + 2.5, y: kitchY + 2 }, { x: kitchX - 2.5, y: kitchY + 2 }]
        },
        {
          name: 'TOILET',
          icon: '🚿',
          category: 'toilet',
          color: '#0ea5e9',
          pts: [{ x: toiletX - 2, y: toiletY - 1.8 }, { x: toiletX + 2, y: toiletY - 1.8 }, { x: toiletX + 2, y: toiletY + 1.8 }, { x: toiletX - 2, y: toiletY + 1.8 }]
        },
      ];

      units.push({
        id: `unit-${i + 1}`,
        label: palette.label,
        stroke: palette.stroke,
        fill: palette.fill,
        textColor: palette.textColor,
        boundaryPts: [
          { x: cx, y: cy },
          raycastPolygon({ x: cx, y: cy }, baseAngle - Math.PI / 4, polygonPts),
          hit,
          raycastPolygon({ x: cx, y: cy }, baseAngle + Math.PI / 4, polygonPts),
        ],
        livingRoomCenter: { x: livingX, y: livingY },
        balconyCenter: { x: balconyX, y: balconyY },
        entranceDoor: { x: entryX, y: entryY },
        rooms,
      });
    }

    return {
      typology: 'chevron-2wing',
      typologyName: '2-WING SLENDER / CHEVRON TYPOLOGY',
      core: { x: cx, y: cy, width: coreW, length: coreH, lifts: 2, stairs: 2 },
      lightShaft,
      corridorWalls,
      units,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. LINEAR SLAB / DOUBLE-SPINE TYPOLOGY (Monolithic Rect, Bosco Verticale)
  // ═══════════════════════════════════════════════════════════════════════════
  if (typology === 'linear-slab') {
    const halfUnits = Math.ceil(numUnits / 2);
    const bayWidth = (widthM * 0.85) / halfUnits;

    // North Bay Units (F1, F2, F3...)
    for (let i = 0; i < halfUnits; i++) {
      const palette = UNIT_PALETTES[i % UNIT_PALETTES.length];
      const bayCenterX = cx - (widthM * 0.85) / 2 + (i + 0.5) * bayWidth;
      const bayNorthY = cy - coreH / 2 - (lengthM * 0.35);

      const livingX = bayCenterX;
      const livingY = cy - coreH / 2 - 8;
      const balconyX = bayCenterX;
      const balconyY = cy - lengthM * 0.42;
      const entryX = bayCenterX;
      const entryY = cy - coreH / 2 - 1.5;

      const mBedX = bayCenterX - bayWidth * 0.25;
      const mBedY = cy - lengthM * 0.32;
      const bed2X = bayCenterX + bayWidth * 0.25;
      const bed2Y = cy - lengthM * 0.32;

      const kitchX = bayCenterX - bayWidth * 0.30;
      const kitchY = livingY - 4;
      const toiletX = bayCenterX + bayWidth * 0.30;
      const toiletY = livingY - 4;

      const rooms: RoomBox[] = [
        {
          name: 'BALCONY',
          icon: '🌿',
          category: 'balcony',
          color: '#10b981',
          isBalcony: true,
          pts: [{ x: balconyX - 3, y: balconyY - 1 }, { x: balconyX + 3, y: balconyY - 1 }, { x: balconyX + 3, y: balconyY + 1 }, { x: balconyX - 3, y: balconyY + 1 }]
        },
        {
          name: 'MASTER BED',
          icon: '🛏️',
          category: 'bedroom',
          color: '#3b82f6',
          pts: [{ x: mBedX - 3, y: mBedY - 2.5 }, { x: mBedX + 3, y: mBedY - 2.5 }, { x: mBedX + 3, y: mBedY + 2.5 }, { x: mBedX - 3, y: mBedY + 2.5 }]
        },
        {
          name: 'BEDROOM 2',
          icon: '🛏️',
          category: 'bedroom',
          color: '#6366f1',
          pts: [{ x: bed2X - 3, y: bed2Y - 2.5 }, { x: bed2X + 3, y: bed2Y - 2.5 }, { x: bed2X + 3, y: bed2Y + 2.5 }, { x: bed2X - 3, y: bed2Y + 2.5 }]
        },
        {
          name: 'KITCHEN',
          icon: '🍳',
          category: 'kitchen',
          color: '#f59e0b',
          pts: [{ x: kitchX - 2.5, y: kitchY - 2 }, { x: kitchX + 2.5, y: kitchY - 2 }, { x: kitchX + 2.5, y: kitchY + 2 }, { x: kitchX - 2.5, y: kitchY + 2 }]
        },
        {
          name: 'TOILET',
          icon: '🚿',
          category: 'toilet',
          color: '#0ea5e9',
          pts: [{ x: toiletX - 2, y: toiletY - 1.8 }, { x: toiletX + 2, y: toiletY - 1.8 }, { x: toiletX + 2, y: toiletY + 1.8 }, { x: toiletX - 2, y: toiletY + 1.8 }]
        },
      ];

      units.push({
        id: `unit-${i + 1}`,
        label: palette.label,
        stroke: palette.stroke,
        fill: palette.fill,
        textColor: palette.textColor,
        boundaryPts: [
          { x: bayCenterX - bayWidth / 2, y: cy - coreH / 2 },
          { x: bayCenterX - bayWidth / 2, y: cy - lengthM * 0.45 },
          { x: bayCenterX + bayWidth / 2, y: cy - lengthM * 0.45 },
          { x: bayCenterX + bayWidth / 2, y: cy - coreH / 2 },
        ],
        livingRoomCenter: { x: livingX, y: livingY },
        balconyCenter: { x: balconyX, y: balconyY },
        entranceDoor: { x: entryX, y: entryY },
        rooms,
      });
    }

    // South Bay Units (F4, F5, F6...)
    const southUnitsCount = numUnits - halfUnits;
    for (let i = 0; i < southUnitsCount; i++) {
      const uIdx = halfUnits + i;
      const palette = UNIT_PALETTES[uIdx % UNIT_PALETTES.length];
      const bayCenterX = cx - (widthM * 0.85) / 2 + (i + 0.5) * ((widthM * 0.85) / southUnitsCount);

      const livingX = bayCenterX;
      const livingY = cy + coreH / 2 + 8;
      const balconyX = bayCenterX;
      const balconyY = cy + lengthM * 0.42;
      const entryX = bayCenterX;
      const entryY = cy + coreH / 2 + 1.5;

      const mBedX = bayCenterX - bayWidth * 0.25;
      const mBedY = cy + lengthM * 0.32;
      const bed2X = bayCenterX + bayWidth * 0.25;
      const bed2Y = cy + lengthM * 0.32;

      const kitchX = bayCenterX - bayWidth * 0.30;
      const kitchY = livingY + 4;
      const toiletX = bayCenterX + bayWidth * 0.30;
      const toiletY = livingY + 4;

      const rooms: RoomBox[] = [
        {
          name: 'BALCONY',
          icon: '🌿',
          category: 'balcony',
          color: '#10b981',
          isBalcony: true,
          pts: [{ x: balconyX - 3, y: balconyY - 1 }, { x: balconyX + 3, y: balconyY - 1 }, { x: balconyX + 3, y: balconyY + 1 }, { x: balconyX - 3, y: balconyY + 1 }]
        },
        {
          name: 'MASTER BED',
          icon: '🛏️',
          category: 'bedroom',
          color: '#3b82f6',
          pts: [{ x: mBedX - 3, y: mBedY - 2.5 }, { x: mBedX + 3, y: mBedY - 2.5 }, { x: mBedX + 3, y: mBedY + 2.5 }, { x: mBedX - 3, y: mBedY + 2.5 }]
        },
        {
          name: 'BEDROOM 2',
          icon: '🛏️',
          category: 'bedroom',
          color: '#6366f1',
          pts: [{ x: bed2X - 3, y: bed2Y - 2.5 }, { x: bed2X + 3, y: bed2Y - 2.5 }, { x: bed2X + 3, y: bed2Y + 2.5 }, { x: bed2X - 3, y: bed2Y + 2.5 }]
        },
        {
          name: 'KITCHEN',
          icon: '🍳',
          category: 'kitchen',
          color: '#f59e0b',
          pts: [{ x: kitchX - 2.5, y: kitchY - 2 }, { x: kitchX + 2.5, y: kitchY - 2 }, { x: kitchX + 2.5, y: kitchY + 2 }, { x: kitchX - 2.5, y: kitchY + 2 }]
        },
        {
          name: 'TOILET',
          icon: '🚿',
          category: 'toilet',
          color: '#0ea5e9',
          pts: [{ x: toiletX - 2, y: toiletY - 1.8 }, { x: toiletX + 2, y: toiletY - 1.8 }, { x: toiletX + 2, y: toiletY + 1.8 }, { x: toiletX - 2, y: toiletY + 1.8 }]
        },
      ];

      units.push({
        id: `unit-${uIdx + 1}`,
        label: palette.label,
        stroke: palette.stroke,
        fill: palette.fill,
        textColor: palette.textColor,
        boundaryPts: [
          { x: bayCenterX - bayWidth / 2, y: cy + coreH / 2 },
          { x: bayCenterX - bayWidth / 2, y: cy + lengthM * 0.45 },
          { x: bayCenterX + bayWidth / 2, y: cy + lengthM * 0.45 },
          { x: bayCenterX + bayWidth / 2, y: cy + coreH / 2 },
        ],
        livingRoomCenter: { x: livingX, y: livingY },
        balconyCenter: { x: balconyX, y: balconyY },
        entranceDoor: { x: entryX, y: entryY },
        rooms,
      });
    }

    return {
      typology: 'linear-slab',
      typologyName: 'LINEAR SLAB TYPOLOGY (DOUBLE-SPINE BAYS)',
      core: { x: cx, y: cy, width: coreW * 1.2, length: coreH * 0.8, lifts: 2, stairs: 2 },
      lightShaft,
      corridorWalls,
      units,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. MULTI-FACETED / RADIAL POLYGONAL TYPOLOGY (Hexagon, Octagon, Torre Glòries)
  // ═══════════════════════════════════════════════════════════════════════════
  for (let i = 0; i < numUnits; i++) {
    const palette = UNIT_PALETTES[i % UNIT_PALETTES.length];
    const angle = (i * 2 * Math.PI) / numUnits - Math.PI / 2;
    const hit = raycastPolygon({ x: cx, y: cy }, angle, polygonPts);
    const dist = Math.sqrt((hit.x - cx) ** 2 + (hit.y - cy) ** 2);

    const livingX = cx + Math.cos(angle) * (dist * 0.45);
    const livingY = cy + Math.sin(angle) * (dist * 0.45);

    const balconyX = cx + Math.cos(angle) * (dist - 1.5);
    const balconyY = cy + Math.sin(angle) * (dist - 1.5);

    const entryRadius = Math.max(coreW, coreH) / 2 + 1.5;
    const entryX = cx + Math.cos(angle) * entryRadius;
    const entryY = cy + Math.sin(angle) * entryRadius;

    const flank1 = angle - 0.25;
    const flank2 = angle + 0.25;
    const mBedX = cx + Math.cos(flank1) * (dist * 0.72);
    const mBedY = cy + Math.sin(flank1) * (dist * 0.72);

    const bed2X = cx + Math.cos(flank2) * (dist * 0.72);
    const bed2Y = cy + Math.sin(flank2) * (dist * 0.72);

    const kitchX = cx + Math.cos(flank1) * (dist * 0.35);
    const kitchY = cy + Math.sin(flank1) * (dist * 0.35);

    const toiletX = cx + Math.cos(flank2) * (dist * 0.35);
    const toiletY = cy + Math.sin(flank2) * (dist * 0.35);

    const rooms: RoomBox[] = [
      {
        name: 'BALCONY',
        icon: '🌿',
        category: 'balcony',
        color: '#10b981',
        isBalcony: true,
        pts: [{ x: balconyX - 3, y: balconyY - 1 }, { x: balconyX + 3, y: balconyY - 1 }, { x: balconyX + 3, y: balconyY + 1 }, { x: balconyX - 3, y: balconyY + 1 }]
      },
      {
        name: 'MASTER BED',
        icon: '🛏️',
        category: 'bedroom',
        color: '#3b82f6',
        pts: [{ x: mBedX - 3.5, y: mBedY - 2.5 }, { x: mBedX + 3.5, y: mBedY - 2.5 }, { x: mBedX + 3.5, y: mBedY + 2.5 }, { x: mBedX - 3.5, y: mBedY + 2.5 }]
      },
      {
        name: 'BEDROOM 2',
        icon: '🛏️',
        category: 'bedroom',
        color: '#6366f1',
        pts: [{ x: bed2X - 3, y: bed2Y - 2.5 }, { x: bed2X + 3, y: bed2Y - 2.5 }, { x: bed2X + 3, y: bed2Y + 2.5 }, { x: bed2X - 3, y: bed2Y + 2.5 }]
      },
      {
        name: 'KITCHEN',
        icon: '🍳',
        category: 'kitchen',
        color: '#f59e0b',
        pts: [{ x: kitchX - 2.5, y: kitchY - 2 }, { x: kitchX + 2.5, y: kitchY - 2 }, { x: kitchX + 2.5, y: kitchY + 2 }, { x: kitchX - 2.5, y: kitchY + 2 }]
      },
      {
        name: 'TOILET',
        icon: '🚿',
        category: 'toilet',
        color: '#0ea5e9',
        pts: [{ x: toiletX - 2, y: toiletY - 1.8 }, { x: toiletX + 2, y: toiletY - 1.8 }, { x: toiletX + 2, y: toiletY + 1.8 }, { x: toiletX - 2, y: toiletY + 1.8 }]
      },
    ];

    units.push({
      id: `unit-${i + 1}`,
      label: palette.label,
      stroke: palette.stroke,
      fill: palette.fill,
      textColor: palette.textColor,
      boundaryPts: [
        { x: cx, y: cy },
        raycastPolygon({ x: cx, y: cy }, angle - Math.PI / numUnits, polygonPts),
        hit,
        raycastPolygon({ x: cx, y: cy }, angle + Math.PI / numUnits, polygonPts),
      ],
      livingRoomCenter: { x: livingX, y: livingY },
      balconyCenter: { x: balconyX, y: balconyY },
      entranceDoor: { x: entryX, y: entryY },
      rooms,
    });
  }

  return {
    typology: 'faceted-tower',
    typologyName: 'MULTI-FACETED POLYGONAL TYPOLOGY (CORNER SUITES)',
    core: { x: cx, y: cy, width: coreW, length: coreH, lifts: 2, stairs: 2 },
    lightShaft,
    corridorWalls,
    units,
  };
}
