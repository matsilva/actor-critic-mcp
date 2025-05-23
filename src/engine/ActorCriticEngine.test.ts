import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuid } from 'uuid';

import { ActorCriticEngine } from './ActorCriticEngine.js';
import { KnowledgeGraphManager, type DagNode } from './KnowledgeGraph.js';
import { Actor } from '../agents/Actor.js';
import { SummarizationAgent } from '../agents/Summarize.js';
import type { Critic } from '../agents/Critic.js';
import { Tag } from './tags.js';
import { createLogger, setGlobalLogger, getInstance as getLogger } from '../logger.js';

const logger = createLogger({ withFile: false, withDevStdout: true });
setGlobalLogger(logger);

describe('ActorCriticEngine', () => {
  let kg: KnowledgeGraphManager;
  let testDir: string;
  let logFile: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `ac-engine-${uuid()}`);
    await fs.mkdir(testDir, { recursive: true });
    logFile = path.join(testDir, 'knowledge_graph.ndjson');

    kg = new KnowledgeGraphManager(getLogger());
    // @ts-expect-error accessing private property for test
    kg.logFilePath = logFile;
    await kg.init();
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('actorThink adds nodes and triggers critic review when a file artifact is mentioned', async () => {
    const summarizationAgent = {
      checkAndTriggerSummarization: vi.fn().mockResolvedValue(undefined),
    } as unknown as SummarizationAgent;

    const critic = {
      review: vi.fn(async ({ actorNodeId, project, projectContext }) => {
        const target = (await kg.getNode(actorNodeId)) as DagNode;
        const mentionsFile = /\.[a-zA-Z]+/.test(target.thought);
        const verdict = mentionsFile && !target.artifacts?.length ? 'needs_revision' : 'approved';
        const node: DagNode = {
          id: uuid(),
          project,
          projectContext,
          thought: verdict === 'approved' ? '✔ Approved' : '✏ Needs revision',
          role: 'critic',
          verdict,
          parents: [actorNodeId],
          children: [],
          tags: [],
          artifacts: [],
          createdAt: '',
          target: actorNodeId,
        };
        await kg.appendEntity(node);
        const actor = (await kg.getNode(actorNodeId)) as DagNode | null;
        if (actor && !actor.children.includes(node.id)) {
          actor.children.push(node.id);
          await kg.appendEntity(actor);
        }
        return node;
      }),
    } as unknown as Critic;

    const engine = new ActorCriticEngine(kg, critic, new Actor(kg), summarizationAgent);

    const criticNode = await engine.actorThink({
      thought: 'Modify src/app.ts',
      tags: [Tag.Task],
      project: 'proj',
      projectContext: '/path/to/proj',
      artifacts: [],
    });

    const nodes = await kg.allDagNodes('proj');
    const actorNode = nodes.filter((n) => n.role === 'actor').pop();
    const storedCritic = nodes.find((n) => n.role === 'critic');

    expect(actorNode).toBeDefined();
    expect(storedCritic).toBeDefined();
    expect(criticNode.id).toBe(storedCritic?.id);
    expect(storedCritic?.parents).toEqual([actorNode!.id]);
    expect(actorNode?.children).toContain(storedCritic?.id);
    expect(storedCritic?.verdict).toBe('needs_revision');
  });

  it('criticReview appends a critic node and updates links', async () => {
    const summarizationAgent = {
      checkAndTriggerSummarization: vi.fn().mockResolvedValue(undefined),
    } as unknown as SummarizationAgent;

    const critic = {
      review: vi.fn(async ({ actorNodeId, project, projectContext }) => {
        const node: DagNode = {
          id: uuid(),
          project,
          projectContext,
          thought: '✔ Approved',
          role: 'critic',
          verdict: 'approved',
          parents: [actorNodeId],
          children: [],
          tags: [],
          artifacts: [],
          createdAt: '',
          target: actorNodeId,
        };
        await kg.appendEntity(node);
        const target = (await kg.getNode(actorNodeId)) as DagNode | null;
        if (target && !target.children.includes(node.id)) {
          target.children.push(node.id);
          await kg.appendEntity(target);
        }
        return node;
      }),
    } as unknown as Critic;

    const engine = new ActorCriticEngine(kg, critic, new Actor(kg), summarizationAgent);

    const { node: actorNode } = await new Actor(kg).think({
      thought: 'Initial thought',
      tags: [Tag.Task],
      project: 'proj',
      projectContext: '/path/to/proj',
      artifacts: [],
    });

    const criticNode = await engine.criticReview({
      actorNodeId: actorNode.id,
      projectContext: '/path/to/proj',
      project: 'proj',
    });

    const updatedActor = await kg.getNode(actorNode.id);
    expect(criticNode.role).toBe('critic');
    expect(criticNode.parents).toEqual([actorNode.id]);
    expect(updatedActor?.children).toContain(criticNode.id);
  });

  it('invokes summarization when threshold met', async () => {
    const summarizationAgent = new SummarizationAgent(kg);
    const createSummary = vi.spyOn(summarizationAgent, 'createSummary').mockResolvedValue({
      id: uuid(),
      project: 'proj',
      projectContext: '/path/to/proj',
      thought: 'summary',
      role: 'summary',
      parents: [],
      children: [],
      createdAt: '',
      summarizedSegment: [],
      tags: [Tag.Summary],
      artifacts: [],
    });

    const SA = SummarizationAgent as unknown as { SUMMARIZATION_THRESHOLD: number };
    const originalThreshold = SA.SUMMARIZATION_THRESHOLD;
    SA.SUMMARIZATION_THRESHOLD = 1;

    const critic = {
      review: vi.fn(async ({ actorNodeId, project, projectContext }) => {
        const node: DagNode = {
          id: uuid(),
          project,
          projectContext,
          thought: '✔ Approved',
          role: 'critic',
          verdict: 'approved',
          parents: [actorNodeId],
          children: [],
          tags: [],
          artifacts: [],
          createdAt: '',
          target: actorNodeId,
        };
        await kg.appendEntity(node);
        const target = (await kg.getNode(actorNodeId)) as DagNode | null;
        if (target && !target.children.includes(node.id)) {
          target.children.push(node.id);
          await kg.appendEntity(target);
        }
        return node;
      }),
    } as unknown as Critic;

    const engine = new ActorCriticEngine(kg, critic, new Actor(kg), summarizationAgent);

    await engine.actorThink({
      thought: 'Work on src/app.ts',
      tags: [Tag.Task],
      project: 'proj',
      projectContext: '/path/to/proj',
      artifacts: [{ name: 'file', path: 'src/app.ts' }],
    });

    expect(createSummary).toHaveBeenCalled();
    SA.SUMMARIZATION_THRESHOLD = originalThreshold;
  });
});
