import path from 'node:path';
import fs from 'node:fs';

// -----------------------------------------------------------------------------
// Configuration ----------------------------------------------------------------
// -----------------------------------------------------------------------------

const dataDir = path.resolve(import.meta.dirname, '..', 'data');
const defaultMemoryFilePath = path.resolve(dataDir, 'memory.json'); //todo: place in ~/.config/acdc - actor critic directed context

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(defaultMemoryFilePath)) fs.writeFileSync(defaultMemoryFilePath, '{}', 'utf8');

export const CFG = {
  WINDOW: Number(process.env.WINDOW ?? 20),
  CRITIC_EVERY_N_STEPS: Number(process.env.critic_every_n_steps ?? 3),
  MAX_REVISION_CYCLES: Number(process.env.max_revision_cycles ?? 2),
  MEMORY_FILE_PATH: process.env.MEMORY_FILE_PATH ?? defaultMemoryFilePath,
};
