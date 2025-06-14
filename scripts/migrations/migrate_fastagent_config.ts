/**
 * Migration script to convert FastAgent YAML configurations to CodeLoops configuration
 *
 * This script:
 * 1. Reads fastagent.config.yaml and fastagent.secrets.yaml from agents/critic and agents/summarize
 * 2. Extracts LLM provider configurations (models, API keys, execution engine)
 * 3. Generates codeloops.config.json with all settings including API keys
 * 4. Maps FastAgent LLM provider settings to CodeLoops configuration schema
 * 5. Provides backup and rollback capabilities
 *
 * Usage: ts-node scripts/migrations/migrate_fastagent_config.ts
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
// Note: No longer generating .env files - everything goes in config
const CONFIG_FILE_PATH = path.resolve(PROJECT_ROOT, 'codeloops.config.json');
const BACKUP_DIR = path.resolve(PROJECT_ROOT, 'backups');

// Ensure backup directory exists
if (!fsSync.existsSync(BACKUP_DIR)) {
  fsSync.mkdirSync(BACKUP_DIR, { recursive: true });
}

interface FastAgentConfig {
  default_model?: string;
  execution_engine?: string;
  // Note: Only migrating LLM provider-related configs
  // Logging, MCP, and OTEL are CodeLoops-specific
}

interface FastAgentSecrets {
  openai?: {
    api_key?: string;
    base_url?: string;
    reasoning_effort?: string;
  };
  anthropic?: {
    api_key?: string;
    base_url?: string;
  };
  azure?: {
    api_key?: string;
    resource_name?: string;
    base_url?: string;
    azure_deployment?: string;
    api_version?: string;
    use_default_azure_credential?: boolean;
  };
  deepseek?: {
    api_key?: string;
    base_url?: string;
  };
  google?: {
    api_key?: string;
    base_url?: string;
  };
  openrouter?: {
    api_key?: string;
    base_url?: string;
  };
  generic?: {
    api_key?: string;
    base_url?: string;
  };
  tensorzero?: {
    base_url?: string;
  };
}

interface MigrationResult {
  warnings: string[];
  errors: string[];
}

interface ModelConfig {
  id: string;
  max_tokens?: number;
  reasoning_effort?: string;
  description?: string;
}

interface ProviderConfig {
  _comment?: string;
  api_key?: string;
  base_url?: string;
  models?: Record<string, ModelConfig>;
  [key: string]: any;
}

interface CodeLoopsConfig {
  version: string;
  default_model?: string;
  execution_engine?: string;
  anthropic?: ProviderConfig;
  openai?: ProviderConfig;
  azure?: ProviderConfig;
  deepseek?: ProviderConfig;
  google?: ProviderConfig;
  openrouter?: ProviderConfig;
  generic?: ProviderConfig;
  tensorzero?: ProviderConfig;
  agents?: {
    critic?: any;
    summarizer?: any;
    actor?: any;
  };
  model_selection?: {
    fallback_order?: string[];
    by_task_type?: Record<string, string[]>;
    cost_optimization?: any;
  };
  mcp?: any;
  otel?: any;
  logger?: any;
  codeloops?: any;
  features?: any;
  env_prefix?: string;
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
 * Get model definitions for a provider
 */
function getProviderModels(provider: string): Record<string, ModelConfig> {
  const modelDefinitions: Record<string, Record<string, ModelConfig>> = {
    anthropic: {
      haiku: {
        id: 'claude-3-haiku-20240307',
        max_tokens: 4096,
        description: 'Fast, lightweight model for simple tasks',
      },
      sonnet: {
        id: 'claude-3-5-sonnet-20241022',
        max_tokens: 8192,
        description: 'Balanced model for most tasks',
      },
      opus: {
        id: 'claude-3-opus-20240229',
        max_tokens: 4096,
        description: 'Most capable model for complex tasks',
      },
    },
    openai: {
      'gpt-4o': {
        id: 'gpt-4o',
        max_tokens: 4096,
        description: 'Latest GPT-4 Omni model',
      },
      'gpt-4o-mini': {
        id: 'gpt-4o-mini',
        max_tokens: 16384,
        description: 'Smaller, faster GPT-4 model',
      },
      'o1-preview': {
        id: 'o1-preview',
        max_tokens: 32768,
        reasoning_effort: 'medium',
        description: 'Reasoning model for complex problems',
      },
      'o1-mini': {
        id: 'o1-mini',
        max_tokens: 65536,
        reasoning_effort: 'low',
        description: 'Smaller reasoning model',
      },
    },
    deepseek: {
      'deepseek-chat': {
        id: 'deepseek-chat',
        max_tokens: 4096,
        description: 'DeepSeek chat model',
      },
    },
    google: {
      'gemini-pro': {
        id: 'gemini-pro',
        max_tokens: 2048,
        description: 'Google Gemini Pro model',
      },
    },
    generic: {
      llama3: {
        id: 'llama3',
        max_tokens: 4096,
        description: 'Llama 3 model via Ollama',
      },
    },
  };
  
  return modelDefinitions[provider] || {};
}

/**
 * Convert FastAgent model string to CodeLoops format
 */
function mapFastAgentModel(modelString: string): string {
  const { provider, model } = parseModelString(modelString);
  
  // Map FastAgent aliases to CodeLoops format
  const aliasMap: Record<string, string> = {
    haiku: 'anthropic.haiku',
    haiku3: 'anthropic.haiku',
    sonnet: 'anthropic.sonnet',
    sonnet35: 'anthropic.sonnet',
    opus: 'anthropic.opus',
    opus3: 'anthropic.opus',
    'gpt-4.1': 'openai.gpt-4o',
    'gpt-4.1-mini': 'openai.gpt-4o-mini',
    'o1': 'openai.o1-preview',
    'o1-mini': 'openai.o1-mini',
    'o3-mini': 'openai.o1-mini',
  };
  
  if (aliasMap[modelString]) {
    return aliasMap[modelString];
  }
  
  // If it's already in provider.model format, use it
  if (modelString.includes('.')) {
    return modelString;
  }
  
  // Try to map to provider.model format
  const providerModels = getProviderModels(provider);
  const modelKey = Object.keys(providerModels).find(key => 
    providerModels[key].id === model || key === model
  );
  
  if (modelKey) {
    return `${provider}.${modelKey}`;
  }
  
  // Fallback to provider.model
  return `${provider}.${model}`;
}

// Note: No longer generating environment variables - everything goes in config file

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
async function processAgentDir(agentDir: string, codeloopsConfig: CodeLoopsConfig): Promise<Partial<MigrationResult>> {
  const configPath = path.resolve(PROJECT_ROOT, agentDir, 'fastagent.config.yaml');
  const secretsPath = path.resolve(PROJECT_ROOT, agentDir, 'fastagent.secrets.yaml');
  const agentName = path.basename(agentDir); // 'critic' or 'summarizer'

  logger.info(`Processing agent directory: ${agentDir}`);

  const config: FastAgentConfig = await readYamlFile(configPath);
  const secrets: FastAgentSecrets = await readYamlFile(secretsPath);

  const warnings: string[] = [];
  const errors: string[] = [];

  // Process model configuration
  if (config?.default_model) {
    logger.info(`Found model configuration: ${config.default_model}`);
    
    // Update CodeLoops config with agent-specific model
    if (!codeloopsConfig.agents) codeloopsConfig.agents = {};
    
    const mappedModel = mapFastAgentModel(config.default_model);
    
    if (agentName === 'critic') {
      codeloopsConfig.agents.critic = {
        enabled: true,
        model: mappedModel,
        temperature: 0.3,
        max_tokens: 2000,
        _comment: `Migrated from FastAgent: ${config.default_model}`,
      };
    } else if (agentName === 'summarize') {
      codeloopsConfig.agents.summarizer = {
        enabled: true,
        model: mappedModel,
        temperature: 0.5,
        max_tokens: 1000,
        _comment: `Migrated from FastAgent: ${config.default_model}`,
      };
    }
    
    // Update default model if not already set or if this is a better choice
    if (!codeloopsConfig.default_model || codeloopsConfig.default_model === 'openai.gpt-4o-mini') {
      codeloopsConfig.default_model = mappedModel;
    }
  }

  // Process execution engine
  if (config?.execution_engine) {
    codeloopsConfig.execution_engine = config.execution_engine;
  }

  // Process all provider configurations from secrets
  const providers = ['openai', 'anthropic', 'azure', 'deepseek', 'google', 'openrouter', 'generic', 'tensorzero'];
  
  for (const provider of providers) {
    const providerConfig = secrets?.[provider as keyof FastAgentSecrets];
    if (providerConfig) {
      logger.info(`Found ${provider} provider configuration`);
      
      // Add full provider config to CodeLoops config (preserve existing models)
      if (!codeloopsConfig[provider]) {
        codeloopsConfig[provider] = { models: {} };
      }
      
      // Merge provider config while preserving model definitions
      const existingModels = codeloopsConfig[provider].models || {};
      codeloopsConfig[provider] = { 
        ...codeloopsConfig[provider],
        ...providerConfig,
        models: { ...existingModels }
      };
      
      if (providerConfig.api_key) {
        logger.info(`Added ${provider} API key to configuration`);
      }
    }
  }

  // Note: Logging, MCP servers, and OpenTelemetry are NOT migrated
  // These are CodeLoops-specific configurations that use:
  // - Pino logger for structured logging
  // - Custom OpenTelemetry instrumentation
  // - CodeLoops-specific MCP integrations
  
  if (config?.logger) {
    warnings.push(`FastAgent logging configuration found but not migrated - CodeLoops uses pino logger`);
  }
  
  if (config?.mcp) {
    warnings.push(`FastAgent MCP configuration found but not migrated - CodeLoops has its own MCP setup`);
  }
  
  if (config?.otel) {
    warnings.push(`FastAgent OpenTelemetry configuration found but not migrated - CodeLoops has custom OTEL`);
  }

  return { warnings, errors };
}



/**
 * Write CodeLoops configuration to JSON file
 */
async function writeConfigFile(config: CodeLoopsConfig): Promise<void> {
  const jsonContent = JSON.stringify(config, null, 2);
  
  await fs.writeFile(CONFIG_FILE_PATH, jsonContent, 'utf8');
  logger.info(`Created CodeLoops configuration file: ${CONFIG_FILE_PATH}`);
}


/**
 * Create backup of existing config file
 */
async function createBackups(): Promise<{ configBackup?: string }> {
  const backups: { configBackup?: string } = {};
  
  // Backup codeloops.config.json if exists
  if (fsSync.existsSync(CONFIG_FILE_PATH)) {
    const configBackupPath = path.resolve(BACKUP_DIR, `codeloops.config.json.backup.${Date.now()}`);
    await fs.copyFile(CONFIG_FILE_PATH, configBackupPath);
    logger.info(`Created backup of existing config file: ${configBackupPath}`);
    backups.configBackup = configBackupPath;
  }
  
  return backups;
}

/**
 * Main migration function
 */
async function migrateAgentConfigs(): Promise<void> {
  console.log(createCodeLoopsAscii());
  logger.info('Starting migration of FastAgent configurations to CodeLoops configuration');

  try {
    // Create backups
    const backups = await createBackups();
    
    // Initialize CodeLoops config with multi-model support
    const codeloopsConfig: CodeLoopsConfig = {
      version: '1.0.0',
      default_model: 'openai.gpt-4o-mini',
      execution_engine: 'asyncio',
      // Initialize providers with model definitions
      anthropic: {
        _comment: 'api_key can be set via ANTHROPIC_API_KEY env var',
        models: getProviderModels('anthropic'),
      },
      openai: {
        _comment: 'api_key can be set via OPENAI_API_KEY env var',
        models: getProviderModels('openai'),
      },
      azure: {
        _comment: 'See documentation for Azure OpenAI configuration options',
        models: { _comment: 'Models configured through Azure deployments' },
      },
      deepseek: {
        _comment: 'api_key can be set via DEEPSEEK_API_KEY env var',
        models: getProviderModels('deepseek'),
      },
      google: {
        _comment: 'api_key can be set via GOOGLE_API_KEY env var',
        models: getProviderModels('google'),
      },
      openrouter: {
        _comment: 'api_key can be set via OPENROUTER_API_KEY env var',
        models: { _comment: 'OpenRouter provides access to multiple models' },
      },
      generic: {
        _comment: 'For Ollama or other OpenAI-compatible APIs',
        api_key: 'ollama',
        base_url: 'http://localhost:11434/v1',
        models: getProviderModels('generic'),
      },
      tensorzero: {
        models: {},
      },
      agents: {
        critic: {
          enabled: true,
          model: 'anthropic.sonnet',
          temperature: 0.3,
          max_tokens: 2000,
          _comment: 'Use Sonnet for balanced performance in code review',
        },
        summarizer: {
          enabled: true,
          model: 'anthropic.haiku',
          temperature: 0.5,
          max_tokens: 1000,
          _comment: 'Use Haiku for fast summarization tasks',
        },
        actor: {
          enabled: true,
          model: 'default',
          temperature: 0.7,
          _comment: 'Use default model for general actor tasks',
        },
      },
      model_selection: {
        _comment: 'Define model selection strategies',
        fallback_order: ['anthropic.sonnet', 'openai.gpt-4o', 'openai.gpt-4o-mini'],
        by_task_type: {
          simple: ['anthropic.haiku', 'openai.gpt-4o-mini'],
          balanced: ['anthropic.sonnet', 'openai.gpt-4o'],
          complex: ['anthropic.opus', 'openai.o1-preview', 'anthropic.sonnet'],
        },
        cost_optimization: {
          enabled: false,
          prefer_cheaper: true,
          max_cost_per_request: 0.10,
        },
      },
      mcp: {
        servers: {},
      },
      telemetry: {
        enabled: true,
        service_name: 'codeloops',
        service_version: '1.0.0',
        environment: 'development',
        opentelemetry: {
          enabled: true,
          otlp_endpoint: 'http://localhost:4318',
          sample_rate: 1.0,
        },
        metrics: {
          enabled: true,
        },
      },
      logging: {
        level: 'info',
        format: 'json',
        destination: 'stdout',
        pino: {
          pretty_print: false,
          redact: ['*.api_key', '*.password', '*.secret'],
        },
        file_logging: {
          enabled: false,
          path: './logs/codeloops.log',
        },
      },
      codeloops: {
        knowledge_graph: {
          data_dir: './data',
          file_format: 'ndjson',
          auto_backup: true,
          backup_interval: 3600,
          max_nodes_per_project: 10000,
        },
        engine: {
          max_parallel_thoughts: 5,
          critic_trigger_tags: ['file-modification', 'task-complete', 'design-decision'],
          auto_summarize_threshold: 50,
        },
        project: {
          auto_detect: true,
          default_name: 'default',
        },
        performance: {
          cache_enabled: true,
          cache_ttl: 900,
          max_memory_mb: 1024,
        },
      },
      features: {
        use_voltagent: false,
        legacy_python_agents: true,
        parallel_execution: false,
      },
      env_prefix: 'CODELOOPS',
    };

    // Process each agent directory
    const results: Partial<MigrationResult>[] = [];
    for (const agentDir of AGENT_DIRS) {
      const result = await processAgentDir(agentDir, codeloopsConfig);
      results.push(result);
    }
    
    // Write the CodeLoops config file
    await writeConfigFile(codeloopsConfig);

    // Collect all warnings and errors
    const allWarnings = results.flatMap((r) => r.warnings || []);
    const allErrors = results.flatMap((r) => r.errors || []);

    // Log results
    logger.info('Migration completed successfully!');
    logger.info(`Configuration file created: ${CONFIG_FILE_PATH}`);

    if (backups.configBackup) {
      logger.info(`Config backup created: ${backups.configBackup}`);
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
    logger.info('1. Review codeloops.config.json for full configuration including API keys');
    logger.info('2. Add any missing API keys or settings to the config file');
    logger.info('3. Set environment variables if you prefer them over config file keys');
    logger.info('4. Update feature flags in config when ready to switch to VoltAgent');
    logger.info('5. Run your application with the new configuration');
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
