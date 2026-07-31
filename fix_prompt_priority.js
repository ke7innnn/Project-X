const fs = require('fs');
const file = 'app/idea-generation/page.tsx';
let code = fs.readFileSync(file, 'utf8');

const oldPromptBlock = `        const promptText = \`Generate a top-down 2D architectural CAD floor plan viewed from above.

BUILDING SPEC:
- Residential tower, \${overallWidth}m x \${overallLength}m footprint.
- \${totalUnits} apartments: \${mixBreakdownParts}.
\${coreSpecStr}

ROOM COMPOSITION:
\${roomCompBlock}
- Every room listed above MUST appear in each apartment. Do not skip any room.

ROOM SIZES (relative):
\${roomSizeBlock}

SPATIAL FLOW (inside each apartment):
- Entrance door leads into living/dining area first (public zone near corridor).
- Kitchen is next to the living area.
- Bedrooms are on the opposite side from the entrance (private zone near facade).
- Each bathroom is attached to or directly adjacent to a bedroom.

STRICT LAYOUT RULES:
- The input image has an existing floor plan inside a thick RED border. The RED border is the fixed building boundary.
- DO NOT modify, move, reshape, or remove the RED border.
- ONLY edit the interior layout INSIDE the RED border. Everything outside the RED border must remain plain white.
- ALL Living Rooms and Bedrooms MUST be placed along the outer edge (RED border) with at least one window on the outer wall. No living room or bedroom may be placed in the interior without a window.
- ALL Kitchens MUST be placed along the outer edge with a window, OR next to a vertical exhaust duct shaft.
- ALL Bathrooms MUST be placed along the outer edge with a window, OR next to a vertical ventilation duct shaft. Draw duct shafts as small labeled rectangles near the core.
- No room in any apartment may be fully enclosed without either a window to the outside or a connection to a duct shaft.
- Each apartment has exactly one entrance door opening onto the corridor.
- A central corridor connects all apartment entrances to the lift/stair core.
\${optionalBlock}

DRAWING STYLE:
- Black-and-white CAD linework only. Keep the existing RED border as-is.
- Outer walls: thick lines. Inner partition walls: thin lines.
- Draw doors as arcs, windows as thin gaps on outer walls.
- Draw lifts as small squares with X inside.
- Draw staircases as parallel diagonal lines.
- CRITICAL: Do NOT draw any furniture, textures, shadows, 3D views, perspective drawings, people, or colored fills.
- CRITICAL: Do NOT write any room names, dimensions, or legends. Rooms must be completely empty boxes.
- Label each apartment: \${labelList}. ONLY these exact labels are allowed. One label per apartment, NO room labels.\`;`;

const newPromptBlock = `        const promptText = \`Generate a top-down 2D architectural CAD floor plan viewed from above.

CRITICAL SHAPE BOUNDARY RULES (HIGHEST PRIORITY):
- The input image has an existing floor plan inside a thick RED border. The RED border is the fixed building boundary.
- DO NOT modify, move, reshape, or remove the RED border under any circumstances.
- ONLY edit the interior layout INSIDE the RED border. Everything outside the RED border must remain plain white.
- Keep the existing RED border exactly as-is.

BUILDING SPEC:
- Residential tower, \${overallWidth}m x \${overallLength}m footprint.
- \${totalUnits} apartments: \${mixBreakdownParts}.
\${coreSpecStr}

ROOM COMPOSITION:
\${roomCompBlock}
- Every room listed above MUST appear in each apartment. Do not skip any room.

ROOM SIZES (relative):
\${roomSizeBlock}

SPATIAL FLOW (inside each apartment):
- Entrance door leads into living/dining area first (public zone near corridor).
- Kitchen is next to the living area.
- Bedrooms are on the opposite side from the entrance (private zone near facade).
- Each bathroom is attached to or directly adjacent to a bedroom.

STRICT LAYOUT RULES:
- ALL Living Rooms and Bedrooms MUST be placed along the outer edge (RED border) with at least one window on the outer wall. No living room or bedroom may be placed in the interior without a window.
- ALL Kitchens MUST be placed along the outer edge with a window, OR next to a vertical exhaust duct shaft.
- ALL Bathrooms MUST be placed along the outer edge with a window, OR next to a vertical ventilation duct shaft. Draw duct shafts as small labeled rectangles near the core.
- No room in any apartment may be fully enclosed without either a window to the outside or a connection to a duct shaft.
- Each apartment has exactly one entrance door opening onto the corridor.
- A central corridor connects all apartment entrances to the lift/stair core.
\${optionalBlock}

DRAWING STYLE:
- Black-and-white CAD linework only.
- Outer walls: thick lines. Inner partition walls: thin lines.
- Draw doors as arcs, windows as thin gaps on outer walls.
- Draw lifts as small squares with X inside.
- Draw staircases as parallel diagonal lines.
- CRITICAL: Do NOT draw any furniture, textures, shadows, 3D views, perspective drawings, people, or colored fills.
- CRITICAL: Do NOT write any room names, dimensions, or legends. Rooms must be completely empty boxes.
- Label each apartment: \${labelList}. ONLY these exact labels are allowed. One label per apartment, NO room labels.\`;`;

code = code.replace(oldPromptBlock, newPromptBlock);
fs.writeFileSync(file, code);
