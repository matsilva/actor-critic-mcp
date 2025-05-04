import { execa } from 'execa';
import { to } from 'await-to-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DagNode } from '../KnowledgeGraph.ts';

export interface SummarizationResult {
  summary: string;
  error?: string;
}

/**
 * SummarizationAgent provides an interface to the Python-based summarization agent.
 * It handles serialization/deserialization of node data and processes the agent's response.
 */
export class SummarizationAgent {
  private readonly agentPath: string;

  /**
   * Creates a new SummarizationAgent.
   * @param pythonCommand Python command to use (defaults to 'uv')
   * @param pythonArgs Additional arguments for the Python command (defaults to ['run'])
   */
  constructor(
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
   * @returns A promise that resolves to a SummarizationResult
   */
  async summarize(nodes: DagNode[]): Promise<SummarizationResult> {
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
}
