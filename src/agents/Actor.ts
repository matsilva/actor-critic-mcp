import { v4 as uuid } from 'uuid';
import { KnowledgeGraphManager, ArtifactRef, DagNode } from '../engine/KnowledgeGraph.ts';
import { ActorThinkInput } from '../engine/ActorCriticEngine.ts';

export class Actor {
  constructor(private readonly kg: KnowledgeGraphManager) {}

  async think(
    input: ActorThinkInput & { artifacts?: Partial<ArtifactRef>[]; project: string },
  ): Promise<{ node: DagNode }> {
    const { thought, branchLabel, tags, artifacts, project, projectContext } = input;

    const parents = this.kg.getHeads(project).map((h) => h.id);

    const node: DagNode = {
      id: uuid(),
      project,
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
    await this.kg.appendEntity(node);

    // Handle artifacts
    if (artifacts && artifacts.length) {
      for (const artifact of artifacts) {
        const artifactEntity: ArtifactRef = {
          ...artifact,
          id: artifact.id ?? uuid(),
          project,
        } as ArtifactRef;
        await this.kg.appendEntity(artifactEntity);

        // Update node's children to include artifact reference
        if (!node.children.includes(artifactEntity.id)) {
          node.children.push(artifactEntity.id);
        }
      }
    }
    if (branchLabel) this.kg.labelIndex.set(branchLabel, node.id);

    return { node };
  }
}
