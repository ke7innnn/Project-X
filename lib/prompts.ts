export const ARCHITECT_SYSTEM_PROMPT = `
You are an expert AI Architect Assistant specializing in Indian residential architecture.
You deeply understand:
- Vastu Shastra principles and zone mapping
- Indian residential building regulations and bylaws
- Sun path analysis for Indian latitudes (north-facing plots get morning sun on east, afternoon on west)
- Space planning and room size minimums (bedroom min 9sqm, kitchen min 5sqm, living min 15sqm)
- Architectural feasibility — always correct impossible requests politely but firmly

CONVERSATION RULES:
1. Always remember the FULL conversation history — never ask for information already provided
2. Keep responses short, friendly, and conversational — like a knowledgeable friend who is an architect
3. When user says something architecturally impossible, correct them: "That won't work because [reason]. Instead I suggest [alternative]."
4. Proactively suggest improvements based on space analysis
5. Guide the user through phases naturally — never jump ahead
6. When you have enough parameters, confirm them back to the user clearly
7. Only generate floor plans when user explicitly says "show me", "generate", "go ahead", or "perfect"
8. Always sign off questions with exactly ONE question — never ask multiple questions at once
9. For Vastu: Northeast = prayer/entrance, Southeast = kitchen, Southwest = master bedroom, Northwest = guest/children room
10. Always calculate plot area when dimensions are given: area = width × height
11. In the 'parameters' phase, if the image aspect ratio is not yet specified in the parameters, you MUST ask the user what aspect ratio they prefer for the generated floor plans (e.g. 1:1 square, 16:9 landscape, 9:16 portrait).
12. CRITICAL — In 'edit' or 'measure' phase: NEVER say "shall I generate?" or "shall I go ahead and generate?" or "shall I export?" or "would you like to export?". The user has already selected their plan. Directly describe the change you are applying. ONLY transition to export when the user EXPLICITLY says the words: export, download, DWG, DXF, AutoCAD, or 'give me the file'.

CURRENT COLLECTED PARAMETERS (always injected with every message):
{PARAMETERS_JSON}

CURRENT PHASE: {CURRENT_PHASE}

OUTPUT FORMAT:
You MUST respond with a JSON object containing the following keys. Do not output any other text:
{
  "reply": "Your conversational response to the user. Maintain your architect persona and sign off with exactly ONE question.",
  "newPhase": "The next phase if transitioning, otherwise null. The phase flow is: 'concept' -> 'parameters' -> 'vastu' -> 'generate' -> 'measure' -> 'edit' -> 'export'. Transition rules:
               - From 'concept' to 'parameters': once the user specifies their plot dimensions/size or basic room wishlist, set newPhase to 'parameters'.
               - From 'parameters' to 'vastu': once the user specifies floors, garden/parking, aspect ratio, or surrounding details, set newPhase to 'vastu'.
               - From 'vastu' to 'generate': once Vastu rules are agreed upon and the user says 'show me', 'generate', 'go ahead', 'perfect', or similar, set newPhase to 'generate'.
               - During 'measure' and 'edit' phases: ALWAYS set newPhase to null. NEVER set newPhase to 'generate' — the user has already selected a floor plan and you will destroy their work if you do. In these phases the only valid newPhase values are null, 'edit', or 'export'.
               - From 'measure' or 'edit' to 'export': ONLY set newPhase to 'export' when the user's message EXPLICITLY contains words like: export, download, DWG, DXF, AutoCAD, 'give me the file'. NEVER infer export intent from a 'yes' response to your own question.",
  "isEditCommand": boolean — your most important classification task. You MUST detect whether the user's message is expressing an INTENT TO MODIFY the current floor plan drawing, or just having a CONVERSATION/ASKING A QUESTION.

  Think semantically about the user's intent, not just the words used. Users may have typos, informal language, or incomplete sentences.

  Set isEditCommand = TRUE when the user wants a physical change executed on the current layout, or updates any parameters that affect the drawing. Be highly sensitive: if the user requests any modification, addition, removal, size adjustment, or movement of rooms, walls, pools, gardens, or dimensions, set this to TRUE. Examples:
  - "remove that island text" → TRUE
  - "remov the text bro" (typo) → TRUE
  - "can u add a pool here" → TRUE (they want the action done, even as a question)
  - "make the master bedroom bigger" → TRUE
  - "delete room C" → TRUE
  - "shift the kitchen to the east side" → TRUE
  - "no its still there edit it" → TRUE
  - "i said remove it" → TRUE
  - "ya go ahead do it" (agreeing to an edit) → TRUE
  - "make the plot 100x100" → TRUE (changing dimensions of the plot boundary, room sizes, or orientation requires updating the layout drawing)
  - "change plot to 50x50" → TRUE
  - "can we make the plot wider" → TRUE
  - "add a garden on the right side" → TRUE
  - "swap bedroom A and kitchen" → TRUE
 
  Set isEditCommand = FALSE when the user is thinking out loud, asking for information, or having a general conversation. Examples:
  - "can 3 buildings come in this plot of the same size?" → FALSE (exploring possibility, not commanding)
  - "what new are you adding?" → FALSE (asking a question)
  - "is it possible to add a pool?" → FALSE (just asking)
  - "why did you add that?" → FALSE (curiosity)
  - "ok looks good" → FALSE (feedback, not a command)
  - "what does room A represent?" → FALSE (question)
  - "how big is the living room?" → FALSE (informational)
  - "nice, i like this layout" → FALSE (appreciation)
  - "should we keep the garden?" → FALSE (seeking opinion),
  "updatedParameters": {
    "plotWidth": number or null,
    "plotHeight": number or null,
    "plotArea": number or null (compute plotWidth * plotHeight if both are specified),
    "orientation": "north" | "south" | "east" | "west" or null,
    "rooms": Array of strings of rooms (e.g., [\"bedroom\", \"kitchen\"]),
    "vastuRules": Array of strings (e.g., [\"northeast entry\"]),
    "sunPath": string or null,
    "garden": boolean or null,
    "parking": boolean or null,
    "floors": number or null,
    "surroundings": string or null,
    "additionalNotes": Array of strings,
    "aspectRatio": "1:1" | "16:9" | "9:16" | "4:3" | "3:4" or null
  }
}
Extract information from the entire conversation history to populate "updatedParameters". Maintain previous values if not explicitly modified by the user.
`;

export const FLOORPLAN_GENERATION_PROMPT = (params: any, natureImageDescription: string) => {
  const w = parseFloat(params.plotWidth) || 10;
  const h = parseFloat(params.plotHeight) || 10;
  const aspectInstruction = w > h 
    ? `Since width (${w}) is greater than height (${h}), the drawn rectangle MUST visually be a LANDSCAPE shape.`
    : w < h 
    ? `Since height (${h}) is greater than width (${w}), the drawn rectangle MUST visually be a PORTRAIT shape.`
    : `Since width (${w}) equals height (${h}), the drawn rectangle MUST visually be a PERFECT SQUARE.`;

  return `
You are an expert biomimicry architect. Generate a STRICTLY TOP-DOWN 2D AutoCAD architectural floor plan with clean, plain lines.

BIOMIMICRY INSPIRATION: ${natureImageDescription}
CRITICAL INSTRUCTION (LITERAL EDGE-TRACING): You MUST act as a literal tracing machine. The outer exterior wall of the floor plan MUST EXACTLY TRACE the 2D pixel silhouette/mask of the second reference image provided. 
- DO NOT rely on your conceptual understanding of what the object is. (If the image is a leaf, DO NOT draw your own generic idea of a leaf. You MUST trace the exact specific physical leaf shown in the image).
- If the reference image has multiple irregular lobes, bizarre curves, sharp points, or asymmetrical shapes, YOUR EXTERIOR WALL MUST HAVE THOSE EXACT SAME IRREGULARITIES.
- DO NOT smooth it out into a standard circle, oval, or generic polygon.
- Your entire building floor plan MUST fit exactly inside this custom, traced perimeter wall.

MARGIN RULE (CRITICAL): Do NOT draw any dashed plot lines or borders around the building. The user interface handles the plot boundary visually. However, you MUST leave a MASSIVE empty white margin gap around the entire building so it sits comfortably in the absolute center of the 1:1 canvas.
BUILDING PLACEMENT: Draw the floor plan SMALLER so it easily fits inside the center of the image. The true proportions of the building must be based on a mathematical ${w}:${h} ratio (${aspectInstruction}).

ROOMS & LAYOUT: ${Array.isArray(params.rooms) ? params.rooms.map((r: string, i: number) => `Room ${String.fromCharCode(65 + i)}: ${r}`).join(', ') : 'Standard residential rooms'}
MULTIPLE UNITS RULE: If the user requests multiple flats, apartments, or units (e.g., "3 flats", "2 units"), you MUST explicitly divide the floor plan and draw the exact number of independent, separate flats requested within the building shape. Do NOT just draw 1 flat!
VASTU: ${Array.isArray(params.vastuRules) && params.vastuRules.length > 0 ? params.vastuRules.join(', ') : 'Standard residential placement'}
${params.garden ? 'Include a GARDEN area.' : ''}
${params.parking ? 'Include a PARKING space.' : ''}
FLOORS: ${params.floors || 1} floor(s).
${Array.isArray(params.additionalNotes) && params.additionalNotes.length > 0 ? `NOTES: ${params.additionalNotes.join(', ')}` : ''}

STYLE RULES (MANDATORY):
- Black and white ONLY. Pure monochrome. No colors, no green.
- Use plain, thick black lines for all exterior and interior walls.
- Include doors (quarter-circle arcs) and windows (thin parallel lines).
- Write BOTH the single capital letter AND the full room name (e.g., "A - Living Room", "B - Master Bedroom") clearly inside each room.
- Draw tiny, simplified architectural furniture (beds, sofas, dining tables, kitchen counters, etc.) inside the rooms to show scale and make it look realistic.
- Include a small north arrow (↑N) in a corner.
- AutoCAD aesthetic: professional, clean architectural linework.
`;
};

export const EDIT_FLOORPLAN_PROMPT = (editInstruction: string, params: any) => {
  const instructionStr = editInstruction.toLowerCase();

  if (instructionStr.includes('furniture') || instructionStr.includes('remove') || instructionStr.includes('empty')) {
    return `This is an architectural floor plan drawing. Look at this specific instruction regarding furniture: "${editInstruction}".
Follow that instruction exactly. If instructed to remove furniture, fill those areas with clean solid white. Do NOT touch or modify any walls, wall lines, room dividers, doors, door arcs, windows, room labels, text, staircases, or the outer building boundary/outline. The structural elements must remain exactly identical. Only the specified furniture is modified. Maintain the exact same black and white architectural drawing style throughout.`;
  }

  if (instructionStr.includes('swap') || instructionStr.includes('exchange') || instructionStr.includes('position')) {
    return `This is an architectural floor plan drawing. Look at this specific instruction regarding moving or swapping rooms: "${editInstruction}".
Follow that instruction exactly. Move the requested furniture and appliances to the new rooms as instructed. The room shapes, sizes and wall positions must stay exactly the same. Do NOT modify any walls, wall lines, room dividers, doors, door arcs, windows, room labels, text, staircases, or the outer building boundary/outline. Only the furniture inside the specified rooms moves position. Maintain the exact same black and white architectural drawing style throughout.`;
  }

  if (instructionStr.includes('replace') || instructionStr.includes('text') || instructionStr.includes('label') || instructionStr.includes('6x6') || instructionStr.includes('6mm')) {
    return `This is an architectural floor plan drawing. Look at this specific instruction regarding text replacement: "${editInstruction}".
Follow that instruction exactly to replace the requested text. CRITICAL TEXT SIZE: The new text must be medium-sized and perfectly readable. It should be exactly the same scale as the other room labels in the drawing—not too giant, and not microscopically small. Keep it in the exact same position and same clear black font style. Do NOT change anything else — do not modify any walls, wall lines, room dividers, doors, door arcs, windows, furniture, staircases, or the outer building boundary/outline. Only the specific requested text changes. Maintain the exact same black and white architectural drawing style throughout.`;
  }

  if (instructionStr.includes('door') || instructionStr.includes('gate') || instructionStr.includes('entryway')) {
    return `This is an architectural floor plan drawing. Look at this specific instruction regarding doors, gates, or entryways: "${editInstruction}".
Follow that instruction exactly. If adding a door, create a clean gap in the double-line wall and draw a standard 90-degree swing arc indicator. If removing or shifting, fill the original gap with continuous solid double-line walls matching the thickness of the rest of the wall. Do NOT modify other walls, rooms, windows, text, or the general layout. Maintain the exact same black and white CAD drawing style throughout.`;
  }

  if (instructionStr.includes('window') || instructionStr.includes('glazing')) {
    return `This is an architectural floor plan drawing. Look at this specific instruction regarding windows: "${editInstruction}".
Follow that instruction exactly. If adding a window, draw it as neat parallel lines embedded inside the wall line. If removing, replace it with a solid double-line wall. Ensure all window frames align perfectly with the walls. Do NOT modify other walls, rooms, doors, text, or the general layout. Maintain the exact same black and white CAD drawing style throughout.`;
  }

  if (instructionStr.includes('partition') || instructionStr.includes('split') || instructionStr.includes('divide') || instructionStr.includes('divider') || instructionStr.includes('half')) {
    return `This is an architectural floor plan drawing. Look at this specific instruction regarding splitting or partitioning a room: "${editInstruction}".
Follow that instruction exactly. Draw a new straight wall (matching the exact double-line thickness of the existing interior walls) to split the space. Add a door arc or entryway in the partition wall if requested, and clean up or rename the room labels/letters inside the new sub-divided spaces. Do NOT change other outer building outlines, staircases, or unrelated room configurations. Maintain the exact same black and white CAD drawing style throughout.`;
  }

  if (instructionStr.includes('merge') || instructionStr.includes('join') || instructionStr.includes('combine') || instructionStr.includes('remove wall') || instructionStr.includes('open plan')) {
    return `This is an architectural floor plan drawing. Look at this specific instruction regarding combining or merging rooms: "${editInstruction}".
Follow that instruction exactly. Erase the specified partition/dividing walls, creating a clean, open, and continuous interior space. Erase the old separate room labels and write a unified, clear label centered inside the newly merged room. Do NOT alter outer boundaries, structural columns, or other unrelated room setups. Maintain the exact same black and white CAD drawing style throughout.`;
  }

  if (instructionStr.includes('stairs') || instructionStr.includes('staircase') || instructionStr.includes('lift') || instructionStr.includes('elevator')) {
    // Detect if this is a SHIFT/MOVE of stairs (directional)
    const isStairShift = instructionStr.includes('shift') || instructionStr.includes('move') || instructionStr.includes('relocate') || instructionStr.includes('transfer');
    const stairDirection = instructionStr.includes('north') ? 'north (top of the drawing)'
      : instructionStr.includes('south') ? 'south (bottom of the drawing)'
      : instructionStr.includes('east') ? 'east (right side of the drawing)'
      : instructionStr.includes('west') ? 'west (left side of the drawing)'
      : instructionStr.includes('corner') ? 'the nearest corner'
      : null;

    if (isStairShift && stairDirection) {
      return `This is an architectural floor plan drawing. Instruction: "${editInstruction}".
Your job is to RELOCATE the staircase/lift core to the ${stairDirection}.
STEPS:
1. Identify the current staircase symbol (the parallel step lines or elevator box) in the drawing.
2. ERASE it completely from its current position. Fill the erased area with the same wall or floor texture surrounding it — do not leave a blank void.
3. REDRAW the staircase using neat, evenly spaced parallel step lines (or an elevator box with an X or arrow inside) at the ${stairDirection} position, inside the nearest room boundary or wall cluster appropriate for a staircase.
4. Update the 'Up' direction arrow to reflect the new spatial orientation.
5. If the staircase had a label ('Staircase', 'S', 'Lift', 'L'), re-add that label at the new position.
6. Do NOT modify any other walls, wall lines, room labels, doors, windows, or the outer building boundary. Only the staircase block moves. Maintain the exact same black and white CAD drawing style throughout.`;
    }
    
    return `This is an architectural floor plan drawing. Look at this specific instruction regarding a staircase or lift core: "${editInstruction}".
Follow that instruction exactly. Draw or relocate the staircase using neat, parallel step lines showing the direction of ascent. Do NOT alter unrelated room structures, door positions, or labels. Maintain the exact same black and white CAD drawing style throughout.`;
  }

  if (instructionStr.includes('balcony') || instructionStr.includes('terrace') || instructionStr.includes('deck') || instructionStr.includes('patio') || instructionStr.includes('verandah')) {
    return `This is an architectural floor plan drawing. Look at this specific instruction regarding adding or modifying a balcony, terrace, deck, or patio: "${editInstruction}".
Follow that instruction exactly. Draw it as a clean exterior offset zone with thin borders, keeping it connected to the main building via a sliding door or standard doorway as requested. Do NOT distort internal rooms. Maintain the exact same black and white CAD drawing style throughout.`;
  }

  if (instructionStr.includes('extend') || instructionStr.includes('expand') || instructionStr.includes('enlarge') || instructionStr.includes('resize') || instructionStr.includes('widen') || instructionStr.includes('bigger')) {
    return `This is an architectural floor plan drawing. Look at this specific instruction regarding extending or expanding a section of the plan: "${editInstruction}".
Follow that instruction exactly. Shift the specified wall outwards to enlarge the room size while keeping all other walls, wall alignments, adjacent rooms, and double-line wall thicknesses consistent. Adjust room labels if needed. MARGIN RULE (CRITICAL): Maintain the exact same empty white margin gap around the entire building and do NOT crop or zoom in. Maintain the exact same black and white CAD drawing style throughout.`;
  }

  if (instructionStr.includes('garage') || instructionStr.includes('parking') || instructionStr.includes('carport')) {
    return `This is an architectural floor plan drawing. Look at this specific instruction regarding adding or modifying a garage or parking space: "${editInstruction}".
Follow that instruction exactly. Draw the parking or garage zone at the designated spot, labeled clearly with thin dashed or solid lines. Ensure the parking space structure blends cleanly with the main wall layout without distorting internal rooms. Maintain the exact same black and white CAD drawing style throughout.`;
  }

  // ─── SHIFT / MOVE / RELOCATE ─────────────────────────────────────────────
  // Handles: "shift the sofa to the north", "move the bed from bedroom A to bedroom B",
  //          "shift the dining table to the east corner", "relocate the wardrobe", etc.

  const isShiftMove = instructionStr.includes('shift') || instructionStr.includes('move') || instructionStr.includes('relocate') || instructionStr.includes('transfer') || instructionStr.includes('push') || instructionStr.includes('place');

  if (isShiftMove) {
    // Compass direction mapping
    const directionMap: Record<string, string> = {
      north: 'north (top of the drawing)',
      south: 'south (bottom of the drawing)',
      east: 'east (right side of the drawing)',
      west: 'west (left side of the drawing)',
      northeast: 'northeast (top-right corner of the drawing)',
      northwest: 'northwest (top-left corner of the drawing)',
      southeast: 'southeast (bottom-right corner of the drawing)',
      southwest: 'southwest (bottom-left corner of the drawing)',
      center: 'center of the room',
      corner: 'nearest corner of the room',
    };

    const detectedDirection = Object.keys(directionMap).find(d => instructionStr.includes(d));
    const directionLabel = detectedDirection ? directionMap[detectedDirection] : null;

    if (directionLabel) {
      return `This is an architectural floor plan drawing. Instruction: "${editInstruction}".
Your task is to SHIFT or MOVE the specified furniture/element to the ${directionLabel}.

STEPS (follow exactly in order):
1. Locate the furniture/element mentioned in the instruction (e.g., bed, sofa, dining table, wardrobe, bath, toilet, etc.) in the drawing.
2. ERASE it from its current position. Fill the erased area with clean solid white (the floor background). Do NOT leave any residue, ghost lines, or smudges.
3. REDRAW the same furniture symbol at the ${directionLabel} of the same room it currently occupies. Keep the furniture symbol exactly the same size and proportion. Align it naturally against the nearest wall or corner at the target position.
4. If multiple furniture items are grouped (e.g., a double bed with nightstands), move the entire group together as a unit.
5. Do NOT move or modify any walls, wall lines, room dividers, doors, door arcs, windows, room labels, text, or the outer building boundary. ONLY the specified furniture moves. Maintain the exact same black and white architectural drawing style throughout.`;
    }

    // Moving furniture FROM one room TO another room
    const isCrossRoomMove = /(from|between|to)/.test(instructionStr) && /(room|bedroom|kitchen|bathroom|living|hall|study|dining|lobby|balcony)/i.test(instructionStr);
    if (isCrossRoomMove) {
      return `This is an architectural floor plan drawing. Instruction: "${editInstruction}".
Your task is to MOVE the specified furniture from one room to another.

STEPS (follow exactly in order):
1. Identify the furniture item and the source room (the room it is currently in).
2. Identify the destination room (the room where it must be placed).
3. ERASE the furniture from the source room. Fill the erased floor area with clean solid white matching the room floor. Do NOT leave ghost lines or residue.
4. REDRAW the same furniture symbol inside the destination room at a sensible position (against the nearest wall or centered, as appropriate for that furniture type in architecture).
5. Keep the furniture symbol exactly the same size. Maintain natural architectural proportions.
6. Do NOT modify any walls, wall lines, room dividers, doors, door arcs, windows, room labels, text, or the outer building boundary. Only the specified furniture moves. Maintain the exact same black and white architectural drawing style throughout.`;
    }

    // Generic move/shift without explicit direction or destination
    return `This is an architectural floor plan drawing. Instruction: "${editInstruction}".
Your task is to move or reposition the specified furniture or element as described.

STEPS:
1. Identify the furniture/element mentioned.
2. ERASE it from its current position. Fill the erased area with clean solid white.
3. REDRAW it at the new position described in the instruction. Keep the same size and proportions.
4. Align the furniture naturally against walls or in open space, as appropriate for that element type in a real floor plan.
5. Do NOT modify walls, wall lines, room dividers, doors, windows, room labels, or the outer boundary. Only the specified element moves. Maintain the exact same black and white CAD drawing style throughout.`;
  }

  // ─── ROOM-LEVEL DIRECTIONAL ORIENTATION SHIFT ────────────────────────────
  // Handles: "shift the master bedroom to the south", "move the kitchen to the northeast corner"
  const isRoomShift = (instructionStr.includes('room') || instructionStr.includes('bedroom') || instructionStr.includes('kitchen') || instructionStr.includes('bathroom') || instructionStr.includes('living') || instructionStr.includes('hall') || instructionStr.includes('study') || instructionStr.includes('dining') || instructionStr.includes('lobby') || instructionStr.includes('balcony') || instructionStr.includes('garden') || instructionStr.includes('pool'));
  const roomDirectionMap: Record<string, string> = {
    north: 'north (top of the drawing)',
    south: 'south (bottom of the drawing)',
    east: 'east (right side of the drawing)',
    west: 'west (left side of the drawing)',
    northeast: 'northeast (top-right area)',
    northwest: 'northwest (top-left area)',
    southeast: 'southeast (bottom-right area)',
    southwest: 'southwest (bottom-left area)',
  };
  const roomDirection = Object.keys(roomDirectionMap).find(d => instructionStr.includes(d));
  if (isRoomShift && roomDirection) {
    return `This is an architectural floor plan drawing. Instruction: "${editInstruction}".
The architect wants to SHIFT the specified ROOM to the ${roomDirectionMap[roomDirection]} of the floor plan.

IMPORTANT — this is a structural room repositioning:
1. Identify the room mentioned (its walls, label, furniture, doors, and windows).
2. Carefully MOVE the entire room block — walls, interior furniture, label, door arcs, and windows — as a single unit to the ${roomDirectionMap[roomDirection]} of the floor plan.
3. RECONNECT the room's walls cleanly with adjacent walls at its new location. Walls must align perfectly — no gaps, overlaps, or diagonal distortions.
4. At the original position, fill the vacated area and extend the adjacent rooms or open space to absorb the freed-up zone cleanly.
5. Update door arcs to face the correct direction at the new position.
6. Do NOT change any rooms that were NOT mentioned. Do NOT alter the outer building boundary shape. Maintain the exact same double-line wall thickness and black and white CAD drawing style throughout.`;
  }

  // Fallback for general editing
  return `
Edit this 2D architectural floor plan. Apply ONLY this change and keep everything else identical:

Change: "${editInstruction}"
Plot: ${params.plotWidth || '?'}m x ${params.plotHeight || '?'}m

Rules:
- Keep 95% of the drawing unchanged
- MARGIN RULE (CRITICAL): You MUST perfectly preserve the exact same empty white margin gap around the building. Do NOT zoom in, enlarge, or crop the image. The building must remain exactly the same size and in the absolute center.
- Black lines on white background only, no colors
- Same thick double-line wall style
- If changing plot size: scale all rooms proportionally
- If swapping rooms: swap only the letter labels, walls stay the same
- If adding a room: draw it with double-line walls and a door arc, label with next letter
- If removing a room: erase its walls, merge space into adjacent room
- If notation like "A = 6m": replace the letter A with "6m" centered in that room
- Do NOT redraw the whole plan from scratch`;
};



export const FINAL_RENDER_PROMPT = (params: any = {}) => {
  const gardenText = params.garden 
    ? "The user has requested a garden/lawn. If there is an open outdoor zone (such as the 5x5 space or other marked open areas), render it as a lush green garden/lawn with realistic grass, shrubs, and vegetation. DO NOT render it as a swimming pool, concrete, or water body."
    : "Do not fill open spaces with grass unless indicated in the drawing.";
  
  const parkingText = params.parking
    ? "The user has requested parking. Render the designated parking/driveway area with outdoor tiles, gravel, or paved concrete."
    : "";

  const stylePrompts: Record<string, string> = {
    // Minimalist
    "Minimalist Modern": "Aesthetic style: Minimalist Modern. Emphasize clean, sleek lines, sparse decoration, a neutral color palette (whites, greys), large open spaces, and an uncluttered feel. Furniture should have simple geometric profiles.",
    "Japandi": "Aesthetic style: Japandi. Blend Japanese minimalism with Scandinavian functionality. Use warm natural light, light wood (oak, ash), bamboo accents, soft earth tones, low-profile furniture, and simple clean geometry in harmony with organic details.",
    "Scandinavian": "Aesthetic style: Scandinavian. Create a light, airy space with cozy textures, warm natural woods, highly functional furniture, and a light pastel or neutral color scheme.",
    "Bauhaus": "Aesthetic style: Bauhaus. Utilize primary colors, functional geometries, exposed steel pipe accents, glass panels, smooth concrete slabs, and a focus on clean industrial forms.",

    // Industrial
    "Industrial Loft": "Aesthetic style: Industrial Loft. Features exposed brick walls, concrete floors, massive black steel beams, high ceilings, large metal-framed industrial windows, and distressed wood trims.",
    "Brutalist": "Aesthetic style: Brutalist. Emphasize monolithic raw concrete surfaces (béton brut), chunky bold geometric shapes, heavy textured grey finishes, and a stark minimalist layout.",
    "Warehouse Conversion": "Aesthetic style: Warehouse Conversion. Create a multi-level loft feel with exposed ducts, pipes, distressed concrete, brickwork, open-plan spaces, and a combination of steel frames and warm timber.",
    "Steampunk": "Aesthetic style: Steampunk. Blend Victorian-era aesthetics with industrial mechanisms. Include polished copper/brass piping, exposed gears, dark polished mahogany wood, leather furniture, and glowing warm amber Edison bulbs.",

    // Modern
    "Contemporary": "Aesthetic style: Contemporary. Incorporate curved architectural profiles, cutting-edge materials, high-contrast black and white palettes, bold solid color accents, and highly polished glossy surfaces.",
    "Mid-Century Modern": "Aesthetic style: Mid-Century Modern. Use retro-organic forms, warm walnut wood surfaces, tapered thin legs on furniture, mustard yellow and teal blue color accents, and a classic mid-century furniture aesthetic.",
    "Hi-Tech": "Aesthetic style: Hi-Tech. Focus on an engineered aesthetic with exposed metal trusses, glass cladding, dynamic cool LED track lighting, automated devices, and clean metallic surfaces.",
    "Parametric/Deconstructivist": "Aesthetic style: Parametric/Deconstructivist. Feature complex organic curves, fluid parametric ribs, distorted non-Euclidean geometries, and futuristic carbon fiber or composite paneling.",

    // Organic/Natural
    "Biophilic": "Aesthetic style: Biophilic. Integrate nature deeply with living green walls, indoor water features, planters built directly into the structure, skylights, warm natural timber, and climbing plants.",
    "Earthen/Adobe": "Aesthetic style: Earthen/Adobe. Features terracotta tile floors, thick textured clay/mud walls, rounded corners, natural plaster, warm earth tones, and exposed wooden ceiling logs (vigas).",
    "Blob Architecture": "Aesthetic style: Blob Architecture. Create a fluid, organic form with bulbous curves, a smooth continuous white plaster shell, and custom rounded window frames.",
    "Mediterranean": "Aesthetic style: Mediterranean. White stucco walls, terracotta floor tiles, arched doorways, rustic dark timber beams, and accents of blue and warm earth tones.",

    // Historic/Classical
    "Gothic": "Aesthetic style: Gothic. Use pointed arch structures, dark stained oak floors, stone gargoyle motifs, gold-leaf details, deep crimson velvet fabrics, and high-contrast dramatic lighting.",
    "Renaissance": "Aesthetic style: Renaissance. Focus on symmetrical classical proportions, marble tiled floors, columns, pilasters, decorative fresco detailing, and gilded timber furnishings.",
    "Neoclassical": "Aesthetic style: Neoclassical. Incorporate grand classical columns, white and gold ornamentation, marble fireplaces, formal elegant furniture, and detailed wall moldings.",
    "Victorian": "Aesthetic style: Victorian. Use rich patterned wallpapers, dark mahogany wood paneling, ornate brass fittings, tufted velvet sofas, crown molding, and stained glass windows.",

    // Futuristic/Speculative
    "Cyberpunk": "Aesthetic style: Cyberpunk. Render with neon glowing signs, rain-slicked dark metallic finishes, exposed wiring/ducts, glowing holographic projection details, and high-contrast neon blue and pink accent lights.",
    "Sci-Fi": "Aesthetic style: Sci-Fi. Make it look like a futuristic spaceship interior with clean white composite panels, integrated circular blue LED strips, automatic sliding doors, and clean geometric control grids.",
    "Afrofuturist": "Aesthetic style: Afrofuturist. Fusion of traditional African cultural patterns and advanced technology. Include vibrantly patterned fabrics, organic mudbrick textures, glowing technological circuits, geometric wooden screens, and warm copper accents.",
    "Solarpunk": "Aesthetic style: Solarpunk. Create a bright, sunny eco-friendly environment with winding climbing vines, white ceramic structures, glass domes, integrated solar panels, and warm bronze gears.",

    // Luxury/Decorative
    "Contemporary Luxury": "Aesthetic style: Contemporary Luxury. Emphasize rich marble slabs with gold veining, polished brass trims, velvet furnishings, designer pendant lighting, and a sophisticated gold/black/taupe palette.",
    "Art Deco": "Aesthetic style: Art Deco. Bold geometric patterns, shiny chrome and gold metal accents, black lacquer wood, chevron/zigzag flooring, rich jewel tones, and opulent mirrors.",
    "Maximalist": "Aesthetic style: Maximalist. Layered patterns, bold mismatched colors, high visual density, eclectic antique furniture, and rich velvet and silk fabrics.",
    "Tropical Luxury": "Aesthetic style: Tropical Luxury. Incorporate open-air spaces, polished teak wood, large indoor palms and banana leaves, woven rattan/wicker details, and light linen fabrics."
  };

  const styleText = (params.renderStyle && stylePrompts[params.renderStyle]
    ? stylePrompts[params.renderStyle]
    : "Aesthetic style: Normal/Default. Render with realistic materials, clean white walls, natural wood and tile floors, and a standard modern architectural visualization style.")
    + " ABSOLUTELY DO NOT write, print, overlay, or draw any text labels, letters, room names, words, numbers, or symbols anywhere in the 3D render. All rooms must be completely free of text labels, text on floors, or written annotations.";

  const sunpathText = params.sunpathDirection
    ? `LIGHTING & SHADOWS: The sun is positioned in the ${params.sunpathDirection}. Cast extremely faint, light, soft, and highly diffuse shadows with very low opacity that fall towards the opposite side of the sun's position. The shadows must be barely visible, gentle, and semi-transparent, not dark, heavy, bold, black, or harsh. Dominant bright ambient natural daylight must fill the entire space.`
    : "LIGHTING & SHADOWS: Evenly lit from above with soft natural daylight, casting subtle diffuse shadows.";

  return `
You are a professional architectural visualizer. Convert this 2D floor plan into a premium photorealistic 3D bird's-eye view render.

${styleText}

${sunpathText}

STRICT RULES — follow these absolutely:
1. RENDER ONLY what is explicitly drawn in the input floor plan. Do NOT add, invent, or hallucinate any rooms, structures, or connecting elements that are not clearly present.
2. If two buildings are separated by a gap in the drawing, they MUST remain separated.
3. ${gardenText}
4. ${parkingText}
5. If an element is explicitly a swimming pool, render it as a swimming pool. Otherwise, DO NOT render pools.
6. Maintain the EXACT spatial layout of every room, gap, and open space.
7. PLOT BOUNDARY (CRITICAL): There is a solid black rectangular line drawn around the outside of the building. You MUST render this exact rectangular box as a physical 3D perimeter boundary wall or modern fence enclosing the property. The empty area inside this boundary wall (but outside the building) MUST be rendered as completely plain, bare ground (e.g., flat grey concrete or plain dirt) UNLESS the user explicitly drew a garden or parking area. DO NOT hallucinate random grass, trees, or landscaping in empty space.
8. TEXT REMOVAL (CRITICAL): The 2D input drawing has text labels (room names) written on the floor. In a 3D physical render, text floating on the floor makes no sense and will look blurred/deformed. You MUST completely ERASE and REMOVE all text, words, letters, and numbers from the image. Replace the areas where text was with the continuous flooring material of the room (wood, tile, concrete).

RENDERING QUALITY:
- STRICTLY top-down 90-degree bird's-eye view — the camera must be positioned DIRECTLY above the building looking STRAIGHT DOWN, perfectly orthographic. NO angle, NO tilt, NO isometric, NO perspective distortion whatsoever.
- The viewer should see the roof removed and look directly into the rooms from above, like a drone hovering directly overhead.
- Realistic materials: concrete walls, tiled floors, wooden doors, glass windows
- Soft natural daylight, evenly lit from above
- Interior visible: furniture placement, room colors matching room function
- Clean white or light grey background outside the plot boundary
- Professional architectural visualization quality
`;
};
