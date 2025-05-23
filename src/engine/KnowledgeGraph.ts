import fs from 'node:fs/promises';
import { lock, unlock } from 'proper-lockfile';
import * as fsSync from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import readline from 'node:readline';
import { dataDir } from '../config.ts';
import { CodeLoopsLogger } from '../logger.ts';
import { ActorThinkInput } from './ActorCriticEngine.ts';

// -----------------------------------------------------------------------------
// Interfaces & Schemas --------------------------------------------------------
// -----------------------------------------------------------------------------

export interface WithProjectContext {
  project: string;
  projectContext: string;
}

export const FILE_REF = z.object({
  name: z.string(), // human label ("UML‑AuthSeq")
  uri: z.string().optional(), // optional external link or S3 key
  /** Absolute or repo‑relative path, e.g. "QuickRecorder/CameraOverlay.swift" */
  path: z.string(),
  /** Optional hash to lock content for provenance */
  hash: z.string().optional(),
  /** Optional MIME, e.g. "text/x-swift" */
  contentType: z.string().optional(),
});
export type ArtifactRef = z.infer<typeof FILE_REF>;

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
  createdAt: string; // ISO timestamp
  summarizedSegment?: string[]; // IDs of nodes summarized (for summary nodes)
}

export interface SummaryNode extends DagNode {
  role: 'summary';
  summarizedSegment: string[]; // IDs of nodes summarized
}

// -----------------------------------------------------------------------------
// KnowledgeGraphManager -------------------------------------------------------
// -----------------------------------------------------------------------------

export class KnowledgeGraphManager {
  private logFilePath: string = path.resolve(dataDir, 'knowledge_graph.ndjson');
  private logger: CodeLoopsLogger;

  // Schema for validating DagNode entries
  private static DagNodeSchema = z.object({
    id: z.string(),
    project: z.string(),
    projectContext: z.string(),
    thought: z.string(),
    role: z.enum(['actor', 'critic', 'summary']),
    createdAt: z.string().datetime(),
    parents: z.array(z.string()),
    children: z.array(z.string()),
    verdict: z.enum(['approved', 'needs_revision', 'reject']).optional(),
    verdictReason: z.string().optional(),
    verdictReferences: z.array(z.string()).optional(),
    target: z.string().optional(),
    summarizedSegment: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    artifacts: z.array(FILE_REF).optional(),
  });

  constructor(logger: CodeLoopsLogger) {
    this.logger = logger;
  }

  async init() {
    this.logger.info(`[KnowledgeGraphManager] Initializing from ${this.logFilePath}`);
    await this.loadLog();
  }

  private async loadLog() {
    if (!(await fs.stat(this.logFilePath).catch(() => null))) {
      this.logger.info(`[KnowledgeGraphManager] Creating new log file at ${this.logFilePath}`);
      await fs.mkdir(path.dirname(this.logFilePath), { recursive: true });
      await fs.writeFile(this.logFilePath, '');
      return;
    }
  }

  private parseDagNode(line: string): DagNode | null {
    try {
      const parsed = JSON.parse(line);
      const validated = KnowledgeGraphManager.DagNodeSchema.parse(parsed);
      return validated as DagNode;
    } catch (err) {
      this.logger.error({ err, line }, 'Invalid DagNode entry');
      return null;
    }
  }

  async appendEntity(entity: DagNode, retries = 3) {
    if (await this.wouldCreateCycle(entity)) {
      throw new Error(`Appending node ${entity.id} would create a cycle`);
    }

    entity.createdAt = new Date().toISOString();
    const line = JSON.stringify(entity) + '\n';
    let err: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await lock(this.logFilePath, { retries: 0 });
        await fs.appendFile(this.logFilePath, line, 'utf8');
        return;
      } catch (e: unknown) {
        err = e as Error;
        this.logger.warn({ err, attempt }, `Retry ${attempt} failed appending entity`);
        if (attempt === retries) break;
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
      } finally {
        try {
          await unlock(this.logFilePath);
        } catch (unlockErr) {
          this.logger.error({ err: unlockErr }, 'Failed to unlock file');
        }
      }
    }

    this.logger.error({ err }, 'Error appending entity after retries');
    throw err;
  }

  private async wouldCreateCycle(entity: DagNode): Promise<boolean> {
    const visited = new Set<string>();
    async function dfs(id: string, manager: KnowledgeGraphManager): Promise<boolean> {
      if (visited.has(id)) return true;
      visited.add(id);
      const node = await manager.getNode(id);
      if (!node) return false;
      for (const childId of node.children) {
        if (childId === entity.id || (await dfs(childId, manager))) return true;
      }
      return false;
    }
    for (const parentId of entity.parents) {
      if (await dfs(parentId, this)) return true;
    }
    return false;
  }

  async getNode(id: string): Promise<DagNode | undefined> {
    const fileStream = fsSync.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        const entry = this.parseDagNode(line);
        if (entry?.id === id) {
          return entry;
        }
      }
      return undefined;
    } finally {
      rl.close();
      fileStream.close();
    }
  }

  async getNeighbors(id: string, depth = 1): Promise<DagNode[]> {
    if (depth < 0) depth = 0;
    const start = await this.getNode(id);
    if (!start) return [];
    const result = new Map<string, DagNode>();
    result.set(start.id, start);

    const traverse = async (node: DagNode, currentDepth: number) => {
      if (currentDepth >= depth) return;
      const neighborIds = [...node.parents, ...node.children];
      for (const nid of neighborIds) {
        if (result.has(nid)) continue;
        const neighbor = await this.getNode(nid);
        if (neighbor) {
          result.set(nid, neighbor);
          await traverse(neighbor, currentDepth + 1);
        }
      }
    };

    await traverse(start, 0);
    return Array.from(result.values());
  }

  async *streamDagNodes(project: string): AsyncGenerator<DagNode, void, unknown> {
    const fileStream = fsSync.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        const node = this.parseDagNode(line);
        if (node?.project === project) {
          yield node;
        }
      }
    } finally {
      rl.close();
      fileStream.close();
    }
  }

  async allDagNodes(project: string): Promise<DagNode[]> {
    const nodes: DagNode[] = [];
    for await (const node of this.streamDagNodes(project)) {
      nodes.push(node);
    }
    return nodes;
  }

  async resume({ project, limit = 5 }: { project: string; limit?: number }): Promise<DagNode[]> {
    return this.export({ project, limit });
  }

  async export({
    project,
    filterFn,
    limit,
  }: {
    project: string;
    filterFn?: (node: DagNode) => boolean;
    limit?: number;
  }): Promise<DagNode[]> {
    const nodes: DagNode[] = [];
    const fileStream = fsSync.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        const node = this.parseDagNode(line);
        if (!node || node.project !== project) continue;
        if (filterFn && !filterFn(node)) continue;
        nodes.push(node);
        if (limit && nodes.length > limit) nodes.shift();
      }
      return nodes;
    } finally {
      rl.close();
      fileStream.close();
    }
  }

  async search({
    project,
    tags,
    query,
    limit,
  }: {
    project: string;
    tags?: string[];
    query?: string;
    limit?: number;
  }): Promise<DagNode[]> {
    const q = query?.toLowerCase();
    return this.export({
      project,
      limit,
      filterFn: (node) => {
        if (tags && (!node.tags || !tags.every((t) => node.tags!.includes(t)))) {
          return false;
        }
        if (q && !node.thought.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      },
    });
  }

  async getArtifactHistory(project: string, path: string, limit?: number): Promise<DagNode[]> {
    return this.export({
      project,
      limit,
      filterFn: (node) => !!node.artifacts?.some((a) => a.path === path),
    });
  }

  async listProjects(): Promise<string[]> {
    const projects = new Set<string>();
    const fileStream = fsSync.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        const entry = this.parseDagNode(line);
        if (entry?.project && !projects.has(entry.project)) {
          projects.add(entry.project);
        }
      }
      return Array.from(projects);
    } finally {
      rl.close();
      fileStream.close();
    }
  }
}
