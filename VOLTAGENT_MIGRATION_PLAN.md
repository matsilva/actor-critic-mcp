# Agent Framework Migration Plan

## Overview

This document outlines the migration plan from the current fast-agent Python framework to a unified TypeScript approach using the existing BaseAgent enhanced with VoltAgent capabilities. After comprehensive analysis, we discovered that the current BaseAgent implementation (using Vercel AI SDK) is already production-ready and more mature than initially anticipated. The plan has been updated to leverage this existing foundation by wrapping VoltAgent to gain additional enterprise features while preserving our battle-tested abstractions.

## Current Architecture

### Components

- **Python Agents** (in `/agents/` directory)
  - `critic/agent.py`: Uses fast-agent framework for code quality evaluation
  - `summarize/agent.py`: Uses fast-agent framework for knowledge graph summarization
- **TypeScript Infrastructure** (in `/src/agents/` directory)
  - **`BaseAgent.ts`**: ✅ **Already Implemented** - Production-ready abstraction using Vercel AI SDK with:
    - Structured output generation with Zod schemas
    - Streaming support (object and text)
    - Multi-provider support (OpenAI, Azure OpenAI)
    - Exponential backoff retry logic
    - Comprehensive error handling
    - Pino logger integration
  - `Actor.ts`: Native TypeScript implementation for knowledge graph
  - `Critic.ts`: Wrapper that executes Python critic via subprocess (execa)
  - `Summarize.ts`: Wrapper that executes Python summarizer via subprocess

### Communication Flow

1. TypeScript wrappers serialize data to JSON
2. Execute Python agents via subprocess (`uv run agent.py`)
3. Pass JSON through stdin/stdout
4. Parse JSON responses back in TypeScript

### Pain Points

- Language fragmentation (Python + TypeScript)
- Subprocess overhead and complexity
- Error handling across process boundaries
- Limited type safety at integration points
- Difficult to extend or configure

## Target Architecture with BaseAgent + VoltAgent

### Layered Architecture

The new architecture provides abstraction layers for maximum flexibility:

```typescript
// Architecture layers:
// 1. VoltAgent (underlying framework)
// 2. BaseAgent (your abstraction layer)
// 3. Specific Agents (CriticAgent, SummarizerAgent)

import { Agent } from '@voltagent/core';
import { BaseAgent, createAgent } from './BaseAgent';
import { z } from 'zod';
```

### Abstraction Benefits

- **Framework Independence**: Easy to switch from VoltAgent to another framework later
- **Custom API**: Your BaseAgent provides a consistent interface
- **VoltAgent Features**: Access to tools, hooks, memory, streaming, sub-agents
- **Type Safety**: Full TypeScript support with your custom types

### Key Benefits of BaseAgent + VoltAgent Approach

1. **Unified Language**: Single TypeScript codebase
2. **Native Integration**: Direct method calls, no subprocess overhead
3. **Abstraction Layer**: BaseAgent wraps VoltAgent for framework independence
4. **VoltAgent Power**: Access to tools, hooks, memory, streaming, sub-agents
5. **Type Safety**: Full TypeScript types with custom BaseAgent interface
6. **Structured Output**: Zod schema validation for reliable responses
7. **Model Flexibility**: Support for OpenAI, Azure OpenAI, Anthropic, and more
8. **Future-Proof**: Easy to switch underlying frameworks if needed
9. **Production Ready**: VoltAgent is battle-tested with enterprise features

## Migration Steps

### Phase 0: Configuration Migration (NEW)

Before migrating the agent code, users need to convert their existing FastAgent YAML configurations to the new CodeLoops configuration system.

#### CodeLoops Configuration Design

CodeLoops uses a comprehensive configuration system with:

1. **Versioned Configuration**: `codeloops.config.json` with version support for future migrations
2. **Environment Variables**: `.env` file for secrets and overrides
3. **Hierarchical Settings**: Structured configuration for all components

#### Configuration Schema Overview

```json
// codeloops.config.json
{
  "version": "1.0.0", // Configuration version for migration support
  "default_model": "openai.gpt-4o-mini",

  // Model providers with multiple model support
  "anthropic": {
    // api_key can be set here or via ANTHROPIC_API_KEY env var
    "api_key": "sk-ant-...", // Optional: API key in config
    "models": {
      "haiku": {
        "id": "claude-3-haiku-20240307",
        "max_tokens": 4096,
        "description": "Fast, lightweight model for simple tasks"
      },
      "sonnet": {
        "id": "claude-3-5-sonnet-20241022",
        "max_tokens": 8192,
        "description": "Balanced model for most tasks"
      },
      "opus": {
        "id": "claude-3-opus-20240229",
        "max_tokens": 4096,
        "description": "Most capable model for complex tasks"
      }
    }
  },

  // Agent-specific model selection
  "agents": {
    "critic": {
      "enabled": true,
      "model": "anthropic.sonnet", // Specific model for code review
      "temperature": 0.3,
      "max_tokens": 2000
    },
    "summarizer": {
      "enabled": true,
      "model": "anthropic.haiku", // Fast model for summaries
      "temperature": 0.5,
      "max_tokens": 1000
    }
  },

  // CodeLoops-specific logging (Pino-based)
  "logging": {
    "level": "info",
    "format": "json",
    "pino": {
      "redact": ["*.api_key", "*.password"]
    },
    "file_logging": {
      "enabled": false,
      "path": "./logs/codeloops.log"
    }
  },

  // CodeLoops-specific telemetry
  "telemetry": {
    "enabled": true,
    "service_name": "codeloops",
    "opentelemetry": {
      "enabled": true,
      "otlp_endpoint": "http://localhost:4318",
      "sample_rate": 1.0
    },
    "metrics": {
      "enabled": true
    }
  }
}
```

1. **Automated Configuration Migration Script**

   The enhanced migration script at `scripts/migrations/migrate_fastagent_config.ts` performs comprehensive conversion:

   ```bash
   # Run the migration script
   npx ts-node scripts/migrations/migrate_fastagent_config.ts
   ```

2. **What the Script Does**

   - **Migrates LLM Provider Configurations ONLY**:
     - Model settings only (no execution engine)
     - API keys and provider-specific settings (OpenAI, Anthropic, Azure, etc.)
   - **Generates Configuration File**:
     - `codeloops.config.json`: Full structured configuration including API keys and CodeLoops-specific settings
   - **CodeLoops-Specific Configuration**:
     - Pino-based structured logging
     - Custom OpenTelemetry instrumentation for agents
     - CodeLoops MCP server integration
   - **Migration Warnings**: Alerts when FastAgent logging/OTEL configs are found but not migrated
   - **Backup Support**: Creates timestamped backups of configuration file

3. **Migration Scope: LLM Providers Only**

   **What Gets Migrated (FastAgent → CodeLoops):**

   ```
   # ✅ Model Providers (fastagent.secrets.yaml → codeloops.config.json)
   FastAgent:                    CodeLoops:
   openai.api_key         →      openai.api_key (config)
   openai.base_url        →      openai.base_url (config)
   openai.reasoning_effort →     openai.reasoning_effort (config)
   anthropic.api_key      →      anthropic.api_key (config)
   azure.api_key          →      azure.api_key (config)

   # ✅ Model Settings (fastagent.config.yaml → codeloops.config.json)
   default_model          →      default_model + agent-specific models
   ```

   **What Does NOT Get Migrated (CodeLoops-Specific):**

   ```
   # ❌ Logging - CodeLoops uses Pino structured logging
   FastAgent logger.*     →      Warning: Not migrated, using pino logger

   # ❌ OpenTelemetry - CodeLoops has custom agent instrumentation
   FastAgent otel.*       →      Warning: Not migrated, using custom OTEL

   # ❌ MCP Servers - CodeLoops has its own MCP integration
   FastAgent mcp.*        →      Warning: Not migrated, CodeLoops-specific
   ```

4. **Multi-Model Support and Per-Agent Configuration**

   CodeLoops now supports multiple models per provider and per-agent model selection:

   ```json
   // Multiple models per provider
   {
     "anthropic": {
       "models": {
         "haiku": { "id": "claude-3-haiku-20240307", "max_tokens": 4096 },
         "sonnet": { "id": "claude-3-5-sonnet-20241022", "max_tokens": 8192 },
         "opus": { "id": "claude-3-opus-20240229", "max_tokens": 4096 }
       }
     },

     // Per-agent model selection
     "agents": {
       "critic": { "model": "anthropic.sonnet" }, // Best for code review
       "summarizer": { "model": "anthropic.haiku" }, // Fast for summaries
       "actor": { "model": "openai.gpt-4o" } // General purpose
     }
   }
   ```

5. **Model Alias Conversion**

   The script handles all FastAgent model aliases and maps them to the new format:

   ```typescript
   // FastAgent aliases → CodeLoops provider.model format
   'haiku'      → 'anthropic.haiku'
   'sonnet'     → 'anthropic.sonnet'
   'opus'       → 'anthropic.opus'
   'gpt-4.1'    → 'openai.gpt-4o'
   'o1-mini'    → 'openai.o1-mini'
   // Provider.model format preserved
   'anthropic.claude-3-5-sonnet' → 'anthropic.sonnet'
   'openai.gpt-4o-mini' → 'openai.gpt-4o-mini'
   ```

6. **Configuration Management with Conf**

   CodeLoops uses the conf library for configuration management:

   ```typescript
   // Configuration priority (highest to lowest):
   1. Environment variables (CODELOOPS__LOGGER__LEVEL=debug) for overrides
   2. codeloops.config.json settings (primary source)
   3. Default values in code

   // API key access pattern:
   config.get('anthropic.api_key') || process.env.ANTHROPIC_API_KEY  // Config first, env fallback
   config.get('logger.level')  // From JSON
   ```

7. **Post-Migration Steps**

   After running the migration script:

   - **Review codeloops.config.json**: Verify LLM provider settings and API keys migrated correctly
   - **Review Migration Warnings**: Check console output for any FastAgent configs that weren't migrated
   - **Review Model Assignments**: Check that each agent has the appropriate model:
     - Critic: Should use a balanced model like `anthropic.sonnet` for code review
     - Summarizer: Can use a fast model like `anthropic.haiku` for quick summaries
     - Actor: Can use `default` or specify a specific model for general tasks
   - **Security Considerations**: API keys are now in the config file - ensure proper file permissions
   - **Configure CodeLoops-Specific Settings**: Adjust logging and telemetry:

     ```json
     // Logging configuration (Pino-based)
     "logging": {
       "level": "debug",  // Adjust as needed
       "pino": {
         "pretty_print": true  // For development
       }
     }

     // Telemetry configuration (global settings)
     "telemetry": {
       "enabled": true,
       "opentelemetry": {
         "enabled": true,
         "sample_rate": 0.1  // 10% sampling for production
       },
       "metrics": {
         "enabled": true
       }
     }
     ```

   - **Customize Model Selection**: Adjust model assignments based on your needs:

     ```json
     // Example: Cost-optimized setup
     "agents": {
       "critic": { "model": "anthropic.haiku" },    // Fast and cheap
       "summarizer": { "model": "anthropic.haiku" },
       "actor": { "model": "openai.gpt-4o-mini" }
     }

     // Example: Performance-optimized setup
     "agents": {
       "critic": { "model": "anthropic.opus" },     // Most capable
       "summarizer": { "model": "anthropic.sonnet" },
       "actor": { "model": "openai.o1-preview" }
     }
     ```

   - **Add Missing Configuration**: Fill in any gaps (e.g., Azure deployment names)
   - **Test Configuration**: Run with legacy_python_agents=true initially
   - **Feature Flags**: Switch to use_voltagent=true when ready

8. **Rollback Support**

   - Config backups: `backups/codeloops.config.json.backup.{timestamp}`
   - Original FastAgent YAML files remain unchanged
   - Easy rollback by restoring backup files

### Phase 1: Enhance Existing BaseAgent with VoltAgent (Hybrid Approach)

#### Why Hybrid Approach?

After analyzing the existing codebase, we discovered that the current BaseAgent implementation is **already more advanced** than the initial plan anticipated. It provides:

- ✅ Production-ready error handling and retry logic
- ✅ Deep Pino logger integration
- ✅ Clean factory pattern with provider abstraction
- ✅ Custom `AgentError` class with detailed context
- ✅ Comprehensive validation and type safety

However, VoltAgent offers **enterprise features** that BaseAgent currently lacks:

- 🚀 **Tools/Function Calling**: Invoke external tools during generation
- 🚀 **Memory Management**: Built-in conversation history and persistence
- 🚀 **Sub-Agents**: Delegate tasks to specialized agents (perfect for actor-critic)
- 🚀 **Lifecycle Hooks**: Observability with `onStart`, `onEnd`, `onToolStart`, `onToolEnd`
- 🚀 **Multi-Provider Support**: Broader LLM ecosystem support

#### Hybrid Implementation Strategy

1. **Refactor BaseAgent to Wrap VoltAgent**

   ```typescript
   // Enhanced BaseAgent that wraps VoltAgent while preserving existing API
   import { Agent as VoltAgent } from '@voltagent/core';
   import { VercelAIProvider } from '@voltagent/vercel-ai';
   import { createHooks } from '@voltagent/core';

   export class Agent<T> {
     private voltAgent: VoltAgent;
     private readonly logger: Logger;
     private readonly outputSchema: z.ZodSchema<T>;

     constructor(config: AgentConfig<T>, deps: AgentDeps) {
       this.logger = deps.logger.child({ agent: config.name });
       this.outputSchema = config.outputSchema;

       // Create VoltAgent with enhanced capabilities
       this.voltAgent = new VoltAgent({
         name: config.name,
         instructions: config.instructions,
         llm: new VercelAIProvider(),
         model: this.selectModel(config),
         temperature: config.temperature,
         maxTokens: config.maxTokens,
         // Enable VoltAgent enterprise features
         tools: config.tools || [],
         memory: config.memory,
         subAgents: config.subAgents,
         hooks: this.createHooks(config),
       });
     }

     // Preserve existing API for backward compatibility
     async send(prompt: string, options?: AgentSendOptions): Promise<T> {
       try {
         // Use VoltAgent's generateObject internally
         const result = await this.voltAgent.generateObject(
           prompt,
           this.outputSchema,
           options?.provider,
         );
         return result.object as T;
       } catch (error) {
         // Preserve existing error handling patterns
         throw new AgentError(`Failed to generate response`, this.config.name, error);
       }
     }

     // New methods to expose VoltAgent features
     async sendWithTools(prompt: string, tools: Tool[]): Promise<T> {
       // Temporarily add tools for this specific request
       const originalTools = this.voltAgent.tools;
       this.voltAgent.tools = [...originalTools, ...tools];
       try {
         return await this.send(prompt);
       } finally {
         this.voltAgent.tools = originalTools;
       }
     }

     // Expose streaming capabilities
     async streamObject(prompt: string, options?: AgentSendOptions) {
       return this.voltAgent.streamObject(prompt, this.outputSchema, options?.provider);
     }

     // Create lifecycle hooks that integrate with existing logging
     private createHooks(config: AgentConfig<T>) {
       return createHooks({
         onStart: async ({ agent, context }) => {
           this.logger.debug({ prompt: context.prompt }, 'Agent started');
         },
         onEnd: async ({ agent, output, error }) => {
           if (error) {
             this.logger.error({ error }, 'Agent failed');
           } else {
             this.logger.debug({ usage: output?.usage }, 'Agent completed');
           }
         },
         onToolStart: async ({ tool }) => {
           this.logger.debug({ tool: tool.name }, 'Tool execution started');
         },
         onToolEnd: async ({ tool, output, error }) => {
           if (error) {
             this.logger.error({ tool: tool.name, error }, 'Tool execution failed');
           } else {
             this.logger.debug({ tool: tool.name }, 'Tool execution completed');
           }
         },
       });
     }
   }
   ```

2. **Benefits of Hybrid Approach**
   - **No Breaking Changes**: Existing CodeLoops code continues working
   - **Incremental Adoption**: Add VoltAgent features as needed
   - **Risk Mitigation**: Easy rollback if issues arise
   - **Best of Both Worlds**: Keep custom logic while gaining enterprise features
   - **Framework Independence**: BaseAgent remains an abstraction layer

### Phase 2: Design Critic Agent with BaseAgent

1. **Configuration Management Setup**

   First, create the configuration management utility:

   ```typescript
   // src/config/index.ts
   import Conf from 'conf';
   import { z } from 'zod';

   // Configuration schema for validation
   const ConfigSchema = z.object({
     version: z.string(),
     default_model: z.string(),
     anthropic: z.object({
       api_key: z.string().optional(),
       models: z.record(
         z.object({
           id: z.string(),
           max_tokens: z.number(),
           description: z.string().optional(),
         }),
       ),
     }),
     openai: z.object({
       api_key: z.string().optional(),
       base_url: z.string().optional(),
       models: z.record(
         z.object({
           id: z.string(),
           max_tokens: z.number(),
           description: z.string().optional(),
           reasoning_effort: z.string().optional(),
         }),
       ),
     }),
     azure: z
       .object({
         api_key: z.string().optional(),
         resource_name: z.string().optional(),
         models: z.record(
           z.object({
             id: z.string(),
             max_tokens: z.number(),
             description: z.string().optional(),
           }),
         ),
       })
       .optional(),
     agents: z.object({
       critic: z.object({
         enabled: z.boolean(),
         model: z.string(),
         temperature: z.number(),
         max_tokens: z.number(),
       }),
       summarizer: z.object({
         enabled: z.boolean(),
         model: z.string(),
         temperature: z.number(),
         max_tokens: z.number(),
       }),
     }),
     // ... other config sections
   });

   type CodeLoopsConfig = z.infer<typeof ConfigSchema>;

   let configInstance: Conf<CodeLoopsConfig> | null = null;

   export function getConfig(): Conf<CodeLoopsConfig> {
     if (!configInstance) {
       configInstance = new Conf<CodeLoopsConfig>({
         configName: 'codeloops.config',
         fileExtension: 'json',
         projectName: 'codeloops',
         schema: ConfigSchema,
         // Support environment variable overrides
         // CODELOOPS__LOGGER__LEVEL -> config.logger.level
         configFileMode: 0o600, // Secure file permissions for API keys
       });
     }
     return configInstance;
   }

   // Helper functions for common config access
   export function getModelConfig(modelRef: string) {
     const config = getConfig();
     const [provider, model] = modelRef.split('.');

     switch (provider) {
       case 'anthropic':
         return config.get(`anthropic.models.${model}`);
       case 'openai':
         return config.get(`openai.models.${model}`);
       case 'azure':
         return config.get(`azure.models.${model}`);
       default:
         throw new Error(`Unsupported provider: ${provider}`);
     }
   }
   ```

2. **Agent Structure Using Enhanced BaseAgent**

   ```typescript
   import { BaseAgent, createAgent } from './BaseAgent';
   import { openai } from '@ai-sdk/openai';
   import { anthropic } from '@ai-sdk/anthropic';
   import { z } from 'zod';
   import { getInstance as getLogger } from '../logger';
   import { DagNode } from '../engine/KnowledgeGraph';
   import { getConfig, getModelConfig } from '../config';

   const CriticOutputSchema = z.object({
     verdict: z.enum(['approved', 'needs_revision', 'reject']),
     verdictReason: z.string().optional(),
   });

   export type CriticResponse = z.infer<typeof CriticOutputSchema>;

   function selectModel(agentType: 'critic' | 'summarizer' | 'actor') {
     // Use codeloops.config.json for model selection
     const config = getConfig();
     const agentConfig = config.get(`agents.${agentType}`);
     const modelRef = agentConfig?.model || config.get('default_model');

     // Use helper function to get model configuration
     const modelConfig = getModelConfig(modelRef);
     const [provider] = modelRef.split('.');

     // Create provider-specific client with API keys from config
     switch (provider) {
       case 'anthropic':
         return anthropic(modelConfig.id, {
           apiKey: config.get('anthropic.api_key') || process.env.ANTHROPIC_API_KEY,
         });

       case 'openai':
         return openai(modelConfig.id, {
           apiKey: config.get('openai.api_key') || process.env.OPENAI_API_KEY,
         });

       case 'azure':
         return azure(modelConfig.id, {
           apiKey: config.get('azure.api_key') || process.env.AZURE_OPENAI_API_KEY,
           resourceName:
             config.get('azure.resource_name') || process.env.AZURE_OPENAI_RESOURCE_NAME,
         });

       default:
         throw new Error(`Unsupported provider: ${provider}`);
     }
   }

   export const createCriticAgent = (): BaseAgent<CriticResponse> => {
     const config = getConfig();
     const criticConfig = config.get('agents.critic');

     return createAgent<CriticResponse>({
       name: 'CodeLoops Quality Critic',
       instructions: CRITIC_INSTRUCTIONS, // Full instructions as system prompt
       outputSchema: CriticOutputSchema,
       model: selectModel('critic'), // Config-based model selection
       temperature: criticConfig.temperature || 0.3,
       maxTokens: criticConfig.max_tokens || 2000,
       // VoltAgent features can be added here:
       // tools: [customTools],
       // hooks: criticHooks,
       // memory: memoryProvider,
     });
   };
   ```

3. **Config-Based Model Selection Benefits**

   - **Declarative**: Model selection defined in codeloops.config.json
   - **Per-Agent**: Each agent can use different models (critic uses sonnet, summarizer uses haiku)
   - **Consistent**: Centralized configuration with fallback to default_model
   - **Flexible**: Easy to change models without code changes
   - **Type-Safe**: Model IDs and parameters validated against config schema

4. **Instructions-Based Logic**

   - Embed all review criteria directly in system instructions
   - Include DagNode schema definition and validation rules
   - Specify exact output format requirements
   - No tools needed - logic handled by LLM reasoning

5. **Integration Approach**
   - Replace subprocess calls in `Critic.ts` with direct agent calls
   - Port existing artifact guard checks as pre-validation
   - Build clean new interface leveraging VoltAgent capabilities

### Phase 3: Design Summarizer Agent with BaseAgent

1. **Agent Structure Using BaseAgent + VoltAgent**

   ```typescript
   import { BaseAgent, createAgent } from './BaseAgent';
   import { openai } from '@ai-sdk/openai';
   import { anthropic } from '@ai-sdk/anthropic';
   import { z } from 'zod';
   import { getInstance as getLogger } from '../logger';
   import { DagNode } from '../engine/KnowledgeGraph';
   import { AZURE_OPENAI_API_KEY, OPENAI_API_KEY } from './config';

   const SummaryOutputSchema = z.object({
     summary: z.string().describe('Concise summary of knowledge graph segment'),
     error: z.string().optional(),
   });

   export type SummaryResponse = z.infer<typeof SummaryOutputSchema>;

   function selectModel(agentType: 'critic' | 'summarizer' | 'actor') {
     // Use codeloops.config.json for model selection
     const config = getConfig();
     const agentConfig = config.get(`agents.${agentType}`);
     const modelRef = agentConfig?.model || config.get('default_model');

     // Use helper function to get model configuration
     const modelConfig = getModelConfig(modelRef);
     const [provider] = modelRef.split('.');

     // Create provider-specific client with API keys from config
     switch (provider) {
       case 'anthropic':
         return anthropic(modelConfig.id, {
           apiKey: config.get('anthropic.api_key') || process.env.ANTHROPIC_API_KEY,
         });

       case 'openai':
         return openai(modelConfig.id, {
           apiKey: config.get('openai.api_key') || process.env.OPENAI_API_KEY,
         });

       case 'azure':
         return azure(modelConfig.id, {
           apiKey: config.get('azure.api_key') || process.env.AZURE_OPENAI_API_KEY,
           resourceName:
             config.get('azure.resource_name') || process.env.AZURE_OPENAI_RESOURCE_NAME,
         });

       default:
         throw new Error(`Unsupported provider: ${provider}`);
     }
   }

   export const createSummarizerAgent = (): BaseAgent<SummaryResponse> => {
     const config = getConfig();
     const summarizerConfig = config.get('agents.summarizer');

     return createAgent<SummaryResponse>({
       name: 'CodeLoops Summarization Agent',
       instructions: SUMMARIZER_INSTRUCTIONS, // Full instructions
       outputSchema: SummaryOutputSchema,
       model: selectModel('summarizer'), // Config-based model selection
       temperature: summarizerConfig.temperature || 0.5,
       maxTokens: summarizerConfig.max_tokens || 1000,
       // VoltAgent features can be added here:
       // memory: conversationHistory,
       // hooks: summaryHooks,
     });
   };
   ```

2. **Config-Based Model Selection**

   - Same `selectModel()` function as Critic Agent for consistency
   - Reads from codeloops.config.json for model configuration
   - Shared model selection logic can be extracted to utility function
   - Declarative configuration without hardcoded providers

3. **Summarization Logic**
   - Instructions include DagNode schema and analysis guidelines
   - Focus on key decisions, artifacts, and work progression
   - Handle error cases within schema (error field)
   - No complex parsing needed - schema validates output

### Phase 4: Update Integration Layer

1. **Update Critic.ts Wrapper**

   ```typescript
   // Replace subprocess logic with direct agent call
   import { reviewActorNode } from './CriticAgent';

   if (verdict === 'approved') {
     try {
       const criticResponse = await reviewActorNode(target as DagNode);
       verdict = criticResponse.verdict;
       reason = criticResponse.verdictReason;
     } catch (err) {
       getLogger().error({ err }, 'Failed to get critic review');
       verdict = 'needs_revision';
       reason = 'Critic agent failed to process the review';
     }
   }
   ```

2. **Update Summarize.ts Wrapper**

   ```typescript
   // Replace subprocess logic with direct agent call
   import { summarizeNodes } from './SummarizerAgent';

   async summarize(nodes: DagNode[]): Promise<{ summary: string; error?: string }> {
     try {
       const result = await summarizeNodes(nodes);
       return result;
     } catch (error) {
       return {
         summary: '',
         error: `Summarization failed: ${error.message}`,
       };
     }
   }
   ```

3. **Clean Implementation**
   - Build new interfaces optimized for VoltAgent features
   - Implement modern error handling with VoltAgent hooks
   - Remove all Python-specific dependencies and patterns

## Migration Checklist

**Phase 0: Configuration Migration**

- [ ] Run migration script: `npx ts-node scripts/migrations/migrate_fastagent_config.ts`
- [ ] Review generated codeloops.config.json for complete configuration including API keys
- [ ] Verify LLM provider settings migrated correctly (models, API keys)
- [ ] Review migration warnings for FastAgent configs not migrated
- [ ] Configure CodeLoops-specific logging (pino) and telemetry settings
- [ ] Add any missing API keys that weren't in YAML files
- [ ] Set Azure-specific values if using Azure OpenAI
- [ ] Set appropriate file permissions for config file containing API keys
- [ ] Test configuration with legacy_python_agents=true
- [ ] Create backup of original FastAgent YAML files

**Phase 1: Enhance BaseAgent with VoltAgent (Hybrid Approach)**

- [x] Install VoltAgent dependencies (`@voltagent/core`, `@voltagent/vercel-ai`)
- [x] Analyze existing BaseAgent implementation (discovered it's already production-ready)
- [ ] Refactor BaseAgent to wrap VoltAgent while preserving existing API
- [ ] Add methods to expose VoltAgent features (tools, memory, sub-agents)
- [ ] Integrate VoltAgent hooks with existing Pino logging
- [ ] Create configuration bridge between codeloops.config.json and VoltAgent

**Phase 2: Critic Agent**

- [ ] Create `src/agents/CriticAgent.ts` with BaseAgent and createAgent
- [ ] Implement dynamic model selection based on environment variables
- [ ] Define comprehensive critic instructions
- [ ] Implement CriticOutputSchema with Zod
- [ ] Create helper function `reviewActorNode()`

**Phase 3: Summarizer Agent**

- [ ] Create `src/agents/SummarizerAgent.ts` with BaseAgent and createAgent
- [ ] Implement dynamic model selection (same as Critic Agent)
- [ ] Define summarization instructions
- [ ] Implement SummaryOutputSchema with Zod
- [ ] Create helper function `summarizeNodes()`

**Phase 4: Integration**

- [ ] Rewrite `Critic.ts` to use new CriticAgent implementation
- [ ] Rewrite `Summarize.ts` to use new SummarizerAgent implementation
- [ ] Remove all Python agent dependencies and subprocess calls
- [ ] Update ActorCriticEngine to use new agent interfaces

**Phase 5: Testing & Cleanup**

- [ ] Create comprehensive unit tests for new VoltAgent-based agents
- [ ] Test new agent integration with ActorCriticEngine
- [ ] Performance comparison with Python agents
- [ ] Update documentation for new VoltAgent architecture
- [ ] Remove Python agent files and dependencies

## Testing Strategy

1. **Unit Tests**

   - Test each agent independently
   - Validate tool execution
   - Check error handling

2. **Integration Tests**

   - Test actor-critic flow
   - Verify knowledge graph updates
   - Check summarization triggers

3. **Migration Tests**
   - Compare outputs between Python and VoltAgent implementations
   - Validate new VoltAgent features work correctly
   - Performance benchmarks and optimization

## Rollback Plan

1. Keep Python agents in place during migration for comparison
2. Use feature flags to switch between Python and VoltAgent implementations
3. Run parallel execution paths until VoltAgent agents are proven stable
4. Document breaking changes and new VoltAgent capabilities

## Timeline Estimate (Updated Based on Analysis)

- **Phase 0**: ✅ **Already Complete** (Configuration system exists)
- **Phase 1**: 0.75-1 day (Enhance BaseAgent with VoltAgent - simpler than full redesign)
- **Phase 2**: 0.5 days (Critic Agent - leverage existing patterns)
- **Phase 3**: 0.25 days (Summarizer Agent - reuse critic patterns)
- **Phase 4**: 0.25 days (Integration layer updates)
- **Phase 5**: 1 day (Testing and cleanup)
- **Total**: 2.75-3.25 days (significantly faster than original estimate)

_Provides best of both worlds: your custom API + VoltAgent's enterprise features_

## Success Criteria

1. **Functionality**: All tests passing with new VoltAgent-based implementation
2. **Performance**: No subprocess calls, faster agent execution with VoltAgent optimizations
3. **Type Safety**: Full TypeScript type coverage with VoltAgent and BaseAgent generics
4. **Reliability**: VoltAgent's built-in error handling, hooks, and retry logic
5. **Maintainability**: Single language codebase with modern VoltAgent architecture
6. **Features**: Access to VoltAgent's enterprise capabilities (tools, memory, streaming)

## Advantages of BaseAgent + VoltAgent Approach

**vs. Direct VoltAgent:**

- ✅ Preserves existing battle-tested BaseAgent implementation
- ✅ No breaking changes for current CodeLoops consumers
- ✅ Maintains custom error handling and retry logic
- ✅ Keeps deep Pino logger integration
- ✅ Access to all VoltAgent enterprise features when needed
- ✅ Framework independence (easy to switch later)
- ✅ Incremental migration path with lower risk

**vs. Python fast-agent:**

- ✅ No subprocess overhead
- ✅ Type safety with TypeScript
- ✅ Unified logging and monitoring
- ✅ Better debugging experience
- ✅ Easier to extend and modify

## Telemetry Implementation Plan

### Current Telemetry Gap Analysis

While `codeloops.config.json` defines comprehensive telemetry configuration, there's currently no implementation:

#### ✅ **What's Configured:**

```json
// Complete example with API keys in config
{
  "anthropic": {
    "api_key": "sk-ant-...", // Config-first approach
    "models": {
      /* ... */
    }
  },
  "openai": {
    "api_key": "sk-...", // Config-first approach
    "base_url": "https://api.openai.com/v1",
    "models": {
      /* ... */
    }
  },
  "telemetry": {
    "enabled": true,
    "service_name": "codeloops",
    "service_version": "1.0.0",
    "environment": "development",
    "opentelemetry": {
      "enabled": true,
      "otlp_endpoint": "http://localhost:4318",
      "sample_rate": 1.0
    },
    "metrics": {
      "enabled": true
    }
  }
}
```

#### ❌ **What's Missing:**

- OpenTelemetry SDK initialization and setup
- Agent performance metrics collection
- Knowledge graph operation tracing
- Integration with VoltAgent hooks
- Structured observability for actor-critic loop

### Implementation Phases

#### **Phase A: Core Telemetry Infrastructure**

Create telemetry service that integrates with existing configuration:

```typescript
// src/telemetry/index.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { getConfig } from '../config';

export class CodeLoopsTelemetry {
  private sdk: NodeSDK;

  constructor() {
    const config = getConfig().get('telemetry');

    this.sdk = new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: config.service_name,
        [SemanticResourceAttributes.SERVICE_VERSION]: config.service_version,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.environment,
      }),
      traceExporter: new OTLPTraceExporter({
        url: `${config.opentelemetry.otlp_endpoint}/v1/traces`,
      }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${config.opentelemetry.otlp_endpoint}/v1/metrics`,
        }),
      }),
      samplingRatio: config.opentelemetry.sample_rate,
    });
  }

  start() {
    if (getConfig().get('telemetry.enabled')) {
      this.sdk.start();
    }
  }

  shutdown() {
    return this.sdk.shutdown();
  }
}
```

#### **Phase B: BaseAgent Telemetry Integration**

Enhance existing BaseAgent with comprehensive instrumentation:

```typescript
// Enhanced BaseAgent with telemetry
import { trace, metrics } from '@opentelemetry/api';

export class Agent<T> {
  private readonly tracer = trace.getTracer('codeloops-agent');
  private readonly meter = metrics.getMeter('codeloops-agent');

  // Metrics
  private readonly requestDuration = this.meter.createHistogram('agent_request_duration_ms');
  private readonly tokenUsage = this.meter.createHistogram('agent_token_usage');
  private readonly requestCount = this.meter.createCounter('agent_requests_total');

  async send(prompt: string, options?: AgentSendOptions): Promise<T> {
    return this.tracer.startActiveSpan(`agent.${this.config.name}.send`, async (span) => {
      const startTime = Date.now();

      // Set span attributes
      span.setAttributes({
        'agent.name': this.config.name,
        'agent.prompt_length': prompt.length,
        'agent.model': this.model.modelId,
        'agent.temperature': this.config.temperature,
      });

      this.requestCount.add(1, { agent: this.config.name, operation: 'send' });

      try {
        const response = await this.executeWithRetry(/* existing logic */);
        const duration = Date.now() - startTime;

        // Record success metrics
        this.requestDuration.record(duration, {
          agent: this.config.name,
          status: 'success',
          model: this.model.modelId,
        });

        if (response.usage) {
          this.tokenUsage.record(response.usage.totalTokens, {
            agent: this.config.name,
            type: 'total',
          });
        }

        span.setAttributes({
          'agent.response.success': true,
          'agent.response.duration_ms': duration,
          'agent.response.tokens.input': response.usage?.promptTokens,
          'agent.response.tokens.output': response.usage?.completionTokens,
        });

        return response.object as T;
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        this.requestCount.add(1, {
          agent: this.config.name,
          operation: 'send',
          status: 'error',
        });
        throw error;
      }
    });
  }
}
```

#### **Phase C: VoltAgent Hook Telemetry**

Perfect integration point for VoltAgent hooks:

```typescript
// src/telemetry/voltAgentHooks.ts
export function createTelemetryHooks(agentName: string) {
  const tracer = trace.getTracer('codeloops-voltagent');
  const meter = metrics.getMeter('codeloops-voltagent');

  return createHooks({
    onStart: async ({ agent, context }) => {
      const span = tracer.startSpan(`voltagent.${agentName}.execution`);
      span.setAttributes({
        'agent.name': agentName,
        'agent.prompt_length': context.prompt?.length || 0,
        'operation.type': 'agent_execution',
      });

      // Store span in context for later hooks
      context.userContext.set('telemetrySpan', span);
    },

    onEnd: async ({ agent, output, error, context }) => {
      const span = context.userContext.get('telemetrySpan');
      if (span) {
        if (error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR });
        } else {
          span.setAttributes({
            'agent.response.success': true,
            'agent.response.tokens': output?.usage?.totalTokens || 0,
          });
        }
        span.end();
      }
    },

    onToolStart: async ({ tool, context }) => {
      const span = tracer.startSpan(`tool.${tool.name}.execution`);
      span.setAttributes({
        'tool.name': tool.name,
        'tool.description': tool.description,
      });
      context.userContext.set('toolSpan', span);
    },

    onToolEnd: async ({ tool, output, error, context }) => {
      const span = context.userContext.get('toolSpan');
      if (span) {
        span.setAttributes({
          'tool.name': tool.name,
          'tool.success': !error,
          'tool.output_size': JSON.stringify(output || {}).length,
        });
        if (error) span.recordException(error);
        span.end();
      }
    },
  });
}
```

#### **Phase D: Knowledge Graph Telemetry**

Instrument the actor-critic feedback loop:

```typescript
// src/engine/KnowledgeGraphManager.ts (enhanced)
export class KnowledgeGraphManager {
  private readonly tracer = trace.getTracer('codeloops-knowledge-graph');
  private readonly meter = metrics.getMeter('codeloops-knowledge-graph');

  // Metrics
  private readonly nodesCreated = this.meter.createCounter('kg_nodes_created_total');
  private readonly criticReviews = this.meter.createCounter('kg_critic_reviews_total');
  private readonly summarizations = this.meter.createCounter('kg_summarizations_total');

  async createNode(node: DagNode): Promise<DagNode> {
    return this.tracer.startActiveSpan('knowledge_graph.create_node', async (span) => {
      span.setAttributes({
        'node.type': node.role,
        'node.project': node.project,
        'node.tags': node.tags?.join(',') || '',
        'node.artifacts_count': node.artifacts?.length || 0,
        'node.has_critic_review': !!node.verdict,
      });

      try {
        const result = await this.performCreateNode(node);

        // Record metrics
        this.nodesCreated.add(1, {
          project: node.project,
          type: node.role,
        });

        if (node.role === 'critic') {
          this.criticReviews.add(1, {
            project: node.project,
            verdict: node.verdict || 'unknown',
          });
        }

        span.setAttributes({
          'node.id': result.id,
          'node.created_successfully': true,
        });

        return result;
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      }
    });
  }
}
```

### Key Metrics for CodeLoops

#### **Agent Performance Metrics:**

- **Request Duration**: Response time percentiles (p50, p95, p99) by agent type
- **Token Usage**: Input/output tokens per agent, cost tracking
- **Success/Failure Rates**: Error rates by agent, model, and operation type
- **Retry Patterns**: Retry attempts before success/failure

#### **Actor-Critic Loop Metrics:**

- **Critic Approval Rate**: Percentage of approved vs needs_revision by project
- **Review Latency**: Time from actor thought to critic review completion
- **Iteration Count**: Average iterations before approval
- **Quality Trends**: Approval rates and feedback quality over time

#### **Knowledge Graph Metrics:**

- **Node Creation Rate**: New thoughts, reviews, and summaries per time period
- **Graph Growth**: Total nodes and connections over time by project
- **Summarization Triggers**: Frequency and effectiveness of auto-summarization
- **Project Activity**: Active projects and node distribution patterns

#### **Distributed Traces:**

- **End-to-End Request Flow**: Complete user request → actor → critic → response
- **Agent Execution Context**: Model calls, retries, tool usage, sub-agent delegation
- **Knowledge Graph Operations**: Node creation, updates, queries, and relationships
- **Error Propagation**: Full context of failures across all components

### Integration with Migration Plan

#### **Configuration-Driven Initialization:**

```typescript
// Application startup
const config = getConfig();
if (config.get('telemetry.enabled')) {
  const telemetry = new CodeLoopsTelemetry();
  telemetry.start();
}
```

#### **Gradual Rollout Strategy:**

1. **Phase 1**: Add basic tracing to enhanced BaseAgent
2. **Phase 2**: Integrate VoltAgent hooks during hybrid migration
3. **Phase 3**: Extend to knowledge graph operations
4. **Phase 4**: Add custom dashboards and alerting

#### **Observability Benefits:**

- **Performance Optimization**: Identify bottlenecks in agent execution
- **Quality Insights**: Track critic feedback patterns and effectiveness
- **Cost Management**: Monitor token usage and optimize model selection
- **Reliability**: Proactive error detection and debugging capabilities

## Key Discoveries During Analysis

1. **BaseAgent is Already Production-Ready**: The existing implementation is more sophisticated than the migration plan anticipated
2. **VoltAgent Adds Enterprise Features**: Tools, memory, sub-agents, and hooks that BaseAgent currently lacks
3. **Hybrid Approach is Optimal**: Wrap VoltAgent with BaseAgent to get best of both worlds
4. **Configuration System Exists**: Phase 0 is essentially complete with codeloops.config.json
5. **Dependencies Already Installed**: VoltAgent packages are already in package.json
6. **Telemetry Gap Identified**: Comprehensive config exists but no implementation - perfect fit for VoltAgent hooks

## Future Enhancements

Once BaseAgent enhancement is complete, consider:

- **Streaming Responses**: Use `streamObject()` for real-time feedback
- **Model Selection Strategies**: Implement fallback order and task-based model selection
- **Performance Optimization**: Add caching, memory management, and parallel execution
- **Engine Configuration**: Add critic trigger tags, auto-summarization, and parallel thoughts
- **Project Management**: Auto-detection and default project naming
- **Model Switching**: Extend support to include Gemini, Groq, and other providers
- **Context Management**: Add conversation history for multi-turn interactions
- **Agent Orchestration**: Create coordinator agents for complex workflows
- **Configuration UI**: Web interface for agent parameter tuning
- **Model Performance**: Compare Claude vs GPT-4 performance for critic/summarizer tasks
