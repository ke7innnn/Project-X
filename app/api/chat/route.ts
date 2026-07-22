import { NextResponse } from 'next/server';
import { ARCHITECT_SYSTEM_PROMPT } from '@/lib/prompts';
import { ConversationMessage, Phase } from '@/types';

export const maxDuration = 120;

function detectPhaseTransition(messageText: string, currentPhase: Phase): Phase | null {
  const text = messageText.toLowerCase();
  
  if (currentPhase === 'vastu' || currentPhase === 'parameters' || currentPhase === 'generate' || currentPhase === 'concept') {
    if (text.includes('show me') || text.includes('generate') || text.includes('go ahead') || text.includes('perfect') || text.includes('try again') || text.includes('show more') || text.includes('regenerate') || text.includes('create floorplan') || text.includes('create floor plan')) {
      return 'generate';
    }
  }
  
  if (currentPhase === 'edit' || currentPhase === 'measure') {
    const exportKeywords = [
      'export', 'download', 'dwg', 'dxf', 'autocad', 
      'give me the file', 'get the file', 'next step', 
      'next stage', 'next section', 'move on', 'finalize',
      'next chapter', 'move to next', 'move to autocad', 'chapter',
      'move forward', 'proceed to autocad', 'done editing', 'done with edit'
    ];
    if (exportKeywords.some(kw => text.includes(kw))) {
      return 'export';
    }
  }

  return null;
}

function extractJsonFromText(text: string): string {
  // Method 1: direct brace extraction
  const firstBrace = text.indexOf('{');
  if (firstBrace !== -1) {
    let openBraces = 0;
    for (let i = firstBrace; i < text.length; i++) {
      if (text[i] === '{') openBraces++;
      if (text[i] === '}') {
        openBraces--;
        if (openBraces === 0) {
          return text.substring(firstBrace, i + 1);
        }
      }
    }
    // Partial — try last closing brace
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace !== -1) {
      return text.substring(firstBrace, lastBrace + 1);
    }
  }
  
  // Method 2: markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  
  return text;
}

// Models with their capabilities
const MODEL_CONFIG = [
  { model: 'deepseek/deepseek-chat', jsonMode: true, timeout: 45000 },
  { model: 'google/gemini-2.5-flash', jsonMode: true, timeout: 45000 },
  { model: 'meta-llama/llama-3.3-70b-instruct', jsonMode: false, timeout: 45000 },
  { model: 'anthropic/claude-3-haiku', jsonMode: true, timeout: 45000 },
];

async function callModelWithRetry(
  apiKey: string,
  messages: any[],
  config: typeof MODEL_CONFIG[0],
  maxRetries = 2
): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const body: any = {
        model: config.model,
        messages,
        temperature: 0.7,
      };
      if (config.jsonMode) {
        body.response_format = { type: 'json_object' };
      }

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Architect AI',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeout),
      });

      if (res.ok) {
        const data = await res.json();
        const rawText = data.choices?.[0]?.message?.content || '{}';
        return { rawText, model: config.model };
      }

      if (res.status === 429) throw new Error('429');
      
      const errText = await res.text().catch(() => 'unknown error');
      throw new Error(`${res.status}: ${errText}`);
    } catch (e: any) {
      if (e.message === '429') throw e; // Don't retry rate limits
      if (attempt === maxRetries) throw e;
      // Exponential backoff before retry
      const delay = 1000 * Math.pow(2, attempt);
      console.warn(`[chat] Model ${config.model} attempt ${attempt + 1} failed: ${e.message}. Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`All retries exhausted for ${config.model}`);
}

export async function POST(request: Request) {
  try {
    const { message, imageBase64, conversationHistory, collectedParameters, phase, onboardingMode, inpaintActive, inpaintRenderActive } = await request.json();

    let systemPrompt = ARCHITECT_SYSTEM_PROMPT
      .replace('{PARAMETERS_JSON}', JSON.stringify(collectedParameters, null, 2))
      .replace('{CURRENT_PHASE}', phase)
      .replace('{ONBOARDING_MODE}', onboardingMode || 'unknown');

    if (inpaintActive || inpaintRenderActive) {
      systemPrompt += "\n\nCRITICAL DIRECTIVE: The user has applied a green inpaint mask to their drawing/render and is asking you to modify it. You MUST set `isEditCommand: true` in your JSON output so their instruction is sent to the image generation backend.";
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY || 
                          process.env.GEMINI_API_KEY || 
                          process.env.GROQ_API_KEY || 
                          process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || 
                          process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!openRouterKey) {
      console.warn('[chat] No OpenRouter/Gemini API key found in environment variables. Using smart offline fallback.');
      
      // Extract parameter updates from user text via keyword rules
      const msgLower = (message || '').toLowerCase().trim();
      const updatedParameters: any = {};
      
      // Plot dimensions detection (e.g. 30x40, 30 by 40, 30 ft by 40 ft)
      const dimMatch = msgLower.match(/(\d+)\s*(?:ft|m|meter|feet)?\s*(?:x|by|\*)\s*(\d+)/);
      if (dimMatch) {
        updatedParameters.plotWidth = parseInt(dimMatch[1]);
        updatedParameters.plotHeight = parseInt(dimMatch[2]);
      }
      
      // Floors detection
      const floorMatch = msgLower.match(/(\d+)\s*(?:story|stories|floor|floors)/);
      if (floorMatch) {
        updatedParameters.floors = parseInt(floorMatch[1]);
      }

      // Check for nature reference search query
      let searchQuery: string | null = null;
      const natureKeywords = ['coral', 'leaf', 'honeycomb', 'wood', 'tree', 'bamboo', 'stone', 'marble', 'wave', 'pinecone', 'nature', 'biophilic', 'organic', 'pattern', 'texture', 'plant', 'forest', 'sun', 'water', 'feather', 'shell', 'moss', 'flower', 'leafs'];
      const isNatureTerm = natureKeywords.some(kw => msgLower.includes(kw));
      const lastMsgText = conversationHistory && conversationHistory.length > 0 ? (conversationHistory[conversationHistory.length - 1]?.parts?.[0]?.text?.toLowerCase() || '') : '';
      const wasAskedForNature = lastMsgText.includes('nature reference') || lastMsgText.includes('looking for');

      if (isNatureTerm || wasAskedForNature || (phase === 'concept' && msgLower.length > 0 && msgLower.length < 50)) {
        searchQuery = message.trim();
      }
      
      let newPhase = detectPhaseTransition(message, phase);
      let replyText = "I'm ready to assist with your architectural project!";
      
      if (searchQuery) {
        replyText = `Searching nature library for "${searchQuery}" concept references... Select your preferred reference from the moodboard below!`;
      } else if (updatedParameters.plotWidth && updatedParameters.plotHeight) {
        replyText = `Understood! I've logged plot dimensions of ${updatedParameters.plotWidth}m x ${updatedParameters.plotHeight}m. What specific room layout or style parameters would you like?`;
      } else if (newPhase === 'generate') {
        replyText = "I'll start generating your initial floor plan options right away!";
      } else if (message) {
        replyText = `Noted: "${message}". Let's continue shaping your architectural concept!`;
      }
      
      const updatedHistory = [...(conversationHistory || []), { role: 'model', parts: [{ text: replyText }] }];
      
      return NextResponse.json({
        reply: replyText,
        updatedHistory,
        newPhase,
        isEditCommand: false,
        updatedParameters,
        searchQuery
      });
    }

    const rawMessages = conversationHistory.map((msg: any) => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.parts.map((p: any) => p.text).join('\n')
    }));

    if (rawMessages.length === 0 && message) {
      rawMessages.push({ role: 'user', content: message });
    }

    // Squash consecutive same-role messages (some models reject them)
    const squashedMessages: any[] = [];
    for (const msg of rawMessages) {
      if (squashedMessages.length > 0 && squashedMessages[squashedMessages.length - 1].role === msg.role) {
        squashedMessages[squashedMessages.length - 1].content += '\n' + msg.content;
      } else {
        squashedMessages.push(msg);
      }
    }

    // Ensure the current user message is always present at the end of the history
    // If the client stripped it (e.g. search phase) and 'message' is empty but we have an image,
    // we need to push an empty user message so the image has a place to attach.
    if ((message || imageBase64) && (squashedMessages.length === 0 || squashedMessages[squashedMessages.length - 1].role !== 'user')) {
      squashedMessages.push({ role: 'user', content: message || '' });
    }

    // Append image to the last user message if provided
    if (imageBase64 && squashedMessages.length > 0) {
      const lastMsg = squashedMessages[squashedMessages.length - 1];
      if (lastMsg.role === 'user') {
        const textContent = lastMsg.content;
        const systemDirective = "\n\n[SYSTEM: The user just uploaded a reference image. Acknowledge it immediately according to CONVERSATION RULE 2.]";
        lastMsg.content = [
          { type: 'text', text: textContent ? textContent + systemDirective : systemDirective },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
        ];
      }
    }

    const messages = [
      {
        role: 'system',
        content: `${systemPrompt}\n\nCRITICAL: You MUST respond with a valid JSON object matching the requested schema. Do not include any explanations, code blocks, or text outside the JSON object.`
      },
      ...squashedMessages
    ];

    // Filter models: if image is present, only use models that support vision
    const availableModels = imageBase64 
      ? MODEL_CONFIG.filter(m => m.model.includes('gemini') || m.model.includes('claude'))
      : MODEL_CONFIG;

    // Try each model in order, with per-model retries
    let rawText = '{}';
    let successfulModel = '';
    let lastError: any = null;

    for (const config of availableModels) {
      try {
        console.log(`[chat] Trying ${config.model}...`);
        const result = await callModelWithRetry(openRouterKey, messages, config);
        rawText = result.rawText;
        successfulModel = result.model;
        console.log(`[chat] Success with ${successfulModel}`);
        lastError = null;
        break;
      } catch (e: any) {
        lastError = e;
        if (e.message === '429') throw e; // Propagate rate limit immediately
        console.warn(`[chat] Model ${config.model} exhausted all retries: ${e.message}`);
      }
    }

    if (lastError) throw lastError; // All models failed

    // Parse JSON — try multiple strategies
    let parsed: any = {};
    try {
      const cleanedText = extractJsonFromText(rawText);
      parsed = JSON.parse(cleanedText.trim());
    } catch (parseErr: any) {
      // Final fallback: regex-extract just the reply field so the user at least sees something
      console.error('[chat] JSON parse failed for model', successfulModel, ':', parseErr.message);
      console.error('[chat] Raw text was:', rawText.substring(0, 500));
      
      const replyMatch = rawText.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const salvagedReply = replyMatch?.[1]
        ? replyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
        : "I'm here and listening. Could you rephrase that?";
      
      parsed = { reply: salvagedReply, newPhase: null, updatedParameters: {} };
    }

    let replyText = parsed.reply || "I'm listening. What would you like to do?";
    const updatedParameters = parsed.updatedParameters || {};
    let newPhase = parsed.newPhase || detectPhaseTransition(message, phase);
    const isEditCommand = parsed.isEditCommand !== undefined ? !!parsed.isEditCommand : false;
    let searchQuery = parsed.searchQuery || null;
    if (!searchQuery) {
      const msgLower = (message || '').toLowerCase().trim();
      const natureKeywords = ['coral', 'leaf', 'honeycomb', 'wood', 'tree', 'bamboo', 'stone', 'marble', 'wave', 'pinecone', 'nature', 'biophilic', 'organic', 'pattern', 'texture', 'plant', 'forest', 'sun', 'water', 'feather', 'shell', 'moss', 'flower', 'leafs'];
      const isNatureTerm = natureKeywords.some(kw => msgLower.includes(kw));
      const lastMsgText = conversationHistory && conversationHistory.length > 0 ? (conversationHistory[conversationHistory.length - 1]?.parts?.[0]?.text?.toLowerCase() || '') : '';
      const wasAskedForNature = lastMsgText.includes('nature reference') || lastMsgText.includes('looking for');

      if (isNatureTerm || wasAskedForNature || (phase === 'concept' && msgLower.length > 0 && msgLower.length < 50)) {
        searchQuery = message.trim();
      }
    }
    let customMessage = null;

    // Prevent accidental phase regression from edit/measure back to generate
    if ((phase === 'edit' || phase === 'measure') && newPhase === 'generate') {
      const generateKeywords = ['regenerate', 'generate again', 'start over', 'new draft', 'new options', 'new floor plans', 'new layout', 'generate'];
      const userMessageLower = message.toLowerCase().trim();
      if (!generateKeywords.some(kw => userMessageLower.includes(kw))) {
        newPhase = null;
      }
    }

    // Prevent accidental export phase transition
    const exportKeywords = [
      'export', 'download', 'dwg', 'dxf', 'autocad', 
      'give me the file', 'get the file', 'next step', 
      'next stage', 'next section', 'move on', 'finalize',
      'next chapter', 'move to next', 'move to autocad', 'chapter',
      'move forward', 'proceed to autocad', 'done editing', 'done with edit'
    ];
    const affirmations = ['yes', 'okay', 'ok', 'sure', 'go ahead', 'yep', 'confirm', 'proceed'];
    const userMessageLower = message.toLowerCase().trim();
    const userExplicitlyWantsExport = exportKeywords.some(kw => userMessageLower.includes(kw)) || 
                                     (affirmations.some(aff => userMessageLower.includes(aff)) && !isEditCommand);
    if (newPhase === 'export' && !userExplicitlyWantsExport) {
      newPhase = null;
    }

    if (newPhase === 'generate' && phase !== 'edit' && phase !== 'measure') {
      replyText += "\n\nI'll start generating your floor plans right away!";
    }

    if (newPhase === 'export') {
      customMessage = {
        role: 'model',
        parts: [{ text: 'Your DXF file is ready! Import it into AutoCAD Raster Design — it will automatically trace all walls and rooms. Come back after your adjustments and upload the refined drawing here.' }],
        customType: 'download-button',
        customData: { url: '/api/export-dwg' }
      };
    }

    const updatedHistory = [...conversationHistory, { role: 'model', parts: [{ text: replyText }] }];
    if (customMessage) updatedHistory.push(customMessage);

    return NextResponse.json({ 
      reply: replyText, 
      updatedHistory,
      newPhase,
      isEditCommand,
      updatedParameters,
      searchQuery
    });
  } catch (error: any) {
    console.error('[chat] Fatal error:', error.message);
    if (error.message === '429') {
      return NextResponse.json({ reply: "I'm thinking hard! Give me a moment...", retry: true }, { status: 429 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
