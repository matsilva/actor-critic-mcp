import pino, { type Logger } from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type CodeLoopsLogger = pino.Logger;
let globalLogger: CodeLoopsLogger | null = null;

interface CreateLoggerOptions {
  withDevStdout?: boolean;
  sync?: boolean;
  setGlobal?: boolean;
}

const logsDir = path.resolve(__dirname, '../logs');
const logFile = path.join(logsDir, 'codeloops.log');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
/**
 * Creates and returns a new pino logger instance with the given options.
 * Also sets the global logger if not already set.
 */
export function createLogger(options?: CreateLoggerOptions): CodeLoopsLogger {
  // Ensure logs directory exists
  const targets: pino.TransportTargetOptions[] = [
    {
      target: 'pino-roll',
      options: {
        file: logFile,
        //TODO: make this all configurable by the user
        frequency: 'daily',
        limit: {
          count: 14, // 14 days of log retention
        },
      },
    },
  ];
  if (options?.withDevStdout) {
    targets.push({
      target: 'pino-pretty',
      options: {
        destination: 1,
      },
    });
  }
  const transports = pino.transport({
    targets,
    ...(options ?? {}),
  });
  const logger = pino(transports);
  if (options?.setGlobal && !globalLogger) {
    globalLogger = logger;
  }
  return logger;
}

/**
 * Returns the global singleton logger instance. If not created, creates with default options.
 */
export function getInstance(options?: CreateLoggerOptions): CodeLoopsLogger {
  if (!globalLogger) {
    createLogger({ ...options, setGlobal: true });
  }
  return globalLogger!;
}

export function setGlobalLogger(logger: CodeLoopsLogger) {
  globalLogger = logger;
}
