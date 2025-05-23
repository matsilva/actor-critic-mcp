import path from 'node:path';
import { fileURLToPath } from 'node:url';

// -----------------------------------------------------------------------------
// Path Configuration ----------------------------------------------------------
// -----------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const dataDir = path.resolve(__dirname, '..', 'data');

// -----------------------------------------------------------------------------
// Gemini Configuration --------------------------------------------------------
// -----------------------------------------------------------------------------

/**
 * Default cache TTL (in seconds) for Gemini context caching.
 * Configurable via the GEMINI_CACHE_TTL environment variable.
 */
export const GEMINI_CACHE_TTL = Number.parseInt(process.env.GEMINI_CACHE_TTL ?? '3600', 10);
