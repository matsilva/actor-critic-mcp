import { v4 as uuid } from 'uuid';
import { KnowledgeGraphManager, ArtifactRef, DagNode } from '../engine/KnowledgeGraph.ts';
import { ActorThinkInput } from '../engine/ActorCriticEngine.ts';

export class Actor {
  constructor(private readonly kg: KnowledgeGraphManager) {}

  async think(
    input: ActorThinkInput & { artifacts?: Partial<ArtifactRef>[]; project: string },
  ): Promise<{ node: DagNode }> {
    const {
      thought,
      tags,
      artifacts,
      project,
      projectContext,
      parents: inputParents,
      diff,
    } = input;

    const parents =
      inputParents && inputParents.length > 0
        ? inputParents
        : (await this.kg.getHeads(project)).map((h) => h.id);

    const node: DagNode = {
      id: uuid(),
      project,
      thought,
      role: 'actor',
      parents,
      children: [],
      createdAt: '', // Will be set by appendEntity
      tags,
      ...(diff && { diff }),
      artifacts: artifacts as ArtifactRef[],
      projectContext,
    };

    await this.kg.appendEntity(node);

    for (const parentId of parents) {
      const parent = await this.kg.getNode(parentId);
      if (parent && !parent.children.includes(node.id)) {
        parent.children.push(node.id);
        await this.kg.appendEntity(parent);
      }
    }

    return { node };
  }
}
