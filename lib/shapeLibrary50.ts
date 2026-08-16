/**
 * Project X — Master Architectural, Geometric & Biophilic Footprint Library
 * Clean, unioned 2D polygon generators with thick, generous residential floor plates (>= 18m-24m wing depth)
 * and high internal usable area efficiency.
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

// ── MASTER SHAPES DEFINITIONS ────────────────────────────────────────────────

export const MASTER_SHAPES_50: ShapeDefinition[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 1: FAMOUS ARCHITECTURAL MASTERPIECES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'batman-insignia',
    name: 'THE DARK KNIGHT (BATMAN INSIGNIA)',
    category: 'architectural',
    inspiration: 'DC Comics / Gotham Iconography',
    description: 'Iconic aerodynamic Batwing silhouette with twin bat ears, wide sweeping wingtips, dual scalloped underbellies, and wide habitable central body.',
    efficiency: 82,
    defaultAspect: '16:9 (Landscape)',
    tags: ['Batman', 'Batwing', 'Gotham', 'Sculptural', 'Iconic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        // 1. Center Head Notch (between ears)
        { x: cx,             y: cy - 0.45 * ry },
        // 2. Right Bat Ear
        { x: cx + 0.10 * rx, y: cy - 0.78 * ry },
        // 3. Right Neck Dip
        { x: cx + 0.18 * rx, y: cy - 0.50 * ry },
        // 4. Right Upper Wing Sweep
        { x: cx + 0.45 * rx, y: cy - 0.62 * ry },
        { x: cx + 0.72 * rx, y: cy - 0.75 * ry },
        // 5. Right Wingtip Apex
        { x: cx + 0.94 * rx, y: cy - 0.85 * ry },
        // 6. Right Outer Flank (Thickened)
        { x: cx + 0.94 * rx, y: cy - 0.20 * ry },
        { x: cx + 0.80 * rx, y: cy + 0.15 * ry },
        // 7. Right Scallop Notch (Thickened)
        { x: cx + 0.68 * rx, y: cy + 0.55 * ry },
        { x: cx + 0.40 * rx, y: cy + 0.48 * ry },
        { x: cx + 0.32 * rx, y: cy + 0.78 * ry },
        // 8. Central Bat Tail Point (bottom)
        { x: cx,             y: cy + 0.92 * ry },
        // 9. Left Inner Scallop Notch (Thickened)
        { x: cx - 0.32 * rx, y: cy + 0.78 * ry },
        { x: cx - 0.40 * rx, y: cy + 0.48 * ry },
        // 10. Left Scallop Notch
        { x: cx - 0.68 * rx, y: cy + 0.55 * ry },
        { x: cx - 0.80 * rx, y: cy + 0.15 * ry },
        // 11. Left Outer Flank
        { x: cx - 0.94 * rx, y: cy - 0.20 * ry },
        // 12. Left Wingtip Apex
        { x: cx - 0.94 * rx, y: cy - 0.85 * ry },
        // 13. Left Upper Wing Sweep
        { x: cx - 0.72 * rx, y: cy - 0.75 * ry },
        { x: cx - 0.45 * rx, y: cy - 0.62 * ry },
        // 14. Left Neck Dip
        { x: cx - 0.18 * rx, y: cy - 0.50 * ry },
        // 15. Left Bat Ear
        { x: cx - 0.10 * rx, y: cy - 0.78 * ry },
      ];
    },
  },

  {
    id: 'taipei-101',
    name: 'TAIPEI 101 (PAGODA STAGGER)',
    category: 'architectural',
    inspiration: 'C.Y. Lee & Partners (Taipei)',
    description: 'Postmodern stepped pagoda modules with wide fluted corner setbacks and massive habitable floor plates.',
    efficiency: 86,
    defaultAspect: '1:1 (Square)',
    tags: ['Pagoda', 'Asian Modernism', 'Corner Setbacks', 'Tiered'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.80 * rx, y: cy - 0.92 * ry },
        { x: cx - 0.65 * rx, y: cy - 0.92 * ry },
        { x: cx - 0.65 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.65 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.65 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.80 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.80 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.65 * ry },
        { x: cx + 0.88 * rx, y: cy - 0.65 * ry },
        { x: cx + 0.88 * rx, y: cy + 0.65 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.65 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.80 * ry },
        { x: cx + 0.80 * rx, y: cy + 0.92 * ry },
        { x: cx + 0.65 * rx, y: cy + 0.92 * ry },
        { x: cx + 0.65 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.65 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.65 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.80 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.80 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.65 * ry },
        { x: cx - 0.88 * rx, y: cy + 0.65 * ry },
        { x: cx - 0.88 * rx, y: cy - 0.65 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.65 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.80 * ry },
      ];
    },
  },

  {
    id: 'shanghai-tower',
    name: 'SHANGHAI TOWER (TREFOIL REULEAUX)',
    category: 'architectural',
    inspiration: 'Gensler (Shanghai)',
    description: 'Smooth triangular Reuleaux cylinder with generous convex curves and full 360-degree daylight exposure.',
    efficiency: 85,
    defaultAspect: '1:1 (Square)',
    tags: ['Reuleaux', 'Curvilinear', 'Aerodynamic', 'Megatall'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const numSegments = 48;
      for (let i = 0; i < numSegments; i++) {
        const theta = (i / numSegments) * 2 * PI;
        const r = 0.85 + 0.08 * cos(3 * theta);
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
    description: 'Radial aerodynamic circular-elliptical floor plate with diagrid perimeter nodes maximizing 360-degree daylight.',
    efficiency: 88,
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
    id: 'torre-glories',
    name: 'TORRE GLÒRIES (BULLET GEODESIC)',
    category: 'architectural',
    inspiration: 'Jean Nouvel (Barcelona)',
    description: 'Smooth aerodynamic bullet-cylinder plate with rounded prows and maximum 360-degree perimeter daylight.',
    efficiency: 89,
    defaultAspect: '1:1 (Square)',
    tags: ['Jean Nouvel', 'Bullet', 'Geodesic', 'Aerodynamic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 36;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI;
        pts.push({
          x: cx + 0.90 * cos(a) * rx,
          y: cy + 0.92 * sin(a) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'turning-torso',
    name: 'TURNING TORSO (TWISTED RHOMBUS)',
    category: 'architectural',
    inspiration: 'Santiago Calatrava (Malmö)',
    description: 'Sculptural offset diamond-rhombus with generous wide floor plate and cantilevered corner balconies.',
    efficiency: 82,
    defaultAspect: '1:1 (Square)',
    tags: ['Calatrava', 'Sculptural', 'Rhombus', 'Dynamic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx,             y: cy - 0.92 * ry },
        { x: cx + 0.78 * rx, y: cy - 0.48 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.10 * ry },
        { x: cx + 0.65 * rx, y: cy + 0.75 * ry },
        { x: cx,             y: cy + 0.92 * ry },
        { x: cx - 0.68 * rx, y: cy + 0.70 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.10 * ry },
        { x: cx - 0.68 * rx, y: cy - 0.65 * ry },
      ];
    },
  },

  {
    id: 'chrysler-starburst',
    name: 'CHRYSLER ART DECO (SUNBURST STAR)',
    category: 'architectural',
    inspiration: 'William Van Alen (New York)',
    description: 'Thick cruciform core flanked by generous geometric setback steps celebrating 1930s Art Deco geometry.',
    efficiency: 84,
    defaultAspect: '1:1 (Square)',
    tags: ['Art-Deco', 'Cruciform', 'Setbacks', 'Classic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.48 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.48 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.48 * rx, y: cy - 0.70 * ry },
        { x: cx + 0.72 * rx, y: cy - 0.70 * ry },
        { x: cx + 0.72 * rx, y: cy - 0.48 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.48 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.48 * ry },
        { x: cx + 0.72 * rx, y: cy + 0.48 * ry },
        { x: cx + 0.72 * rx, y: cy + 0.70 * ry },
        { x: cx + 0.48 * rx, y: cy + 0.70 * ry },
        { x: cx + 0.48 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.48 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.48 * rx, y: cy + 0.70 * ry },
        { x: cx - 0.72 * rx, y: cy + 0.70 * ry },
        { x: cx - 0.72 * rx, y: cy + 0.48 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.48 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.48 * ry },
        { x: cx - 0.72 * rx, y: cy - 0.48 * ry },
        { x: cx - 0.72 * rx, y: cy - 0.70 * ry },
        { x: cx - 0.48 * rx, y: cy - 0.70 * ry },
      ];
    },
  },

  {
    id: 'the-shard',
    name: 'THE SHARD (FACETED PYRAMID)',
    category: 'architectural',
    inspiration: 'Renzo Piano (London)',
    description: 'Generous multi-faceted crystalline polygon with wide structural spans and panoramic corner living rooms.',
    efficiency: 86,
    defaultAspect: '1:1 (Square)',
    tags: ['Renzo Piano', 'Crystalline', 'Pyramid', 'Spacious'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.35 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.80 * rx, y: cy - 0.45 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.65 * ry },
        { x: cx + 0.25 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.80 * rx, y: cy + 0.75 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.25 * ry },
      ];
    },
  },

  {
    id: 'petronas-cross',
    name: 'PETRONAS TWIN (OCTAGRAM 8-STAR)',
    category: 'architectural',
    inspiration: 'César Pelli (Kuala Lumpur)',
    description: 'Thick Islamic geometric Rub el Hizb with wide 8-pointed star interlocking squares and massive central core.',
    efficiency: 84,
    defaultAspect: '1:1 (Square)',
    tags: ['Cesar Pelli', 'Octagram', 'Sacred Geometry', 'Twin Towers'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 16;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI - PI / 2;
        const r = i % 2 === 0 ? 0.92 : 0.78;
        pts.push({
          x: cx + r * cos(a) * rx,
          y: cy + r * sin(a) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'triangular-prism',
    name: 'TRIAD PRISM (WIDE 3-WING CORE)',
    category: 'architectural',
    inspiration: 'SOM / Norman Foster',
    description: 'High-density triangular prism tower with broad 24m-deep wings radiating from a central high-speed elevator core.',
    efficiency: 88,
    defaultAspect: '1:1 (Square)',
    tags: ['Triad', 'Prism', 'SOM', 'High Density'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.35 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.35 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.35 * ry },
        { x: cx + 0.70 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.70 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.35 * ry },
      ];
    },
  },

  {
    id: 'one-wtc-octagon',
    name: 'ONE WTC (CHAMFERED OCTAGON)',
    category: 'architectural',
    inspiration: 'David Childs / SOM (New York)',
    description: 'Square footprint with gentle corner chamfers creating a massive 8-sided dynamic prism with 90% floor efficiency.',
    efficiency: 90,
    defaultAspect: '1:1 (Square)',
    tags: ['SOM', 'Octagonal', 'Chamfered', 'Prism'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.60 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.60 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.60 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.60 * ry },
        { x: cx + 0.60 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.60 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.60 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.60 * ry },
      ];
    },
  },

  {
    id: 'hearst-prism',
    name: 'HEARST TOWER (DIAGRID FACETED)',
    category: 'architectural',
    inspiration: 'Foster + Partners (New York)',
    description: 'Voluminous box with subtle bird-mouth corner notches expressing structural triangular diagrid with maximum floor plate.',
    efficiency: 88,
    defaultAspect: '1:1 (Square)',
    tags: ['Foster', 'Diagrid', 'Faceted', 'Corner Setback'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.78 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.78 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.78 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.78 * ry },
        { x: cx + 0.78 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.78 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.78 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.78 * ry },
      ];
    },
  },

  {
    id: 'marilyn-monroe',
    name: 'ABSOLUTE WORLD (ORGANIC HOURGLASS)',
    category: 'architectural',
    inspiration: 'MAD Architects / Ma Yansong (Canada)',
    description: 'Smooth curvilinear continuous ellipse with broad residential floor plate and sweeping wraparound balconies.',
    efficiency: 84,
    defaultAspect: '1:1 (Square)',
    tags: ['MAD Architects', 'Organic', 'Hourglass', 'Curvilinear'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 40;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI;
        const r = 0.82 + 0.10 * cos(2 * a);
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
    efficiency: 85,
    defaultAspect: '3:2 (Landscape)',
    tags: ['Stefano Boeri', 'Biophilic', 'Cantilever', 'Twin Slabs'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.88 * rx, y: cy - 0.85 * ry },
        { x: cx + 0.30 * rx, y: cy - 0.85 * ry },
        { x: cx + 0.30 * rx, y: cy - 0.20 * ry },
        { x: cx + 0.88 * rx, y: cy - 0.20 * ry },
        { x: cx + 0.88 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.30 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.30 * rx, y: cy + 0.20 * ry },
        { x: cx - 0.88 * rx, y: cy + 0.20 * ry },
      ];
    },
  },

  {
    id: 'aqua-waveform',
    name: 'AQUA TOWER (UNDULATING WAVEFORM)',
    category: 'architectural',
    inspiration: 'Studio Gang / Jeanne Gang (Chicago)',
    description: 'Wide rectangular core plate enveloped by organic wave contours with huge usable interior floor space.',
    efficiency: 88,
    defaultAspect: '3:2 (Landscape)',
    tags: ['Studio Gang', 'Waveform', 'Limestone', 'Organic Slabs'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 40;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI;
        const r = 0.85 + 0.06 * sin(5 * a) + 0.04 * cos(2 * a);
        pts.push({
          x: cx + r * cos(a) * rx,
          y: cy + r * sin(a) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'de-rotterdam',
    name: 'DE ROTTERDAM (TRIPLE INTERLOCKING)',
    category: 'architectural',
    inspiration: 'Rem Koolhaas / OMA (Rotterdam)',
    description: 'Vertical city composed of 3 interconnected offset towers creating dynamic overhangs and sky terraces.',
    efficiency: 88,
    defaultAspect: '16:9 (Landscape)',
    tags: ['OMA', 'Vertical City', 'Interlocking', 'Staggered'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.92 * rx, y: cy - 0.78 * ry },
        { x: cx - 0.25 * rx, y: cy - 0.78 * ry },
        { x: cx - 0.25 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.25 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.25 * rx, y: cy - 0.78 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.78 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.78 * ry },
        { x: cx + 0.25 * rx, y: cy + 0.78 * ry },
        { x: cx + 0.25 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.25 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.25 * rx, y: cy + 0.78 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.78 * ry },
      ];
    },
  },

  {
    id: 'al-hamra-helix',
    name: 'AL HAMRA (SCULPTED RIBBON)',
    category: 'architectural',
    inspiration: 'SOM (Kuwait City)',
    description: 'Asymmetrical carved stone monolith with deep southern shading ribbon and huge habitable residential core.',
    efficiency: 85,
    defaultAspect: '1:1 (Square)',
    tags: ['SOM', 'Sculpted', 'Solar-Responsive', 'Ribbon'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.80 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.88 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.70 * ry },
        { x: cx + 0.50 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.10 * rx, y: cy + 0.60 * ry },
        { x: cx - 0.88 * rx, y: cy + 0.88 * ry },
      ];
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 2: HIGH-DENSITY GEOMETRIC TYPOLOGIES (THICK & SPACIOUS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'stepped-l',
    name: 'STEP-TERRACED L-SHAPE',
    category: 'geometric',
    inspiration: 'Corner Infill Typology',
    description: 'Thick dual-wing 90-degree corner urban tower with cascading sky terraces and massive 24m residential plate depth.',
    efficiency: 85,
    defaultAspect: '3:2 (Landscape)',
    tags: ['L-Shape', 'Terraced', 'Corner Plot', 'Urban Infill'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.92 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.05 * ry },
        { x: cx + 0.05 * rx, y: cy + 0.05 * ry },
        { x: cx + 0.05 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.92 * ry },
      ];
    },
  },

  {
    id: 'h-shape',
    name: 'H-SHAPE DUAL WING',
    category: 'geometric',
    inspiration: 'Parallel Double-Loaded Slab',
    description: 'Thick, high-density twin parallel wings connected by a wide, spacious central circulation bridge.',
    efficiency: 85,
    defaultAspect: '3:2 (Landscape)',
    tags: ['H-Shape', 'Twin Wings', 'High Density', 'Optimal Light'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.92 * rx, y: cy - 0.92 * ry },
        { x: cx - 0.30 * rx, y: cy - 0.92 * ry },
        { x: cx - 0.30 * rx, y: cy - 0.35 * ry },
        { x: cx + 0.30 * rx, y: cy - 0.35 * ry },
        { x: cx + 0.30 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.92 * ry },
        { x: cx + 0.30 * rx, y: cy + 0.92 * ry },
        { x: cx + 0.30 * rx, y: cy + 0.35 * ry },
        { x: cx - 0.30 * rx, y: cy + 0.35 * ry },
        { x: cx - 0.30 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.92 * ry },
      ];
    },
  },

  {
    id: 'pinwheel',
    name: 'DYNAMIC PINWHEEL (4-WING)',
    category: 'geometric',
    inspiration: 'Wind-Engineered Pinwheel Core',
    description: 'Thick 4-arm pinwheel with wide 22m habitable wings ensuring zero wing-to-wing privacy overlap.',
    efficiency: 82,
    defaultAspect: '1:1 (Square)',
    tags: ['Pinwheel', '4-Wing', 'Zero Overlap', 'Panoramic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.40 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.40 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.40 * rx, y: cy - 0.40 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.40 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.40 * ry },
        { x: cx + 0.40 * rx, y: cy + 0.40 * ry },
        { x: cx + 0.40 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.40 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.40 * rx, y: cy + 0.40 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.40 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.40 * ry },
        { x: cx - 0.40 * rx, y: cy - 0.40 * ry },
      ];
    },
  },

  {
    id: 'curved-x',
    name: 'CURVED X-SHAPE QUAD-WING',
    category: 'geometric',
    inspiration: 'Radial Cross-Ventilation Core',
    description: 'Thick 4-wing curvilinear tower with broad 24m diagonal wings and huge central elevator core.',
    efficiency: 84,
    defaultAspect: '1:1 (Square)',
    tags: ['Curved X', 'Quad Wing', 'Central Core', 'Cross Vent'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const wingAngles = [PI / 4, (3 * PI) / 4, (5 * PI) / 4, (7 * PI) / 4];

      for (let i = 0; i < 4; i++) {
        const angle = wingAngles[i];
        const cosA = cos(angle);
        const sinA = sin(angle);
        const perpX = -sinA;
        const perpY = cosA;

        // Extra thick residential wings
        pts.push({ x: cx + (cosA * 0.40 - perpX * 0.30) * rx, y: cy + (sinA * 0.40 - perpY * 0.30) * ry });
        pts.push({ x: cx + (cosA * 0.70 - perpX * 0.28) * rx, y: cy + (sinA * 0.70 - perpY * 0.28) * ry });
        pts.push({ x: cx + (cosA * 0.94 - perpX * 0.24) * rx, y: cy + (sinA * 0.94 - perpY * 0.24) * ry });
        pts.push({ x: cx + (cosA * 0.94 + perpX * 0.24) * rx, y: cy + (sinA * 0.94 + perpY * 0.24) * ry });
        pts.push({ x: cx + (cosA * 0.70 + perpX * 0.28) * rx, y: cy + (sinA * 0.70 + perpY * 0.28) * ry });
        pts.push({ x: cx + (cosA * 0.40 + perpX * 0.30) * rx, y: cy + (sinA * 0.40 + perpY * 0.30) * ry });

        const midAngle = angle + PI / 4;
        pts.push({
          x: cx + 0.45 * cos(midAngle) * rx,
          y: cy + 0.45 * sin(midAngle) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'hexagonal',
    name: 'HEXAGONAL HONEYCOMB',
    category: 'geometric',
    inspiration: 'Natural Honeycomb Lattice',
    description: '6-sided geometric honeycomb plate offering wide 60-degree corner balconies and maximum usable area.',
    efficiency: 86,
    defaultAspect: '1:1 (Square)',
    tags: ['Hexagonal', 'Honeycomb', '6-Sided', 'Corner Balconies'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 2 * PI - PI / 6;
        pts.push({
          x: cx + 0.92 * cos(a) * rx,
          y: cy + 0.92 * sin(a) * ry,
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
    description: '4 thick orthogonal wings radiating from a centralized high-capacity vertical transit core.',
    efficiency: 85,
    defaultAspect: '1:1 (Square)',
    tags: ['Cross', 'Cruciform', 'Symmetrical', 'High Rise'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.50 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.50 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.50 * rx, y: cy - 0.50 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.50 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.50 * ry },
        { x: cx + 0.50 * rx, y: cy + 0.50 * ry },
        { x: cx + 0.50 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.50 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.50 * rx, y: cy + 0.50 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.50 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.50 * ry },
        { x: cx - 0.50 * rx, y: cy - 0.50 * ry },
      ];
    },
  },

  {
    id: 't-shape',
    name: 'T-SHAPE RESIDENTIAL SLAB',
    category: 'geometric',
    inspiration: 'Linear High-Efficiency Core',
    description: 'Thick high-efficiency linear slab with wide perpendicular stabilizing wing maximizing daylight exposure.',
    efficiency: 88,
    defaultAspect: '3:2 (Landscape)',
    tags: ['T-Shape', 'Linear Slab', 'Orientation', 'Efficient'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.92 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.10 * ry },
        { x: cx + 0.45 * rx, y: cy - 0.10 * ry },
        { x: cx + 0.45 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.45 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.45 * rx, y: cy - 0.10 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.10 * ry },
      ];
    },
  },

  {
    id: 'double-diamond',
    name: 'DOUBLE-DIAMOND (INTERLOCKING)',
    category: 'geometric',
    inspiration: 'Hexagonal Interlocking Array',
    description: 'Thick twin interlocking angled diamond pods offering 6 panoramic corner living rooms per floor.',
    efficiency: 84,
    defaultAspect: '16:9 (Landscape)',
    tags: ['Diamond', 'Corner Units', 'Interlocking', 'Panoramic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.45 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.05 * rx, y: cy - 0.25 * ry },
        { x: cx + 0.55 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.94 * rx, y: cy },
        { x: cx + 0.55 * rx, y: cy + 0.88 * ry },
        { x: cx + 0.05 * rx, y: cy + 0.25 * ry },
        { x: cx - 0.45 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.94 * rx, y: cy },
      ];
    },
  },

  {
    id: 'octagram-star',
    name: 'OCTAGRAM (8-POINT STAR TOWER)',
    category: 'geometric',
    inspiration: 'Symmetric Faceted Geometry',
    description: 'Thick symmetrical 8-star faceted plate providing 8 corner balcony units with 270-degree view corridors.',
    efficiency: 85,
    defaultAspect: '1:1 (Square)',
    tags: ['8-Star', 'Octagram', 'Corner Views', 'Faceted'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 16;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI;
        const r = i % 2 === 0 ? 0.92 : 0.78;
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
    description: 'Thick symmetric dual-arc pointed oval with wide 28m center span maximizing aerodynamics and light.',
    efficiency: 88,
    defaultAspect: '16:9 (Landscape)',
    tags: ['Lens', 'Vesica', 'Aerodynamic', 'Smooth'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.94 * rx, y: cy },
        { x: cx - 0.55 * rx, y: cy - 0.78 * ry },
        { x: cx,             y: cy - 0.90 * ry },
        { x: cx + 0.55 * rx, y: cy - 0.78 * ry },
        { x: cx + 0.94 * rx, y: cy },
        { x: cx + 0.55 * rx, y: cy + 0.78 * ry },
        { x: cx,             y: cy + 0.90 * ry },
        { x: cx - 0.55 * rx, y: cy + 0.78 * ry },
      ];
    },
  },

  {
    id: 'chevron-v',
    name: 'CHEVRON (WIDE V-WING)',
    category: 'geometric',
    inspiration: 'Swept V-Wing Architecture',
    description: 'Extra thick forward-swept wide V-wing angle with 26m habitable wing depth and private entry forecourt.',
    efficiency: 86,
    defaultAspect: '1:1 (Square)',
    tags: ['Chevron', 'V-Shape', 'Wind Deflection', 'Modernist'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx,             y: cy - 0.75 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.25 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.80 * ry },
        { x: cx + 0.40 * rx, y: cy + 0.92 * ry },
        { x: cx,             y: cy + 0.25 * ry },
        { x: cx - 0.40 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.80 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.25 * ry },
      ];
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 3: NATURE-INSPIRED & BIOPHILIC GEOMETRIES (THICK & VOLUMINOUS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'water-droplet',
    name: 'WATER DROPLET (TEARDROP POD)',
    category: 'biophilic',
    inspiration: 'Fluid Hydrodynamics',
    description: 'Voluminous teardrop water droplet with smooth tapered apical crown and massive bulbous lower living zones.',
    efficiency: 86,
    defaultAspect: '1:1 (Square)',
    tags: ['Water Droplet', 'Fluid', 'Aerodynamic', 'Biophilic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];

      pts.push({ x: cx, y: cy - 0.94 * ry });
      pts.push({ x: cx + 0.28 * rx, y: cy - 0.65 * ry });
      pts.push({ x: cx + 0.60 * rx, y: cy - 0.25 * ry });
      pts.push({ x: cx + 0.88 * rx, y: cy + 0.15 * ry });
      pts.push({ x: cx + 0.92 * rx, y: cy + 0.50 * ry });
      pts.push({ x: cx + 0.75 * rx, y: cy + 0.80 * ry });
      pts.push({ x: cx + 0.45 * rx, y: cy + 0.92 * ry });

      pts.push({ x: cx, y: cy + 0.94 * ry });

      pts.push({ x: cx - 0.45 * rx, y: cy + 0.92 * ry });
      pts.push({ x: cx - 0.75 * rx, y: cy + 0.80 * ry });
      pts.push({ x: cx - 0.92 * rx, y: cy + 0.50 * ry });
      pts.push({ x: cx - 0.88 * rx, y: cy + 0.15 * ry });
      pts.push({ x: cx - 0.60 * rx, y: cy - 0.25 * ry });
      pts.push({ x: cx - 0.28 * rx, y: cy - 0.65 * ry });

      return pts;
    },
  },

  {
    id: 'botanical-leaf',
    name: 'ORGANIC BOTANICAL LEAF',
    category: 'biophilic',
    inspiration: 'Natural Foliage Morphology',
    description: 'Iconic organic leaf geometry with thick, wide curving belly taking maximum floor plate area.',
    efficiency: 85,
    defaultAspect: '1:1 (Square)',
    tags: ['Botanical Leaf', 'Foliage', 'Organic', 'Biophilic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];

      pts.push({ x: cx, y: cy - 0.94 * ry });
      pts.push({ x: cx + 0.38 * rx, y: cy - 0.70 * ry });
      pts.push({ x: cx + 0.72 * rx, y: cy - 0.38 * ry });
      pts.push({ x: cx + 0.92 * rx, y: cy });
      pts.push({ x: cx + 0.92 * rx, y: cy + 0.30 * ry });
      pts.push({ x: cx + 0.72 * rx, y: cy + 0.65 * ry });
      pts.push({ x: cx + 0.40 * rx, y: cy + 0.85 * ry });

      pts.push({ x: cx, y: cy + 0.94 * ry });

      pts.push({ x: cx - 0.40 * rx, y: cy + 0.85 * ry });
      pts.push({ x: cx - 0.72 * rx, y: cy + 0.65 * ry });
      pts.push({ x: cx - 0.92 * rx, y: cy + 0.30 * ry });
      pts.push({ x: cx - 0.92 * rx, y: cy });
      pts.push({ x: cx - 0.72 * rx, y: cy - 0.38 * ry });
      pts.push({ x: cx - 0.38 * rx, y: cy - 0.70 * ry });

      return pts;
    },
  },

  {
    id: 'nautilus-spiral',
    name: 'NAUTILUS (GOLDEN RATIO SPIRAL)',
    category: 'biophilic',
    inspiration: 'Nautilus Pompilius Logarithmic Spiral',
    description: 'Thick golden ratio spiral chamber layout creating escalating unit terraces around a wide mantle.',
    efficiency: 84,
    defaultAspect: '1:1 (Square)',
    tags: ['Nautilus', 'Golden Ratio', 'Logarithmic Spiral', 'Fibonacci'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 32;
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * 2 * PI;
        const r = 0.55 + 0.38 * (t / (2 * PI));
        pts.push({
          x: cx + r * cos(t) * rx,
          y: cy + r * sin(t) * ry,
        });
      }
      pts.push({ x: cx + 0.75 * rx, y: cy - 0.15 * ry });
      pts.push({ x: cx + 0.50 * rx, y: cy - 0.20 * ry });
      return pts;
    },
  },

  {
    id: 'ginkgo-leaf',
    name: 'GINKGO BILOBA (FAN LEAF)',
    category: 'biophilic',
    inspiration: 'Ginkgo Biloba Ancient Leaf',
    description: 'Wide splayed radial fan with gentle central indentation and huge habitable floor area.',
    efficiency: 86,
    defaultAspect: '1:1 (Square)',
    tags: ['Ginkgo', 'Fan Leaf', 'Botanical', 'Radial Views'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx,             y: cy - 0.35 * ry },
        { x: cx + 0.55 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.40 * ry },
        { x: cx + 0.88 * rx, y: cy + 0.40 * ry },
        { x: cx + 0.45 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.45 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.88 * rx, y: cy + 0.40 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.40 * ry },
        { x: cx - 0.55 * rx, y: cy - 0.90 * ry },
      ];
    },
  },

  {
    id: 'starflower-5petal',
    name: '5-PETAL STARFLOWER (PENTAGRAM)',
    category: 'biophilic',
    inspiration: 'Floral Pentamerous Radial Symmetry',
    description: 'Thick 5 rounded floral petal lobes wrapped around a compact central elevator/stair core.',
    efficiency: 84,
    defaultAspect: '1:1 (Square)',
    tags: ['Floral', '5-Petal', 'Radial', 'Pentagram'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 50;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI - PI / 2;
        const r = 0.80 + 0.12 * cos(5 * a);
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
    description: 'Thick 4 wide rounded biophilic petal wings offering 4 completely private residential quadrants.',
    efficiency: 85,
    defaultAspect: '1:1 (Square)',
    tags: ['Clover', '4-Leaf', 'Quadrifoil', 'Biophilic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 48;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI;
        const r = 0.82 + 0.10 * cos(4 * a);
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
    name: 'BUTTERFLY (WIDE BIAXIAL PODS)',
    category: 'biophilic',
    inspiration: 'Lepidoptera Wing Aerodynamics',
    description: 'Thick bilateral symmetric upper and lower wide wing lobes taking huge usable area.',
    efficiency: 85,
    defaultAspect: '16:9 (Landscape)',
    tags: ['Butterfly', 'Lepidoptera', 'Biaxial Wings', 'Organic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx,             y: cy - 0.30 * ry },
        { x: cx + 0.50 * rx, y: cy - 0.90 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.45 * ry },
        { x: cx + 0.78 * rx, y: cy },
        { x: cx + 0.92 * rx, y: cy + 0.60 * ry },
        { x: cx + 0.50 * rx, y: cy + 0.90 * ry },
        { x: cx,             y: cy + 0.35 * ry },
        { x: cx - 0.50 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.60 * ry },
        { x: cx - 0.78 * rx, y: cy },
        { x: cx - 0.92 * rx, y: cy - 0.45 * ry },
        { x: cx - 0.50 * rx, y: cy - 0.90 * ry },
      ];
    },
  },

  {
    id: 'lotus-blossom',
    name: 'LOTUS BLOSSOM (BIOPHILIC POD)',
    category: 'biophilic',
    inspiration: 'Nelumbo Nucifera Sacred Lotus',
    description: 'Thick 8-petal blooming floral plate with broad habitable petals wrapping around a radiant central core.',
    efficiency: 86,
    defaultAspect: '1:1 (Square)',
    tags: ['Lotus', 'Floral', 'Biophilic', 'Radiant Core'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 48;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI;
        const r = 0.82 + 0.10 * cos(8 * a);
        pts.push({
          x: cx + r * cos(a) * rx,
          y: cy + r * sin(a) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'scallop-shell',
    name: 'SCALLOP SHELL (BIVALVE ARC)',
    category: 'biophilic',
    inspiration: 'Marine Bivalve Scallop Geometry',
    description: 'Radial corrugated fan geometry with wide 22m residential rooms and open panoramic balconies.',
    efficiency: 86,
    defaultAspect: '1:1 (Square)',
    tags: ['Shell', 'Bivalve', 'Corrugated', 'Marine'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.45 * rx, y: cy + 0.90 * ry },
        { x: cx - 0.82 * rx, y: cy + 0.45 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.15 * ry },
        { x: cx - 0.65 * rx, y: cy - 0.75 * ry },
        { x: cx,             y: cy - 0.92 * ry },
        { x: cx + 0.65 * rx, y: cy - 0.75 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.15 * ry },
        { x: cx + 0.82 * rx, y: cy + 0.45 * ry },
        { x: cx + 0.45 * rx, y: cy + 0.90 * ry },
      ];
    },
  },

  {
    id: 'biophilic-triad',
    name: 'TRI-CLUSTER POD (3-HEXAGON UNION)',
    category: 'biophilic',
    inspiration: 'Organic Modular Polyhedron',
    description: '3 thick interlocking hexagonal pods sharing a common central core with 3 separate private residential wings.',
    efficiency: 86,
    defaultAspect: '1:1 (Square)',
    tags: ['Tri-Cluster', 'Hexagonal', 'Modular', 'High Density'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.35 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.35 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.65 * rx, y: cy - 0.48 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.15 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.40 * ry },
        { x: cx + 0.55 * rx, y: cy + 0.85 * ry },
        { x: cx,             y: cy + 0.60 * ry },
        { x: cx - 0.55 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.40 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.15 * ry },
        { x: cx - 0.65 * rx, y: cy - 0.48 * ry },
      ];
    },
  },

  {
    id: 'ripple-oval',
    name: 'CONCENTRIC RIPPLE (WATER WAVE)',
    category: 'biophilic',
    inspiration: 'Fluid Surface Wave Propagation',
    description: 'Thick concentric smooth oval contours expanding outward with massive residential floor plate spans.',
    efficiency: 88,
    defaultAspect: '16:9 (Landscape)',
    tags: ['Ripple', 'Water Wave', 'Concentric', 'Smooth'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: Array<{ x: number; y: number }> = [];
      const N = 36;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * PI;
        const r = 0.88 + 0.04 * sin(6 * a);
        pts.push({
          x: cx + r * cos(a) * rx,
          y: cy + r * sin(a) * ry,
        });
      }
      return pts;
    },
  },

  {
    id: 'diamond-quadrant',
    name: 'DIAMOND QUADRANT (4-WING FACET)',
    category: 'biophilic',
    inspiration: 'Crystalline Faceted Diamond Structure',
    description: '4 thick interlocking diamond quadrant pods with expansive 270-degree panoramic corner living rooms.',
    efficiency: 86,
    defaultAspect: '1:1 (Square)',
    tags: ['Diamond', 'Quadrant', 'Crystalline', 'Panoramic'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx,             y: cy - 0.92 * ry },
        { x: cx + 0.55 * rx, y: cy - 0.55 * ry },
        { x: cx + 0.92 * rx, y: cy },
        { x: cx + 0.55 * rx, y: cy + 0.55 * ry },
        { x: cx,             y: cy + 0.92 * ry },
        { x: cx - 0.55 * rx, y: cy + 0.55 * ry },
        { x: cx - 0.92 * rx, y: cy },
        { x: cx - 0.55 * rx, y: cy - 0.55 * ry },
      ];
    },
  },

  {
    id: 'flame-teardrop',
    name: 'DYNAMIC VORTEX (AERODYNAMIC POD)',
    category: 'biophilic',
    inspiration: 'Fluid Thermal Vortex Flow',
    description: 'Thick curving teardrop profile with generous 24m belly depth and smooth aerodynamic facade curves.',
    efficiency: 85,
    defaultAspect: '1:1 (Square)',
    tags: ['Vortex', 'Aerodynamic', 'Dynamic', 'Soaring'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.30 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.45 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.30 * ry },
        { x: cx + 0.85 * rx, y: cy + 0.60 * ry },
        { x: cx + 0.20 * rx, y: cy + 0.92 * ry },
        { x: cx - 0.55 * rx, y: cy + 0.80 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.15 * ry },
        { x: cx - 0.75 * rx, y: cy - 0.50 * ry },
      ];
    },
  },

  {
    id: 'triple-honeycomb',
    name: 'TRIPLE HONEYCOMB (3-POD CLUSTER)',
    category: 'biophilic',
    inspiration: 'Modular Beehive Hexagonal Cluster',
    description: '3 thick interlocking hexagonal pods sharing a common central core with 3 separate private residential wings.',
    efficiency: 86,
    defaultAspect: '1:1 (Square)',
    tags: ['Triple Hex', 'Cluster', 'Modular', 'Beehive'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.30 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.30 * rx, y: cy - 0.92 * ry },
        { x: cx + 0.65 * rx, y: cy - 0.48 * ry },
        { x: cx + 0.92 * rx, y: cy - 0.15 * ry },
        { x: cx + 0.92 * rx, y: cy + 0.40 * ry },
        { x: cx + 0.55 * rx, y: cy + 0.85 * ry },
        { x: cx,             y: cy + 0.60 * ry },
        { x: cx - 0.55 * rx, y: cy + 0.85 * ry },
        { x: cx - 0.92 * rx, y: cy + 0.40 * ry },
        { x: cx - 0.92 * rx, y: cy - 0.15 * ry },
        { x: cx - 0.65 * rx, y: cy - 0.48 * ry },
      ];
    },
  },

  {
    id: 'seed-capsule',
    name: 'SEED POD (SEGMENTED CAPSULE)',
    category: 'biophilic',
    inspiration: 'Botanical Seed Capsule / Embryo',
    description: 'Thick organic oblong pill shape with 4 distinct rounded corner pods and huge central sunlit core.',
    efficiency: 90,
    defaultAspect: '16:9 (Landscape)',
    tags: ['Seed Pod', 'Capsule', 'Oblong', 'High Efficiency'],
    getPolygon: (cx, cy, w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return [
        { x: cx - 0.70 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.70 * rx, y: cy - 0.88 * ry },
        { x: cx + 0.94 * rx, y: cy - 0.40 * ry },
        { x: cx + 0.94 * rx, y: cy + 0.40 * ry },
        { x: cx + 0.70 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.70 * rx, y: cy + 0.88 * ry },
        { x: cx - 0.94 * rx, y: cy + 0.40 * ry },
        { x: cx - 0.94 * rx, y: cy - 0.40 * ry },
      ];
    },
  },
];
