import { NextResponse } from 'next/server';
import { ARCHITECT_SYSTEM_PROMPT } from '@/lib/prompts';
import { ConversationMessage, Phase } from '@/types';

function detectPhaseTransition(messageText: string, currentPhase: Phase): Phase | null {
  const text = messageText.toLowerCase();
  
  if (currentPhase === 'vastu' || currentPhase === 'parameters' || currentPhase === 'generate') {
    if (text.includes('show me') || text.includes('generate') || text.includes('go ahead') || text.includes('perfect') || text.includes('try again') || text.includes('show more') || text.includes('regenerate')) {
      return 'generate';
    }
  }
  
  if (currentPhase === 'edit' || currentPhase === 'measure') {
    const exportKeywords = [
      'export', 'download', 'dwg', 'dxf', 'autocad', 
      'give me the file', 'get the file', 'next step', 
      'next stage', 'next section', 'move on', 'finalize'
    ];
    if (exportKeywords.some(kw => text.includes(kw))) {
      return 'export';
    }
  }

  // Add more transitions as needed based on the logic requested
  return null;
}

function cleanJsonResponse(text: string): string {
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return text;
  
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
  
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace !== -1) {
    return text.substring(firstBrace, lastBrace + 1);
  }
  return text;
}

export async function POST(request: Request) {
  try {
    const { message, imageBase64, conversationHistory, collectedParameters, phase } = await request.json();

    // The logic: 
    // We send the parameters to Gemini injected in the system prompt.
    const systemPrompt = ARCHITECT_SYSTEM_PROMPT
      .replace('{PARAMETERS_JSON}', JSON.stringify(collectedParameters, null, 2))
      .replace('{CURRENT_PHASE}', phase);

    const responseSchema = {
      type: "OBJECT",
      properties: {
        reply: {
          type: "STRING",
          description: "Conversational response to the user. Maintain your architect persona and sign off with exactly ONE question."
        },
        newPhase: {
          type: "STRING",
          description: "The next phase if transitioning, otherwise null. The phase flow is: 'concept' -> 'parameters' -> 'vastu' -> 'generate' -> 'measure' -> 'edit' -> 'export'.",
          enum: ["concept", "parameters", "vastu", "generate", "measure", "edit", "export"]
        },
        isEditCommand: {
          type: "BOOLEAN",
          description: "Set to true ONLY if the user's message is an explicit imperative instruction to modify or edit the layout (e.g. 'add pool', 'remove room'). Set to false if they are asking a question (e.g., starting with 'can we', 'is it possible', 'why', 'how') or just chatting."
        },
        updatedParameters: {
          type: "OBJECT",
          description: "Partially or fully updated collected parameters based on new information from the user's message. Preserve existing values if they are not updated.",
          properties: {
            plotWidth: { type: "NUMBER" },
            plotHeight: { type: "NUMBER" },
            plotArea: { type: "NUMBER" },
            orientation: { type: "STRING" },
            rooms: { 
              type: "ARRAY", 
              items: { type: "STRING" },
              description: "Concise list of room requirements requested by the user. Limit to maximum 10 items."
            },
            vastuRules: { 
              type: "ARRAY", 
              items: { type: "STRING" },
              description: "Vastu Shastra rules mentioned or requested by the user. Keep this concise and limit to maximum 5 items. Only include rules explicitly agreed upon."
            },
            sunPath: { type: "STRING" },
            garden: { type: "BOOLEAN" },
            parking: { type: "BOOLEAN" },
            floors: { type: "INTEGER" },
            surroundings: { type: "STRING" },
            additionalNotes: { 
              type: "ARRAY", 
              items: { type: "STRING" },
              description: "Any other miscellaneous requirements or notes. Limit to maximum 5 items."
            }
          }
        }
      },
      required: ["reply", "isEditCommand"]
    };

    const primaryKey = process.env.GROQ_API_KEY;
    const fallbackKey = process.env.GROQ_API_KEY_FALLBACK;
    const groqApiKeys = [primaryKey, fallbackKey].filter(Boolean);

    if (groqApiKeys.length === 0) throw new Error('No GROQ API keys found in environment');

    const rawMessages = conversationHistory.map((msg: any) => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.parts.map((p: any) => p.text).join('\n')
    }));

    if (rawMessages.length === 0 && message) {
      rawMessages.push({ role: 'user', content: message });
    }

    const squashedMessages: any[] = [];
    for (const msg of rawMessages) {
      if (squashedMessages.length > 0 && squashedMessages[squashedMessages.length - 1].role === msg.role) {
        squashedMessages[squashedMessages.length - 1].content += '\n' + msg.content;
      } else {
        squashedMessages.push(msg);
      }
    }

    // Groq's llama-3.1-8b-instant has an incredibly high free limit and does not suffer from the 100k TPD limit of the 70b model.
    // It is also not currently experiencing a 503 outage like Google AI Studio.
    const modelToUse = 'llama-3.1-8b-instant';

    const messages = [
      {
        role: 'system',
        content: `${systemPrompt}\n\nCRITICAL: You MUST respond with a valid JSON object matching the requested schema. Do not include any explanations, code blocks, or text outside the JSON object.`
      },
      ...squashedMessages
    ];

    console.log(`[Groq] Calling ${modelToUse} for chat. History length: ${conversationHistory.length}`);

    let groqResponse;
    let lastError: { status: number; text: string } | null = null;

    for (let i = 0; i < groqApiKeys.length; i++) {
      const key = groqApiKeys[i];
      try {
        groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: modelToUse,
            messages,
            temperature: 0.7,
            max_tokens: 2048,
            response_format: { type: 'json_object' }
          }),
          signal: AbortSignal.timeout(30000)
        });

        if (groqResponse.ok) {
          lastError = null;
          break; // Success, exit the waterfall loop
        } else {
          const errText = await groqResponse.text();
          lastError = { status: groqResponse.status, text: errText };
          console.warn(`[Groq Waterfall] Key ${i + 1} failed with status ${groqResponse.status}. Attempting next key if available...`);
        }
      } catch (e: any) {
        lastError = { status: 500, text: e.message };
        console.warn(`[Groq Waterfall] Key ${i + 1} fetch failed: ${e.message}. Attempting next key if available...`);
      }
    }

    if (lastError) {
      if (lastError.status === 429) {
        throw new Error('429');
      }
      throw new Error(`Groq API Error (${modelToUse}): ${lastError.status} — ${lastError.text}`);
    }

    const groqData = await groqResponse!.json();
    const rawText = groqData.choices?.[0]?.message?.content || '{}';
    const cleanedText = cleanJsonResponse(rawText);

    let parsed: any = {};
    try {
      parsed = JSON.parse(cleanedText.trim());
    } catch (e) {
      console.error('Failed to parse Groq JSON response:', rawText, cleanedText, e);
      const replyMatch = rawText.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      let salvagedReply = "I'm processing your requirements but encountered a glitch. Could you repeat that?";
      if (replyMatch && replyMatch[1]) {
        try {
          salvagedReply = JSON.parse(`"${replyMatch[1]}"`);
        } catch(err) {
          salvagedReply = replyMatch[1];
        }
      }
      parsed = {
        reply: salvagedReply,
        newPhase: null,
        updatedParameters: {}
      };
    }

    let replyText = parsed.reply || "I'm not sure what to say.";
    const updatedParameters = parsed.updatedParameters || {};
    let newPhase = parsed.newPhase || detectPhaseTransition(message, phase);
    const isEditCommand = parsed.isEditCommand !== undefined ? !!parsed.isEditCommand : false;
    let customMessage = null;

    // CRITICAL: Never allow phase to regress back to 'generate' once the user is
    // in edit or measure. The AI sometimes sets newPhase='generate' when it says
    // "shall I generate?" — this would reset the user to the concept selection screen.
    if ((phase === 'edit' || phase === 'measure') && newPhase === 'generate') {
      newPhase = null; // Stay in current phase, never go back to concept selection
    }

    // CRITICAL: Only allow export phase transition if the user EXPLICITLY asked for it or confirmed/affirmed it.
    // Prevent the AI's "shall I export?" → user says "yes [to something else]" → accidental export.
    const exportKeywords = [
      'export', 'download', 'dwg', 'dxf', 'autocad', 
      'give me the file', 'get the file', 'next step', 
      'next stage', 'next section', 'move on', 'finalize'
    ];
    const affirmations = ['yes', 'okay', 'ok', 'sure', 'go ahead', 'yep', 'confirm', 'proceed'];
    const userMessageLower = message.toLowerCase().trim();
    const userExplicitlyWantsExport = exportKeywords.some(kw => userMessageLower.includes(kw)) || 
                                     (affirmations.some(aff => userMessageLower.includes(aff)) && !isEditCommand);
    if (newPhase === 'export' && !userExplicitlyWantsExport) {
      newPhase = null; // Stay in edit phase, user didn't ask for export
    }

    if (newPhase === 'generate' && phase !== 'edit' && phase !== 'measure') {
      replyText += "\n\nI'll start generating your floor plans right away!";
    }

    if (newPhase === 'export') {
      customMessage = {
        role: 'model',
        parts: [{ text: 'Your DXF file is ready! Import it into AutoCAD Raster Design — it will automatically trace all walls and rooms. Come back after your adjustments and upload the refined drawing here.' }],
        customType: 'download-button',
        customData: {
          url: '/api/export-dwg',
        }
      };
    }

    // Add model response to history
    const updatedHistory = [...conversationHistory, { role: 'model', parts: [{ text: replyText }] }];
    
    if (customMessage) {
      updatedHistory.push(customMessage);
    }

    return NextResponse.json({ 
      reply: replyText, 
      updatedHistory,
      newPhase,
      isEditCommand,
      updatedParameters
    });
  } catch (error: any) {
    console.error('Chat error:', error);
    if (error.message === '429') {
      return NextResponse.json({ reply: "I'm thinking hard! Give me a moment...", retry: true }, { status: 429 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
