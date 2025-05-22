/**
 * Migration script to convert existing per-project JSON files to the new unified NDJSON format
 *
 * This script:
 * 1. Reads all existing kg.*.json files in the data directory
 * 2. Extracts the project name from each file name
 * 3. Parses the JSON content and adds the project field to each entity
 * 4. Writes all entities to the new knowledge_graph.ndjson file
 * 5. Includes error handling and logging
 *
 * Usage: ts-node scripts/migrate.ts
 */

import fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import path from 'node:path';
import { dataDir } from '../../src/config.ts';
import { createLogger, getInstance as getLogger } from '../../src/logger.ts';
import { extractProjectName } from '../../src/utils/project.ts';
import { createInterface } from 'node:readline';
import { createCodeLoopsAscii } from '../../src/utils/fun.ts';
import { DagNode } from '../../src/engine/KnowledgeGraph.ts';
import { table } from 'table';
import chalk from 'chalk';

const logger = getLogger({ withDevStdout: true, sync: true });
const silentLogger = createLogger({ sync: true });

// Path to the new NDJSON file
const ndjsonFilePath = path.resolve(dataDir, 'knowledge_graph.ndjson');
const failedEntitiesFilePath = path.resolve(dataDir, 'failed_entities.ndjson');
const backupDir = path.resolve(dataDir, 'backups');
const backupPathFile = path.resolve(backupDir, `${ndjsonFilePath}.backup.${Date.now()}`);
if (!fsSync.existsSync(backupDir)) {
  fsSync.mkdirSync(backupDir, { recursive: true });
}

// Regular expression to extract project name from file name
const projectFileRegex = /^kg\.(.+)\.json$/;

async function migrateProjectFiles() {
  console.log(createCodeLoopsAscii());
  logger.info('Starting migration of knowledge graph to unified knowledge graph NDJSON format');
  try {
    // Create a backup of the NDJSON file if it already exists
    if (fsSync.existsSync(ndjsonFilePath)) {
      silentLogger.info(`Creating backup of ${ndjsonFilePath} to ${backupPathFile}`);
      await fs.copyFile(ndjsonFilePath, backupPathFile);
    }

    // Get all files in the data directory
    silentLogger.info(`Reading files in ${dataDir}`);
    const files = await fs.readdir(dataDir);

    // Filter for project files
    const projectFiles = files.filter(
      (file) => projectFileRegex.test(file) && file !== 'kg.json', // Exclude the legacy kg.json file
    );

    logger.info(`Projects found: ${projectFiles.length}`);

    // Create or clear the NDJSON file
    silentLogger.info(`Creating NDJSON file at ${ndjsonFilePath}`);
    await fs.writeFile(ndjsonFilePath, '', 'utf8');

    const migrationMetrics = {
      totalProcessed: 0,
      totalFailed: 0,
      projects: {},
    };

    const incrementTotalProcessed = () => {
      migrationMetrics.totalProcessed++;
    };

    const incrementTotalFailed = () => {
      migrationMetrics.totalFailed++;
    };

    const incrementProjectProcessed = (projectName: string) => {
      incrementTotalProcessed();
      if (!migrationMetrics.projects[projectName]) {
        migrationMetrics.projects[projectName] = { processed: 0, failed: 0 };
      }
      const projectMetrics = migrationMetrics.projects[projectName];
      if (!projectMetrics) return;
      projectMetrics.processed++;
      migrationMetrics.projects[projectName] = projectMetrics;
    };

    const incrementProjectFailed = (projectName: string) => {
      incrementTotalFailed();
      if (!migrationMetrics.projects[projectName]) {
        migrationMetrics.projects[projectName] = { processed: 0, failed: 0 };
      }
      const projectMetrics = migrationMetrics.projects[projectName];
      if (!projectMetrics) return;
      projectMetrics.failed++;
      migrationMetrics.projects[projectName] = projectMetrics;
    };

    for (const file of projectFiles) {
      const match = file.match(projectFileRegex);
      if (!match) {
        silentLogger.info(`Skipping file ${file}`);
        continue;
      }
      const projectName = match[1];
      const filePath = path.resolve(dataDir, file);

      logger.info('Processing project: ' + projectName);
      silentLogger.info({ file, projectName });

      try {
        // Read and parse the project file
        silentLogger.info('Reading file: ' + filePath);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const jsonData = JSON.parse(fileContent);

        // Extract entities and relations
        const entities: DagNode = jsonData.entities || {};

        // Process and write entities to NDJSON
        for (const [, entity] of Object.entries(entities)) {
          //skip non-actor or critic entities
          if (!entity.role) continue;

          // Add project field to the entity
          const enrichedEntity = {
            ...entity,
            //project context is used to infer the project name from the last item in the path.
          };

          incrementProjectProcessed(projectName);
          // due to an issue with legacy project management, the data might be mixed in multiple project files.
          if (entity.projectContext) {
            enrichedEntity.projectContext = entity.projectContext;
            enrichedEntity.project = extractProjectName(entity.projectContext);
          } else if (projectName) {
            enrichedEntity.project = projectName;
            enrichedEntity.projectContext = `/this/is/fine/${projectName}`;
          } else {
            silentLogger.info({ entity, projectName, filePath }, 'Failed to process entity');
            await fs.appendFile(
              failedEntitiesFilePath,
              JSON.stringify(enrichedEntity) + '\n',
              'utf8',
            );
            incrementProjectFailed(projectName);
            continue;
          }

          // Write to NDJSON file (one JSON object per line)
          silentLogger.info({ entity, projectName, filePath }, 'Writing entity to NDJSON file');
          await fs.appendFile(ndjsonFilePath, JSON.stringify(enrichedEntity) + '\n', 'utf8');
        }

        // Create a backup of the original project file
        const backupPath = path.resolve(backupDir, `${file}.backup.${Date.now()}`);
        silentLogger.info({ backupPath, filePath }, 'Creating backup of project file');
        await fs.copyFile(filePath, backupPath);
      } catch (error) {
        logger.error(`Error processing project ${projectName}:`, error);
      }
    }

    if (fsSync.existsSync(backupPathFile)) {
      const backupStream = fsSync.createReadStream(backupPathFile);
      silentLogger.info({ backupPathFile }, 'Adding original NDJSON file entries');
      const rl = createInterface({
        input: backupStream,
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        await fs.appendFile(ndjsonFilePath, line + '\n', 'utf8');
      }
      backupStream.close();
      rl.close();
      silentLogger.info(`Successfully added original NDJSON file entries from ${backupPathFile}`);
    }

    silentLogger.info(`New NDJSON file created at: ${ndjsonFilePath}`);
    silentLogger.info(migrationMetrics, 'Migration metrics:');
    logger.info('Migration metrics:');
    logMigrationMetricsToAscii(migrationMetrics);
    logger.info('CodeLoops is now ready to use with new and improved knowledge graph management!');
  } catch (error) {
    logger.error(error);
    logger.info('Migration failed.');
    process.exit(1);
  }
}

// Run the migration
migrateProjectFiles().catch((error) => {
  console.error('Unhandled error during migration:', error);
  process.exit(1);
});

//output utils

/// Define interfaces for the metrics structure
interface ProjectMetrics {
  processed: number;
  failed: number;
}

interface MigrationMetrics {
  totalProcessed: number;
  totalFailed: number;
  projects: Record<string, ProjectMetrics>;
}

function logMigrationMetricsToAscii(metrics: MigrationMetrics): void {
  const projectTableData: string[][] = [
    [chalk.cyan('Project'), chalk.cyan('Processed'), chalk.cyan('Failed')], // Headers
    ...Object.entries(metrics.projects).map(([projectName, stats]) => [
      projectName,
      chalk.green(stats.processed.toString()),
      chalk.red(stats.failed.toString()),
    ]),
  ];

  const projectTable = table(projectTableData, {
    border: {
      topBody: `─`,
      topJoin: `┬`,
      topLeft: `┌`,
      topRight: `┐`,
      bottomBody: `─`,
      bottomJoin: `┴`,
      bottomLeft: `└`,
      bottomRight: `┘`,
      bodyLeft: `│`,
      bodyRight: `│`,
      bodyJoin: `│`,
      joinLeft: `├`,
      joinRight: `┤`,
      joinBody: `─`,
      joinJoin: `┼`,
    },
  });

  const totalsTableData: string[][] = [
    [chalk.cyan('Metric'), chalk.cyan('Value')], // Headers
    ['Total Processed', chalk.green(metrics.totalProcessed.toString())],
    ['Total Failed', chalk.red(metrics.totalFailed.toString())],
  ];

  const totalsTable = table(totalsTableData, {
    border: {
      topBody: `─`,
      topJoin: `┬`,
      topLeft: `┌`,
      topRight: `┐`,
      bottomBody: `─`,
      bottomJoin: `┴`,
      bottomLeft: `└`,
      bottomRight: `┘`,
      bodyLeft: `│`,
      bodyRight: `│`,
      bodyJoin: `│`,
      joinLeft: `├`,
      joinRight: `┤`,
      joinBody: `─`,
      joinJoin: `┼`,
    },
  });

  // Log the message and both tables
  logger.info('\n' + projectTable + '\n' + totalsTable);
}
