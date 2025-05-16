import { v4 as uuid } from 'uuid';
import { KnowledgeGraphManager, ArtifactRef, DagNode } from '../engine/KnowledgeGraph.ts';
import { ActorThinkInput } from '../engine/ActorCriticEngine.ts';

export class Actor {
  constructor(private readonly kg: KnowledgeGraphManager) {}

  async think(
    input: ActorThinkInput & { artifacts?: Partial<ArtifactRef>[]; project: string },
  ): Promise<{ node: DagNode }> {
    const { thought, tags, artifacts, project, projectContext } = input;

    //TODO: rework parents
    // const parents = (await this.kg.getHeads(project)).map((h) => h.id);

    const node: DagNode = {
      id: uuid(),
      project,
      thought,
      role: 'actor',
      parents: [],
      children: [],
      createdAt: '', // Will be set by appendEntity
      tags,
      artifacts: artifacts as ArtifactRef[],
      projectContext,
    };

    // Persist node
    await this.kg.appendEntity(node);

    return { node };
  }
}
