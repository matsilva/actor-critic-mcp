import fs from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import { CFG } from './config.ts';
import { SummarizationAgent } from './agents/summarize_agent.ts';

// -----------------------------------------------------------------------------
// Minimal JSON‑file Knowledge Graph adapter ------------------------------------
// -----------------------------------------------------------------------------

export interface BranchHead {
  branchId: string;
  label?: string;
  head: DagNode;
  depth: number;
}

export interface ArtifactRef {
  id: string; // uuid for KG reference
  name: string; // human label ("UML‑AuthSeq")
  uri?: string; // optional external link or S3 key
  contentType?: string; // mime‑type hint (image/png, text/markdown …)
  hash?: string; // sha256 etc. (optional)
}

export interface DagNode {
  id: string;
  thought: string;
  role: 'actor' | 'critic' | 'summary';
  verdict?: 'approved' | 'needs_revision' | 'reject';
  verdictReason?: string;
  verdictReferences?: string[];
  target?: string; // nodeId this criticises
  parents: string[];
  children: string[];
  needsMore?: boolean;
  createdAt: string; // ISO timestamp for durability
  branchLabel?: string; // friendly label for this branch head
  tags?: string[]; // free‑form categories ("design", "task", …)
  artifacts?: ArtifactRef[]; // attached artefacts
  summarizedSegment?: string[]; // IDs of the nodes that were summarized (for summary nodes)
}

export interface SummaryNode extends DagNode {
  role: 'summary';
  summarizedSegment: string[]; // IDs of the nodes that were summarized
}

export class KnowledgeGraphManager {
  public static WINDOW = CFG.WINDOW;

  // Number of nodes after which to trigger summarization
  private static SUMMARIZATION_THRESHOLD = 20;

  // Maximum number of nodes to include in a summary
  private static SUMMARY_CHUNK_SIZE = 10;

  private entities: Record<string, DagNode | ArtifactRef> = {};
  private relations: { from: string; to: string; type: string }[] = [];
  private dirty = false;

  // Summarization agent instance
  private summarizationAgent: SummarizationAgent | null = null;

  public labelIndex: Map<string, string> = new Map(); // branchLabel ➜ nodeId

  constructor(private readonly filePath: string) {}

  async init() {
    try {
      const blob = await fs.readFile(this.filePath, 'utf8');
      const json = JSON.parse(blob);
      this.entities = json.entities ?? {};
      this.relations = json.relations ?? [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async flush() {
    if (!this.dirty) return;
    await fs.writeFile(this.filePath, JSON.stringify({ entities: this.entities, relations: this.relations }), 'utf8');
    this.dirty = false;
  }

  // ----------------------------- entities ----------------------------------
  createEntity(entity: DagNode | ArtifactRef) {
    this.entities[entity.id] = entity;
    this.dirty = true;
  }

  createRelation(from: string, to: string, type: string) {
    this.relations.push({ from, to, type });
    this.dirty = true;
  }

  getNode(id: string) {
    return this.entities[id] as DagNode | undefined;
  }

  getChildren(id: string, type: string) {
    return this.relations
      .filter((r) => r.from === id && r.type === type)
      .map((r) => this.entities[r.to])
      .filter(Boolean) as DagNode[];
  }

  getHeads(): DagNode[] {
    const hasOutgoing = new Set(this.relations.map((r) => r.from));
    return Object.values(this.entities).filter((n): n is DagNode => 'role' in n && !hasOutgoing.has(n.id));
  }

  allDagNodes(): DagNode[] {
    return Object.values(this.entities).filter((e): e is DagNode => 'role' in e);
  }

  listBranches(): BranchHead[] {
    return this.getHeads().map((head) => ({ branchId: head.id, label: head.branchLabel, head, depth: this.depth(head.id) }));
  }

  resume(branchIdOrLabel: string): string {
    const id = this.labelIndex.get(branchIdOrLabel) ?? branchIdOrLabel;
    const node = this.getNode(id);
    if (!node) throw new Error('branch not found');

    // Collect nodes in the branch
    const path: DagNode[] = [];
    let curr: DagNode | undefined = node;

    // First, collect the most recent nodes up to the window size
    while (curr && path.length < CFG.WINDOW) {
      path.unshift(curr);
      curr = curr.parents[0] ? this.getNode(curr.parents[0]) : undefined;
    }

    // If we've reached the window limit but there are more nodes,
    // look for summaries to include
    if (curr) {
      // Find summaries that cover the older nodes
      const summaries = this.allDagNodes().filter((n): n is SummaryNode => n.role === 'summary' && n.summarizedSegment.includes(curr!.id));

      // Add relevant summaries to the beginning of the path
      if (summaries.length > 0) {
        // Sort summaries by creation date (oldest first)
        summaries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        // Add summaries to the beginning of the path
        path.unshift(...summaries);
      }
    }

    return path.map((n) => n.thought).join('\n');
  }

  exportPlan(filterTag?: string): unknown {
    const nodes = this.allDagNodes().filter((n) => (filterTag ? n.tags?.includes(filterTag) : true));
    return nodes.map((n) => ({
      id: n.id,
      thought: n.thought,
      tags: n.tags,
      branchLabel: n.branchLabel,
      verdict: n.verdict,
      parents: n.parents,
      artifacts: n.artifacts?.map((a) => ({ name: a.name, uri: a.uri })),
    }));
  }

  /**
   * Gets or creates the summarization agent.
   */
  private getSummarizationAgent(): SummarizationAgent {
    if (!this.summarizationAgent) {
      this.summarizationAgent = new SummarizationAgent();
    }
    return this.summarizationAgent;
  }

  /**
   * Checks if summarization is needed and triggers it if necessary.
   * This should be called after adding new nodes to the graph.
   */
  async checkAndTriggerSummarization(): Promise<void> {
    const branches = this.listBranches();

    for (const branch of branches) {
      // Only summarize branches that have enough nodes
      if (branch.depth >= KnowledgeGraphManager.SUMMARIZATION_THRESHOLD) {
        await this.summarizeBranch(branch.branchId);
      }
    }
  }

  /**
   * Summarizes the oldest segment of nodes in a branch.
   * @param branchId ID of the branch to summarize
   */
  async summarizeBranch(branchId: string): Promise<SummaryNode | null> {
    // Get the branch head
    const head = this.getNode(branchId);
    if (!head) return null;

    // Collect all nodes in the branch
    const branchNodes: DagNode[] = [];
    let current: DagNode | undefined = head;

    while (current) {
      branchNodes.push(current);
      current = current.parents[0] ? this.getNode(current.parents[0]) : undefined;
    }

    // Reverse to get chronological order
    branchNodes.reverse();

    // Check if we already have summaries for this branch
    const existingSummaries = branchNodes.filter(
      (node): node is SummaryNode => node.role === 'summary' && node.summarizedSegment !== undefined
    );

    // Determine which nodes need to be summarized
    let nodesToSummarize: DagNode[] = [];

    if (existingSummaries.length === 0) {
      // If no summaries exist, summarize the oldest chunk
      nodesToSummarize = branchNodes.slice(0, Math.min(KnowledgeGraphManager.SUMMARY_CHUNK_SIZE, branchNodes.length));
    } else {
      // Find the newest summary
      const newestSummary = existingSummaries.reduce((newest, current) => {
        const newestDate = new Date(newest.createdAt);
        const currentDate = new Date(current.createdAt);
        return currentDate > newestDate ? current : newest;
      }, existingSummaries[0]);

      // Find nodes that were created after the newest summary but are old enough to summarize
      const summaryIndex = branchNodes.findIndex((node) => node.id === newestSummary.id);

      if (summaryIndex !== -1 && branchNodes.length - summaryIndex > KnowledgeGraphManager.SUMMARIZATION_THRESHOLD) {
        nodesToSummarize = branchNodes.slice(summaryIndex + 1, summaryIndex + 1 + KnowledgeGraphManager.SUMMARY_CHUNK_SIZE);
      }
    }

    // If there are nodes to summarize, create a summary
    if (nodesToSummarize.length > 0) {
      return await this.createSummary(nodesToSummarize);
    }

    return null;
  }

  /**
   * Creates a summary for a segment of nodes.
   * @param nodes Nodes to summarize
   */
  async createSummary(nodes: DagNode[]): Promise<SummaryNode> {
    const agent = this.getSummarizationAgent();
    const result = await agent.summarize(nodes);

    // Create a summary node
    const summaryNode: SummaryNode = {
      id: uuid(),
      thought: result.summary,
      role: 'summary',
      parents: [nodes[nodes.length - 1].id], // Link to the newest node in the segment
      children: [],
      createdAt: new Date().toISOString(),
      summarizedSegment: nodes.map((node) => node.id),
      tags: ['summary'],
    };

    // Persist the summary node
    this.createEntity(summaryNode);
    this.createRelation(nodes[nodes.length - 1].id, summaryNode.id, 'has_summary');
    await this.flush();

    return summaryNode;
  }

  /* ------------------------- helpers ------------------------------- */
  private depth(id: string): number {
    let d = 0;
    let n: DagNode | undefined = this.getNode(id);
    while (n && n.parents.length) {
      d += 1;
      n = this.getNode(n.parents[0]);
    }
    return d;
  }
}
