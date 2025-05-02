import path from 'node:path';

// -----------------------------------------------------------------------------
// Configuration ----------------------------------------------------------------
// -----------------------------------------------------------------------------

export const CFG = {
  WINDOW: Number(process.env.WINDOW ?? 20),
  CRITIC_EVERY_N_STEPS: Number(process.env.critic_every_n_steps ?? 3),
  MAX_REVISION_CYCLES: Number(process.env.max_revision_cycles ?? 2),
  MEMORY_FILE_PATH: process.env.MEMORY_FILE_PATH ?? path.resolve(process.cwd(), 'memory.json'),
};
