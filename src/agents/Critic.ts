import { v4 as uuid } from 'uuid';
import { KnowledgeGraphManager, DagNode } from '../engine/KnowledgeGraph.ts';
import { getInstance as getLogger } from '../logger.ts';
import { CriticAgent } from './CriticAgent.ts';
import { z } from 'zod';

export const CriticSchema = {
  actorNodeId: z.string().describe('ID of the actor node to critique.'),
};

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
      reason:
        'Thought references a file but provided no artifacts array.  Add an artifacts array with a durable link.',
    };
  }
  return { needsFix: false };
}

export class Critic {
  private readonly criticAgent: CriticAgent;

  constructor(private readonly kg: KnowledgeGraphManager) {
    this.criticAgent = new CriticAgent({ logger: getLogger() });
  }

  async review({
    actorNodeId,
    project,
    projectContext,
  }: {
    actorNodeId: string;
    project: string;
    projectContext: string;
  }): Promise<DagNode> {
    const target = await this.kg.getNode(actorNodeId);
    if (!target || (target as DagNode).role !== 'actor')
      throw new Error('invalid target for critic');

    let verdict: DagNode['verdict'] = 'approved';
    let reason: DagNode['verdictReason'] | undefined;

    if ((target as DagNode).thought.trim() === '') verdict = 'needs_revision';
    const artifactGuard = missingArtifactGuard(target as DagNode);
    if (artifactGuard.needsFix) verdict = 'needs_revision';
    if (artifactGuard.reason) reason = artifactGuard.reason;

    if (verdict === 'approved') {
      try {
        const criticResponse = await this.criticAgent.reviewActorNode(target as DagNode);
        verdict = (criticResponse as any).verdict;
        reason = (criticResponse as any).verdictReason;
      } catch (err) {
        getLogger().error({ err }, 'CriticAgent failed to review actor node');
        // Fallback to needs_revision if critic agent fails
        verdict = 'needs_revision';
        reason = 'Critic agent evaluation failed';
      }
    }

    const criticNode: DagNode = {
      id: uuid(),
      project,
      thought:
        verdict === 'approved'
          ? '✔ Approved'
          : verdict === 'needs_revision'
            ? '✏ Needs revision'
            : '✗ Rejected',
      role: 'critic',
      verdict,
      ...(reason && { verdictReason: reason }),
      target: actorNodeId,
      parents: [actorNodeId],
      children: [],
      tags: [],
      artifacts: [],
      createdAt: '', // Will be set by appendEntity
      projectContext,
    };

    // Update the target node's children to include this critic node
    if (target && !target.children.includes(criticNode.id)) {
      target.children.push(criticNode.id);
      // Update the target node in the knowledge graph
      await this.kg.appendEntity(target);
    }

    // Persist the critic node
    await this.kg.appendEntity(criticNode);

    return criticNode;
  }
}
