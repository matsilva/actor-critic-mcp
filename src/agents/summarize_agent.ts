import { exec } from 'child_process';
import { promisify } from 'util';
import { DagNode } from '../KnowledgeGraph.ts';

const execAsync = promisify(exec);

export interface SummarizationResult {
  summary: string;
  error?: string;
}

/**
 * SummarizationAgent provides an interface to the Python-based summarization agent.
 * It handles serialization/deserialization of node data and processes the agent's response.
 */
export class SummarizationAgent {
  private readonly pythonPath: string;
  private readonly agentPath: string;

  /**
   * Creates a new SummarizationAgent.
   * @param pythonPath Path to the Python executable (defaults to 'python')
   * @param agentPath Path to the agent script (defaults to 'agents/summarize/agent.py')
   */
  constructor(
    pythonPath: string = 'python',
    agentPath: string = 'agents/summarize/agent.py'
  ) {
    this.pythonPath = pythonPath;
    this.agentPath = agentPath;
  }

  /**
   * Summarizes a segment of nodes from the knowledge graph.
   * @param nodes Array of DagNode objects to summarize
   * @returns A promise that resolves to a SummarizationResult
   */
  async summarize(nodes: DagNode[]): Promise<SummarizationResult> {
    try {
      // Serialize the nodes to JSON
      const input = JSON.stringify(nodes);

      // Call the Python agent
      const { stdout, stderr } = await execAsync(
        `${this.pythonPath} ${this.agentPath} --summarize`,
        { input }
      );

      if (stderr) {
        console.error('Summarization agent error:', stderr);
      }

      // Parse the response
      try {
        // The agent should return a JSON object with a summary field
        const response = JSON.parse(stdout.trim());
        
        if (response.error) {
          return { summary: '', error: response.error };
        }
        
        if (response.summary) {
          return { summary: response.summary };
        }
        
        // If the response doesn't match the expected format, try to extract a summary
        return { 
          summary: stdout.trim(),
          error: 'Response format not recognized, using raw output as summary'
        };
      } catch (parseError) {
        // If the response isn't valid JSON, use the raw output as the summary
        return { 
          summary: stdout.trim(),
          error: `Failed to parse agent response: ${parseError.message}`
        };
      }
    } catch (error) {
      return {
        summary: '',
        error: `Failed to execute summarization agent: ${error.message}`
      };
    }
  }
}
