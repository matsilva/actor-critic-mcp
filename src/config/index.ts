import Conf from 'conf';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// -----------------------------------------------------------------------------
// Path Configuration ----------------------------------------------------------
// -----------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const dataDir = path.resolve(__dirname, '..', '..', 'data');

// Define the configuration schema
const ModelConfigSchema = z.object({
  id: z.string(),
  max_tokens: z.number().optional(),
  description: z.string().optional(),
});

const ProviderConfigSchema = z.object({
  _comment: z.string().optional(),
  api_key: z.string().optional(),
  base_url: z.string().optional(),
  resource_name: z.string().optional(),
  models: z.record(ModelConfigSchema).optional(),
}).passthrough(); // Allow additional provider-specific fields

const AgentConfigSchema = z.object({
  enabled: z.boolean(),
  model: z.string(),
  temperature: z.number(),
  max_tokens: z.number(),
  _comment: z.string().optional(),
});

const TelemetryConfigSchema = z.object({
  enabled: z.boolean(),
  service_name: z.string(),
  service_version: z.string().optional(),
  environment: z.string().optional(),
  opentelemetry: z.object({
    enabled: z.boolean(),
    otlp_endpoint: z.string(),
    sample_rate: z.number(),
  }),
  metrics: z.object({
    enabled: z.boolean(),
  }),
});

const LoggingConfigSchema = z.object({
  level: z.string(),
  format: z.string(),
  destination: z.string(),
  pino: z.object({
    pretty_print: z.boolean(),
    redact: z.array(z.string()),
  }),
  file_logging: z.object({
    enabled: z.boolean(),
    path: z.string(),
  }),
});

const FeaturesConfigSchema = z.object({
  use_voltagent: z.boolean(),
  legacy_python_agents: z.boolean(),
  telemetry_enabled: z.boolean(),
});

const MCPConfigSchema = z.object({
  servers: z.record(z.unknown()),
});

const ConfigSchema = z.object({
  version: z.string(),
  default_model: z.string(),
  providers: z.object({
    anthropic: ProviderConfigSchema.optional(),
    openai: ProviderConfigSchema.optional(),
    azure: ProviderConfigSchema.optional(),
    deepseek: ProviderConfigSchema.optional(),
    google: ProviderConfigSchema.optional(),
    openrouter: ProviderConfigSchema.optional(),
    generic: ProviderConfigSchema.optional(),
    tensorzero: ProviderConfigSchema.optional(),
  }),
  agents: z.object({
    critic: AgentConfigSchema,
    summarizer: AgentConfigSchema,
    actor: AgentConfigSchema,
  }),
  mcp: MCPConfigSchema,
  telemetry: TelemetryConfigSchema,
  logging: LoggingConfigSchema,
  features: FeaturesConfigSchema,
  env_prefix: z.string().optional(),
});

export type CodeLoopsConfig = z.infer<typeof ConfigSchema>;

// Singleton instance
let configInstance: Conf<CodeLoopsConfig> | null = null;

/**
 * Get the configuration instance
 */
export function getConfig(): Conf<CodeLoopsConfig> {
  if (!configInstance) {
    configInstance = new Conf<CodeLoopsConfig>({
      projectName: 'codeloops',
      configName: 'codeloops.config',
      fileExtension: 'json',
      cwd: process.cwd(), // Use current working directory
      //@ts-expect-error - this is fine
      schema: ConfigSchema,
      clearInvalidConfig: false,
      accessPropertiesByDotNotation: true,
      defaults: {
        version: '1.0.0',
        default_model: 'openai.gpt-4o-mini',
        providers: {
          anthropic: {
            models: {}
          },
          openai: {
            models: {}
          },
          azure: {
            models: {}
          },
          deepseek: {
            models: {}
          },
          google: {
            models: {}
          },
          openrouter: {
            models: {}
          },
          generic: {
            models: {}
          },
          tensorzero: {
            models: {}
          }
        },
        agents: {
          critic: {
            enabled: true,
            model: 'anthropic.sonnet',
            temperature: 0.3,
            max_tokens: 2000,
          },
          summarizer: {
            enabled: true,
            model: 'anthropic.haiku',
            temperature: 0.5,
            max_tokens: 1000,
          },
          actor: {
            enabled: true,
            model: 'default',
            temperature: 0.7,
            max_tokens: 2000,
          },
        },
        mcp: {
          servers: {},
        },
        telemetry: {
          enabled: true,
          service_name: 'codeloops',
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
        features: {
          use_voltagent: false,
          legacy_python_agents: true,
          telemetry_enabled: true,
        },
        env_prefix: 'CODELOOPS',
      },
    });
  }
  return configInstance;
}

/**
 * Helper function to get model configuration
 */
export function getModelConfig(modelRef: string): { provider: string; model: z.infer<typeof ModelConfigSchema> } | null {
  const config = getConfig();
  const [provider, modelKey] = modelRef.split('.');

  if (!provider || !modelKey) {
    return null;
  }

  const providerConfig = config.get(`providers.${provider}`) as { models?: Record<string, unknown> } | undefined;
  if (!providerConfig?.models) {
    return null;
  }

  const modelConfig = providerConfig.models[modelKey];
  if (!modelConfig) {
    return null;
  }

  return { provider, model: modelConfig as z.infer<typeof ModelConfigSchema> };
}

/**
 * Get API key for a provider
 */
export function getProviderApiKey(provider: string): string | undefined {
  const config = getConfig();
  const providerConfig = config.get(`providers.${provider}`) as { api_key?: string } | undefined;

  // First check config file
  if (providerConfig?.api_key) {
    return providerConfig.api_key;
  }

  // Then check environment variables
  const envVarMap: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    azure: 'AZURE_OPENAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    google: 'GOOGLE_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
  };

  const envVar = envVarMap[provider];
  if (envVar) {
    return process.env[envVar];
  }

  return undefined;
}

/**
 * Update a feature flag
 */
export function updateFeatureFlag(flag: keyof z.infer<typeof FeaturesConfigSchema>, value: boolean): void {
  const config = getConfig();
  config.set(`features.${String(flag)}`, value);
}
