import { execa } from 'execa';
import { to } from 'await-to-js';
import path from 'node:path';
import { getInstance as getLogger } from '../logger.ts';
import { fileURLToPath } from 'node:url';
import { v4 as uuid } from 'uuid';
import { DagNode, KnowledgeGraphManager, SummaryNode } from '../engine/KnowledgeGraph.ts';
import { Tag } from '../engine/tags.ts';

// Maximum length for debug output (500 chars - much more reasonable for frequent logging)
const MAX_DEBUG_LENGTH = 500;

/**
 * SummarizationAgent provides an interface to the Python-based summarization agent.
 * It handles serialization/deserialization of node data and processes the agent's response.
 * It also manages the summarization logic for the knowledge graph.
 */
export class SummarizationAgent {
  private readonly agentPath: string;

  // Number of nodes after which to trigger summarization
  private static SUMMARIZATION_THRESHOLD = (() => {
    const env = process.env.SUMMARIZATION_THRESHOLD;
    const parsed = env ? parseInt(env, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
  })();

  /**
   * Creates a new SummarizationAgent.
   * @param knowledgeGraph The knowledge graph manager instance
   * @param pythonCommand Python command to use (defaults to 'uv')
   * @param pythonArgs Additional arguments for the Python command (defaults to ['run'])
   */
  constructor(
    private readonly knowledgeGraph: KnowledgeGraphManager,
    private readonly pythonCommand: string = 'uv',
    private readonly pythonArgs: string[] = ['run'],
  ) {
    // Get the path to the summarize agent directory
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.agentPath = path.resolve(__dirname, '..', '..', 'agents', 'summarize');
  }

  /**
   * Summarizes a segment of nodes from the knowledge graph.
   * @param nodes Array of DagNode objects to summarize
   * @returns A promise that resolves to an object containing the summary text and any error
   */
  async summarize(nodes: DagNode[]): Promise<{ summary: string; error?: string }> {
    try {
      // Serialize the nodes to JSON
      const nodesJson = JSON.stringify(nodes);

      // Only log essential info, not debug data
      getLogger().info(`[summarize] Processing ${nodes.length} nodes (${(nodesJson.length / 1024).toFixed(1)}KB)`);

      // Call the Python agent using execa
      const [execError, output] = await to(
        execa(this.pythonCommand, [...this.pythonArgs, 'agent.py', '--quiet', '--summarize'], {
          cwd: this.agentPath,
          input: nodesJson,
        }),
      );

      // Handle execution errors
      if (execError) {
        getLogger().error({ execError }, 'Summarization agent execution error');
        return {
          summary: '',
          error: `Failed to execute summarization agent: ${execError.message}`,
        };
      }

      // Handle stderr output - only log if there's an actual error
      if (output.stderr && output.stderr.length > 0) {
        const isActualError = output.stderr.includes('Error') || 
                             output.stderr.includes('Exception') || 
                             output.stderr.includes('Traceback');
        
        if (isActualError) {
          getLogger().error({ stderr: output.stderr.slice(0, 200) }, 'Summarization agent error');
        }
        // Don't log verbose output at all
      }

      // Parse the response with improved error handling
      let response;
      try {
        response = JSON.parse(output.stdout.trim());
      } catch (parseError) {
        const err = parseError as Error;
        getLogger().error({ parseError: err.message }, 'Failed to parse summarization response');
        return { summary: '', error: `Failed to parse JSON response: ${err.message}` };
      }

      // Check if response has the expected format
      if (response.error) {
        return { summary: '', error: response.error };
      }

      if (response.summary) {
        return { summary: response.summary };
      }

      // If the response doesn't match the expected format
      if (typeof response !== 'object' || response === null) {
        return {
          summary: output.stdout.trim(),
          error: 'Response format not recognized, using raw output as summary',
        };
      }

      // Fallback for unexpected valid JSON object response
      return {
        summary: '',
        error: 'Unexpected response format: no summary or error provided',
      };
    } catch (error) {
      const err = error as Error;
      return {
        summary: '',
        error: `Unexpected error during summarization: ${err.message}`,
      };
    }
  }

  /**
   * Checks if summarization is needed and triggers it if necessary.
   * This should be called after adding new nodes to the graph.
   */
  async checkAndTriggerSummarization({
    project,
    projectContext,
  }: {
    project: string;
    projectContext: string;
  }): Promise<void> {
    const nodes = await this.knowledgeGraph.resume({
      project,
      limit: SummarizationAgent.SUMMARIZATION_THRESHOLD,
    });

    const lastSummaryIndex = nodes.findIndex((node) => node.role === 'summary');
    const nodesToSummarize = nodes.slice(lastSummaryIndex + 1);

    // Only summarize branches that have enough nodes
    if (nodesToSummarize.length >= SummarizationAgent.SUMMARIZATION_THRESHOLD) {
      await this.createSummary({
        project,
        projectContext,
        nodes: nodesToSummarize,
      });
    }
  }

  /**
   * Creates a summary for a segment of nodes.
   * @param nodes Nodes to summarize
   * @throws Error if summarization fails
   */
  async createSummary({
    nodes,
    projectContext,
    project,
  }: {
    nodes: DagNode[];
    projectContext: string;
    project: string;
  }): Promise<SummaryNode> {
    if (!nodes || nodes.length === 0) {
      throw new Error('Cannot create summary: No nodes provided');
    }

    getLogger().info(`[createSummary] Creating summary for ${nodes.length} nodes`);

    const result = await this.summarize(nodes);

    // Check for errors in the summarization result
    if (result.error) {
      getLogger().error({ error: result.error }, `[createSummary] Summarization agent error:`);
      throw new Error(`Summarization failed: ${result.error}`);
    }

    // Validate the summary content
    if (!result.summary || result.summary.trim() === '') {
      getLogger().error(`[createSummary] Summarization agent returned empty summary`);
      throw new Error('Summarization failed: Empty summary returned');
    }

    // Create a summary node
    const summaryNode: SummaryNode = {
      id: uuid(),
      project,
      thought: result.summary,
      role: 'summary',
      parents: [nodes[nodes.length - 1].id], // Link to the newest node in the segment
      children: [],
      createdAt: '', // Will be set by appendEntity
      projectContext,
      summarizedSegment: nodes.map((node) => node.id),
      tags: [Tag.Summary],
      artifacts: [],
    };

    getLogger().info(`[createSummary] Created summary node with ID ${summaryNode.id}`);

    // Persist the summary node
    await this.knowledgeGraph.appendEntity(summaryNode);

    // Update the last node to include the summary node in its children
    const lastNode = nodes[nodes.length - 1];
    if (lastNode && !lastNode.children.includes(summaryNode.id)) {
      lastNode.children.push(summaryNode.id);
      await this.knowledgeGraph.appendEntity(lastNode);
    }

    return summaryNode;
  }
}
