import { Critic } from '../agents/Critic.ts';
import { Actor } from '../agents/Actor.ts';
import { KnowledgeGraphManager, ArtifactRef, DagNode } from './KnowledgeGraph.ts';
import { SummarizationAgent } from '../agents/Summarize.ts';
import { z } from 'zod';
// -----------------------------------------------------------------------------
// Actor–Critic engine ----------------------------------------------------------
// -----------------------------------------------------------------------------

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

const FILE_REF = z.object({
  name: z.string(), // human label ("UML‑AuthSeq")
  uri: z.string().optional(), // optional external link or S3 key
  /** Absolute or repo‑relative path, e.g. "QuickRecorder/CameraOverlay.swift" */
  path: z.string(),
  /** Optional hash to lock content for provenance */
  hash: z.string().optional(),
  /** Optional MIME, e.g. "text/x-swift" */
  contentType: z.string().optional(),
});
export type FileRef = z.infer<typeof FILE_REF>;

export const ActorThinkSchema = {
  thought: z.string().describe(THOUGHT_DESCRIPTION),

  needsMore: z
    .boolean()
    .optional()
    .describe('True if further actor work is expected before critic review.'),

  branchLabel: z
    .string()
    .optional()
    .describe('Human‑friendly name for the *first* node of an alternative branch.'),

  tags: z
    .array(z.string())
    .min(1, 'Add at least one semantic tag – requirement, task, risk, design …')
    .describe('Semantic categories used for later search and deduping.'),

  /** Actual files produced or updated by this step.*/
  artifacts: z
    .array(FILE_REF)
    .describe(
      'Declare the file set this thought will affect so the critic can ' +
        'verify coverage before code is written.' +
        'graph has durable pointers to the exact revision.',
    ),
};

export const ActorThinkSchemaZodObject = z.object(ActorThinkSchema);
export type ActorThinkInput = z.infer<typeof ActorThinkSchemaZodObject>;

export class ActorCriticEngine {
  constructor(
    private readonly kg: KnowledgeGraphManager,
    private readonly critic: Critic,
    private readonly actor: Actor,
    private readonly summarizationAgent: SummarizationAgent,
  ) {}
  /* --------------------------- public API --------------------------- */
  async actorThink(input: ActorThinkInput): Promise<DagNode> {
    const { node, decision } = await this.actor.think(input);

    // Trigger summarization check after adding a new node
    await this.summarizationAgent.checkAndTriggerSummarization();

    if (decision === Actor.THINK_DECISION.NEEDS_REVIEW) return await this.criticReview(node.id);
    return node;
  }

  async criticReview(actorNodeId: string): Promise<DagNode> {
    const criticNode = await this.critic.review(actorNodeId);

    // Trigger summarization check after adding a critic node
    await this.summarizationAgent.checkAndTriggerSummarization();

    return criticNode;
  }

  /**
   * Explicitly triggers summarization for a specific branch.
   * This can be used to generate summaries on demand.
   * @param branchIdOrLabel Branch ID or label
   * @returns The summary node if successful, or null with error information if unsuccessful
   */
  async summarizeBranch(branchIdOrLabel: string): Promise<DagNode | null> {
    const branchId = this.kg.labelIndex.get(branchIdOrLabel) ?? branchIdOrLabel;
    const result = await this.summarizationAgent.summarizeBranch(branchId);

    // Log the result for debugging
    if (!result.success) {
      console.log(
        `[summarizeBranch] Summarization failed: ${result.errorCode} - ${result.errorMessage}`,
      );
      if (result.details) {
        console.log(`[summarizeBranch] Details: ${result.details}`);
      }
    }

    return result.summary as DagNode | null;
  }
}
