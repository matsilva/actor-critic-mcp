import path from 'node:path';
import { fileURLToPath } from 'node:url';

// -----------------------------------------------------------------------------
// Path Configuration ----------------------------------------------------------
// -----------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const dataDir = path.resolve(__dirname, '..', 'data');
