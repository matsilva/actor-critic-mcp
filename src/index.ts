import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ActorCriticEngine, ActorThinkSchema } from './engine/ActorCriticEngine.ts';
import { KnowledgeGraphManager } from './engine/KnowledgeGraph.ts';
import { Critic } from './agents/Critic.ts';
import { Actor } from './agents/Actor.ts';
import { SummarizationAgent } from './agents/Summarize.ts';
import pkg from '../package.json' with { type: 'json' };
import { CodeLoopsLogger, getInstance as getLogger, setGlobalLogger } from './logger.ts';
import { extractProjectName } from './utils/project.ts';

// -----------------------------------------------------------------------------
// MCP Server -------------------------------------------------------------------
// -----------------------------------------------------------------------------

/**
 * Utilities for main entry point
 */

const runOnceOnProjectLoad = ({ logger }: { logger: CodeLoopsLogger }) => {
  return (project: string) => {
    const child = logger.child({ project });
    setGlobalLogger(child);
  };
};

const loadProjectOrThrow = async ({
  logger,
  args,
  onProjectLoad,
}: {
  logger: CodeLoopsLogger;
  args: { projectContext: string };
  onProjectLoad: (project: string) => void;
}) => {
  const projectName = extractProjectName(args.projectContext);
  if (!projectName) {
    logger.error({ projectContext: args.projectContext }, 'Invalid projectContext');
    throw new Error(`Invalid projectContext: ${args.projectContext}`);
  }
  onProjectLoad(projectName);
  return projectName;
};

/**
 * Main entry point for the CodeLoops MCP server.
 */
async function main() {
  // Initialize logger
  const logger = getLogger();
  const runOnce = runOnceOnProjectLoad({ logger });
  logger.info('Starting CodeLoops MCP server...');

  // Create KnowledgeGraphManager
  const kg = new KnowledgeGraphManager(logger);
  await kg.init();

  // Create SummarizationAgent with KnowledgeGraphManager
  const summarizationAgent = new SummarizationAgent(kg);

  // Create other dependencies
  const critic = new Critic(kg);
  const actor = new Actor(kg);

  // Create ActorCriticEngine with all dependencies
  const engine = new ActorCriticEngine(kg, critic, actor, summarizationAgent);

  const server = new McpServer({ name: 'codeloops', version: pkg.version });

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
    const projectName = await loadProjectOrThrow({ logger, args, onProjectLoad: runOnce });
    const node = await engine.actorThink({
      ...args,
      project: projectName,
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(node, null, 2),
        },
      ],
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
    'Call this tool when you want explicit feedback on your thought, idea or final implementation of a task.',
    {
      actorNodeId: z.string().describe('ID of the actor node to critique.'),
      projectContext: z.string().describe('Full path to the project directory.'),
    },
    async (a) => {
      const projectName = await loadProjectOrThrow({ logger, args: a, onProjectLoad: runOnce });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              await engine.criticReview({
                actorNodeId: a.actorNodeId,
                projectContext: a.projectContext,
                project: projectName,
              }),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'get_node',
    'Get a specific node by ID',
    {
      id: z.string().describe('ID of the node to retrieve.'),
    },
    async (a) => {
      const node = await kg.getNode(a.id);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(node, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'get_neighbors',
    'Get a node along with its parents and children up to the requested depth',
    {
      id: z.string().describe('ID of the node to retrieve neighbors for.'),
      projectContext: z.string().describe('Full path to the project directory.'),
      depth: z
        .number()
        .optional()
        .describe('How many levels of neighbors to include. Defaults to 1.'),
    },
    async (a) => {
      await loadProjectOrThrow({
        logger,
        args: { projectContext: a.projectContext },
        onProjectLoad: runOnce,
      });
      const nodes = await kg.getNeighbors(a.id, a.depth);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(nodes, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'resume',
    'Pick up where you left off by fetching the most recent nodes from the knowledge graph for this project. Use limit to control the number of nodes returned. Increase it if you need more context.',
    {
      projectContext: z.string().describe('Full path to the project directory.'),
      limit: z
        .number()
        .optional()
        .describe('Limit the number of nodes returned. Increase it if you need more context.'),
    },
    async (a) => {
      const projectName = await loadProjectOrThrow({ logger, args: a, onProjectLoad: runOnce });
      const text = await kg.resume({
        project: projectName,
        limit: a.limit,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(text, null, 2) }],
      };
    },
  );

  /** export – dump the current graph */
  server.tool(
    'export',
    'dump the current knowledge graph, with optional limit',
    {
      limit: z.number().optional().describe('Limit the number of nodes returned.'),
      projectContext: z.string().describe('Full path to the project directory.'),
    },
    async (a) => {
      const projectName = await loadProjectOrThrow({ logger, args: a, onProjectLoad: runOnce });
      const nodes = await kg.export({ project: projectName, limit: a.limit });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(nodes, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'search_nodes',
    'Search nodes by tags and/or text query',
    {
      projectContext: z.string().describe('Full path to the project directory.'),
      tags: z.array(z.string()).optional().describe('Tags to match.'),
      query: z.string().optional().describe('Substring to search for in thoughts.'),
      limit: z.number().optional().describe('Limit the number of nodes returned.'),
    },
    async (a) => {
      const projectName = await loadProjectOrThrow({ logger, args: a, onProjectLoad: runOnce });
      const nodes = await kg.search({
        project: projectName,
        tags: a.tags,
        query: a.query,
        limit: a.limit,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(nodes, null, 2),
          },
        ],
      };
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
