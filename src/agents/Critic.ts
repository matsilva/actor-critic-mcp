import { execa } from 'execa';
import { to } from 'await-to-js';
import { v4 as uuid } from 'uuid';
import { KnowledgeGraphManager, DagNode } from '../engine/KnowledgeGraph.ts';
import { RevisionCounter } from '../engine/RevisionCounter.ts';
import { getInstance as getLogger } from '../logger.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  constructor(
    private readonly kg: KnowledgeGraphManager,
    private readonly revisionCounter: RevisionCounter,
  ) {}
  async review(actorNodeId: string): Promise<DagNode> {
    const target = this.kg.getNode(actorNodeId);
    if (!target || (target as DagNode).role !== 'actor')
      throw new Error('invalid target for critic');

    let verdict: DagNode['verdict'] = 'approved';
    let reason: DagNode['verdictReason'] | undefined;

    if ((target as DagNode).thought.trim() === '') verdict = 'needs_revision';
    if (this.revisionCounter.isAtMaxRevisions(actorNodeId)) verdict = 'reject';
    const artifactGuard = missingArtifactGuard(target as DagNode);
    if (artifactGuard.needsFix) verdict = 'needs_revision';
    if (artifactGuard.reason) reason = artifactGuard.reason;

    if (verdict === 'approved') {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const criticDir = path.resolve(__dirname, '..', '..', 'agents', 'critic');
      const targetJson = JSON.stringify(target);
      const [criticError, output] = await to(
        execa('uv', ['run', 'agent.py', '--quiet', '--agent', 'default', '--message', targetJson], {
          cwd: criticDir,
        }),
      );

      if (criticError) {
        throw criticError;
      }
      try {
        const json = JSON.parse(output.stdout) as {
          verdict: DagNode['verdict'];
          verdictReason?: string;
        };
        verdict = json.verdict;
        reason = json.verdictReason;
      } catch (err) {
        getLogger().error({ err }, 'Failed to parse JSON from uv mcp-server-fetch');
      }
    }

    const criticNode: DagNode = {
      id: uuid(),
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
      createdAt: new Date().toISOString(),
    };

    const relType =
      verdict === 'approved' ? 'approves' : verdict === 'needs_revision' ? 'criticises' : 'rejects';
    this.kg.createEntity(criticNode);
    this.kg.createRelation(actorNodeId, criticNode.id, relType);
    await this.kg.flush();

    if (verdict === 'needs_revision') this.revisionCounter.increment(actorNodeId);
    else this.revisionCounter.delete(actorNodeId);

    return criticNode;
  }
}
