import { GoogleGenAI, type Content } from '@google/genai';
import { GEMINI_CACHE_TTL } from '../config.ts';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable not set');
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const promptCache = new Map<string, string>();

export async function getCacheId(prompt: string, ttl: number = GEMINI_CACHE_TTL): Promise<string> {
  if (promptCache.has(prompt)) {
    return promptCache.get(prompt)!;
  }

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];
  const response = await ai.caches.create({
    model: 'gemini-1.5-flash',
    config: {
      contents,
      ttl: `${ttl}s`,
      displayName: `prompt-${Math.random().toString(36).slice(2)}`,
    },
  });

  const cacheId = response.name as string;
  promptCache.set(prompt, cacheId);
  return cacheId;
}
