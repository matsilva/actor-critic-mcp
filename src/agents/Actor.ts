import { v4 as uuid } from 'uuid';
import { KnowledgeGraphManager, ArtifactRef, DagNode } from '../engine/KnowledgeGraph.ts';
import { CFG } from '../config.ts';
import { ActorThinkInput } from '../engine/ActorCriticEngine.ts';
import { extractProjectName } from '../utils/projectUtils.ts';

export type ThinkDecision = (typeof Actor.THINK_DECISION)[keyof typeof Actor.THINK_DECISION];

export class Actor {
  public static CRITIC_EVERY_N_STEPS = CFG.CRITIC_EVERY_N_STEPS;
  public static THINK_DECISION = {
    CONTINUE: 'CONTINUE',
    NEEDS_REVIEW: 'NEEDS_REVIEW',
  };
  constructor(private readonly kg: KnowledgeGraphManager) {}

  async think(
    input: ActorThinkInput & { artifacts?: Partial<ArtifactRef>[] },
  ): Promise<{ node: DagNode; decision: ThinkDecision }> {
    const needsMore = false; //hardcoding this for pending removal of this logic flow
    const { thought, branchLabel, tags, artifacts, projectContext } = input;

    if (!projectContext) {
      throw new Error('projectContext is required');
    }

    const projectName = extractProjectName(projectContext);
    if (!projectName) {
      throw new Error('Invalid projectContext');
    }

    const parents = this.kg.getHeads(projectName).map((h) => h.id);

    const node: DagNode = {
      id: uuid(),
      project: '', // Will be set by appendEntity
      thought,
      role: 'actor',
      parents,
      children: [],
      createdAt: '', // Will be set by appendEntity
      branchLabel,
      tags,
      artifacts: artifacts as ArtifactRef[],
      projectContext,
    };

    // Persist node
    await this.kg.appendEntity(node, projectContext);

    // Handle artifacts
    if (artifacts && artifacts.length) {
      for (const art of artifacts) {
        const artEntity: ArtifactRef = {
          ...art,
          id: art.id ?? uuid(),
          project: '', // Will be set by appendEntity
        } as ArtifactRef;
        await this.kg.appendEntity(artEntity, projectContext);

        // Update node's children to include artifact reference
        if (!node.children.includes(artEntity.id)) {
          node.children.push(artEntity.id);
        }
      }
    }
    if (branchLabel) this.kg.labelIndex.set(branchLabel, node.id);

    const totalSteps = this.kg.allDagNodes(projectName).length;
    if (totalSteps % CFG.CRITIC_EVERY_N_STEPS === 0 || !needsMore) {
      return { node, decision: Actor.THINK_DECISION.NEEDS_REVIEW };
    }

    return { node, decision: Actor.THINK_DECISION.CONTINUE };
  }
}
