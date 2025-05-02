import { v4 as uuid } from 'uuid';
import { KnowledgeGraphManager, ArtifactRef, DagNode } from '../KnowledgeGraph.ts';
import { RevisionCounter } from './RevisionCounter.ts';
import { CFG } from '../config.ts';

export type ThinkDecision = (typeof Actor.THINK_DECISION)[keyof typeof Actor.THINK_DECISION];

export class Actor {
  public static CRITIC_EVERY_N_STEPS = CFG.CRITIC_EVERY_N_STEPS;
  public static THINK_DECISION = {
    CONTINUE: 'CONTINUE',
    NEEDS_REVIEW: 'NEEDS_REVIEW',
  };
  constructor(private readonly kg: KnowledgeGraphManager) {}

  async think(input: {
    thought: string;
    needsMore?: boolean;
    branchLabel?: string;
    tags?: string[];
    artifacts?: Partial<ArtifactRef>[];
  }): Promise<{ node: DagNode; decision: ThinkDecision }> {
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
    if (branchLabel) this.kg.labelIndex.set(branchLabel, node.id);
    await this.kg.flush();

    const totalSteps = this.kg.allDagNodes().length;
    if (totalSteps % CFG.CRITIC_EVERY_N_STEPS === 0 || !needsMore) {
      return { node, decision: Actor.THINK_DECISION.NEEDS_REVIEW };
    }

    return { node, decision: Actor.THINK_DECISION.CONTINUE };
  }
}
