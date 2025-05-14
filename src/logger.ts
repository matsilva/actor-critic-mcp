import pino, { Logger, LoggerOptions } from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// -----------------------------------------------------------------------------
// Path Configuration ----------------------------------------------------------
// -----------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let globalLogger: Logger | null = null;

/**
 * Creates and returns a new pino logger instance with the given options.
 * Also sets the global logger if not already set.
 */
export function createLogger(options?: LoggerOptions): Logger {
  if (!globalLogger) {
    const devToStdout = process.env.NODE_ENV === 'development';
    let destination: pino.DestinationStream;
    if (devToStdout) {
      destination = pino.destination(1); // stdout
    } else {
      // Ensure logs directory exists
      const logsDir = path.resolve(__dirname, '../logs');
      const logFile = path.join(logsDir, 'codeloops.log');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      destination = pino.destination(logFile);
    }
    globalLogger = pino(options ?? {}, destination);
  }
  return globalLogger;
}

/**
 * Returns the global singleton logger instance. If not created, creates with default options.
 */
export function getInstance(): Logger {
  if (!globalLogger) {
    createLogger();
  }
  return globalLogger!;
}
