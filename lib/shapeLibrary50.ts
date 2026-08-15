/**
 * Project X — 50 Master Architectural, Geometric & Biophilic Footprint Library
 * Complete mathematical 2D polygon generators for tower floor plate synthesis.
 */

export type ShapeCategory = 'all' | 'architectural' | 'geometric' | 'biophilic';

export interface ShapeDefinition {
  id: string;
  name: string;
  category: 'architectural' | 'geometric' | 'biophilic';
  inspiration: string;
  description: string;
  efficiency: number; // 0 - 100 percentage
  defaultAspect: string;
  tags: string[];
  getPolygon: (cx: number, cy: number, w: number, h: number) => Array<{ x: number; y: number }>;
  getHoles?: (cx: number, cy: number, w: number, h: number) => Array<Array<{ x: number; y: number }>>;
}

// ── Math Helpers ─────────────────────────────────────────────────────────────
const PI = Math.PI;
const cos = Math.cos;
const sin = Math.sin;

// ── 50 SHAPES DEFINITIONS ───────────────────────────────────────────────────

export const MASTER_SHAPES_50: ShapeDefinition[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 1: FAMOUS ARCHITECTURAL MASTERPIECES (1 - 20)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'burj-khalifa',
    name: 'BURJ KHALIFA (TRI-FOIL 3-WING)',
    category: 'architectural',
    inspiration: 'Adrian Smith / SOM (Dubai)',
    description: 'Iconic 3-wing Y-buttressed core structure with stepped aerodynamic setbacks minimizing wind vortex shedding.',
    efficiency: 68,
    defaultAspect: '1:1 (Square)',
    tags: ['Super-Tall', 'Tri-Foil', 'Wind-Engineered', 'Y-Shape'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const angles = [0, (2 * PI) / 3, (4 * PI) / 3];
      for (const angle of angles) {
        const cosA = cos(angle);
        const sinA = sin(angle);
        const perpX = -sinA;
        const perpY = cosA;
        const armLen = 0.95;
        const armW1 = 0.22;
        const armW2 = 0.16;
        const armW3 = 0.10;

        pts.push({ x: cx + (cosA * 0.28 + perpX * 0.28) * rx, y: cy + (sinA * 0.28 + perpY * 0.28) * ry });
        pts.push({ x: cx + (cosA * 0.55 + perpX * armW1) * rx, y: cy + (sinA * 0.55 + perpY * armW1) * ry });
        pts.push({ x: cx + (cosA * 0.78 + perpX * armW2) * rx, y: cy + (sinA * 0.78 + perpY * armW2) * ry });
        pts.push({ x: cx + (cosA * armLen + perpX * armW3) * rx, y: cy + (sinA * armLen + perpY * armW3) * ry });
        pts.push({ x: cx + (cosA * armLen - perpX * armW3) * rx, y: cy + (sinA * armLen - perpY * armW3) * ry });
        pts.push({ x: cx + (cosA * 0.78 - perpX * armW2) * rx, y: cy + (sinA * 0.78 - perpY * armW2) * ry });
        pts.push({ x: cx + (cosA * 0.55 - perpX * armW1) * rx, y: cy + (sinA * 0.55 - perpY * armW1) * ry });
        pts.push({ x: cx + (cosA * 0.28 - perpX * 0.28) * rx, y: cy + (sinA * 0.28 - perpY * 0.28) * ry });
      }
      return pts;
    },
  },

  {
    id: 'taipei-101',
    name: 'TAIPEI 101 (PAGODA STAGGER)',
    category: 'architectural',
    inspiration: 'C.Y. Lee & Partners (Taipei)',
    description: 'Postmodern inverted stepped pagoda modules with fluted corner setbacks inspired by traditional bamboo shoots.',
    efficiency: 74,
    defaultAspect: '1:1 (Square)',
    tags: ['Pagoda', 'Asian Modernism', 'Corner Setbacks', 'Tiered'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.75 * rx, y: cy - 0.95 * ry },
        { x: cx - 0.60 * rx, y: cy - 0.95 * ry },
        { x: cx - 0.60 * rx, y: cy - 0.85 * ry },
        { x: cx + 0.60 * rx, y: cy - 0.85 * ry },
        { x: cx + 0.60 * rx, y: cy - 0.95 * ry },
        { x: cx + 0.75 * rx, y: cy - 0.95 * ry },
        { x: cx + 0.95 * rx, y: cy - 0.75 * ry },
        { x: cx + 0.95 * rx, y: cy - 0.60 * ry },
        { x: cx + 0.85 * rx, y: cy - 0.60 * ry },
        { x: cx + 0.85 * rx, y: cy + 0.60 * ry },
        { x: cx + 0.95 * rx, y: cy + 0.60 * ry },
        { x: cx + 0.95 * rx, y: cy + 0.75 * ry },
        { x: cx + 0.75 * rx, y: cy + 0.95 * ry },
        { x: cx + 0.60 * rx, y: cy + 0.95 * ry },
        { x: cx + 0.60 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.60 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.60 * rx, y: cy + 0.95 * ry },
        { x: cx - 0.75 * rx, y: cy + 0.95 * ry },
        { x: cx - 0.95 * rx, y: cy + 0.75 * ry },
        { x: cx - 0.95 * rx, y: cy + 0.60 * ry },
        { x: cx - 0.85 * rx, y: cy + 0.60 * ry },
        { x: cx - 0.85 * rx, y: cy - 0.60 * ry },
        { x: cx - 0.95 * rx, y: cy - 0.60 * ry },
        { x: cx - 0.95 * rx, y: cy - 0.75 * ry },
      ];
    },
  },

  {
    id: 'shanghai-tower',
    name: 'SHANGHAI TOWER (TREFOIL REULEAUX)',
    category: 'architectural',
    inspiration: 'Gensler (Shanghai)',
    description: 'Smooth triangular Reuleaux cylinder with chamfered rounded apexes and aerodynamic vortex-dissipating contour.',
    efficiency: 72,
    defaultAspect: '1:1 (Square)',
    tags: ['Reuleaux', 'Curvilinear', 'Aerodynamic', 'Megatall'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const numSegments = 48;
      for (let i = 0; i < numSegments; i++) {
        const theta = (i / numSegments) * 2 * PI;
        const r = 0.78 + 0.18 * cos(3 * theta);
        pts.push({
          x: cx + r * cos(theta) * rx,
          y: cy + r * sin(theta) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'gherkin-torpedo',
    name: 'THE GHERKIN (TORPEDO OVAL)',
    category: 'architectural',
    inspiration: 'Foster + Partners (London)',
    description: 'Radial aerodynamic circular-elliptical floor plate with diagrid perimeter nodes maximizing 360-degree perimeter daylight.',
    efficiency: 82,
    defaultAspect: '1:1 (Square)',
    tags: ['Foster', 'Radial', 'Diagrid', 'Curvilinear'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 36;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI;
        pts.push({
          x: cx + 0.92 * cos(a) * rx,
          y: cy + 0.92 * sin(a) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'mbs-curved-arc',
    name: 'MARINA BAY SANDS (CURVED ARC SLAB)',
    category: 'architectural',
    inspiration: 'Moshe Safdie (Singapore)',
    description: 'Sweeping continuous arc wing with tapering rounded prow ends oriented to capture panoramic waterfront views.',
    efficiency: 76,
    defaultAspect: '16:9 (Landscape)',
    tags: ['Safdie', 'Panoramic', 'Curved Arc', 'Luxury'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.92 * rx, y: cy + 0.40 * ry },
        { x: cx - 0.60 * rx, y: cy + 0.05 * ry },
        { x: cx,             y: cy - 0.15 * ry },
        { x: cx + 0.60 * rx, y: cy + 0.05 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.40 * ry },
        { x: cx + 0.95 * rx, y: cy + 0.65 * ry },
        { x: cx + 0.65 * rx, y: cy + 0.35 * ry },
        { x: cx,             y: cy + 0.18 * ry },
        { x: cx - 0.65 * rx, y: cy + 0.35 * ry },
        { x: cx - 0.95 * rx, y: cy + 0.65 * ry },
      ];
    },
  },

  {
    id: 'turning-torso',
    name: 'TURNING TORSO (TWISTED RHOMBUS)',
    category: 'architectural',
    inspiration: 'Santiago Calatrava (Malmö)',
    description: 'Sculptural offset diamond-rhombus with spine-supported structural cantilevered wedge balconies.',
    efficiency: 70,
    defaultAspect: '1:1 (Square)',
    tags: ['Calatrava', 'Sculptural', 'Rhombus', 'Dynamic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx,             y: cy - 0.90 * ry },
        { x: cx + 0.65 * rx, y: cy - 0.65 * ry },
        { x: cx + 0.90 * rx, y: cy },
        { x: cx + 0.65 * rx, y: cy + 0.65 * ry },
        { x: cx,             y: cy + 0.90 * ry },
        { x: cx - 0.45 * rx, y: cy + 0.70 * ry },
        { x: cx - 0.85 * rx, y: cy },
        { x: cx - 0.45 * rx, y: cy - 0.70 * ry },
      ];
    },
  },

  {
    id: 'chrysler-starburst',
    name: 'CHRYSLER ART DECO (SUNBURST STAR)',
    category: 'architectural',
    inspiration: 'William Van Alen (New York)',
    description: 'Cruciform core flanked by radiating geometric setback steps celebrating 1930s Art Deco geometry.',
    efficiency: 75,
    defaultAspect: '1:1 (Square)',
    tags: ['Art-Deco', 'Cruciform', 'Setbacks', 'Classic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.30 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.30 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.30 * rx, y: cy - 0.65 * ry },
        { x: cx + 0.55 * rx, y: cy - 0.65 * ry },
        { x: cx + 0.55 * rx, y: cy - 0.40 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.40 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.40 * ry },
        { x: cx + 0.55 * rx, y: cy + 0.40 * ry },
        { x: cx + 0.55 * rx, y: cy + 0.65 * ry },
        { x: cx + 0.30 * rx, y: cy + 0.65 * ry },
        { x: cx + 0.30 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.30 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.30 * rx, y: cy + 0.65 * ry },
        { x: cx - 0.55 * rx, y: cy + 0.65 * ry },
        { x: cx - 0.55 * rx, y: cy + 0.40 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.40 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.40 * ry },
        { x: cx - 0.55 * rx, y: cy - 0.40 * ry },
        { x: cx - 0.55 * rx, y: cy - 0.65 * ry },
        { x: cx - 0.30 * rx, y: cy - 0.65 * ry },
      ];
    },
  },

  {
    id: 'cctv-loop',
    name: 'CCTV BEIJING (CONTINUOUS LOOP)',
    category: 'architectural',
    inspiration: 'Rem Koolhaas / OMA (Beijing)',
    description: 'Revolutionary continuous folded loop footprint connecting twin leaning towers around an open atrium void.',
    efficiency: 65,
    defaultAspect: '1:1 (Square)',
    tags: ['OMA', 'Koolhaas', 'Loop', 'Avante-Garde'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.88 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.88 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.88 * rx, y: cy + 0.88 * ry },
        { x: cx + 0.38 * rx, y: cy + 0.88 * ry },
        { x: cx + 0.38 * rx, y: cy + 0.38 * ry },
        { x: cx - 0.38 * rx, y: cy + 0.38 * ry },
        { x: cx - 0.38 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.88 * rx, y: cy + 0.88 * ry },
      ];
    },
    getHoles: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [[
        { x: cx - 0.35 * rx, y: cy - 0.35 * ry },
        { x: cx + 0.35 * rx, y: cy - 0.35 * ry },
        { x: cx + 0.35 * rx, y: cy + 0.05 * ry },
        { x: cx - 0.35 * rx, y: cy + 0.05 * ry },
      ]];
    }
  },

  {
    id: 'the-shard',
    name: 'THE SHARD (FACETED PYRAMID)',
    category: 'architectural',
    inspiration: 'Renzo Piano (London)',
    description: 'Irregular sharp crystalline polygon tapering with fractured glass facet perimeter lines.',
    efficiency: 78,
    defaultAspect: '1:1 (Square)',
    tags: ['Renzo Piano', 'Crystalline', 'Pyramid', 'Sharp'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.15 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.82 * rx, y: cy - 0.35 * ry },
        { x: cx + 0.90 * rx, y: cy + 0.65 * ry },
        { x: cx + 0.20 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.75 * rx, y: cy + 0.70 * ry },
        { x: cx - 0.90 * rx, y: cy - 0.25 * ry },
      ];
    },
  },

  {
    id: 'petronas-cross',
    name: 'PETRONAS TWIN (OCTAGRAM 8-STAR)',
    category: 'architectural',
    inspiration: 'César Pelli (Kuala Lumpur)',
    description: 'Islamic geometric Rub el Hizb with 8-pointed star interlocking squares and semicircular infill scallops.',
    efficiency: 76,
    defaultAspect: '1:1 (Square)',
    tags: ['Cesar Pelli', 'Octagram', 'Sacred Geometry', 'Twin Towers'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 16;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI - PI / 2;
        const r = i % 2 === 0 ? 0.92 : 0.65;
        pts.push({
          x: cx + r * cos(a) * rx,
          y: cy + r * sin(a) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'flatiron-wedge',
    name: 'FLATIRON (ACUTE PROW WEDGE)',
    category: 'architectural',
    inspiration: 'Daniel Burnham (New York)',
    description: 'Dramatic triangular wedge footprint designed to maximize narrow urban avenue bifurcations.',
    efficiency: 79,
    defaultAspect: '1:1 (Square)',
    tags: ['Flatiron', 'Wedge', 'Triangle', 'Urban Infill'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx,             y: cy - 0.95 * ry },
        { x: cx + 0.12 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.75 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.75 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.12 * rx, y: cy - 0.90 * ry },
      ];
    },
  },

  {
    id: 'one-wtc-octagon',
    name: 'ONE WTC (CHAMFERED OCTAGON)',
    category: 'architectural',
    inspiration: 'David Childs / SOM (New York)',
    description: 'Square footprint with deep isosceles triangle chamfers creating an 8-sided dynamic prism.',
    efficiency: 84,
    defaultAspect: '1:1 (Square)',
    tags: ['SOM', 'Octagonal', 'Chamfered', 'Prism'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.40 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.40 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.90 * rx, y: cy - 0.40 * ry },
        { x: cx + 0.90 * rx, y: cy + 0.40 * ry },
        { x: cx + 0.40 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.40 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.90 * rx, y: cy + 0.40 * ry },
        { x: cx - 0.90 * rx, y: cy - 0.40 * ry },
      ];
    },
  },

  {
    id: 'hearst-prism',
    name: 'HEARST TOWER (DIAGRID FACETED)',
    category: 'architectural',
    inspiration: 'Foster + Partners (New York)',
    description: 'Geometric fluted box with recessed bird-mouth corner chamfers expressing structural triangular diagrid.',
    efficiency: 81,
    defaultAspect: '1:1 (Square)',
    tags: ['Foster', 'Diagrid', 'Faceted', 'Corner Setback'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.65 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.65 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.88 * rx, y: cy - 0.65 * ry },
        { x: cx + 0.88 * rx, y: cy + 0.65 * ry },
        { x: cx + 0.65 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.65 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.88 * rx, y: cy + 0.65 * ry },
        { x: cx - 0.88 * rx, y: cy - 0.65 * ry },
      ];
    },
  },

  {
    id: 'marilyn-monroe',
    name: 'ABSOLUTE WORLD (ORGANIC HOURGLASS)',
    category: 'architectural',
    inspiration: 'MAD Architects / Ma Yansong (Canada)',
    description: 'Smooth curvilinear continuous ellipse pinched at the center creating an iconic hourglass profile.',
    efficiency: 77,
    defaultAspect: '1:1 (Square)',
    tags: ['MAD Architects', 'Organic', 'Hourglass', 'Curvilinear'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 40;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI;
        const r = 0.72 + 0.20 * cos(2 * a);
        pts.push({
          x: cx + r * cos(a) * rx,
          y: cy + r * sin(a) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'bosco-verticale',
    name: 'BOSCO VERTICALE (STAGGERED SLABS)',
    category: 'architectural',
    inspiration: 'Stefano Boeri (Milan)',
    description: 'Twin staggered overlapping orthogonal towers with perimeter protruding deep cantilever terraces.',
    efficiency: 80,
    defaultAspect: '3:2 (Landscape)',
    tags: ['Stefano Boeri', 'Biophilic', 'Cantilever', 'Twin Slabs'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.85 * rx, y: cy - 0.80 * ry },
        { x: cx + 0.15 * rx, y: cy - 0.80 * ry },
        { x: cx + 0.15 * rx, y: cy - 0.30 * ry },
        { x: cx + 0.85 * rx, y: cy - 0.30 * ry },
        { x: cx + 0.85 * rx, y: cy + 0.80 * ry },
        { x: cx - 0.15 * rx, y: cy + 0.80 * ry },
        { x: cx - 0.15 * rx, y: cy + 0.30 * ry },
        { x: cx - 0.85 * rx, y: cy + 0.30 * ry },
      ];
    },
  },

  {
    id: 'aqua-waveform',
    name: 'AQUA TOWER (UNDULATING WAVEFORM)',
    category: 'architectural',
    inspiration: 'Studio Gang / Jeanne Gang (Chicago)',
    description: 'Rectangular core plate enveloped by organic wave contours mimicking limestone topography.',
    efficiency: 82,
    defaultAspect: '3:2 (Landscape)',
    tags: ['Studio Gang', 'Waveform', 'Limestone', 'Organic Slabs'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 40;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI;
        const r = 0.78 + 0.14 * sin(5 * a) + 0.08 * cos(2 * a);
        pts.push({
          x: cx + r * cos(a) * rx,
          y: cy + r * sin(a) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'morpheus-void',
    name: 'MORPHEUS (ORGANIC ATRIUM VOID)',
    category: 'architectural',
    inspiration: 'Zaha Hadid Architects (Macau)',
    description: 'Monolithic rectangular block with freeform carved organic central void connected by twin sky-bridges.',
    efficiency: 71,
    defaultAspect: '1:1 (Square)',
    tags: ['Zaha Hadid', 'Exoskeleton', 'Void', 'Parametric'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.88 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.88 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.88 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.88 * rx, y: cy + 0.88 * ry },
      ];
    },
    getHoles: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const hole: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * 2 * PI;
        const r = 0.35 + 0.10 * sin(3 * a);
        hole.push({
          x: cx + r * cos(a) * rx,
          y: cy + r * sin(a) * ry,
        });
      }
      return [hole];
    }
  },

  {
    id: 'big-8house',
    name: 'BIG 8-HOUSE (INFINITY LOOP)',
    category: 'architectural',
    inspiration: 'Bjarke Ingels Group (Copenhagen)',
    description: 'Figure-8 continuous infinity loop with dual internal landscaped courtyards and looping continuous circulation.',
    efficiency: 73,
    defaultAspect: '16:9 (Landscape)',
    tags: ['BIG', 'Bjarke Ingels', 'Figure-8', 'Dual Courtyard'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.90 * rx, y: cy - 0.80 * ry },
        { x: cx - 0.15 * rx, y: cy - 0.80 * ry },
        { x: cx + 0.15 * rx, y: cy - 0.20 * ry },
        { x: cx + 0.90 * rx, y: cy - 0.80 * ry },
        { x: cx + 0.90 * rx, y: cy + 0.80 * ry },
        { x: cx + 0.15 * rx, y: cy + 0.80 * ry },
        { x: cx - 0.15 * rx, y: cy + 0.20 * ry },
        { x: cx - 0.90 * rx, y: cy + 0.80 * ry },
      ];
    },
    getHoles: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        [
          { x: cx - 0.70 * rx, y: cy - 0.45 * ry },
          { x: cx - 0.35 * rx, y: cy - 0.45 * ry },
          { x: cx - 0.35 * rx, y: cy + 0.45 * ry },
          { x: cx - 0.70 * rx, y: cy + 0.45 * ry },
        ],
        [
          { x: cx + 0.35 * rx, y: cy - 0.45 * ry },
          { x: cx + 0.70 * rx, y: cy - 0.45 * ry },
          { x: cx + 0.70 * rx, y: cy + 0.45 * ry },
          { x: cx + 0.35 * rx, y: cy + 0.45 * ry },
        ],
      ];
    }
  },

  {
    id: 'de-rotterdam',
    name: 'DE ROTTERDAM (TRIPLE INTERLOCKING)',
    category: 'architectural',
    inspiration: 'Rem Koolhaas / OMA (Rotterdam)',
    description: 'Vertical city composed of 3 interconnected offset towers creating dynamic overhangs and sky terraces.',
    efficiency: 85,
    defaultAspect: '16:9 (Landscape)',
    tags: ['OMA', 'Vertical City', 'Interlocking', 'Staggered'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.90 * rx, y: cy - 0.75 * ry },
        { x: cx - 0.30 * rx, y: cy - 0.75 * ry },
        { x: cx - 0.30 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.30 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.30 * rx, y: cy - 0.75 * ry },
        { x: cx + 0.90 * rx, y: cy - 0.75 * ry },
        { x: cx + 0.90 * rx, y: cy + 0.75 * ry },
        { x: cx + 0.30 * rx, y: cy + 0.75 * ry },
        { x: cx + 0.30 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.30 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.30 * rx, y: cy + 0.75 * ry },
        { x: cx - 0.90 * rx, y: cy + 0.75 * ry },
      ];
    },
  },

  {
    id: 'al-hamra-helix',
    name: 'AL HAMRA (SCULPTED RIBBON)',
    category: 'architectural',
    inspiration: 'SOM (Kuwait City)',
    description: 'Asymmetrical carved stone monolith with deep southern shading ribbon and curved perimeter glass wall.',
    efficiency: 76,
    defaultAspect: '1:1 (Square)',
    tags: ['SOM', 'Sculpted', 'Solar-Responsive', 'Ribbon'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.75 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.85 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.90 * rx, y: cy + 0.65 * ry },
        { x: cx + 0.45 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.20 * rx, y: cy + 0.40 * ry },
        { x: cx - 0.85 * rx, y: cy + 0.85 * ry },
      ];
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 2: HIGH-DENSITY GEOMETRIC TYPOLOGIES (21 - 35)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'stepped-l',
    name: 'STEP-TERRACED L-SHAPE',
    category: 'geometric',
    inspiration: 'Corner Infill Typology',
    description: 'Dual-wing 90-degree corner urban tower with cascading sky terraces and corner cross-ventilation.',
    efficiency: 80,
    defaultAspect: '3:2 (Landscape)',
    tags: ['L-Shape', 'Terraced', 'Corner Plot', 'Urban Infill'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.88 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.88 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.88 * rx, y: cy - 0.20 * ry },
        { x: cx - 0.15 * rx, y: cy - 0.20 * ry },
        { x: cx - 0.15 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.88 * rx, y: cy + 0.88 * ry },
      ];
    },
  },

  {
    id: 'h-shape',
    name: 'H-SHAPE DUAL WING',
    category: 'geometric',
    inspiration: 'Parallel Double-Loaded Slab',
    description: 'High-density twin parallel wings connected by a central elevator/staircase circulation link.',
    efficiency: 78,
    defaultAspect: '3:2 (Landscape)',
    tags: ['H-Shape', 'Twin Wings', 'High Density', 'Optimal Light'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.88 * rx, y: cy - 0.88 * ry },
        { x: cx - 0.38 * rx, y: cy - 0.88 * ry },
        { x: cx - 0.38 * rx, y: cy - 0.25 * ry },
        { x: cx + 0.38 * rx, y: cy - 0.25 * ry },
        { x: cx + 0.38 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.88 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.88 * rx, y: cy + 0.88 * ry },
        { x: cx + 0.38 * rx, y: cy + 0.88 * ry },
        { x: cx + 0.38 * rx, y: cy + 0.25 * ry },
        { x: cx - 0.38 * rx, y: cy + 0.25 * ry },
        { x: cx - 0.38 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.88 * rx, y: cy + 0.88 * ry },
      ];
    },
  },

  {
    id: 'pinwheel',
    name: 'DYNAMIC PINWHEEL (4-WING)',
    category: 'geometric',
    inspiration: 'Wind-Engineered Pinwheel Core',
    description: 'Dynamic staggered 4-arm pinwheel ensuring zero wing-to-wing privacy overlap and four unobstructed vistas.',
    efficiency: 66,
    defaultAspect: '1:1 (Square)',
    tags: ['Pinwheel', '4-Wing', 'Zero Overlap', 'Panoramic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.20 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.20 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.20 * rx, y: cy - 0.20 * ry },
        { x: cx + 0.90 * rx, y: cy - 0.20 * ry },
        { x: cx + 0.90 * rx, y: cy + 0.20 * ry },
        { x: cx + 0.20 * rx, y: cy + 0.20 * ry },
        { x: cx + 0.20 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.20 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.20 * rx, y: cy + 0.20 * ry },
        { x: cx - 0.90 * rx, y: cy + 0.20 * ry },
        { x: cx - 0.90 * rx, y: cy - 0.20 * ry },
        { x: cx - 0.20 * rx, y: cy - 0.20 * ry },
      ];
    },
  },

  {
    id: 'curved-x',
    name: 'CURVED X-SHAPE QUAD-WING',
    category: 'geometric',
    inspiration: 'Radial Cross-Ventilation Core',
    description: 'Symmetrical 4-wing curvilinear tower with central core and 4 independent private corner wings.',
    efficiency: 64,
    defaultAspect: '1:1 (Square)',
    tags: ['Curved X', 'Quad Wing', 'Central Core', 'Cross Vent'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.70 * rx, y: cy - 0.90 * ry },
        { x: cx - 0.35 * rx, y: cy - 0.90 * ry },
        { x: cx,             y: cy - 0.30 * ry },
        { x: cx + 0.35 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.70 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.40 * rx, y: cy - 0.15 * ry },
        { x: cx + 0.90 * rx, y: cy + 0.35 * ry },
        { x: cx + 0.70 * rx, y: cy + 0.90 * ry },
        { x: cx + 0.20 * rx, y: cy + 0.40 * ry },
        { x: cx,             y: cy + 0.70 * ry },
        { x: cx - 0.20 * rx, y: cy + 0.40 * ry },
        { x: cx - 0.70 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.90 * rx, y: cy + 0.35 * ry },
        { x: cx - 0.40 * rx, y: cy - 0.15 * ry },
      ];
    },
  },

  {
    id: 'curved-s',
    name: 'SERPENTINE S-SHAPE',
    category: 'geometric',
    inspiration: 'Fluid Waveform Slab',
    description: 'Flowing double-curve residential footprint for maximum perimeter daylight and acoustic noise deflection.',
    efficiency: 72,
    defaultAspect: '16:9 (Landscape)',
    tags: ['S-Curve', 'Serpentine', 'Flowing', 'Wave'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.90 * rx, y: cy - 0.70 * ry },
        { x: cx - 0.30 * rx, y: cy - 0.70 * ry },
        { x: cx + 0.10 * rx, y: cy - 0.10 * ry },
        { x: cx + 0.60 * rx, y: cy - 0.10 * ry },
        { x: cx + 0.90 * rx, y: cy + 0.70 * ry },
        { x: cx + 0.30 * rx, y: cy + 0.70 * ry },
        { x: cx - 0.10 * rx, y: cy + 0.10 * ry },
        { x: cx - 0.60 * rx, y: cy + 0.10 * ry },
      ];
    },
  },

  {
    id: 'courtyard-ring',
    name: 'COURTYARD RING (O-SHAPE)',
    category: 'geometric',
    inspiration: 'European Perimeter Block',
    description: 'Continuous enclosed perimeter ring layout with a central open-to-sky communal atrium courtyard.',
    efficiency: 65,
    defaultAspect: '1:1 (Square)',
    tags: ['Courtyard', 'O-Shape', 'Atrium', 'Perimeter Block'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.88 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.88 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.88 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.88 * rx, y: cy + 0.88 * ry },
      ];
    },
    getHoles: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [[
        { x: cx - 0.40 * rx, y: cy - 0.40 * ry },
        { x: cx + 0.40 * rx, y: cy - 0.40 * ry },
        { x: cx + 0.40 * rx, y: cy + 0.40 * ry },
        { x: cx - 0.40 * rx, y: cy + 0.40 * ry },
      ]];
    }
  },

  {
    id: 'hexagonal',
    name: 'HEXAGONAL HONEYCOMB',
    category: 'geometric',
    inspiration: 'Natural Honeycomb Lattice',
    description: '6-sided geometric honeycomb plate offering 60-degree corner balconies and maximum perimeter surface.',
    efficiency: 74,
    defaultAspect: '1:1 (Square)',
    tags: ['Hexagonal', 'Honeycomb', '6-Sided', 'Corner Balconies'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 2 * PI - PI / 6;
        pts.push({
          x: cx + 0.90 * cos(a) * rx,
          y: cy + 0.90 * sin(a) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'greek-cross',
    name: 'SYMMETRICAL GREEK CROSS',
    category: 'geometric',
    inspiration: 'Classical Cruciform',
    description: '4 identical orthogonal wings radiating from a centralized high-capacity vertical transit core.',
    efficiency: 70,
    defaultAspect: '1:1 (Square)',
    tags: ['Cross', 'Cruciform', 'Symmetrical', 'High Rise'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.35 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.35 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.35 * rx, y: cy - 0.35 * ry },
        { x: cx + 0.90 * rx, y: cy - 0.35 * ry },
        { x: cx + 0.90 * rx, y: cy + 0.35 * ry },
        { x: cx + 0.35 * rx, y: cy + 0.35 * ry },
        { x: cx + 0.35 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.35 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.35 * rx, y: cy + 0.35 * ry },
        { x: cx - 0.90 * rx, y: cy + 0.35 * ry },
        { x: cx - 0.90 * rx, y: cy - 0.35 * ry },
        { x: cx - 0.35 * rx, y: cy - 0.35 * ry },
      ];
    },
  },

  {
    id: 't-shape',
    name: 'T-SHAPE RESIDENTIAL SLAB',
    category: 'geometric',
    inspiration: 'Linear High-Efficiency Core',
    description: 'High-efficiency linear slab with perpendicular stabilizing wing maximizing south-facing facade orientation.',
    efficiency: 82,
    defaultAspect: '3:2 (Landscape)',
    tags: ['T-Shape', 'Linear Slab', 'Orientation', 'Efficient'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.90 * rx, y: cy - 0.85 * ry },
        { x: cx + 0.90 * rx, y: cy - 0.85 * ry },
        { x: cx + 0.90 * rx, y: cy - 0.25 * ry },
        { x: cx + 0.25 * rx, y: cy - 0.25 * ry },
        { x: cx + 0.25 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.25 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.25 * rx, y: cy - 0.25 * ry },
        { x: cx - 0.90 * rx, y: cy - 0.25 * ry },
      ];
    },
  },

  {
    id: 'horseshoe-u',
    name: 'HORSESHOE (U-SHAPE SLAB)',
    category: 'geometric',
    inspiration: 'Semi-Enclosed Courtyard',
    description: '3-sided courtyard enclosure providing acoustic barrier against urban traffic with open garden views.',
    efficiency: 74,
    defaultAspect: '1:1 (Square)',
    tags: ['U-Shape', 'Horseshoe', 'Courtyard', 'Garden View'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.88 * rx, y: cy - 0.88 * ry },
        { x: cx - 0.35 * rx, y: cy - 0.88 * ry },
        { x: cx - 0.35 * rx, y: cy + 0.35 * ry },
        { x: cx + 0.35 * rx, y: cy + 0.35 * ry },
        { x: cx + 0.35 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.88 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.88 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.88 * rx, y: cy + 0.88 * ry },
      ];
    },
  },

  {
    id: 'z-shape',
    name: 'Z-SHAPE STAGGERED SLAB',
    category: 'geometric',
    inspiration: 'Urban Staggered Shift',
    description: 'Dual opposing offset wings connected by a central elevator lobby ensuring zero self-shadowing.',
    efficiency: 78,
    defaultAspect: '3:2 (Landscape)',
    tags: ['Z-Shape', 'Staggered', 'Sunlight', 'Modernist'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.90 * rx, y: cy - 0.85 * ry },
        { x: cx + 0.15 * rx, y: cy - 0.85 * ry },
        { x: cx + 0.15 * rx, y: cy - 0.15 * ry },
        { x: cx + 0.90 * rx, y: cy - 0.15 * ry },
        { x: cx + 0.90 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.15 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.15 * rx, y: cy + 0.15 * ry },
        { x: cx - 0.90 * rx, y: cy + 0.15 * ry },
      ];
    },
  },

  {
    id: 'double-diamond',
    name: 'DOUBLE-DIAMOND (INTERLOCKING)',
    category: 'geometric',
    inspiration: 'Hexagonal Interlocking Array',
    description: 'Twin interlocking angled diamond pods offering 6 panoramic corner living rooms per floor.',
    efficiency: 75,
    defaultAspect: '16:9 (Landscape)',
    tags: ['Diamond', 'Corner Units', 'Interlocking', 'Panoramic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.50 * rx, y: cy - 0.85 * ry },
        { x: cx - 0.05 * rx, y: cy - 0.35 * ry },
        { x: cx + 0.40 * rx, y: cy - 0.85 * ry },
        { x: cx + 0.90 * rx, y: cy },
        { x: cx + 0.40 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.05 * rx, y: cy + 0.35 * ry },
        { x: cx - 0.50 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.95 * rx, y: cy },
      ];
    },
  },

  {
    id: 'octagram-star',
    name: 'OCTAGRAM (8-POINT STAR TOWER)',
    category: 'geometric',
    inspiration: 'Symmetric Faceted Geometry',
    description: 'Symmetrical 8-star faceted plate providing 8 corner balcony units with 270-degree view corridors.',
    efficiency: 73,
    defaultAspect: '1:1 (Square)',
    tags: ['8-Star', 'Octagram', 'Corner Views', 'Faceted'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 16;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI;
        const r = i % 2 === 0 ? 0.90 : 0.60;
        pts.push({
          x: cx + r * cos(a) * rx,
          y: cy + r * sin(a) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'vesica-piscis',
    name: 'VESICA PISCIS (CONVEX LENS)',
    category: 'geometric',
    inspiration: 'Sacred Lens Geometry',
    description: 'Symmetric dual-arc pointed oval maximizing aerodynamics and uninterrupted light on both facades.',
    efficiency: 81,
    defaultAspect: '16:9 (Landscape)',
    tags: ['Lens', 'Vesica', 'Aerodynamic', 'Smooth'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.92 * rx, y: cy },
        { x: cx - 0.50 * rx, y: cy - 0.70 * ry },
        { x: cx,             y: cy - 0.85 * ry },
        { x: cx + 0.50 * rx, y: cy - 0.70 * ry },
        { x: cx + 0.92 * rx, y: cy },
        { x: cx + 0.50 * rx, y: cy + 0.70 * ry },
        { x: cx,             y: cy + 0.85 * ry },
        { x: cx - 0.50 * rx, y: cy + 0.70 * ry },
      ];
    },
  },

  {
    id: 'chevron-v',
    name: 'CHEVRON (AERODYNAMIC V-WING)',
    category: 'geometric',
    inspiration: 'Swept V-Wing Architecture',
    description: 'Forward-swept V-wing angle deflecting prevailing storm winds while creating a sheltered private entry forecourt.',
    efficiency: 77,
    defaultAspect: '1:1 (Square)',
    tags: ['Chevron', 'V-Shape', 'Wind Deflection', 'Modernist'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx,             y: cy - 0.90 * ry },
        { x: cx + 0.88 * rx, y: cy + 0.40 * ry },
        { x: cx + 0.65 * rx, y: cy + 0.85 * ry },
        { x: cx,             y: cy - 0.10 * ry },
        { x: cx - 0.65 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.88 * rx, y: cy + 0.40 * ry },
      ];
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 3: NATURE-INSPIRED & BIOPHILIC GEOMETRIES (36 - 50)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'water-droplet',
    name: 'WATER DROPLET (TEARDROP POD)',
    category: 'biophilic',
    inspiration: 'Fluid Hydrodynamics',
    description: 'Aerodynamic smooth teardrop profile with rounded southern living zones and tapered northern service spine.',
    efficiency: 79,
    defaultAspect: '1:1 (Square)',
    tags: ['Water Droplet', 'Fluid', 'Aerodynamic', 'Biophilic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 40;
      for (let i = 0; i < N; i++) {
        const theta = (i / N) * 2 * PI;
        const r = (1 - sin(theta)) * 0.45 + 0.45;
        pts.push({
          x: cx + r * cos(theta - PI / 2) * rx * 0.95,
          y: cy + r * sin(theta - PI / 2) * ry * 1.1 - 0.1 * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'botanical-leaf',
    name: 'BOTANICAL LEAF (FOLIAGE CURVE)',
    category: 'biophilic',
    inspiration: 'Plant Foliage / Photosynthetic Optimization',
    description: 'Organic leaf contour with apical tip and bilateral symmetry capturing maximum solar exposure across daylight hours.',
    efficiency: 76,
    defaultAspect: '1:1 (Square)',
    tags: ['Botanical Leaf', 'Foliage', 'Solar', 'Organic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx,             y: cy - 0.95 * ry },
        { x: cx + 0.45 * rx, y: cy - 0.55 * ry },
        { x: cx + 0.85 * rx, y: cy },
        { x: cx + 0.65 * rx, y: cy + 0.55 * ry },
        { x: cx,             y: cy + 0.90 * ry },
        { x: cx - 0.65 * rx, y: cy + 0.55 * ry },
        { x: cx - 0.85 * rx, y: cy },
        { x: cx - 0.45 * rx, y: cy - 0.55 * ry },
      ];
    },
  },

  {
    id: 'nautilus-spiral',
    name: 'NAUTILUS (GOLDEN RATIO SPIRAL)',
    category: 'biophilic',
    inspiration: 'Nautilus Pompilius Logarithmic Spiral',
    description: 'Expanding golden ratio spiral chamber layout creating dynamic escalating unit terraces and core orientation.',
    efficiency: 71,
    defaultAspect: '1:1 (Square)',
    tags: ['Nautilus', 'Golden Ratio', 'Logarithmic Spiral', 'Fibonacci'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 36;
      for (let i = 0; i < N; i++) {
        const t = (i / N) * 2 * PI;
        const r = 0.35 + 0.55 * (t / (2 * PI));
        pts.push({
          x: cx + r * cos(t) * rx,
          y: cy + r * sin(t) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'ginkgo-leaf',
    name: 'GINKGO BILOBA (FAN LEAF)',
    category: 'biophilic',
    inspiration: 'Ginkgo Biloba Ancient Leaf',
    description: 'Splayed radial fan with gentle central indentation maximizing panoramic perimeter exposure.',
    efficiency: 74,
    defaultAspect: '1:1 (Square)',
    tags: ['Ginkgo', 'Fan Leaf', 'Botanical', 'Radial Views'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx,             y: cy - 0.50 * ry },
        { x: cx + 0.50 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.90 * rx, y: cy - 0.45 * ry },
        { x: cx + 0.80 * rx, y: cy + 0.35 * ry },
        { x: cx + 0.15 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.15 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.80 * rx, y: cy + 0.35 * ry },
        { x: cx - 0.90 * rx, y: cy - 0.45 * ry },
        { x: cx - 0.50 * rx, y: cy - 0.88 * ry },
      ];
    },
  },

  {
    id: 'starflower-5petal',
    name: '5-PETAL STARFLOWER (PENTAGRAM)',
    category: 'biophilic',
    inspiration: 'Floral Pentamerous Radial Symmetry',
    description: '5 rounded radiating floral petal lobes wrapped around a compact central elevator/stair core.',
    efficiency: 67,
    defaultAspect: '1:1 (Square)',
    tags: ['Floral', '5-Petal', 'Radial', 'Pentagram'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 50;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI - PI / 2;
        const r = 0.65 + 0.25 * cos(5 * a);
        pts.push({
          x: cx + r * cos(a) * rx,
          y: cy + r * sin(a) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'clover-4leaf',
    name: '4-LEAF CLOVER (QUADRIFOIL)',
    category: 'biophilic',
    inspiration: 'Trifolium Repens Quadrifoil',
    description: '4 rounded biophilic petal wings offering 4 completely private residential quadrants.',
    efficiency: 69,
    defaultAspect: '1:1 (Square)',
    tags: ['Clover', '4-Leaf', 'Quadrifoil', 'Biophilic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 48;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI;
        const r = 0.68 + 0.24 * cos(4 * a);
        pts.push({
          x: cx + r * cos(a) * rx,
          y: cy + r * sin(a) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'butterfly-wing',
    name: 'BUTTERFLY (BIAXIAL WING PODS)',
    category: 'biophilic',
    inspiration: 'Lepidoptera Wing Aerodynamics',
    description: 'Bilateral symmetric upper and lower curved wing lobes separated by a central sunlit structural atrium.',
    efficiency: 72,
    defaultAspect: '16:9 (Landscape)',
    tags: ['Butterfly', 'Lepidoptera', 'Biaxial Wings', 'Organic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx,             y: cy - 0.40 * ry },
        { x: cx + 0.45 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.50 * ry },
        { x: cx + 0.60 * rx, y: cy },
        { x: cx + 0.85 * rx, y: cy + 0.70 * ry },
        { x: cx + 0.35 * rx, y: cy + 0.85 * ry },
        { x: cx,             y: cy + 0.45 * ry },
        { x: cx - 0.35 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.85 * rx, y: cy + 0.70 * ry },
        { x: cx - 0.60 * rx, y: cy },
        { x: cx - 0.92 * rx, y: cy - 0.50 * ry },
        { x: cx - 0.45 * rx, y: cy - 0.90 * ry },
      ];
    },
  },

  {
    id: 'swept-aerofoil',
    name: 'BIRD WING (SWEPT AEROFOIL)',
    category: 'biophilic',
    inspiration: 'Avian Wing Kinematics',
    description: 'Aerodynamic swept-back wing camber generating minimal turbulence and smooth facade air currents.',
    efficiency: 78,
    defaultAspect: '16:9 (Landscape)',
    tags: ['Bird Wing', 'Aerofoil', 'High Lift', 'Fluid'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.92 * rx, y: cy - 0.10 * ry },
        { x: cx - 0.20 * rx, y: cy - 0.80 * ry },
        { x: cx + 0.60 * rx, y: cy - 0.60 * ry },
        { x: cx + 0.95 * rx, y: cy - 0.20 * ry },
        { x: cx + 0.70 * rx, y: cy + 0.40 * ry },
        { x: cx + 0.10 * rx, y: cy + 0.75 * ry },
        { x: cx - 0.50 * rx, y: cy + 0.60 * ry },
      ];
    },
  },

  {
    id: 'scallop-shell',
    name: 'SCALLOP SHELL (BIVALVE ARC)',
    category: 'biophilic',
    inspiration: 'Marine Bivalve Scallop Geometry',
    description: 'Radial corrugated fan geometry channeling natural airflow from the hinge core out to the scalloped rim.',
    efficiency: 75,
    defaultAspect: '1:1 (Square)',
    tags: ['Shell', 'Bivalve', 'Corrugated', 'Marine'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.30 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.75 * rx, y: cy + 0.45 * ry },
        { x: cx - 0.90 * rx, y: cy - 0.15 * ry },
        { x: cx - 0.60 * rx, y: cy - 0.65 * ry },
        { x: cx,             y: cy - 0.90 * ry },
        { x: cx + 0.60 * rx, y: cy - 0.65 * ry },
        { x: cx + 0.90 * rx, y: cy - 0.15 * ry },
        { x: cx + 0.75 * rx, y: cy + 0.45 * ry },
        { x: cx + 0.30 * rx, y: cy + 0.85 * ry },
      ];
    },
  },

  {
    id: 'coral-branch',
    name: 'CORAL REEF (BRANCHING POLYHEDRON)',
    category: 'biophilic',
    inspiration: 'Marine Coral Polyp Fractal Branching',
    description: 'Multi-faceted organic branching plate maximizing surface exposure to sea breezes and sunlight.',
    efficiency: 68,
    defaultAspect: '1:1 (Square)',
    tags: ['Coral Reef', 'Fractal', 'Branching', 'Marine'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.25 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.20 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.15 * rx, y: cy - 0.40 * ry },
        { x: cx + 0.75 * rx, y: cy - 0.75 * ry },
        { x: cx + 0.90 * rx, y: cy - 0.40 * ry },
        { x: cx + 0.40 * rx, y: cy },
        { x: cx + 0.85 * rx, y: cy + 0.50 * ry },
        { x: cx + 0.65 * rx, y: cy + 0.85 * ry },
        { x: cx + 0.20 * rx, y: cy + 0.35 * ry },
        { x: cx - 0.20 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.55 * rx, y: cy + 0.80 * ry },
        { x: cx - 0.35 * rx, y: cy + 0.25 * ry },
        { x: cx - 0.90 * rx, y: cy + 0.30 * ry },
        { x: cx - 0.85 * rx, y: cy - 0.25 * ry },
        { x: cx - 0.35 * rx, y: cy - 0.15 * ry },
      ];
    },
  },

  {
    id: 'ripple-oval',
    name: 'CONCENTRIC RIPPLE (WATER WAVE)',
    category: 'biophilic',
    inspiration: 'Fluid Surface Wave Propagation',
    description: 'Stepped concentric smooth oval contours expanding outward like water ripples.',
    efficiency: 81,
    defaultAspect: '16:9 (Landscape)',
    tags: ['Ripple', 'Water Wave', 'Concentric', 'Smooth'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 36;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI;
        const r = 0.82 + 0.08 * sin(6 * a);
        pts.push({
          x: cx + r * cos(a) * rx,
          y: cy + r * sin(a) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'snowflake-hex',
    name: 'CRYSTALLINE SNOWFLAKE (DENDRITE)',
    category: 'biophilic',
    inspiration: 'Hexagonal Ice Crystal Dendrite',
    description: '6-fold symmetric crystal lattice with faceted secondary branch pods providing 12 corner living rooms.',
    efficiency: 65,
    defaultAspect: '1:1 (Square)',
    tags: ['Snowflake', 'Crystal', '6-Fold', 'Dendrite'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 24;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI;
        const r = i % 4 === 0 ? 0.92 : i % 2 === 0 ? 0.65 : 0.45;
        pts.push({
          x: cx + r * cos(a) * rx,
          y: cy + r * sin(a) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'flame-teardrop',
    name: 'FLAME (S-CURVED FIRE POD)',
    category: 'biophilic',
    inspiration: 'Ascending Thermal Plume / Fire Vortex',
    description: 'Dynamic curving teardrop with soaring crest tapering into a high-performance aerodynamic edge.',
    efficiency: 76,
    defaultAspect: '1:1 (Square)',
    tags: ['Flame', 'Fire Vortex', 'Dynamic', 'Soaring'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx + 0.20 * rx, y: cy - 0.95 * ry },
        { x: cx + 0.65 * rx, y: cy - 0.50 * ry },
        { x: cx + 0.85 * rx, y: cy + 0.10 * ry },
        { x: cx + 0.65 * rx, y: cy + 0.70 * ry },
        { x: cx,             y: cy + 0.90 * ry },
        { x: cx - 0.65 * rx, y: cy + 0.70 * ry },
        { x: cx - 0.85 * rx, y: cy },
        { x: cx - 0.40 * rx, y: cy - 0.40 * ry },
        { x: cx - 0.15 * rx, y: cy - 0.70 * ry },
      ];
    },
  },

  {
    id: 'triple-honeycomb',
    name: 'TRIPLE HONEYCOMB (3-POD CLUSTER)',
    category: 'biophilic',
    inspiration: 'Modular Beehive Hexagonal Cluster',
    description: '3 interlocking hexagonal pods sharing a common central core with 3 separate private residential wings.',
    efficiency: 78,
    defaultAspect: '1:1 (Square)',
    tags: ['Triple Hex', 'Cluster', 'Modular', 'Beehive'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.25 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.25 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.50 * rx, y: cy - 0.50 * ry },
        { x: cx + 0.88 * rx, y: cy - 0.20 * ry },
        { x: cx + 0.88 * rx, y: cy + 0.35 * ry },
        { x: cx + 0.50 * rx, y: cy + 0.75 * ry },
        { x: cx,             y: cy + 0.55 * ry },
        { x: cx - 0.50 * rx, y: cy + 0.75 * ry },
        { x: cx - 0.88 * rx, y: cy + 0.35 * ry },
        { x: cx - 0.88 * rx, y: cy - 0.20 * ry },
        { x: cx - 0.50 * rx, y: cy - 0.50 * ry },
      ];
    },
  },

  {
    id: 'seed-capsule',
    name: 'SEED POD (SEGMENTED CAPSULE)',
    category: 'biophilic',
    inspiration: 'Botanical Seed Capsule / Embryo',
    description: 'Organic oblong pill shape with 4 distinct rounded corner pods and central sunlit core.',
    efficiency: 83,
    defaultAspect: '16:9 (Landscape)',
    tags: ['Seed Pod', 'Capsule', 'Oblong', 'High Efficiency'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.60 * rx, y: cy - 0.80 * ry },
        { x: cx + 0.60 * rx, y: cy - 0.80 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.40 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.40 * ry },
        { x: cx + 0.60 * rx, y: cy + 0.80 * ry },
        { x: cx - 0.60 * rx, y: cy + 0.80 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.40 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.40 * ry },
      ];
    },
  },
];
