import { v4 as uuid } from 'uuid';
import { Critic } from './actor-critic/Critic.ts';
import { Actor } from './actor-critic/Actor.ts';
import { KnowledgeGraphManager, ArtifactRef, DagNode } from './KnowledgeGraph.ts';
import { CFG } from './config.ts';
import { z } from 'zod';
// -----------------------------------------------------------------------------
// Actor–Critic engine ----------------------------------------------------------
// -----------------------------------------------------------------------------
const FILE_RX = /[\\w./-]+\\.(ts|tsx|js|jsx|json|css|md)/gi;

const THOUGHT_DESCRIPTION = `
Add a new thought node to the knowledge‑graph.

• Use for any creative / planning step, requirement capture, task break‑down, etc.
• **Always include at least one 'tag'** so future searches can find this node
  – e.g. requirement, task, risk, design, definition.
• **If your thought references a file you just created or modified**, list it in
  the 'artifacts' array so the graph stores a durable link.
• Use 'branchLabel' **only** on the first node of an alternative approach.
• Think of 'tags' + 'artifacts' as the breadcrumbs that future you (or another
  agent) will follow to avoid duplicate work or forgotten decisions.
`.trim();

export const ActorThinkSchema = {
  thought: z.string().describe(THOUGHT_DESCRIPTION),

  needsMore: z
    .boolean()
    .optional()
    .describe(
      'Set true if more actor steps are expected before calling the critic. ' + 'Leave false when the current micro‑task is complete.'
    ),

  branchLabel: z
    .string()
    .optional()
    .describe(
      'Human‑friendly name for a NEW branch.  Only set on the first node of ' + 'an alternative design path (e.g. "event‑sourcing‑spike").'
    ),

  tags: z
    .array(z.string())
    .min(1, 'Add at least one semantic tag – requirement, task, risk, design …')
    .describe(
      'Semantic categories that make this node discoverable later.  Use ' +
        '`definition` when you introduce a new API, schema, or interface.'
    ),

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
    .describe('Generated files or links (code, diagrams, docs).  ' + 'Mention every new or updated file here to keep the graph in sync.'),
};

export interface ActorThinkInput {
  thought: string;
  needsMore?: boolean;
  branchLabel?: string;
  tags: string[];
  artifacts?: Partial<ArtifactRef>[];
}

export class ActorCriticEngine {
  constructor(private readonly kg: KnowledgeGraphManager, private readonly critic: Critic, private readonly actor: Actor) {}
  /* --------------------------- public API --------------------------- */
  async actorThink(input: ActorThinkInput): Promise<DagNode> {
    const { node, decision } = await this.actor.think(input);

    // Trigger summarization check after adding a new node
    await this.kg.checkAndTriggerSummarization();

    if (decision === Actor.THINK_DECISION.NEEDS_REVIEW) return await this.criticReview(node.id);
    return node;
  }

  async criticReview(actorNodeId: string): Promise<DagNode> {
    const criticNode = await this.critic.review(actorNodeId);

    // Trigger summarization check after adding a critic node
    await this.kg.checkAndTriggerSummarization();

    return criticNode;
  }

  /**
   * Explicitly triggers summarization for a specific branch.
   * This can be used to generate summaries on demand.
   * @param branchIdOrLabel Branch ID or label
   */
  async summarizeBranch(branchIdOrLabel: string): Promise<DagNode | null> {
    const branchId = this.kg.labelIndex.get(branchIdOrLabel) ?? branchIdOrLabel;
    return await this.kg.summarizeBranch(branchId);
  }
}
