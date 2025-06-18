# Agent Framework Migration Plan

## Overview

Migration from Python fast-agent framework to TypeScript using VoltAgent as the underlying framework, wrapped by our existing BaseAgent API. This approach leverages VoltAgent's enterprise features (tools, memory, sub-agents, hooks, retrievers) while maintaining backward compatibility with our existing agent architecture.

## Current State

- **Python Agents**: `critic/agent.py`, `summarize/agent.py` (using fast-agent)
- **TypeScript Infrastructure**: BaseAgent.ts now powered by VoltAgent with Vercel AI SDK
- **Communication**: JSON over subprocess (Python ↔ TypeScript)
- **Pain Points**: Language fragmentation, subprocess overhead, limited type safety

## Target Architecture: BaseAgent + VoltAgent

```typescript
// Layered approach:
// 1. VoltAgent (underlying enterprise framework)
// 2. BaseAgent (compatibility wrapper + extension points)
// 3. Specific Agents (CriticAgent, SummarizerAgent)

import { BaseAgent, createTool, type Tool } from './BaseAgent';
```

**Benefits**: Unified TypeScript codebase, VoltAgent enterprise features (tools, hooks, memory, streaming, sub-agents, retrievers), backward compatibility, clear extension paths.

## Implementation Checklist

### Phase 0: Configuration & Infrastructure

**Status**: ⚠️ **PARTIALLY COMPLETE** - Missing foundational components

#### ✅ Completed
- [x] **Run migration script**: `npx ts-node scripts/migrations/migrate_fastagent_config.ts`
- [x] **Review generated** `codeloops.config.json`
- [x] **Verify LLM provider settings** migrated correctly (OpenAI, Anthropic, Azure)
- [x] **Add VoltAgent dependencies**: `@voltagent/core`, `@voltagent/vercel-ai`
- [x] **Rewrite BaseAgent** to use VoltAgent under the hood with `_agent` property naming
- [x] **Maintain backward compatibility** with existing AgentConfig interface
- [x] **Add extension points** for VoltAgent features (tools, memory, sub-agents, etc.)

#### ❌ Outstanding (BLOCKERS for Phase 1)
- [ ] **Set file permissions** `chmod 600 codeloops.config.json` for API key security
- [ ] **Implement `selectModel()` function** for dynamic model instance creation
- [ ] **Define Zod output schemas** for CriticOutputSchema and SummaryOutputSchema
- [ ] **Add AI SDK provider imports** (anthropic, openai, azure) for model creation
- [ ] **Create model factory utilities** to bridge config system with AI SDK instances
- [ ] **Test model instance creation** with available API keys

### Phase 0.5: Missing Foundational Components

**Status**: ✅ **COMPLETED** - Phase 1 blockers resolved

**Files**: `src/config/models.ts`, `src/agents/schemas.ts`

- [x] **Implement `createModel()` function**:
  ```typescript
  function createModel(modelRef: string): LanguageModelV1 {
    // Parse model reference (format: "provider.model")
    const [provider, modelName] = modelRef.split('.');
    const modelConfig = getModelConfig(modelRef);
    
    switch (provider) {
      case 'anthropic': return anthropic(modelConfig.model.id);
      case 'openai': return openai(modelConfig.model.id);
      case 'azure': return azure(modelConfig.model.id, { resourceName });
      case 'deepseek': return openai(modelConfig.model.id, { baseURL: 'https://api.deepseek.com/v1', apiKey });
      case 'google': return openai(modelConfig.model.id, { baseURL: 'https://generativelanguage.googleapis.com/v1beta', apiKey });
      case 'generic': return openai(modelConfig.model.id, { baseURL, apiKey });
    }
  }
  
  // Also includes:
  // - getModelReference(configPath: string): Get model ref from any config path
  // - getModelConfigFromPath(configPath: string): Get model settings from config
  ```

- [x] **Define agent output schemas**:
  ```typescript
  export const CriticOutputSchema = z.object({
    verdict: z.enum(['approved', 'needs_revision', 'reject']),
    verdictReason: z.string().optional(),
    recommendations: z.array(z.string()).optional(),
  });
  
  export const SummaryOutputSchema = z.object({
    summary: z.string(),
    keyPoints: z.array(z.string()),
    actionItems: z.array(z.string()).optional(),
  });
  
  export type CriticResponse = z.infer<typeof CriticOutputSchema>;
  export type SummaryResponse = z.infer<typeof SummaryOutputSchema>;
  ```

- [x] **Add required AI SDK imports** (anthropic, openai, azure) to config system
- [x] **Create model factory utilities** with support for all configured providers
- [x] **API key management** with config-first + environment variable fallback
- [x] **Set file permissions**: `chmod 600 codeloops.config.json`

### Phase 1: Critic Agent Implementation

**Status**: 🚧 **READY TO START** - All blockers resolved

**Files**: `src/agents/CriticAgent.ts`

**Prerequisites**: 
- ✅ BaseAgent VoltAgent integration complete
- ✅ `createModel()` function implementation
- ✅ CriticOutputSchema definition
- ✅ AI SDK provider imports

**Implementation Tasks**:
- [ ] **Create CriticAgent class** extending BaseAgent
- [ ] **Implement dynamic model selection** using model reference from config
- [ ] **Port critic instructions** from Python agent (`agents/critic/agent.py`)
- [ ] **Add helper function** `reviewActorNode(nodeId: string, context: string)`
- [ ] **Leverage VoltAgent hooks** for automatic telemetry tracking
- [ ] **Test against existing Python agent** for output compatibility

### Phase 2: Summarizer Agent Implementation

**Status**: ⏸️ **BLOCKED** - Waiting for Phase 0.5 and Phase 1 completion

**Files**: `src/agents/SummarizerAgent.ts`

**Prerequisites**: 
- ❌ `selectModel()` function implementation
- ❌ SummaryOutputSchema definition
- ❌ Phase 1 CriticAgent completion (for pattern reference)

**Implementation Tasks**:
- [ ] **Create SummarizerAgent class** extending BaseAgent
- [ ] **Implement dynamic model selection** using `selectModel('summarizer')`
- [ ] **Port summarization instructions** from Python agent (`agents/summarize/agent.py`)
- [ ] **Add helper function** `summarizeNodes(nodes: DagNode[])`
- [ ] **Leverage VoltAgent hooks** for automatic telemetry tracking
- [ ] **Test against existing Python agent** for output compatibility

### Phase 3: Integration & Migration

**Status**: ⏸️ **BLOCKED** - Waiting for Phase 1 and Phase 2 completion

**Files**: Update existing `Critic.ts`, `Summarize.ts`, `ActorCriticEngine.ts`

**Prerequisites**: 
- ❌ CriticAgent implementation complete
- ❌ SummarizerAgent implementation complete
- ❌ Both agents tested and verified

**Current Integration Files**:
- **`src/agents/Critic.ts`** - Currently uses `execa` subprocess calls to Python
- **`src/agents/Summarize.ts`** - SummarizationAgent class with Python subprocess calls
- **`src/engine/ActorCriticEngine.ts`** - Orchestrates workflow, needs agent integration updates

**Implementation Tasks**:
- [ ] **Update Critic.ts** to use new CriticAgent instead of Python subprocess
- [ ] **Update Summarize.ts** to use new SummarizerAgent instead of Python subprocess
- [ ] **Remove subprocess calls** (`execa` usage for Python agents)
- [ ] **Update ActorCriticEngine** to work with TypeScript-only agents
- [ ] **Update error handling** for native TypeScript exceptions
- [ ] **Add feature flag support** to toggle between Python and TypeScript agents
- [ ] **Performance comparison testing** between old and new implementations

### Phase 4: Testing & Cleanup

**Status**: ⏸️ **BLOCKED** - Waiting for Phase 3 completion

**Prerequisites**: 
- ❌ All TypeScript agents implemented and integrated
- ❌ Feature flag system working
- ❌ Performance validation complete

**Quality Assurance Tasks**:
- [ ] **Create unit tests** for CriticAgent and SummarizerAgent
- [ ] **Create integration tests** with ActorCriticEngine and KnowledgeGraph
- [ ] **Performance comparison** between Python and TypeScript agents
- [ ] **End-to-end testing** with full actor-critic workflow
- [ ] **Memory usage analysis** (subprocess vs in-process)
- [ ] **Error handling validation** across all scenarios
- [ ] **Documentation updates** for new agent architecture

**Cleanup Tasks** (Only after validation):
- [ ] **Set feature flag**: `"legacy_python_agents": false` in config
- [ ] **Remove Python files**: Delete `agents/critic/` and `agents/summarize/` directories
- [ ] **Remove Python dependencies** from package.json and requirements files
- [ ] **Final type checking**: `npx tsc --noEmit --skipLibCheck`
- [ ] **Update README** with new architecture documentation

## Technical Implementation Details

### VoltAgent-Powered BaseAgent

The BaseAgent now uses VoltAgent under the hood while maintaining the existing API:

```typescript
export class Agent<T> {
  private readonly _agent: VoltAgent<any>; // Using any for now to avoid complex type issues
  private readonly logger: Logger;
  
  constructor(config: AgentConfig<T>, { logger }: AgentDeps) {
    // Create VoltAgent hooks for logging integration
    const hooks = createHooks({
      onStart: async ({ agent, context }) => {
        this.logger.info({
          operationId: context.operationId,
          agentName: agent.name,
        }, 'VoltAgent operation started');
      },
      onEnd: async ({ agent, output, error, context }) => {
        if (error) {
          this.logger.error({ operationId: context.operationId, error }, 'VoltAgent operation failed');
        } else {
          this.logger.info({ operationId: context.operationId }, 'VoltAgent operation completed');
        }
      },
      // Tool hooks for automatic tracking
      onToolStart: async ({ agent, tool, context }) => {
        this.logger.info({ toolName: tool.name }, 'VoltAgent tool execution started');
      },
      onToolEnd: async ({ agent, tool, output, error, context }) => {
        if (error) {
          this.logger.error({ toolName: tool.name, error }, 'VoltAgent tool execution failed');
        } else {
          this.logger.info({ toolName: tool.name }, 'VoltAgent tool execution completed');
        }
      },
    });

    // Initialize VoltAgent with basic configuration
    this._agent = new VoltAgent({
      name: config.name,
      instructions: config.instructions,
      llm: new VercelAIProvider(),
      model: config.model,
      hooks,
      markdown: config.markdown ?? false,
      // Keep it simple for now - advanced features can be added later
      tools: [],
      subAgents: [],
    });
  }

  // Main API methods
  async send(prompt: string, options?: AgentSendOptions): Promise<T> {
    return await this._agent.generateObject(prompt, this.outputSchema, {
      provider: {
        temperature: options?.temperature ?? this.temperature,
        maxTokens: options?.maxTokens ?? this.maxTokens,
      },
    }).then(response => response.object as T);
  }

  async sendText(prompt: string, options?: AgentSendOptions): Promise<string> {
    return await this._agent.generateText(prompt, {
      provider: {
        temperature: options?.temperature ?? this.temperature,
        maxTokens: options?.maxTokens ?? this.maxTokens,
      },
    }).then(response => response.text);
  }
}
```

### Configuration Management

Enhanced config system with providers object structure:

```typescript
// Model selection with config-first approach
function selectModel(agentType: 'critic' | 'summarizer' | 'actor') {
  const config = getConfig();
  const agentConfig = config.get(`agents.${agentType}`);
  const modelRef = agentConfig?.model || config.get('default_model');

  const modelConfig = getModelConfig(modelRef);
  const [provider] = modelRef.split('.');

  switch (provider) {
    case 'anthropic':
      return anthropic(modelConfig.id, {
        apiKey: config.get('providers.anthropic.api_key') || process.env.ANTHROPIC_API_KEY,
      });
    case 'openai':
      return openai(modelConfig.id, {
        apiKey: config.get('providers.openai.api_key') || process.env.OPENAI_API_KEY,
      });
    // ... other providers
  }
}
```

### Agent Implementation Pattern (FUTURE - Phase 1)

```typescript
// READY TO IMPLEMENT
export class CriticAgent extends Agent<CriticResponse> {
  constructor(deps: AgentDeps) {
    const config = getConfig();
    const modelRef = getModelReference('agents.critic.model') || config.get('default_model');
    
    super(
      {
        name: 'critic',
        instructions: `You are a code critic agent that evaluates code quality...`,
        outputSchema: CriticOutputSchema,
        model: createModel(modelRef),
        markdown: true,
      },
      deps, // Requires logger in deps object
    );
  }

  async reviewActorNode(nodeId: string, context: string): Promise<CriticResponse> {
    const prompt = `Review actor node ${nodeId} in context: ${context}`;
    return await this.send(prompt);
  }
}

// Usage pattern:
// const criticAgent = new CriticAgent({ logger: getInstance() });
// const result = await criticAgent.reviewActorNode('node123', 'implementation context');
```

### Extension Points for VoltAgent Features

The BaseAgent provides clear extension points for advanced VoltAgent capabilities:

```typescript
// Tools - for external integrations
const codeAnalysisTool = createTool({
  name: "analyze_code",
  description: "Analyze code quality and patterns",
  parameters: z.object({ code: z.string() }),
  execute: async ({ code }) => {
    // Tool implementation
  },
});

// Memory - for conversation persistence
import { LibSQLStorage } from '@voltagent/core';
const memory = new LibSQLStorage({ /* config */ });

// Retriever - for RAG capabilities
class CodebaseRetriever extends BaseRetriever {
  async retrieve(query: string): Promise<string> {
    // RAG implementation
  }
}

// Sub-agents - for task delegation
const researchAgent = new BaseAgent({ /* config */ });
const analysisAgent = new BaseAgent({ /* config */ });

// Enhanced agent with full VoltAgent capabilities
const agent = new BaseAgent({
  name: "Advanced Critic",
  instructions: "...",
  tools: [codeAnalysisTool],
  memory,
  retriever: new CodebaseRetriever(),
  subAgents: [researchAgent, analysisAgent],
  markdown: true,
});
```

### Feature Flags

Control migration with feature flags in `codeloops.config.json`:

```json
{
  "features": {
    "legacy_python_agents": true,  // Currently TRUE - using Python agents
    "telemetry_enabled": true      // VoltAgent hooks provide automatic telemetry
  }
}
```

**Migration Strategy**: Keep `legacy_python_agents: true` until all TypeScript agents are implemented and tested. This allows gradual migration and easy rollback if issues arise.

### Telemetry Integration

VoltAgent hooks provide automatic telemetry integration:

```typescript
// Automatic logging via VoltAgent hooks
const hooks = createHooks({
  onStart: async ({ agent, context }) => {
    logger.info({ operationId: context.operationId }, 'Agent operation started');
  },
  onEnd: async ({ agent, output, error, context }) => {
    // Automatic success/error tracking
  },
  onToolStart: async ({ agent, tool, context }) => {
    // Automatic tool usage tracking
  },
  onToolEnd: async ({ agent, tool, output, error, context }) => {
    // Automatic tool performance tracking
  },
});
```

## Migration Commands

```bash
# 1. Install VoltAgent dependencies
npm install @voltagent/core @voltagent/vercel-ai

# 2. Run tests after implementation
npm test
npx tsc --noEmit --skipLibCheck

# 3. Performance comparison
npm run benchmark:agents

# 4. Final cleanup
rm -rf agents/critic agents/summarize
```

## Timeline Estimate

- **Phase 0** (Configuration & Infrastructure): ✅ COMPLETED
- **Phase 0.5** (Missing Foundational Components): ✅ **COMPLETED** 
- **Phase 1** (Critic Agent): 🚧 0.5 days (READY TO START)
- **Phase 2** (Summarizer Agent): ⏸️ 0.5 days (BLOCKED)
- **Phase 3** (Integration): ⏸️ 0.75 days (BLOCKED)
- **Phase 4** (Testing & Cleanup): ⏸️ 0.5 days (BLOCKED)

**Total**: 2.25 days remaining (0.75 days completed)

**Next Steps**: Begin Phase 1 - Critic Agent Implementation.

## Success Criteria

### ✅ Completed
- [x] **Configuration migrated** from FastAgent YAML to CodeLoops JSON
- [x] **VoltAgent integration** working with automatic telemetry
- [x] **Extension points available** for tools, memory, sub-agents, retrievers
- [x] **Backward compatibility maintained** with existing BaseAgent API

### 🚧 In Progress (Phase 0.5)
- [ ] **Foundation components implemented** (selectModel, schemas, model factories)
- [ ] **Security hardening complete** (config file permissions)

### ⏸️ Pending (Phases 1-4)
- [ ] **All Python agents removed** and replaced with TypeScript equivalents
- [ ] **Performance maintained or improved** compared to subprocess approach
- [ ] **Full type safety** across agent interactions
- [ ] **All tests passing** including integration tests
- [ ] **Feature flag migration** (`legacy_python_agents: false`)
- [ ] **Documentation updated** for new architecture

## Rollback Plan

Currently safe - Python agents still active via `"legacy_python_agents": true`.

If issues arise during migration:

1. **Keep feature flag**: `"legacy_python_agents": true` in config (already set)
2. **Revert integration changes** in `ActorCriticEngine.ts` (if modified)
3. **Restore Python agent calls** in `Critic.ts` and `Summarize.ts` (currently intact)
4. **Keep VoltAgent BaseAgent** as experimental until issues resolved
5. **Remove problematic TypeScript agents** and continue with Python until fixed

**Risk Level**: LOW - Python infrastructure remains intact throughout migration.

## Future Enhancements (Post-Migration)

Now easily achievable with VoltAgent integration:

### Tools Integration
- **Code Analysis Tools**: AST parsing, linting integration
- **External APIs**: GitHub, JIRA, documentation systems
- **File System Tools**: Read/write operations, git commands

### Memory & Context
- **Conversation Persistence**: Full chat history across sessions
- **Project Context**: Codebase understanding and patterns
- **User Preferences**: Learning from user feedback

### Sub-Agents & Delegation
- **Specialized Agents**: Research, analysis, documentation, testing
- **Workflow Orchestration**: Complex multi-step processes
- **Parallel Processing**: Concurrent task execution

### RAG Integration
- **Codebase Knowledge**: Vector search across project files
- **Documentation Access**: Real-time docs and API references
- **Historical Context**: Past decisions and patterns

### Advanced Features
- **Voice Integration**: Speech-to-text and text-to-speech
- **Streaming Responses**: Real-time feedback and progress
- **Custom Providers**: Integration with specialized AI models
- **MCP Integration**: Model Context Protocol for external services