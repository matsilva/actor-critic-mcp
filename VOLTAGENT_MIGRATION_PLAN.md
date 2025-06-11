# Agent Framework Migration Plan

## Overview

This document outlines the migration plan from the current fast-agent Python framework to a unified TypeScript approach using BaseAgent built on top of VoltAgent for the CodeLoops system. The goal is to unify the codebase language and make CodeLoops a configurable framework for developers and non-developers seeking actor/critic style models in their workflows.

## Current Architecture

### Components

- **Python Agents** (in `/agents/` directory)
  - `critic/agent.py`: Uses fast-agent framework for code quality evaluation
  - `summarize/agent.py`: Uses fast-agent framework for knowledge graph summarization
- **TypeScript Wrappers** (in `/src/agents/` directory)
  - `Actor.ts`: Native TypeScript implementation
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

### Phase 1: Redesign BaseAgent to Use VoltAgent

1. **New BaseAgent Architecture**

   ```typescript
   // BaseAgent extends/wraps VoltAgent
   import { Agent } from '@voltagent/core';
   import { VercelAIProvider } from '@voltagent/vercel-ai';

   export class BaseAgent<T> {
     private voltAgent: Agent;

     constructor(config: BaseAgentConfig<T>) {
       this.voltAgent = new Agent({
         name: config.name,
         instructions: config.instructions,
         llm: new VercelAIProvider(),
         model: config.model,
         // VoltAgent features available
       });
     }

     async send(prompt: string): Promise<T> {
       // Use VoltAgent's generateObject with your schema
       const result = await this.voltAgent.generateObject(prompt, config.outputSchema);
       return result.object as T;
     }
   }
   ```

2. **VoltAgent Integration Benefits**
   - **Tools**: Easy to add custom tools to agents
   - **Hooks**: Built-in lifecycle hooks for logging/monitoring
   - **Memory**: Conversation history and context management
   - **Streaming**: Native streaming support with partial updates
   - **Sub-Agents**: Coordinate multiple agents for complex tasks

### Phase 2: Design Critic Agent with BaseAgent

1. **Agent Structure Using BaseAgent + VoltAgent**

   ```typescript
   import { BaseAgent, createAgent } from './BaseAgent';
   import { openai } from '@ai-sdk/openai';
   import { anthropic } from '@ai-sdk/anthropic';
   import { z } from 'zod';
   import { getInstance as getLogger } from '../logger';
   import { DagNode } from '../engine/KnowledgeGraph';
   import { AZURE_OPENAI_API_KEY, OPENAI_API_KEY } from './config';

   const CriticOutputSchema = z.object({
     verdict: z.enum(['approved', 'needs_revision', 'reject']),
     verdictReason: z.string().optional(),
   });

   export type CriticResponse = z.infer<typeof CriticOutputSchema>;

   function selectModel() {
     // Dynamic model selection based on environment variables
     if (AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_RESOURCE_NAME) {
       const azure = createAzure({
         apiKey: AZURE_OPENAI_API_KEY,
         resourceName: process.env.AZURE_OPENAI_RESOURCE_NAME,
       });
       return azure('gpt-4o');
     } else if (process.env.ANTHROPIC_API_KEY) {
       return anthropic('claude-3-5-sonnet-20241022');
     } else if (OPENAI_API_KEY) {
       const openai = createOpenAI({
         apiKey: OPENAI_API_KEY,
       });
       return openai('gpt-4o');
     } else {
       throw new Error('No valid API keys found for LLM providers');
     }
   }

   export const createCriticAgent = (): BaseAgent<CriticResponse> => {
     return createAgent<CriticResponse>({
       name: 'CodeLoops Quality Critic',
       instructions: CRITIC_INSTRUCTIONS, // Full instructions as system prompt
       outputSchema: CriticOutputSchema,
       model: selectModel(), // Dynamic model selection
       temperature: 0.3, // Lower temperature for consistent reviews
       // VoltAgent features can be added here:
       // tools: [customTools],
       // hooks: criticHooks,
       // memory: memoryProvider,
     });
   };
   ```

2. **Dynamic Model Selection Benefits**

   - **Flexibility**: Supports Azure OpenAI, Anthropic Claude, and OpenAI models
   - **Priority Order**: Azure OpenAI → Anthropic Claude → OpenAI (based on availability)
   - **Environment-Based**: Respects deployment-specific configurations
   - **Error Handling**: Clear error when no valid API keys are found
   - **Consistency**: Same model selection logic across all agents

3. **Instructions-Based Logic**

   - Embed all review criteria directly in system instructions
   - Include DagNode schema definition and validation rules
   - Specify exact output format requirements
   - No tools needed - logic handled by LLM reasoning

4. **Integration Approach**
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

   function selectModel() {
     // Dynamic model selection based on environment variables
     if (AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_RESOURCE_NAME) {
       const azure = createAzure({
         apiKey: AZURE_OPENAI_API_KEY,
         resourceName: process.env.AZURE_OPENAI_RESOURCE_NAME,
       });
       return azure('gpt-4o');
     } else if (process.env.ANTHROPIC_API_KEY) {
       return anthropic('claude-3-5-sonnet-20241022');
     } else if (OPENAI_API_KEY) {
       const openai = createOpenAI({
         apiKey: OPENAI_API_KEY,
       });
       return openai('gpt-4o');
     } else {
       throw new Error('No valid API keys found for LLM providers');
     }
   }

   export const createSummarizerAgent = (): BaseAgent<SummaryResponse> => {
     return createAgent<SummaryResponse>({
       name: 'CodeLoops Summarization Agent',
       instructions: SUMMARIZER_INSTRUCTIONS, // Full instructions
       outputSchema: SummaryOutputSchema,
       model: selectModel(), // Dynamic model selection
       temperature: 0.5, // Moderate creativity for summaries
       maxTokens: 1000, // Limit summary length
       // VoltAgent features can be added here:
       // memory: conversationHistory,
       // hooks: summaryHooks,
     });
   };
   ```

2. **Dynamic Model Selection**

   - Same `selectModel()` function as Critic Agent for consistency
   - Supports Azure OpenAI, Anthropic Claude, and OpenAI models
   - Shared model selection logic can be extracted to utility function
   - Environment-based configuration without hardcoded providers

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

**Phase 1: BaseAgent Redesign**

- [x] Install VoltAgent dependencies (`@voltagent/core`, `@voltagent/vercel-ai`)
- [ ] Build new BaseAgent class wrapping VoltAgent's Agent class
- [ ] Design clean API optimized for VoltAgent capabilities
- [ ] Implement support for VoltAgent features (tools, hooks, memory)

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

## Timeline Estimate

- **Phase 1**: 1-2 days (BaseAgent redesign to use VoltAgent)
- **Phase 2**: 1 day (Critic Agent with new BaseAgent)
- **Phase 3**: 1 day (Summarizer Agent with new BaseAgent)
- **Phase 4**: 1 day (Integration layer updates)
- **Phase 5**: 1-2 days (Testing and cleanup)
- **Total**: 5-7 days

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

- ✅ Custom API layer optimized for CodeLoops use cases
- ✅ Framework independence (easy to switch later)
- ✅ Clean slate implementation with modern patterns
- ✅ Access to all VoltAgent enterprise features
- ✅ Dynamic model selection based on environment
- ✅ Purpose-built configuration and abstraction layer

**vs. Python fast-agent:**

- ✅ No subprocess overhead
- ✅ Type safety with TypeScript
- ✅ Unified logging and monitoring
- ✅ Better debugging experience
- ✅ Easier to extend and modify

## Future Enhancements

Once BaseAgent migration is complete, consider:

- **Streaming Responses**: Use `streamObject()` for real-time feedback
- **Model Switching**: Extend support to include Gemini, Groq, and other providers
- **Context Management**: Add conversation history for multi-turn interactions
- **Agent Orchestration**: Create coordinator agents for complex workflows
- **Configuration UI**: Web interface for agent parameter tuning
- **Model Performance**: Compare Claude vs GPT-4 performance for critic/summarizer tasks
