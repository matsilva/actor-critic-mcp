import { execa } from 'execa';
import { to } from 'await-to-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuid } from 'uuid';
import { DagNode, KnowledgeGraphManager, SummaryNode } from '../engine/KnowledgeGraph.ts';

export interface SummarizationResult {
  summary: string | SummaryNode | null;
  success: boolean;
  error?: string;
  errorCode?:
    | 'BRANCH_NOT_FOUND'
    | 'INSUFFICIENT_NODES'
    | 'ALREADY_SUMMARIZED'
    | 'SUMMARIZATION_ERROR';
  errorMessage?: string;
  details?: string;
}

/**
 * SummarizationAgent provides an interface to the Python-based summarization agent.
 * It handles serialization/deserialization of node data and processes the agent's response.
 * It also manages the summarization logic for the knowledge graph.
 */
export class SummarizationAgent {
  private readonly agentPath: string;

  // Number of nodes after which to trigger summarization
  private static SUMMARIZATION_THRESHOLD = 20;

  // Maximum number of nodes to include in a summary
  private static SUMMARY_CHUNK_SIZE = 10;

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
   * @returns A promise that resolves to a SummarizationResult with just the summary text
   */
  async summarize(nodes: DagNode[]): Promise<{ summary: string; error?: string }> {
    try {
      // Serialize the nodes to JSON
      const nodesJson = JSON.stringify(nodes);

      // Call the Python agent using execa
      const [execError, output] = await to(
        execa(this.pythonCommand, [...this.pythonArgs, 'agent.py', '--summarize'], {
          cwd: this.agentPath,
          input: nodesJson,
        }),
      );

      // Handle execution errors
      if (execError) {
        console.error('Summarization agent execution error:', execError);
        return {
          summary: '',
          error: `Failed to execute summarization agent: ${execError.message}`,
        };
      }

      // Handle stderr output
      if (output.stderr) {
        console.error('Summarization agent error:', output.stderr);
      }

      // Parse the response
      try {
        // The agent should return a JSON object with a summary field
        const response = JSON.parse(output.stdout.trim());

        if (response.error) {
          return { summary: '', error: response.error };
        }

        if (response.summary) {
          return { summary: response.summary };
        }

        // If the response doesn't match the expected format, try to extract a summary
        return {
          summary: output.stdout.trim(),
          error: 'Response format not recognized, using raw output as summary',
        };
      } catch (parseError) {
        // If the response isn't valid JSON, use the raw output as the summary
        return {
          summary: output.stdout.trim(),
          error: `Failed to parse agent response: ${parseError.message}`,
        };
      }
    } catch (error) {
      return {
        summary: '',
        error: `Unexpected error during summarization: ${error.message}`,
      };
    }
  }

  /**
   * Checks if summarization is needed and triggers it if necessary.
   * This should be called after adding new nodes to the graph.
   */
  async checkAndTriggerSummarization(): Promise<void> {
    const branches = this.knowledgeGraph.listBranches();

    for (const branch of branches) {
      // Only summarize branches that have enough nodes
      if (branch.depth >= SummarizationAgent.SUMMARIZATION_THRESHOLD) {
        await this.summarizeBranch(branch.branchId);
      }
    }
  }

  /**
   * Summarizes the oldest segment of nodes in a branch.
   * @param branchId ID of the branch to summarize
   * @returns A SummarizationResult object containing the summary or error information
   */
  async summarizeBranch(branchId: string): Promise<SummarizationResult> {
    // Get the branch head
    const head = this.knowledgeGraph.getNode(branchId);
    if (!head) {
      console.error(`[summarizeBranch] Branch not found: ${branchId}`);
      return {
        summary: null,
        success: false,
        errorCode: 'BRANCH_NOT_FOUND',
        errorMessage: `Branch with ID or label "${branchId}" not found`,
      };
    }

    // Collect all nodes in the branch
    const branchNodes: DagNode[] = [];
    let current: DagNode | undefined = head;

    while (current) {
      branchNodes.push(current);
      current = current.parents[0] ? this.knowledgeGraph.getNode(current.parents[0]) : undefined;
    }

    // Reverse to get chronological order
    branchNodes.reverse();

    // Log branch information for debugging
    console.log(`[summarizeBranch] Branch ${branchId} has ${branchNodes.length} nodes`);

    // Check if the branch has enough nodes to meet the summarization threshold
    if (branchNodes.length < SummarizationAgent.SUMMARIZATION_THRESHOLD) {
      return {
        summary: null,
        success: false,
        errorCode: 'INSUFFICIENT_NODES',
        errorMessage: `Branch has only ${branchNodes.length} nodes, which is below the summarization threshold of ${SummarizationAgent.SUMMARIZATION_THRESHOLD}`,
        details: `Current nodes: ${branchNodes.length}, Required: ${SummarizationAgent.SUMMARIZATION_THRESHOLD}`,
      };
    }

    // Check if we already have summaries for this branch
    const existingSummaries = branchNodes.filter(
      (node): node is SummaryNode =>
        node.role === 'summary' && node.summarizedSegment !== undefined,
    );

    console.log(`[summarizeBranch] Branch has ${existingSummaries.length} existing summaries`);

    // Determine which nodes need to be summarized
    let nodesToSummarize: DagNode[] = [];

    if (existingSummaries.length === 0) {
      // If no summaries exist, summarize the oldest chunk
      nodesToSummarize = branchNodes.slice(
        0,
        Math.min(SummarizationAgent.SUMMARY_CHUNK_SIZE, branchNodes.length),
      );
    } else {
      // Find the newest summary
      const newestSummary = existingSummaries.reduce((newest, current) => {
        const newestDate = new Date(newest.createdAt);
        const currentDate = new Date(current.createdAt);
        return currentDate > newestDate ? current : newest;
      }, existingSummaries[0]);

      // Find nodes that were created after the newest summary but are old enough to summarize
      const summaryIndex = branchNodes.findIndex((node) => node.id === newestSummary.id);

      if (
        summaryIndex !== -1 &&
        branchNodes.length - summaryIndex > SummarizationAgent.SUMMARIZATION_THRESHOLD
      ) {
        nodesToSummarize = branchNodes.slice(
          summaryIndex + 1,
          summaryIndex + 1 + SummarizationAgent.SUMMARY_CHUNK_SIZE,
        );
      }
    }

    try {
      const summaryNode = await this.createSummary(nodesToSummarize);
      return {
        summary: summaryNode,
        success: true,
      };
    } catch (error) {
      console.error(`[summarizeBranch] Error creating summary:`, error);
      return {
        summary: null,
        success: false,
        errorCode: 'SUMMARIZATION_ERROR',
        errorMessage: 'Error occurred during summarization process',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Creates a summary for a segment of nodes.
   * @param nodes Nodes to summarize
   * @throws Error if summarization fails
   */
  async createSummary(nodes: DagNode[]): Promise<SummaryNode> {
    if (!nodes || nodes.length === 0) {
      throw new Error('Cannot create summary: No nodes provided');
    }

    console.log(`[createSummary] Creating summary for ${nodes.length} nodes`);

    const result = await this.summarize(nodes);

    // Check for errors in the summarization result
    if (result.error) {
      console.error(`[createSummary] Summarization agent error:`, result.error);
      throw new Error(`Summarization failed: ${result.error}`);
    }

    // Validate the summary content
    if (!result.summary || result.summary.trim() === '') {
      console.error(`[createSummary] Summarization agent returned empty summary`);
      throw new Error('Summarization failed: Empty summary returned');
    }

    // Create a summary node
    const summaryNode: SummaryNode = {
      id: uuid(),
      thought: result.summary,
      role: 'summary',
      parents: [nodes[nodes.length - 1].id], // Link to the newest node in the segment
      children: [],
      createdAt: new Date().toISOString(),
      projectContext: nodes.find((node) => !!node.projectContext)?.projectContext ?? '',
      summarizedSegment: nodes.map((node) => node.id),
      tags: ['summary'],
      artifacts: [],
    };

    console.log(`[createSummary] Created summary node with ID ${summaryNode.id}`);

    // Persist the summary node
    this.knowledgeGraph.createEntity(summaryNode);
    this.knowledgeGraph.createRelation(nodes[nodes.length - 1].id, summaryNode.id, 'has_summary');
    await this.knowledgeGraph.flush();

    return summaryNode;
  }
}
