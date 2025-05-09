// actor-critic-mcp.ts – v0.4 (May 1 2025)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ActorCriticEngine, ActorThinkSchema } from './engine/ActorCriticEngine.ts';
import { KnowledgeGraphManager } from './engine/KnowledgeGraph.ts';
import { ProjectManager } from './engine/ProjectManager.ts';
import { Critic, CriticSchema } from './agents/Critic.ts';
import { RevisionCounter } from './engine/RevisionCounter.ts';
import { Actor } from './agents/Actor.ts';
import { SummarizationAgent } from './agents/Summarize.ts';

// -----------------------------------------------------------------------------
// MCP Server -------------------------------------------------------------------
// -----------------------------------------------------------------------------

async function main() {
  // Create ProjectManager first
  const projectManager = new ProjectManager();

  // Create KnowledgeGraphManager with ProjectManager
  const kg = new KnowledgeGraphManager(projectManager);
  await kg.init();

  // Create SummarizationAgent with KnowledgeGraphManager
  const summarizationAgent = new SummarizationAgent(kg);

  // Create other dependencies
  const revisionCounter = new RevisionCounter(RevisionCounter.MAX_REVISION_CYCLES);
  const critic = new Critic(kg, revisionCounter);
  const actor = new Actor(kg);

  // Create ActorCriticEngine with all dependencies
  const engine = new ActorCriticEngine(kg, critic, actor, summarizationAgent);

  const server = new McpServer({ name: 'actor-critic-mcp', version: '0.4.0' });

  const ACTOR_THINK_DESCRIPTION = `
  Add a new thought node to the knowledge‑graph.

  • Use for any creative / planning step, requirement capture, task break‑down, etc.
  • **Always include at least one semantic 'tag'** so future searches can find this node
    – e.g. requirement, task, risk, design, definition.
  • **If your thought references a file you just created or modified**, list it in the 'artifacts' array.
  • Use 'branchLabel' **only** on the first node of an alternative approach.
  • Think of 'tags' + 'artifacts' as the breadcrumbs that future you (or another
    agent) will follow to avoid duplicate work or forgotten decisions.
  *
  `;

  /**
   * actor_think - Add a new thought node to the knowledge graph.
   *
   * This is the primary tool for interacting with the actor-critic system.
   * It automatically triggers critic reviews when appropriate, so you don't
   * need to call critic_review separately in most cases.
   *
   * The response will include:
   * - The actor node if no critic review was triggered
   * - The critic node if a review was automatically triggered
   */
  server.tool('actor_think', ACTOR_THINK_DESCRIPTION, ActorThinkSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await engine.actorThink(args), null, 2) }],
  }));

  // -----------------------------------------------------------------------------
  // Tool definitions ---------------------------------------------------------------------
  // -----------------------------------------------------------------------------

  /**
   * critic_review – manually evaluates an actor node.
   *
   * NOTE: In most cases, you don't need to call this directly.
   * The actor_think function automatically triggers critic reviews when:
   * 1. A certain number of steps have been taken (configured by CRITIC_EVERY_N_STEPS)
   * 2. The actor indicates the thought doesn't need more work (needsMore=false)
   *
   * This tool is primarily useful for:
   * - Manual intervention in the workflow
   * - Forcing a review of a specific previous node
   * - Debugging or testing purposes
   */
  server.tool('critic_review', CriticSchema, async (a) => ({
    content: [
      { type: 'text', text: JSON.stringify(await engine.criticReview(a.actorNodeId), null, 2) },
    ],
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
  server.tool(
    'export_plan',
    { filterTag: z.string().optional().describe('Return only nodes containing this tag.') },
    async (a) => ({
      content: [{ type: 'text', text: JSON.stringify(kg.exportPlan(a.filterTag), null, 2) }],
    }),
  );

  /** summarize_branch – generate a summary for a specific branch */
  server.tool(
    'summarize_branch',
    {
      branchId: z.string().describe('Branch id OR label'),
    },
    async (args) => {
      try {
        const summary = await engine.summarizeBranch(args.branchId);

        if (summary) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(summary, null, 2),
              },
            ],
          };
        } else {
          // If summarization failed, get the branch information to provide context
          const branches = kg.listBranches();
          const targetBranch = branches.find(
            (b) => b.branchId === args.branchId || b.head.branchLabel === args.branchId,
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: true,
                    message:
                      'Summarization failed. This could be due to insufficient nodes, already summarized content, or an error in the summarization process.',
                    branchInfo: targetBranch
                      ? {
                          branchId: targetBranch.branchId,
                          label: targetBranch.head.branchLabel,
                          depth: targetBranch.depth,
                        }
                      : null,
                    tip: 'Check console logs for detailed error information.',
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
      } catch (error) {
        console.error(`[summarize_branch] Error:`, error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: `Summarization error: ${error instanceof Error ? error.message : String(error)}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );

  /** list_projects – list all available knowledge graph projects */
  server.tool('list_projects', {}, async () => {
    const current = projectManager.getCurrentProject();
    const projects = projectManager.listProjects();

    console.log(
      `[list_projects] Current project: ${current}, Available projects: ${projects.join(', ')}`,
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              current,
              projects,
            },
            null,
            2,
          ),
        },
      ],
    };
  });

  /** switch_project – switch to a different knowledge graph project */
  server.tool(
    'switch_project',
    {
      projectName: z
        .string()
        .min(1, 'Project name cannot be empty')
        .max(50, 'Project name is too long (max 50 characters)')
        .regex(
          /^[a-zA-Z0-9_-]+$/,
          'Project name can only contain letters, numbers, dashes, and underscores',
        )
        .describe('Name of the project to switch to'),
    },
    async (a) => {
      console.log(`[switch_project] Attempting to switch to project: ${a.projectName}`);

      const result = await kg.switchProject(a.projectName);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: result.success,
                message: result.message,
                current: projectManager.getCurrentProject(),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  /** create_project – create a new knowledge graph project */
  server.tool(
    'create_project',
    {
      projectName: z
        .string()
        .min(1, 'Project name cannot be empty')
        .max(50, 'Project name is too long (max 50 characters)')
        .regex(
          /^[a-zA-Z0-9_-]+$/,
          'Project name can only contain letters, numbers, dashes, and underscores',
        )
        .describe('Name of the new project to create'),
    },
    async (a) => {
      console.log(`[create_project] Attempting to create project: ${a.projectName}`);

      const result = await projectManager.createProject(a.projectName);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: result.success,
                message: result.message,
                current: projectManager.getCurrentProject(),
                projects: projectManager.listProjects(),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
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
