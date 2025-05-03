import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// -----------------------------------------------------------------------------
// Configuration ----------------------------------------------------------------
// -----------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '..', 'data');
const defaultMemoryFilePath = path.resolve(dataDir, 'kg.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(defaultMemoryFilePath)) fs.writeFileSync(defaultMemoryFilePath, '{}', 'utf8');

export const CFG = {
  WINDOW: Number(process.env.WINDOW ?? 20),
  CRITIC_EVERY_N_STEPS: Number(process.env.critic_every_n_steps ?? 3),
  MAX_REVISION_CYCLES: Number(process.env.max_revision_cycles ?? 2),
  MEMORY_FILE_PATH: process.env.MEMORY_FILE_PATH ?? defaultMemoryFilePath,
};
