import { GoogleGenAI, type Content } from '@google/genai';
import { GENAI_THINKING_BUDGET } from '../config.ts';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable not set');
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

function normalize(input: string | Content[]): Content[] {
  return typeof input === 'string' ? [{ role: 'user', parts: [{ text: input }] }] : input;
}

export async function generateGeminiContent({
  model,
  contents,
}: {
  model: string;
  contents: string | Content[];
}): Promise<string> {
  const normalized = normalize(contents);
  const result = await ai.models.generateContent({
    model,
    contents: normalized,
    config: {
      thinkingConfig: { thinkingBudget: GENAI_THINKING_BUDGET },
    },
  });

  return result.text ?? '';
}
