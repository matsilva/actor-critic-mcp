import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateSpy = vi.fn();

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: generateSpy.mockResolvedValue({ response: { text: () => 'ok' } }),
      },
    })),
  };
});

beforeEach(() => {
  vi.resetModules();
  generateSpy.mockClear();
  process.env.GEMINI_API_KEY = 'dummy';
  process.env.GENAI_THINKING_BUDGET = '5';
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GENAI_THINKING_BUDGET;
});

describe('generateGeminiContent', () => {
  it('passes thinkingBudget to generateContent', async () => {
    const { generateGeminiContent } = await import('./genai.ts');
    await generateGeminiContent({ model: 'gemini-test', contents: 'hello' });
    expect(generateSpy).toHaveBeenCalledWith({
      model: 'gemini-test',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      config: { thinkingConfig: { thinkingBudget: 5 } },
    });
  });
});
