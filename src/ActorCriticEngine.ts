import { v4 as uuid } from 'uuid';
import { Critic } from './actor-critic/Critic.ts';
import { Actor } from './actor-critic/Actor.ts';
import { KnowledgeGraphManager, ArtifactRef, DagNode } from './KnowledgeGraph.ts';
import { CFG } from './config.ts';
import { z } from 'zod';
// -----------------------------------------------------------------------------
// Actor–Critic engine ----------------------------------------------------------
// -----------------------------------------------------------------------------

/**
 * actor_think – add a new thought node to the design graph.
 * Use for any creative/planning step, requirement capture, task breakdown, etc.
 * Include `branchLabel` on the FIRST node of an alternative approach.
 */
export const ActorThinkSchema = {
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

export interface ActorThinkInput {
  thought: string;
  needsMore?: boolean;
  branchLabel?: string;
  tags?: string[];
  artifacts?: Partial<ArtifactRef>[];
}

export class ActorCriticEngine {
  constructor(private readonly kg: KnowledgeGraphManager, private readonly critic: Critic, private readonly actor: Actor) {}
  /* --------------------------- public API --------------------------- */
  async actorThink(input: ActorThinkInput): Promise<DagNode> {
    const { node, decision } = await this.actor.think(input);
    if (decision === Actor.THINK_DECISION.NEEDS_REVIEW) return await this.criticReview(node.id);
    return node;
  }

  async criticReview(actorNodeId: string): Promise<DagNode> {
    return await this.critic.review(actorNodeId);
  }
}
