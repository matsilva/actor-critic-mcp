import path from 'node:path';
import { getInstance as getLogger } from '../logger.ts';

/**
 * Extracts a valid project name from a project context (typically a file path).
 *
 * @param projectContext The project context, typically a file path
 * @returns A valid project name or null if the context is invalid
 */
export function extractProjectName(
  projectContext: string,
  { logger }: { logger?: any } = { logger: getLogger() },
): string | null {
  if (!projectContext || typeof projectContext !== 'string' || projectContext.trim() === '') {
    logger.info(`Invalid projectContext: ${projectContext}`);
    return null;
  }

  const normalizedPath = path.normalize(projectContext);
  const lastSegment = path.basename(normalizedPath);
  const cleanedProjectName = lastSegment.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
  const validNameRegex = /^[a-zA-Z0-9_-]+$/;

  if (!validNameRegex.test(cleanedProjectName)) {
    logger.info(`Invalid project name: ${cleanedProjectName}`);
    return null;
  }

  return cleanedProjectName;
}
