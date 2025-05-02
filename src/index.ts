// actor-critic-mcp.ts – v0.4 (May 1 2025)
// -----------------------------------------------------------------------------
// Adds **branch labels**, **tags**, **artifact attachments**, and a new
// `export_plan` tool to the Actor‑Critic Sequential‑Thinking MCP.
// -----------------------------------------------------------------------------

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import fs from 'node:fs/promises';
import path from 'node:path';

// -----------------------------------------------------------------------------
// Configuration ----------------------------------------------------------------
// -----------------------------------------------------------------------------

const CFG = {
  WINDOW: Number(process.env.WINDOW ?? 20),
  CRITIC_EVERY_N_STEPS: Number(process.env.critic_every_n_steps ?? 3),
  MAX_REVISION_CYCLES: Number(process.env.max_revision_cycles ?? 2),
  MEMORY_FILE_PATH: process.env.MEMORY_FILE_PATH ?? path.resolve(process.cwd(), 'memory.json'),
};

// -----------------------------------------------------------------------------
// Types ------------------------------------------------------------------------
// -----------------------------------------------------------------------------

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
  role: 'actor' | 'critic';
  verdict?: 'approved' | 'needs_revision' | 'reject';
  target?: string; // nodeId this criticises
  parents: string[];
  children: string[];
  needsMore?: boolean;
  createdAt: string; // ISO timestamp for durability

  // v0.4 additions
  branchLabel?: string; // friendly label for this branch head
  tags?: string[]; // free‑form categories ("design", "task", …)
  artifacts?: ArtifactRef[]; // attached artefacts
}

interface BranchHead {
  branchId: string;
  label?: string;
  head: DagNode;
  depth: number;
}

// -----------------------------------------------------------------------------
// Minimal JSON‑file Knowledge Graph adapter ------------------------------------
// -----------------------------------------------------------------------------

class KnowledgeGraphManager {
  private entities: Record<string, DagNode | ArtifactRef> = {};
  private relations: { from: string; to: string; type: string }[] = [];
  private dirty = false;

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
}

// -----------------------------------------------------------------------------
// Actor–Critic engine ----------------------------------------------------------
// -----------------------------------------------------------------------------

class ActorCriticEngine {
  private revisionCounter: Record<string, number> = {};
  private labelIndex: Map<string, string> = new Map(); // branchLabel ➜ nodeId

  constructor(private readonly kg: KnowledgeGraphManager) {}

  /* --------------------------- public API --------------------------- */

  async actorThink(input: {
    thought: string;
    needsMore?: boolean;
    branchLabel?: string;
    tags?: string[];
    artifacts?: Partial<ArtifactRef>[];
  }): Promise<DagNode> {
    const { thought, needsMore, branchLabel, tags, artifacts } = input;

    const parents = this.kg.getHeads().map((h) => h.id);

    const node: DagNode = {
      id: uuid(),
      thought,
      role: 'actor',
      parents,
      children: [],
      needsMore,
      createdAt: new Date().toISOString(),
      branchLabel,
      tags,
      artifacts: artifacts as ArtifactRef[],
    };

    // Persist node & optional artefacts
    this.kg.createEntity(node);
    parents.forEach((p) => this.kg.createRelation(p, node.id, 'flows_to'));

    //mutates each artiface in the above node.artifacts
    if (artifacts && artifacts.length) {
      for (const art of artifacts) {
        const artEntity: ArtifactRef = { ...art, id: art.id ?? uuid() } as ArtifactRef;
        this.kg.createEntity(artEntity);
        this.kg.createRelation(node.id, artEntity.id, 'has_artifact');
      }
    }
    if (branchLabel) this.labelIndex.set(branchLabel, node.id);
    await this.kg.flush();

    // Cadence‑based auto‑critic
    const totalSteps = this.kg.allDagNodes().length;
    if (totalSteps % CFG.CRITIC_EVERY_N_STEPS === 0 || !needsMore) {
      await this.criticReview(node.id);
    }

    return node;
  }

  async criticReview(actorNodeId: string): Promise<DagNode> {
    const target = this.kg.getNode(actorNodeId);
    if (!target || (target as DagNode).role !== 'actor') throw new Error('invalid target for critic');

    const cycles = this.revisionCounter[actorNodeId] ?? 0;
    let verdict: DagNode['verdict'] = 'approved';
    if (!(target as DagNode).thought.trim()) verdict = 'needs_revision';
    if (cycles >= CFG.MAX_REVISION_CYCLES) verdict = 'reject';

    const critic: DagNode = {
      id: uuid(),
      thought: verdict === 'approved' ? '✔ Approved' : verdict === 'needs_revision' ? '✏ Needs revision' : '✗ Rejected',
      role: 'critic',
      verdict,
      target: actorNodeId,
      parents: [actorNodeId],
      children: [],
      needsMore: false,
      createdAt: new Date().toISOString(),
    };

    const relType = verdict === 'approved' ? 'approves' : verdict === 'needs_revision' ? 'criticises' : 'rejects';
    this.kg.createEntity(critic);
    this.kg.createRelation(actorNodeId, critic.id, relType);
    await this.kg.flush();

    if (verdict === 'needs_revision') this.revisionCounter[actorNodeId] = cycles + 1;
    else delete this.revisionCounter[actorNodeId];

    return critic;
  }

  listBranches(): BranchHead[] {
    return this.kg.getHeads().map((head) => ({ branchId: head.id, label: head.branchLabel, head, depth: this.depth(head.id) }));
  }

  resume(branchIdOrLabel: string): string {
    const id = this.labelIndex.get(branchIdOrLabel) ?? branchIdOrLabel;
    const node = this.kg.getNode(id);
    if (!node) throw new Error('branch not found');
    const path: DagNode[] = [];
    let curr: DagNode | undefined = node;
    while (curr && path.length < CFG.WINDOW) {
      path.unshift(curr);
      curr = curr.parents[0] ? this.kg.getNode(curr.parents[0]) : undefined;
    }
    return path.map((n) => n.thought).join('\n');
  }

  exportPlan(filterTag?: string): unknown {
    const nodes = this.kg.allDagNodes().filter((n) => (filterTag ? n.tags?.includes(filterTag) : true));
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
    let n: DagNode | undefined = this.kg.getNode(id);
    while (n && n.parents.length) {
      d += 1;
      n = this.kg.getNode(n.parents[0]);
    }
    return d;
  }
}

// -----------------------------------------------------------------------------
// MCP Server -------------------------------------------------------------------
// -----------------------------------------------------------------------------

async function main() {
  const kg = new KnowledgeGraphManager(CFG.MEMORY_FILE_PATH);
  await kg.init();
  const engine = new ActorCriticEngine(kg);

  const server = new McpServer({ name: 'actor-critic-mcp', version: '0.4.0' });

  /**
   * actor_think – add a new thought node to the design graph.
   * Use for any creative/planning step, requirement capture, task breakdown, etc.
   * Include `branchLabel` on the FIRST node of an alternative approach.
   */
  const ActorThinkSchema = {
    thought: z.string().describe('The actual design idea / reasoning step.'),
    needsMore: z.boolean().optional().describe('Set true if more actor steps are expected before a critic check.'),
    branchLabel: z.string().optional().describe('Human‑friendly label for a new branch.'),
    tags: z.array(z.string()).optional().describe('Arbitrary tags: requirement, task, risk, …'),
    artifacts: z
      .array(
        z.object({
          name: z.string(),
          uri: z.string().optional(),
          contentType: z.string().optional(),
          hash: z.string().optional(),
        })
      )
      .optional()
      .describe('Supporting files / links.'),
  };

  server.tool('actor_think', ActorThinkSchema, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await engine.actorThink(args), null, 2) }],
  }));

  /**
   * critic_review – evaluates an actor node. Call after every ~3 actor steps,
   * or sooner if the agent is uncertain.
   */
  const CriticSchema = { actorNodeId: z.string().describe('ID of the actor node to critique.') };
  server.tool('critic_review', CriticSchema, async (a) => ({
    content: [{ type: 'text', text: JSON.stringify(await engine.criticReview(a.actorNodeId), null, 2) }],
  }));

  /** list_branches – quick overview for navigation */
  server.tool('list_branches', {}, async () => ({
    content: [{ type: 'text', text: JSON.stringify(engine.listBranches(), null, 2) }],
  }));

  /** resume – fetch WINDOW‑sized recent context for a branch */
  server.tool('resume', { branchId: z.string().describe('Branch id OR label') }, async (a) => ({
    content: [{ type: 'text', text: engine.resume(a.branchId) }],
  }));

  /** export_plan – dump the current graph, optionally filtered by tag */
  server.tool('export_plan', { filterTag: z.string().optional().describe('Return only nodes containing this tag.') }, async (a) => ({
    content: [{ type: 'text', text: JSON.stringify(engine.exportPlan(a.filterTag), null, 2) }],
  }));

  // ------------------------------------------------------------------
  // Transport: stdio JSON‑over‑MCP -----------------------------------
  // ------------------------------------------------------------------
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
