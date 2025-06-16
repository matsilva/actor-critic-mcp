# Agent Framework Migration Plan

## Overview

Migration from Python fast-agent framework to TypeScript using existing BaseAgent enhanced with VoltAgent capabilities. BaseAgent is production-ready with Vercel AI SDK - the plan leverages this foundation by wrapping VoltAgent to gain enterprise features while preserving existing abstractions.

## Current State

- **Python Agents**: `critic/agent.py`, `summarize/agent.py` (using fast-agent)
- **TypeScript Infrastructure**: Production-ready `BaseAgent.ts` with Vercel AI SDK
- **Communication**: JSON over subprocess (Python ↔ TypeScript)
- **Pain Points**: Language fragmentation, subprocess overhead, limited type safety

## Target Architecture: BaseAgent + VoltAgent

```typescript
// Layered approach:
// 1. VoltAgent (underlying framework)
// 2. BaseAgent (abstraction layer)
// 3. Specific Agents (CriticAgent, SummarizerAgent)

import { Agent } from '@voltagent/core';
import { BaseAgent } from './BaseAgent';
```

**Benefits**: Unified TypeScript, native integration, framework independence, VoltAgent enterprise features (tools, hooks, memory, streaming), full type safety.

## Implementation Checklist

### Phase 0: Configuration Migration

**Status**: ✅ COMPLETED

- [x] **Run migration script**: `npx ts-node scripts/migrations/migrate_fastagent_config.ts`
- [x] **Review generated** `codeloops.config.json`
- [x] **Verify LLM provider settings** migrated correctly (OpenAI, Anthropic, Azure)
- [x] **Review migration warnings** for FastAgent-specific configs not migrated
- [x] **Add missing API keys** to config file or environment variables
- [ ] **Set Azure-specific values** if using Azure OpenAI (resource_name, etc.)
- [ ] **Set file permissions** `chmod 600 codeloops.config.json` for API key security
- [x] **Test configuration** with `legacy_python_agents=true` flag
- [ ] **Create backup** of original FastAgent YAML files

### Phase 1: BaseAgent Enhancement

**Status**: ✅ COMPLETED

- [x] **Install VoltAgent**:
      `npm install --save-dev typescript tsx @types/node @voltagent/cli`
      `npm install @voltagent/core @voltagent/vercel-ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/azure zod`
- [x] **Refactor BaseAgent** to wrap VoltAgent while preserving existing API
- [x] **Add VoltAgent features**: Expose tools, hooks, memory capabilities
- [x] **Integrate logging**: Connect VoltAgent hooks with Pino logging
- [x] **Create config bridge**: Link VoltAgent with `codeloops.config.json`
- [x] **Add feature flag**: `use_voltagent=true` in config

### Phase 2: Critic Agent Implementation

**Files**: `src/agents/CriticAgent.ts`

- [ ] **Create CriticAgent class** extending enhanced BaseAgent
- [ ] **Implement dynamic model selection** using `selectModel('critic')`
- [ ] **Define critic instructions** for code quality evaluation
- [ ] **Create CriticOutputSchema**:

  ```typescript
  z.object({
    verdict: z.enum(['approved', 'needs_revision', 'reject']),
    verdictReason: z.string().optional(),
    recommendations: z.array(z.string()).optional(),
  });
  ```

- [ ] **Add helper function** `reviewActorNode(nodeId: string, context: string)`
- [ ] **Add telemetry hooks** for critic performance tracking

### Phase 3: Summarizer Agent Implementation

**Files**: `src/agents/SummarizerAgent.ts`

- [ ] **Create SummarizerAgent class** extending enhanced BaseAgent
- [ ] **Implement dynamic model selection** using `selectModel('summarizer')`
- [ ] **Define summarization instructions** for knowledge graph condensation
- [ ] **Create SummaryOutputSchema**:

  ```typescript
  z.object({
    summary: z.string(),
    keyPoints: z.array(z.string()),
    actionItems: z.array(z.string()).optional(),
  });
  ```

- [ ] **Add helper function** `summarizeNodes(nodes: DagNode[])`
- [ ] **Add telemetry hooks** for summarization performance

### Phase 4: Integration & Migration

**Files**: Update existing `Critic.ts`, `Summarize.ts`, `ActorCriticEngine.ts`

- [ ] **Update Critic.ts** to use new CriticAgent instead of Python subprocess
- [ ] **Update Summarize.ts** to use new SummarizerAgent instead of Python subprocess
- [ ] **Remove subprocess calls** (`execa` usage for Python agents)
- [ ] **Update ActorCriticEngine** to work with TypeScript-only agents
- [ ] **Add feature flag support** to allow gradual migration
- [ ] **Update error handling** for native TypeScript exceptions

### Phase 5: Testing & Cleanup

**Quality Assurance**

- [ ] **Create unit tests** for CriticAgent and SummarizerAgent
- [ ] **Create integration tests** with ActorCriticEngine and KnowledgeGraph
- [ ] **Performance comparison** between Python and TypeScript agents
- [ ] **End-to-end testing** with full actor-critic workflow
- [ ] **Documentation updates** for new agent architecture
- [ ] **Remove Python files**: Delete `agents/critic/` and `agents/summarize/` directories
- [ ] **Remove Python dependencies** from package.json and requirements files
- [ ] **Run type checking**: `npx tsc --noEmit --skipLibCheck`

## Technical Implementation Details

### Configuration Management

The enhanced config system uses `codeloops.config.json` with environment fallbacks:

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

### Agent Implementation Pattern

```typescript
export class CriticAgent extends BaseAgent<CriticResponse> {
  constructor() {
    super(
      {
        name: 'critic',
        instructions: `You are a code critic agent...`,
        outputSchema: CriticOutputSchema,
        model: selectModel('critic'),
      },
      { logger: getInstance() },
    );
  }

  async reviewActorNode(nodeId: string, context: string): Promise<CriticResponse> {
    const prompt = `Review actor node ${nodeId} in context: ${context}`;
    return await this.send(prompt);
  }
}
```

### Feature Flags

Support gradual migration with feature flags in `codeloops.config.json`:

```json
{
  "features": {
    "legacy_python_agents": false,
    "use_voltagent": true,
    "telemetry_enabled": true
  }
}
```

### Telemetry Integration

VoltAgent hooks integrate with existing Pino logging:

```typescript
// BaseAgent enhancement with VoltAgent hooks
class EnhancedBaseAgent extends BaseAgent {
  constructor(config, deps) {
    super(config, deps);

    // VoltAgent telemetry hooks
    this.voltAgent.onBeforeCall((context) => {
      this.logger.info({ context }, 'Agent call started');
    });

    this.voltAgent.onAfterCall((context, result) => {
      this.logger.info({ context, result }, 'Agent call completed');
    });
  }
}
```

## Migration Commands

```bash
# 1. Configuration migration
npx ts-node scripts/migrations/migrate_fastagent_config.ts

# 2. Install VoltAgent dependencies
npm install @voltagent/core @voltagent/vercel-ai

# 3. Run tests after implementation
npm test
npx tsc --noEmit --skipLibCheck

# 4. Performance comparison
npm run benchmark:agents

# 5. Final cleanup
rm -rf agents/critic agents/summarize
```

## Timeline Estimate

- **Phase 0** (Configuration): 0.5 days
- **Phase 1** (BaseAgent Enhancement): 1 day
- **Phase 2** (Critic Agent): 0.75 days
- **Phase 3** (Summarizer Agent): 0.75 days
- **Phase 4** (Integration): 0.5 days
- **Phase 5** (Testing & Cleanup): 0.75 days

**Total**: 4.25 days (reduced from original 5.5-7.5 days due to existing BaseAgent maturity)

## Success Criteria

- [ ] **All Python agents removed** and replaced with TypeScript equivalents
- [ ] **Performance maintained or improved** compared to subprocess approach
- [ ] **Full type safety** across agent interactions
- [ ] **All tests passing** including integration tests
- [x] **Configuration migrated** from FastAgent YAML to CodeLoops JSON
- [x] **Telemetry operational** with VoltAgent hooks and Pino logging
- [x] **Feature flags working** for gradual migration control

## Rollback Plan

If issues arise during migration:

1. **Set feature flag**: `"legacy_python_agents": true` in config
2. **Revert integration changes** in `ActorCriticEngine.ts`
3. **Restore Python agent calls** in `Critic.ts` and `Summarize.ts`
4. **Keep TypeScript agents** as experimental until issues resolved

## Future Enhancements (Post-Migration)

- **Model Selection UI**: Dynamic model switching
- **Parallel Execution**: Multi-agent concurrent processing
- **Advanced VoltAgent Features**: Sub-agents, complex tool chains
- **Performance Optimization**: Caching, streaming responses
- **Enterprise Features**: Advanced memory management, custom hooks

