import { CFG } from '../config.ts';

export class RevisionCounter {
  public static MAX_REVISION_CYCLES = CFG.MAX_REVISION_CYCLES;
  private revisionCounter: Record<string, number> = {};
  constructor(private readonly maxRevisionCycles: number) {}

  public isAtMaxRevisions(actorNodeId: string): boolean {
    return this.get(actorNodeId) >= this.maxRevisionCycles;
  }

  public get(actorNodeId: string): number {
    return this.revisionCounter[actorNodeId] ?? 0;
  }

  public increment(actorNodeId: string): void {
    const cycles = this.get(actorNodeId);
    this.revisionCounter[actorNodeId] = cycles + 1;
  }
  public decrement(actorNodeId: string): void {
    const cycles = this.get(actorNodeId);
    if (cycles > 0) this.revisionCounter[actorNodeId]--;
  }
  public delete(actorNodeId: string): void {
    delete this.revisionCounter[actorNodeId];
  }
}
