import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createSpy = vi.fn();

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      caches: { create: createSpy.mockResolvedValue({ name: 'cache-1' }) },
    })),
  };
});

beforeEach(() => {
  vi.resetModules();
  createSpy.mockClear();
  process.env.GEMINI_API_KEY = 'dummy';
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe('getCacheId', () => {
  it('creates a cache when prompt not cached', async () => {
    const { getCacheId } = await import('./geminiCache.ts');
    const id = await getCacheId('hello');
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(id).toBe('cache-1');
  });

  it('reuses existing cache id for same prompt', async () => {
    const { getCacheId } = await import('./geminiCache.ts');
    const first = await getCacheId('hello');
    const second = await getCacheId('hello');
    expect(first).toBe(second);
    expect(createSpy).toHaveBeenCalledTimes(1);
  });
});
