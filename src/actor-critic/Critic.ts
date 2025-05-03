import { v4 as uuid } from 'uuid';
import { KnowledgeGraphManager, DagNode } from '../KnowledgeGraph.ts';
import { RevisionCounter } from './RevisionCounter.ts';
import { z } from 'zod';

export const CriticSchema = { actorNodeId: z.string().describe('ID of the actor node to critique.') };

/**
 * FILE_RX — detects a file path or filename with a wide range of extensions.
 *
 * • Accepts relative or nested paths: `src/utils/index.ts`, `./foo/bar.py`
 * • Case‑insensitive
 * • Captures extension families:
 *   - Code:  ts, tsx, js, jsx, mjs, cjs, py, go, java, kt, swift, rb, c, cpp, h, hpp,
 *            cs, rs, php, scala, sh, bat, ps1
 *   - Markup / styles: html, htm, css, scss, sass, less, xml, svg
 *   - Config / data: json, yaml, yml, toml, sql, csv, lock
 *   - Docs: md, markdown, txt, rst
 *   - Assets: png, jpg, jpeg, gif, pdf
 */
const FILE_RX =
  /(?:^|\\s)([\\w./-]+\\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|java|kt|swift|rb|c|cpp|h|hpp|cs|rs|php|scala|sh|bat|ps1|html?|css|scss|sass|less|xml|svg|json|ya?ml|toml|sql|csv|lock|md|markdown|rst|txt|png|jpe?g|gif|pdf))(?:\\s|$)/i;

function missingArtifactGuard(actorNode: DagNode): { needsFix: boolean; reason?: string } {
  const mentionsFile = FILE_RX.test(actorNode.thought);
  const hasArtifacts = !!actorNode.artifacts?.length;
  if (mentionsFile && !hasArtifacts) {
    return {
      needsFix: true,
      reason: 'Thought references a file but provided no artifacts array.  Add an artifacts array with a durable link.',
    };
  }
  return { needsFix: false };
}

export class Critic {
  constructor(private readonly kg: KnowledgeGraphManager, private readonly revisionCounter: RevisionCounter) {}
  async review(actorNodeId: string): Promise<DagNode> {
    const target = this.kg.getNode(actorNodeId);
    if (!target || (target as DagNode).role !== 'actor') throw new Error('invalid target for critic');

    let verdict: DagNode['verdict'] = 'approved';
    if (!(target as DagNode).thought.trim()) verdict = 'needs_revision';
    if (this.revisionCounter.isAtMaxRevisions(actorNodeId)) verdict = 'reject';
    const { needsFix, reason } = missingArtifactGuard(target as DagNode);
    if (needsFix) verdict = 'needs_revision';

    const criticNode: DagNode = {
      id: uuid(),
      thought: verdict === 'approved' ? '✔ Approved' : verdict === 'needs_revision' ? '✏ Needs revision' : '✗ Rejected',
      role: 'critic',
      verdict,
      ...(reason && { verdictReason: reason }),
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
