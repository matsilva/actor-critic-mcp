import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ActorCriticEngine, ActorThinkSchema } from './engine/ActorCriticEngine.ts';
import { KnowledgeGraphManager } from './engine/KnowledgeGraph.ts';
import { Critic } from './agents/Critic.ts';
import { RevisionCounter } from './engine/RevisionCounter.ts';
import { Actor } from './agents/Actor.ts';
import { SummarizationAgent } from './agents/Summarize.ts';
import { version as VERSION } from '../package.json';
import { getInstance as getLogger } from './logger.ts';
import { extractProjectName } from './utils/projectUtils.ts';

// -----------------------------------------------------------------------------
// MCP Server -------------------------------------------------------------------
// -----------------------------------------------------------------------------

async function main() {
  // Initialize logger
  const logger = getLogger();
  logger.info('Starting CodeLoops MCP server...');

  // Create KnowledgeGraphManager
  const kg = new KnowledgeGraphManager();
  await kg.init();

  // Create SummarizationAgent with KnowledgeGraphManager
  const summarizationAgent = new SummarizationAgent(kg);

  // Create other dependencies
  const revisionCounter = new RevisionCounter(RevisionCounter.MAX_REVISION_CYCLES);
  const critic = new Critic(kg, revisionCounter);
  const actor = new Actor(kg);

  // Create ActorCriticEngine with all dependencies
  const engine = new ActorCriticEngine(kg, critic, actor, summarizationAgent);

  const server = new McpServer({ name: 'codeloops', version: VERSION });

  const ACTOR_THINK_DESCRIPTION = `
  Add a new thought node to the CodeLoops knowledge graph to plan, execute, or document coding tasks.
  
  **Purpose**: This is the **primary tool** for interacting with the actor-critic system. It records your work, triggers critic reviews when needed, and guides you through iterative development. **You must call 'actor_think' iteratively** after every significant action to ensure your work is reviewed and refined.
  
  **Instructions**:
  1. **Call 'actor_think' for all actions**:
     - Planning, requirement capture, task breakdown, or coding steps.
     - Use the 'projectContext' property to specify the full path to the currently open directory.
  2. **Always include at least one semantic tag** (e.g., 'requirement', 'task', 'file-modification', 'task-complete') to enable searchability and trigger appropriate reviews.
  3. **Iterative Workflow**:
     - File modifications or task completions automatically trigger critic reviews.
     - Use the critic's feedback (in 'criticNode') to refine your next thought.
  4. **Tags and artifacts are critical for tracking decisions and avoiding duplicate work**.
  
  **Example Workflow**:
  - Step 1: Call 'actor_think' with thought: "Create main.ts with initial setup", projectContext: "/path/to/project", artifacts: ['src/main.ts'], tags: ['file-modification'].
      - Response: Includes feedback from the critic
  - Step 2:  Make any necessary changes and call 'actor_think' again with the updated thought.
  - Repeat until the all work is completed.
  
  **Note**: Do not call 'critic_review' directly unless debugging; 'actor_think' manages reviews automatically.
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
  server.tool('actor_think', ACTOR_THINK_DESCRIPTION, ActorThinkSchema, async (args) => {
    const projectName = extractProjectName(args.projectContext);
    if (!projectName) {
      logger.error({ projectContext: args.projectContext }, 'Invalid projectContext');
      throw new Error('Invalid projectContext');
    }
    await kg.tryLoadProject(projectName);
    return {
      content: [{ type: 'text', text: JSON.stringify(await engine.actorThink(args), null, 2) }],
    };
  });

  // -----------------------------------------------------------------------------
  // Tool definitions ---------------------------------------------------------------------
  // -----------------------------------------------------------------------------

  /**
   * critic_review – manually evaluates an actor node.
   *
   */
  server.tool(
    'critic_review',
    {
      actorNodeId: z.string().describe('ID of the actor node to critique.'),
      projectContext: z.string().describe('Full path to the project directory.'),
    },
    async (a) => {
      const projectName = extractProjectName(a.projectContext);
      if (!projectName) {
        logger.error({ projectContext: a.projectContext }, 'Invalid projectContext');
        throw new Error('Invalid projectContext');
      }
      await kg.tryLoadProject(projectName);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(await engine.criticReview(a.actorNodeId, projectName), null, 2),
          },
        ],
      };
    },
  );

  /** list_branches – quick overview for navigation */
  server.tool(
    'list_branches',
    { projectContext: z.string().describe('Full path to the project directory.') },
    async (a) => {
      const projectName = extractProjectName(a.projectContext);
      if (!projectName) {
        logger.error({ projectContext: a.projectContext }, 'Invalid projectContext');
        throw new Error('Invalid projectContext');
      }
      await kg.tryLoadProject(projectName);
      return {
        content: [{ type: 'text', text: JSON.stringify(kg.listBranches(projectName), null, 2) }],
      };
    },
  );

  /** resume – fetch WINDOW‑sized recent context for a branch */
  server.tool(
    'resume',
    {
      projectContext: z.string().describe('Full path to the project directory.'),
      branchId: z.string().describe('Branch id OR label'),
    },
    async (a) => {
      const projectName = extractProjectName(a.projectContext);
      if (!projectName) {
        logger.error({ projectContext: a.projectContext }, 'Invalid projectContext');
        throw new Error('Invalid projectContext');
      }
      await kg.tryLoadProject(projectName);
      return {
        content: [{ type: 'text', text: kg.resume(a.branchId, projectName) }],
      };
    },
  );

  /** export_plan – dump the current graph, optionally filtered by tag */
  server.tool(
    'export_plan',
    {
      projectContext: z.string().describe('Full path to the project directory.'),
      filterTag: z.string().optional().describe('Return only nodes containing this tag.'),
    },
    async (a) => {
      const projectName = extractProjectName(a.projectContext);
      if (!projectName) {
        logger.error({ projectContext: a.projectContext }, 'Invalid projectContext');
        throw new Error('Invalid projectContext');
      }
      await kg.tryLoadProject(projectName);
      return {
        content: [
          { type: 'text', text: JSON.stringify(kg.exportPlan(projectName, a.filterTag), null, 2) },
        ],
      };
    },
  );

  /** summarize_branch – generate a summary for a specific branch */
  server.tool(
    'summarize_branch',
    {
      projectContext: z.string().describe('Full path to the project directory.'),
      branchId: z.string().describe('Branch id OR label'),
    },
    async (args) => {
      const projectName = extractProjectName(args.projectContext);
      if (!projectName) {
        logger.error({ projectContext: args.projectContext }, 'Invalid projectContext');
        throw new Error('Invalid projectContext');
      }
      await kg.tryLoadProject(projectName);
      try {
        const summary = await engine.summarizeBranch(args.branchId, projectName);

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
          const branches = kg.listBranches(projectName);
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
                    tip: 'Check logs for detailed error information.',
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
      } catch (error) {
        const logger = getLogger();
        logger.error({ error }, '[summarize_branch] Error:');
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
  server.tool(
    'list_projects',
    {
      projectContext: z
        .string()
        .optional()
        .describe(
          'Optional full path to the project directory. If provided, the project name will be extracted and highlighted as current.',
        ),
    },
    async (a) => {
      let activeProject: string | null = null;
      if (a.projectContext) {
        const projectName = extractProjectName(a.projectContext);
        if (!projectName) {
          throw new Error('Invalid projectContext');
        }
        activeProject = projectName;
      }
      const projects = await kg.listProjects();

      logger.info(
        `[list_projects] Current project: ${activeProject}, Available projects: ${projects.join(', ')}`,
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                activeProject,
                projects,
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
  logger.info('CodeLoops MCP server running on stdio');
}

main().catch((err) => {
  const logger = getLogger();
  logger.error({ err }, 'Fatal error in main');
  process.exit(1);
});
