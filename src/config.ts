import path from 'node:path';
import { fileURLToPath } from 'node:url';

// -----------------------------------------------------------------------------
// Path Configuration ----------------------------------------------------------
// -----------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const dataDir = path.resolve(__dirname, '..', 'data');

// Note: Project-related configuration has been removed as part of the knowledge graph persistence redesign
// The system now uses a single NDJSON file for all projects

// -----------------------------------------------------------------------------
// Configuration Constants -----------------------------------------------------
// -----------------------------------------------------------------------------

export const CFG = {
  // Application settings
  WINDOW: Number(process.env.WINDOW ?? 20),
  CRITIC_EVERY_N_STEPS: Number(process.env.critic_every_n_steps ?? 3),
  MAX_REVISION_CYCLES: Number(process.env.max_revision_cycles ?? 2),
};
