// actor-critic-mcp.ts – v0.4 (May 1 2025)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ActorCriticEngine, ActorThinkSchema } from './ActorCriticEngine.ts';
import { KnowledgeGraphManager } from './KnowledgeGraph.ts';
import { Critic, CriticSchema } from './actor-critic/Critic.ts';
import { RevisionCounter } from './actor-critic/RevisionCounter.ts';
import { Actor } from './actor-critic/Actor.ts';
import { CFG } from './config.ts';

//TODO:
// now that components are refactored...
// 1 by 1 improve each component based on the temporal difference problems
// additionally create new components needed to solve the problems

// -----------------------------------------------------------------------------
// MCP Server -------------------------------------------------------------------
// -----------------------------------------------------------------------------

async function main() {
  const kg = new KnowledgeGraphManager(CFG.MEMORY_FILE_PATH);
  await kg.init();
  const revisionCounter = new RevisionCounter(RevisionCounter.MAX_REVISION_CYCLES);
  const critic = new Critic(kg, revisionCounter);
  const actor = new Actor(kg);
  const engine = new ActorCriticEngine(kg, critic, actor);

  const server = new McpServer({ name: 'actor-critic-mcp', version: '0.4.0' });

  server.tool('actor_think', ActorThinkSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await engine.actorThink(args), null, 2) }],
  }));

  // -----------------------------------------------------------------------------
  // Tool definitions ---------------------------------------------------------------------
  // -----------------------------------------------------------------------------

  /**
   * critic_review – evaluates an actor node. Call after every ~3 actor steps,
   * or sooner if the agent is uncertain.
   */
  server.tool('critic_review', CriticSchema, async (a) => ({
    content: [{ type: 'text', text: JSON.stringify(await engine.criticReview(a.actorNodeId), null, 2) }],
  }));

  /** list_branches – quick overview for navigation */
  server.tool('list_branches', {}, async () => ({
    content: [{ type: 'text', text: JSON.stringify(kg.listBranches(), null, 2) }],
  }));

  /** resume – fetch WINDOW‑sized recent context for a branch */
  server.tool('resume', { branchId: z.string().describe('Branch id OR label') }, async (a) => ({
    content: [{ type: 'text', text: kg.resume(a.branchId) }],
  }));

  /** export_plan – dump the current graph, optionally filtered by tag */
  server.tool('export_plan', { filterTag: z.string().optional().describe('Return only nodes containing this tag.') }, async (a) => ({
    content: [{ type: 'text', text: JSON.stringify(kg.exportPlan(a.filterTag), null, 2) }],
  }));

  /** summarize_branch – generate a summary for a specific branch */
  server.tool(
    'summarize_branch',
    {
      branchId: z.string().describe('Branch id OR label'),
    },
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await engine.summarizeBranch(args.branchId), null, 2) }],
    })
  );

  // ------------------------------------------------------------------
  // Transport: stdio JSON‑over‑MCP -----------------------------------
  // ------------------------------------------------------------------
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('ActorCritic MCP server running on stdio');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
