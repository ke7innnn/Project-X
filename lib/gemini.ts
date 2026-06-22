import { ConversationMessage } from '@/types';

/**
 * Supported Gemini models via the official Google Generative Language API.
 *
 * Image-generation models (require responseModalities: ['image', 'text']):
 *   - gemini-2.5-flash-image   → fast, cheap base generation (fal-ai/gemini-2.5-flash-image on fal)
 *   - gemini-3.1-flash-image-preview → higher quality renders
 *
 * Text models:
 *   - gemini-2.5-flash          → fast text / JSON chat
 *   - gemini-2.5-flash-lite     → cheapest text / JSON chat
 *   - gemini-3.1-flash-lite     → fast text / JSON chat (Gemini 3.1 series)
 */
type GeminiModel =
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-flash-image'
  | 'gemini-3.1-flash-lite'
  | 'gemini-3.1-flash-image-preview'
  | 'gemini-3-pro-image';

interface GeminiRequestOptions {
  model: GeminiModel;
  systemPrompt?: string;
  history?: ConversationMessage[];
  message?: string;
  imageBase64?: string; // Optional image for multimodal requests
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: any;
  responseModalities?: string[]; // e.g. ['image', 'text']
  timeoutMs?: number; // Optional timeout in ms
}

export async function callGemini(options: GeminiRequestOptions) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing');

  const {
    model,
    systemPrompt,
    history = [],
    message,
    imageBase64,
    temperature = 0.7,
    maxOutputTokens = 1000,
    responseMimeType,
    responseSchema,
    responseModalities,
    timeoutMs = 30000,
  } = options;

  // Build contents array from history + new message
  let contents: any[];

  // Allow callers to pass fully custom contents (e.g. multi-image requests)
  if ((options as any)._customContents) {
    contents = (options as any)._customContents;
  } else {
    contents = history.map((msg) => ({
      role: msg.role,
      parts: msg.parts.map((p: any) => {
        const cleanPart: any = {};
        if (p.text !== undefined) cleanPart.text = p.text;
        if (p.inlineData !== undefined) cleanPart.inlineData = p.inlineData;
        return cleanPart;
      }),
    }));

    if (message || imageBase64) {
      const parts: any[] = [];
      if (message) parts.push({ text: message });
      if (imageBase64) {
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBase64,
          },
        });
      }
      contents.push({ role: 'user', parts });
    }
  }

  const requestBody: any = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(responseMimeType ? { responseMimeType } : {}),
      ...(responseSchema ? { responseSchema } : {}),
      ...(responseModalities ? { responseModalities } : {}),
    },
  };

  if (systemPrompt) {
    requestBody.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('429'); // Special handling for rate limits
      }
      const errorText = await response.text();
      console.error('[callGemini] API Error:', errorText);
      throw new Error(`Gemini API Error (${model}): ${response.status} — ${errorText}`);
    }

    const data = await response.json();
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}
