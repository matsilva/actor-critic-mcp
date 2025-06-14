/**
 * Migration script to convert FastAgent YAML configurations to .env variables
 *
 * This script:
 * 1. Reads fastagent.config.yaml and fastagent.secrets.yaml from agents/critic and agents/summarize
 * 2. Extracts model configurations and API keys
 * 3. Converts them to environment variables compatible with the new VoltAgent-based system
 * 4. Creates or updates a .env file in the project root
 * 5. Provides backup and rollback capabilities
 *
 * Usage: ts-node scripts/migrations/migrate_agents_to_env.ts
 */

import fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import path from 'node:path';
import { parse as yamlParse } from 'yaml';
import { getInstance as getLogger } from '../../src/logger.ts';
import { createCodeLoopsAscii } from '../../src/utils/fun.ts';
import chalk from 'chalk';

const logger = getLogger({ withDevStdout: true, sync: true });

// Paths to agent configuration files
const AGENT_DIRS = ['agents/critic', 'agents/summarize'];
const PROJECT_ROOT = process.cwd();
const ENV_FILE_PATH = path.resolve(PROJECT_ROOT, '.env');
const BACKUP_DIR = path.resolve(PROJECT_ROOT, 'backups');

// Ensure backup directory exists
if (!fsSync.existsSync(BACKUP_DIR)) {
  fsSync.mkdirSync(BACKUP_DIR, { recursive: true });
}

interface FastAgentConfig {
  default_model?: string;
  logger?: {
    level?: string;
    progress_display?: boolean;
    show_chat?: boolean;
    show_tools?: boolean;
    truncate_tools?: boolean;
  };
}

interface FastAgentSecrets {
  openai?: {
    api_key?: string;
  };
  anthropic?: {
    api_key?: string;
  };
  deepseek?: {
    api_key?: string;
  };
  openrouter?: {
    api_key?: string;
  };
}

interface MigrationResult {
  envVars: Record<string, string>;
  backupPath?: string;
  warnings: string[];
  errors: string[];
}

/**
 * Parse FastAgent model string to extract provider and model
 */
function parseModelString(modelString: string): { provider: string; model: string } {
  // Handle aliases first
  const aliases: Record<string, { provider: string; model: string }> = {
    haiku: { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
    haiku3: { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
    sonnet: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    sonnet35: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    opus: { provider: 'anthropic', model: 'claude-3-opus-20240229' },
    opus3: { provider: 'anthropic', model: 'claude-3-opus-20240229' },
    'gpt-4.1': { provider: 'openai', model: 'gpt-4o' },
    'gpt-4.1-mini': { provider: 'openai', model: 'gpt-4o-mini' },
    o1: { provider: 'openai', model: 'o1-preview' },
    'o1-mini': { provider: 'openai', model: 'o1-mini' },
    'o3-mini': { provider: 'openai', model: 'o3-mini' },
  };

  if (aliases[modelString]) {
    return aliases[modelString];
  }

  // Parse provider.model.reasoning_effort format
  const parts = modelString.split('.');
  if (parts.length >= 2) {
    return {
      provider: parts[0],
      model: parts.slice(1).join('.'), // Handle models with dots
    };
  }

  // Default fallback
  return {
    provider: 'anthropic',
    model: modelString || 'claude-3-haiku-20240307',
  };
}

/**
 * Convert FastAgent model to environment variable format
 */
function modelToEnvVar(modelString: string): Record<string, string> {
  const { provider, model } = parseModelString(modelString);

  switch (provider) {
    case 'anthropic':
      return {
        ANTHROPIC_MODEL: model,
        PREFERRED_PROVIDER: 'anthropic',
      };
    case 'openai':
      return {
        OPENAI_MODEL: model,
        PREFERRED_PROVIDER: 'openai',
      };
    case 'azure':
      return {
        AZURE_OPENAI_MODEL: model,
        PREFERRED_PROVIDER: 'azure',
      };
    default:
      return {
        DEFAULT_MODEL: model,
        PREFERRED_PROVIDER: provider,
      };
  }
}

/**
 * Read and parse a YAML file safely
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readYamlFile(filePath: string): Promise<any> {
  try {
    if (!fsSync.existsSync(filePath)) {
      return null;
    }
    const content = await fs.readFile(filePath, 'utf8');
    return yamlParse(content);
  } catch (error) {
    logger.error(`Error reading YAML file ${filePath}:`, error);
    return null;
  }
}

/**
 * Process a single agent directory
 */
async function processAgentDir(agentDir: string): Promise<Partial<MigrationResult>> {
  const configPath = path.resolve(PROJECT_ROOT, agentDir, 'fastagent.config.yaml');
  const secretsPath = path.resolve(PROJECT_ROOT, agentDir, 'fastagent.secrets.yaml');

  logger.info(`Processing agent directory: ${agentDir}`);

  const config: FastAgentConfig = await readYamlFile(configPath);
  const secrets: FastAgentSecrets = await readYamlFile(secretsPath);

  const envVars: Record<string, string> = {};
  const warnings: string[] = [];
  const errors: string[] = [];

  // Process model configuration
  if (config?.default_model) {
    const modelEnvVars = modelToEnvVar(config.default_model);
    Object.assign(envVars, modelEnvVars);
    logger.info(`Found model configuration: ${config.default_model}`);
  } else {
    warnings.push(`No default_model found in ${configPath}`);
  }

  // Process API keys
  if (secrets?.openai?.api_key) {
    envVars['OPENAI_API_KEY'] = secrets.openai.api_key;
    logger.info('Found OpenAI API key');
  }

  if (secrets?.anthropic?.api_key) {
    envVars['ANTHROPIC_API_KEY'] = secrets.anthropic.api_key;
    logger.info('Found Anthropic API key');
  }

  if (secrets?.deepseek?.api_key) {
    envVars['DEEPSEEK_API_KEY'] = secrets.deepseek.api_key;
    logger.info('Found DeepSeek API key');
  }

  if (secrets?.openrouter?.api_key) {
    envVars['OPENROUTER_API_KEY'] = secrets.openrouter.api_key;
    logger.info('Found OpenRouter API key');
  }

  // Process logging configuration
  if (config?.logger?.level) {
    envVars['LOG_LEVEL'] = config.logger.level.toUpperCase();
  }

  return { envVars, warnings, errors };
}

/**
 * Merge environment variables from multiple sources
 */
function mergeEnvVars(results: Partial<MigrationResult>[]): Record<string, string> {
  const merged: Record<string, string> = {};

  for (const result of results) {
    if (result.envVars) {
      // Handle conflicts by preferring the first occurrence
      for (const [key, value] of Object.entries(result.envVars)) {
        if (merged[key] && merged[key] !== value) {
          logger.warn(`Conflict for ${key}: keeping ${merged[key]}, ignoring ${value}`);
        } else if (!merged[key]) {
          merged[key] = value;
        }
      }
    }
  }

  return merged;
}

/**
 * Read existing .env file and parse it
 */
async function readExistingEnv(): Promise<Record<string, string>> {
  try {
    if (!fsSync.existsSync(ENV_FILE_PATH)) {
      return {};
    }

    const content = await fs.readFile(ENV_FILE_PATH, 'utf8');
    const envVars: Record<string, string> = {};

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          envVars[key.trim()] = valueParts.join('=').trim();
        }
      }
    }

    return envVars;
  } catch (error) {
    logger.error('Error reading existing .env file:', error);
    return {};
  }
}

/**
 * Write environment variables to .env file
 */
async function writeEnvFile(envVars: Record<string, string>): Promise<void> {
  const lines = [
    '# CodeLoops Environment Configuration',
    '# Generated by VoltAgent migration script',
    `# Migration date: ${new Date().toISOString()}`,
    '',
    '# LLM Provider Configuration',
  ];

  // Group variables by category
  const categories = {
    'Provider Keys': [
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'AZURE_OPENAI_API_KEY',
      'DEEPSEEK_API_KEY',
      'OPENROUTER_API_KEY',
    ],
    'Model Configuration': [
      'PREFERRED_PROVIDER',
      'OPENAI_MODEL',
      'ANTHROPIC_MODEL',
      'AZURE_OPENAI_MODEL',
      'DEFAULT_MODEL',
    ],
    'Azure Configuration': ['AZURE_OPENAI_RESOURCE_NAME', 'AZURE_OPENAI_ENDPOINT'],
    Logging: ['LOG_LEVEL'],
    Other: [],
  };

  for (const [category, keys] of Object.entries(categories)) {
    const categoryVars = keys.filter((key) => envVars[key]);
    if (categoryVars.length > 0) {
      lines.push('', `# ${category}`);
      for (const key of categoryVars) {
        lines.push(`${key}=${envVars[key]}`);
      }
    }
  }

  // Add any remaining variables
  const usedKeys = Object.values(categories).flat();
  const remainingKeys = Object.keys(envVars).filter((key) => !usedKeys.includes(key));
  if (remainingKeys.length > 0) {
    lines.push('', '# Other Configuration');
    for (const key of remainingKeys) {
      lines.push(`${key}=${envVars[key]}`);
    }
  }

  await fs.writeFile(ENV_FILE_PATH, lines.join('\n') + '\n', 'utf8');
}

/**
 * Create backup of existing .env file
 */
async function createBackup(): Promise<string | undefined> {
  if (!fsSync.existsSync(ENV_FILE_PATH)) {
    return undefined;
  }

  const backupPath = path.resolve(BACKUP_DIR, `.env.backup.${Date.now()}`);
  await fs.copyFile(ENV_FILE_PATH, backupPath);
  logger.info(`Created backup of existing .env file: ${backupPath}`);
  return backupPath;
}

/**
 * Main migration function
 */
async function migrateAgentConfigs(): Promise<void> {
  console.log(createCodeLoopsAscii());
  logger.info('Starting migration of FastAgent configurations to .env variables');

  try {
    // Create backup if .env exists
    const backupPath = await createBackup();

    // Read existing .env file
    const existingEnv = await readExistingEnv();

    // Process each agent directory
    const results: Partial<MigrationResult>[] = [];
    for (const agentDir of AGENT_DIRS) {
      const result = await processAgentDir(agentDir);
      results.push(result);
    }

    // Merge all environment variables
    const newEnvVars = mergeEnvVars(results);

    // Combine with existing variables (existing takes precedence)
    const finalEnvVars = { ...newEnvVars, ...existingEnv };

    // Write the new .env file
    await writeEnvFile(finalEnvVars);

    // Collect all warnings and errors
    const allWarnings = results.flatMap((r) => r.warnings || []);
    const allErrors = results.flatMap((r) => r.errors || []);

    // Log results
    logger.info('Migration completed successfully!');
    logger.info(`Environment file created/updated: ${ENV_FILE_PATH}`);

    if (backupPath) {
      logger.info(`Backup created: ${backupPath}`);
    }

    logger.info('Environment variables added:');
    for (const [key, value] of Object.entries(newEnvVars)) {
      // Mask sensitive values
      const displayValue = key.includes('KEY') ? value.replace(/.(?=.{4})/g, '*') : value;
      logger.info(`  ${chalk.green(key)}=${displayValue}`);
    }

    if (allWarnings.length > 0) {
      logger.warn('Warnings:');
      allWarnings.forEach((warning) => logger.warn(`  ${warning}`));
    }

    if (allErrors.length > 0) {
      logger.error('Errors:');
      allErrors.forEach((error) => logger.error(`  ${error}`));
    }

    logger.info('\nNext steps:');
    logger.info('1. Review the generated .env file');
    logger.info('2. Add any missing API keys if needed');
    logger.info('3. Set AZURE_OPENAI_RESOURCE_NAME if using Azure OpenAI');
    logger.info('4. Update your application to use the new VoltAgent-based agents');
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateAgentConfigs().catch((error) => {
  console.error('Unhandled error during migration:', error);
  process.exit(1);
});
