import fs from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import { CFG } from '../config.ts';

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

export interface SummarizationResult {
  summary: SummaryNode | null;
  success: boolean;
  errorCode?:
    | 'BRANCH_NOT_FOUND'
    | 'INSUFFICIENT_NODES'
    | 'ALREADY_SUMMARIZED'
    | 'SUMMARIZATION_ERROR';
  errorMessage?: string;
  details?: string;
}

export class KnowledgeGraphManager {
  public static WINDOW = CFG.WINDOW;

  private entities: Record<string, DagNode | ArtifactRef> = {};
  private relations: { from: string; to: string; type: string }[] = [];
  private dirty = false;

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
    await fs.writeFile(
      this.filePath,
      JSON.stringify({ entities: this.entities, relations: this.relations }),
      'utf8',
    );
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
    return Object.values(this.entities).filter(
      (n): n is DagNode => 'role' in n && !hasOutgoing.has(n.id),
    );
  }

  allDagNodes(): DagNode[] {
    return Object.values(this.entities).filter((e): e is DagNode => 'role' in e);
  }

  listBranches(): BranchHead[] {
    return this.getHeads().map((head) => ({
      branchId: head.id,
      label: head.branchLabel,
      head,
      depth: this.depth(head.id),
    }));
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
      const summaries = this.allDagNodes().filter(
        (n): n is SummaryNode =>
          !!(n.role === 'summary' && n?.summarizedSegment?.includes(curr!.id)),
      );

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
    const nodes = this.allDagNodes().filter((n) =>
      filterTag ? n.tags?.includes(filterTag) : true,
    );
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
