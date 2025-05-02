import { v4 as uuid } from 'uuid';
import { KnowledgeGraphManager, DagNode } from '../KnowledgeGraph.ts';
import { RevisionCounter } from './RevisionCounter.ts';
import { z } from 'zod';

export const CriticSchema = { actorNodeId: z.string().describe('ID of the actor node to critique.') };

export class Critic {
  constructor(private readonly kg: KnowledgeGraphManager, private readonly revisionCounter: RevisionCounter) {}
  async review(actorNodeId: string): Promise<DagNode> {
    const target = this.kg.getNode(actorNodeId);
    if (!target || (target as DagNode).role !== 'actor') throw new Error('invalid target for critic');

    let verdict: DagNode['verdict'] = 'approved';
    if (!(target as DagNode).thought.trim()) verdict = 'needs_revision';
    if (this.revisionCounter.isAtMaxRevisions(actorNodeId)) verdict = 'reject';

    const criticNode: DagNode = {
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
    this.kg.createEntity(criticNode);
    this.kg.createRelation(actorNodeId, criticNode.id, relType);
    await this.kg.flush();

    if (verdict === 'needs_revision') this.revisionCounter.increment(actorNodeId);
    else this.revisionCounter.delete(actorNodeId);

    return criticNode;
  }
}
