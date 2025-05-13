import fs from 'node:fs/promises';
import { CFG } from '../config.ts';
import { ProjectManager } from './ProjectManager.ts';
import { ActorThinkInput, FileRef } from './ActorCriticEngine.ts';

// -----------------------------------------------------------------------------
// Minimal JSON‑file Knowledge Graph adapter ------------------------------------
// -----------------------------------------------------------------------------

export interface BranchHead {
  branchId: string;
  label?: string;
  head: DagNode;
  depth: number;
}

export interface ArtifactRef extends FileRef {
  id: string; // uuid for KG reference
}

export interface DagNode extends ActorThinkInput {
  id: string;
  thought: string;
  role: 'actor' | 'critic' | 'summary';
  verdict?: 'approved' | 'needs_revision' | 'reject';
  verdictReason?: string;
  verdictReferences?: string[];
  target?: string; // nodeId this criticises
  parents: string[];
  children: string[];
  createdAt: string; // ISO timestamp for durability
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

  private filePath: string;

  /**
   * Creates a new KnowledgeGraphManager instance
   * @param projectManager The project manager to use for project operations
   */
  constructor(private readonly projectManager: ProjectManager) {
    this.filePath = projectManager.getCurrentProjectPath();
  }

  async init() {
    try {
      const blob = await fs.readFile(this.filePath, 'utf8');
      const json = JSON.parse(blob);
      this.entities = json.entities ?? {};
      this.relations = json.relations ?? [];
      console.log(`[KnowledgeGraphManager] Initialized with file: ${this.filePath}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[KnowledgeGraphManager] Error initializing from ${this.filePath}:`, err);
        throw err;
      }
      console.log(
        `[KnowledgeGraphManager] No existing file found at ${this.filePath}, starting fresh`,
      );
    }
  }

  /**
   * Get the name of the current active project
   * @returns The current project name
   */
  getCurrentProject(): string {
    return this.projectManager.getCurrentProject();
  }
  
  /**
   * Switches to the project specified in the project context if needed
   * Delegates to ProjectManager's switchProjectIfNeeded method
   * 
   * @param projectContext The full path to the project directory
   * @returns Promise resolving to true if project was switched, false if no switch was needed
   */
  async switchProjectIfNeeded(projectContext?: string): Promise<boolean> {
    return await this.projectManager.switchProjectIfNeeded(projectContext);
  }

  /**

  /**
   * Switch to a different project and load its data
   * @param projectName Name of the project to switch to
   * @returns Object with success status and message
   */
  async switchProject(projectName: string): Promise<{ success: boolean; message: string }> {
    try {
      // First, flush any pending changes to the current project
      await this.flush();
      console.log(
        `[KnowledgeGraphManager] Flushed changes to current project: ${this.getCurrentProject()}`,
      );

      // Use the project manager to switch projects
      const result = await this.projectManager.switchProject(projectName);
      if (!result.success) {
        return result;
      }

      // Update the file path to the new project's file
      const newFilePath = this.projectManager.getCurrentProjectPath();
      console.log(`[KnowledgeGraphManager] Switching from ${this.filePath} to ${newFilePath}`);
      this.filePath = newFilePath;

      // Clear current data
      this.entities = {};
      this.relations = [];
      this.labelIndex.clear();
      this.dirty = false;

      // Load the new project data
      await this.init();

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `[KnowledgeGraphManager] Error switching to project ${projectName}:`,
        errorMessage,
      );
      return { success: false, message: `Error switching to project: ${errorMessage}` };
    }
  }

  async flush() {
    if (!this.dirty) return;
    try {
      await fs.writeFile(
        this.filePath,
        JSON.stringify({ entities: this.entities, relations: this.relations }),
        'utf8',
      );
      this.dirty = false;
    } catch (error) {
      console.error(`[KnowledgeGraphManager] Error flushing to ${this.filePath}:`, error);
      throw error;
    }
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
