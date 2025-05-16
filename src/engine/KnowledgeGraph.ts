import fs from 'node:fs/promises';
import { lock, unlock } from 'proper-lockfile';
import * as fsSync from 'node:fs';
import path from 'node:path';
import { extractProjectName } from '../utils/project.ts';
import readline from 'node:readline';
import { dataDir } from '../config.ts';
import { getInstance as getLogger } from '../logger.ts';
import { ActorThinkInput, FileRef } from './ActorCriticEngine.ts';

// -----------------------------------------------------------------------------
// Minimal JSON‑file Knowledge Graph adapter ------------------------------------
// -----------------------------------------------------------------------------

export interface WithProjectContext {
  project: string;
  projectContext: string;
}

export interface BranchHead {
  branchId: string;
  label?: string;
  head: DagNode;
  depth: number;
}

export interface ArtifactRef extends FileRef {}

export interface DagNode extends ActorThinkInput, WithProjectContext {
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
  public static WINDOW = 20;

  private logFilePath: string = path.resolve(dataDir, 'knowledge_graph.ndjson');
  private projectStates: Map<string, { entities: Map<string, DagNode | ArtifactRef> }> = new Map();
  // No currentProject state - all operations must be explicitly scoped by project
  private logger = getLogger();
  public labelIndex: Map<string, string> = new Map(); // branchLabel ➜ nodeId

  constructor() {}

  async init() {
    this.logger.info(`[KnowledgeGraphManager] Initializing from ${this.logFilePath}`);
    await this.loadLog();
  }

  private async loadLog() {
    if (!(await fs.stat(this.logFilePath).catch(() => null))) {
      this.logger.info(
        `[KnowledgeGraphManager] No log file found, creating new one at ${this.logFilePath}`,
      );
      await fs.mkdir(path.dirname(this.logFilePath), { recursive: true });
      await fs.writeFile(this.logFilePath, '');
      return;
    }
  }

  async tryLoadProject(project: string, onDidLoadProject?: (project: string) => void) {
    if (this.projectStates.has(project)) {
      return;
    }
    onDidLoadProject?.(project);
    this.projectStates.set(project, { entities: new Map() });
    const fileStream = fsSync.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    for await (const line of rl) {
      try {
        const entry = JSON.parse(line);
        if (entry.project !== project) continue;
        this.projectStates.get(project)!.entities.set(entry.id, entry);

        // Update label index if it's a branch label
        if ('branchLabel' in entry && entry.branchLabel) {
          this.labelIndex.set(entry.branchLabel, entry.id);
        }
      } catch (err) {
        this.logger.error({ err, line }, 'Error parsing entry');
      }
    }
  }

  // Use the centralized extractProjectName function from utils

  async appendEntity(entity: DagNode) {
    // Set createdAt for DagNode, ensure it exists for ArtifactRef
    if ('role' in entity) {
      entity.createdAt = new Date().toISOString();
    } else {
      (entity as any).createdAt = new Date().toISOString();
    }
    const line = JSON.stringify(entity) + '\n';
    //lockfile
    let err: Error | null = null;
    try {
      await lock(this.logFilePath);
      await fs.appendFile(this.logFilePath, line, 'utf8');
    } catch (e: unknown) {
      err = e as Error;
    } finally {
      await unlock(this.logFilePath);
    }
    if (err) {
      this.logger.error({ err }, 'Error appending entity');
      throw err;
    }
    this.logger.info(
      `[KnowledgeGraphManager] node_append: ${entity.id} to project: ${entity.project}`,
    );
    const state = this.projectStates.get(entity.project) || { entities: new Map() };
    state.entities.set(entity.id, entity);
    this.projectStates.set(entity.project, state);
  }

  getNode(id: string, project: string): DagNode | undefined {
    const entity = this.projectStates.get(project)?.entities.get(id);
    return entity && 'role' in entity ? (entity as DagNode) : undefined;
  }

  getHeads(project: string): DagNode[] {
    const state = this.projectStates.get(project);
    if (!state) return [];
    const hasOutgoing = new Set(
      Array.from(state.entities.values())
        .filter((e): e is DagNode => 'role' in e)
        .flatMap((n) => n.parents),
    );
    return Array.from(state.entities.values()).filter(
      (n): n is DagNode => 'role' in n && !hasOutgoing.has(n.id),
    );
  }

  allDagNodes(project: string): DagNode[] {
    const state = this.projectStates.get(project);
    if (!state) return [];
    return Array.from(state.entities.values()).filter((e): e is DagNode => 'role' in e);
  }

  listBranches(project: string): BranchHead[] {
    return this.getHeads(project).map((head) => ({
      branchId: head.id,
      label: head.branchLabel,
      head,
      depth: this.depth(head.id, project),
    }));
  }

  resume(branchIdOrLabel: string, project: string): string {
    const id = this.labelIndex.get(branchIdOrLabel) ?? branchIdOrLabel;
    const node = this.getNode(id, project);
    if (!node) throw new Error('branch not found');
    return id;
  }

  export({ project, filterTag, limit }: { project: string; filterTag?: string; limit?: number }) {
    let nodes = this.allDagNodes(project).filter((n) =>
      filterTag ? n.tags?.includes(filterTag) : true,
    );
    if (limit) {
      nodes = nodes.slice(0, limit);
    }
    return nodes;
  }

  async listProjects(): Promise<string[]> {
    const fileStream = fsSync.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    const projects = new Set<string>();
    for await (const line of rl) {
      try {
        const entry = JSON.parse(line);
        const project = entry.project;
        if (project && !projects.has(project)) projects.add(project);
      } catch (err) {
        this.logger.error({ err, line }, 'Error parsing entry');
      }
    }
    return Array.from(projects);
  }

  private depth(id: string, project: string): number {
    return this.depthRecursive(id, new Set(), project);
  }

  private depthRecursive(id: string, visited: Set<string>, project: string): number {
    if (visited.has(id)) return 0;
    visited.add(id);
    const node = this.getNode(id, project);
    if (!node || !node.parents.length) return 1;
    return 1 + Math.max(...node.parents.map((p) => this.depthRecursive(p, visited, project)));
  }
}
