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
import { fileURLToPath } from 'node:url';
import { dataDir } from '../src/config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the new NDJSON file
const ndjsonFilePath = path.resolve(dataDir, 'knowledge_graph.ndjson');

// Regular expression to extract project name from file name
const projectFileRegex = /^kg\.(.+)\.json$/;

async function migrateProjectFiles() {
  console.log('Starting migration of project files to unified NDJSON format');
  console.log(`Data directory: ${dataDir}`);
  console.log(`Target NDJSON file: ${ndjsonFilePath}`);

  try {
    // Create a backup of the NDJSON file if it already exists
    if (fsSync.existsSync(ndjsonFilePath)) {
      const backupPath = `${ndjsonFilePath}.backup.${Date.now()}`;
      console.log(`Backing up existing NDJSON file to ${backupPath}`);
      await fs.copyFile(ndjsonFilePath, backupPath);
    }

    // Get all files in the data directory
    const files = await fs.readdir(dataDir);
    
    // Filter for project files
    const projectFiles = files.filter(file => 
      projectFileRegex.test(file) && file !== 'kg.json' // Exclude the legacy kg.json file
    );
    
    console.log(`Found ${projectFiles.length} project files to migrate`);
    
    // Create or clear the NDJSON file
    await fs.writeFile(ndjsonFilePath, '', 'utf8');
    
    // Process each project file
    for (const file of projectFiles) {
      const match = file.match(projectFileRegex);
      if (!match) continue;
      
      const projectName = match[1];
      const filePath = path.resolve(dataDir, file);
      
      console.log(`Processing project: ${projectName} (${filePath})`);
      
      try {
        // Read and parse the project file
        const fileContent = await fs.readFile(filePath, 'utf8');
        const jsonData = JSON.parse(fileContent);
        
        // Extract entities and relations
        const entities = jsonData.entities || {};
        const relations = jsonData.relations || [];
        
        console.log(`  Found ${Object.keys(entities).length} entities and ${relations.length} relations`);
        
        // Process and write entities to NDJSON
        let entityCount = 0;
        for (const [id, entity] of Object.entries(entities)) {
          // Add project field to the entity
          const enrichedEntity = {
            ...entity,
            project: projectName,
          };
          
          // Write to NDJSON file (one JSON object per line)
          await fs.appendFile(ndjsonFilePath, JSON.stringify(enrichedEntity) + '\n', 'utf8');
          entityCount++;
        }
        
        console.log(`  Migrated ${entityCount} entities from project ${projectName}`);
        
        // Create a backup of the original project file
        const backupPath = `${filePath}.backup.${Date.now()}`;
        console.log(`  Backing up original project file to ${backupPath}`);
        await fs.copyFile(filePath, backupPath);
        
      } catch (error) {
        console.error(`Error processing project ${projectName}:`, error);
      }
    }
    
    console.log('Migration completed successfully');
    console.log(`New NDJSON file created at: ${ndjsonFilePath}`);
    console.log('You can now use the new KnowledgeGraphManager with the unified NDJSON format');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateProjectFiles().catch(error => {
  console.error('Unhandled error during migration:', error);
  process.exit(1);
});
