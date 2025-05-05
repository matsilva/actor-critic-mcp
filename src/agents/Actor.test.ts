import { describe, expect, it } from 'vitest';
import { Actor } from './Actor.ts';

describe('Actor', () => {
  it('should create a new thought node', async () => {
    const actor = new Actor({} as any); // Mock KnowledgeGraphManager
    const thought = 'This is a new thought';
    const tags = ['tag1', 'tag2'];
    const { node } = await actor.think({ thought, tags });
    expect(node.thought).toBe(thought);
    expect(node.tags).toEqual(tags);
  });
});
