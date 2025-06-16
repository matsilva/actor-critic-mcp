import { createAzure } from '@ai-sdk/azure';
import { createOpenAI } from '@ai-sdk/openai';
import {
  generateObject,
  generateText,
  streamObject,
  streamText,
  LanguageModelV1,
  Schema,
} from 'ai';
import { getProviderApiKey } from '../config/index.ts';
import { z } from 'zod';
import { Logger } from 'pino';

export interface AgentConfig<T> {
  name: string;
  instructions: string;
  outputSchema: z.Schema<T, z.ZodTypeDef, unknown> | Schema;
  model: LanguageModelV1;
  maxRetries?: number;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentSendOptions {
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export class AgentError extends Error {
  readonly agentName: string;
  readonly cause?: unknown;

  constructor(message: string, agentName: string, cause?: unknown) {
    super(message);
    this.name = 'AgentError';
    this.agentName = agentName;
    this.cause = cause;
  }
}

export const createAzureAgent = <T>(
  config: Omit<AgentConfig<T>, 'model'>,
  deps: AgentDeps,
): Agent<T> => {
  const apiKey = getProviderApiKey('azure');
  const resourceName = process.env.AZURE_OPENAI_RESOURCE_NAME;

  if (!apiKey || !resourceName) {
    throw new AgentError(
      'Missing Azure OpenAI credentials. Please set AZURE_OPENAI_API_KEY and AZURE_OPENAI_RESOURCE_NAME environment variables.',
      config.name,
    );
  }

  const azure = createAzure({
    apiKey,
    resourceName,
  });

  return createAgent<T>(
    {
      ...config,
      model: azure('gpt-4o'),
    },
    deps,
  );
};

export const createOpenAIAgent = <T>(
  config: Omit<AgentConfig<T>, 'model'> & { model?: LanguageModelV1 },
  deps: AgentDeps,
): Agent<T> => {
  const apiKey = getProviderApiKey('openai');
  
  if (!apiKey) {
    throw new AgentError(
      'Missing OpenAI API key. Please set OPENAI_API_KEY environment variable or add it to config.',
      config.name,
    );
  }

  const openai = createOpenAI({
    apiKey,
  });

  return createAgent<T>(
    {
      model: openai('gpt-4o'),
      ...config,
    },
    deps,
  );
};

//TODO: add better way to support different models

interface AgentDeps {
  logger: Logger;
}

export const createAgent = <T>(config: AgentConfig<T>, deps: AgentDeps) => {
  return new Agent<T>(config, deps);
};

// Export as BaseAgent for clarity when used in inheritance
export { Agent as BaseAgent };

export class Agent<T> {
  private readonly logger: Logger;
  private readonly name: string;
  private readonly instructions: string;
  private readonly outputSchema: z.Schema<T, z.ZodTypeDef, unknown> | Schema;
  private readonly model: LanguageModelV1;
  private readonly maxRetries: number;
  private readonly temperature?: number;
  private readonly maxTokens?: number;

  constructor(config: AgentConfig<T>, { logger }: AgentDeps) {
    this.logger = logger.child({ agentName: config.name });
    if (!config.name?.trim()) {
      throw new AgentError('Agent name is required', config.name || 'unknown');
    }
    if (!config.instructions?.trim()) {
      throw new AgentError('Agent instructions are required', config.name);
    }
    if (!config.outputSchema) {
      throw new AgentError('Output schema is required', config.name);
    }
    if (!config.model) {
      throw new AgentError('Model is required', config.name);
    }

    this.name = config.name;
    this.instructions = config.instructions;
    this.outputSchema = config.outputSchema;
    this.model = config.model;
    this.maxRetries = config.maxRetries ?? 3;
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens;
    this.logger = this.logger.child({ agentName: config.name });
  }

  async send(prompt: string, options?: AgentSendOptions): Promise<T> {
    if (!prompt?.trim()) {
      throw new AgentError('Prompt cannot be empty', this.name);
    }

    const startTime = Date.now();
    this.logger.info(
      {
        promptLength: prompt.length,
        //log entire prompt for the time being so we can analyze and improve
        //the agent's performance and user experience
        prompt,
        stream: options?.stream ?? false,
      },
      `Agent ${this.name} processing prompt`,
    );

    try {
      const response = await this.executeWithRetry(async () => {
        return await generateObject({
          model: this.model,
          system: this.instructions,
          prompt,
          schema: this.outputSchema as unknown as Schema,
          temperature: options?.temperature ?? this.temperature,
          maxTokens: options?.maxTokens ?? this.maxTokens,
          abortSignal: options?.signal,
        });
      }, this.maxRetries);

      const duration = Date.now() - startTime;
      this.logger.info(
        {
          duration,
          //log entire response for the time being so we can analyze and improve
          //the agent's performance
          //and user experience
          ...response,
        },
        `Agent ${this.name} completed successfully`,
      );

      return response.object as T;
    } catch (error) {
      this.logger.error(
        {
          error,
          duration: Date.now() - startTime,
        },
        `Agent ${this.name} failed`,
      );
      throw new AgentError(
        `Failed to generate response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        error,
      );
    }
  }

  async sendText(prompt: string, options?: AgentSendOptions): Promise<string> {
    if (!prompt?.trim()) {
      throw new AgentError('Prompt cannot be empty', this.name);
    }

    const startTime = Date.now();
    this.logger.info(
      {
        promptLength: prompt.length,
        //log entire prompt for the time being so we can analyze and improve
        //the agent's performance and user experience
        prompt,
        stream: options?.stream ?? false,
      },
      `Agent ${this.name} processing text prompt`,
    );

    try {
      const response = await this.executeWithRetry(async () => {
        return await generateText({
          model: this.model,
          system: this.instructions,
          prompt,
          temperature: options?.temperature ?? this.temperature,
          maxTokens: options?.maxTokens ?? this.maxTokens,
          abortSignal: options?.signal,
        });
      }, this.maxRetries);

      const duration = Date.now() - startTime;
      this.logger.info(
        //log entire response for the time being so we can analyze and improve
        //the agent's performance and user experience
        {
          duration,
          usage: response.usage,
          response,
        },
        `Agent ${this.name} text generation completed`,
      );

      return response.text;
    } catch (error) {
      this.logger.error(
        {
          error,
          duration: Date.now() - startTime,
        },
        `Agent ${this.name} text generation failed`,
      );
      throw new AgentError(
        `Failed to generate text response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        error,
      );
    }
  }

  async *streamObject(prompt: string, options?: AgentSendOptions): AsyncGenerator<Partial<T>> {
    if (!prompt?.trim()) {
      throw new AgentError('Prompt cannot be empty', this.name);
    }

    const startTime = Date.now();
    this.logger.info(
      {
        promptLength: prompt.length,
        //log entire prompt for the time being so we can analyze and improve
        //the agent's performance and user experience
        prompt,
        stream: options?.stream ?? false,
      },
      `Agent ${this.name} starting stream`,
    );

    try {
      const { partialObjectStream } = streamObject({
        model: this.model,
        system: this.instructions,
        prompt,
        schema: this.outputSchema as unknown as Schema,
        temperature: options?.temperature ?? this.temperature,
        maxTokens: options?.maxTokens ?? this.maxTokens,
        abortSignal: options?.signal,
      });

      for await (const partialObject of partialObjectStream) {
        this.logger.info(
          {
            duration: Date.now() - startTime,
            partialObject,
          },
          `Agent ${this.name} streaming partial object`,
        );
        yield partialObject as Partial<T>;
      }

      this.logger.info(
        {
          duration: Date.now() - startTime,
          //log entire response for the time being so we can analyze and improve
          //the agent's performance and user experience
        },
        `Agent ${this.name} stream completed`,
      );
    } catch (error) {
      this.logger.error(
        {
          error,
          duration: Date.now() - startTime,
        },
        `Agent ${this.name} stream failed`,
      );
      throw new AgentError(
        `Failed to stream response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        error,
      );
    }
  }

  async *streamText(prompt: string, options?: AgentSendOptions): AsyncGenerator<string> {
    if (!prompt?.trim()) {
      throw new AgentError('Prompt cannot be empty', this.name);
    }

    const startTime = Date.now();
    this.logger.info(
      {
        promptLength: prompt.length,
        //log entire prompt for the time being so we can analyze and improve
        //the agent's performance and user experience
        prompt,
        stream: options?.stream ?? false,
      },
      `Agent ${this.name} starting text stream`,
    );

    try {
      const { textStream } = streamText({
        model: this.model,
        system: this.instructions,
        prompt,
        temperature: options?.temperature ?? this.temperature,
        maxTokens: options?.maxTokens ?? this.maxTokens,
        abortSignal: options?.signal,
      });

      for await (const text of textStream) {
        this.logger.info(
          {
            duration: Date.now() - startTime,
            text,
          },
          `Agent ${this.name} streaming text`,
        );
        yield text;
      }

      this.logger.info(
        {
          duration: Date.now() - startTime,
        },
        `Agent ${this.name} text stream completed`,
      );
    } catch (error) {
      this.logger.error(
        {
          error,
          duration: Date.now() - startTime,
        },
        `Agent ${this.name} text stream failed`,
      );
      throw new AgentError(
        `Failed to stream text response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        error,
      );
    }
  }

  private async executeWithRetry<R>(
    fn: () => Promise<R>,
    retriesLeft: number,
    lastError?: unknown,
  ): Promise<R> {
    if (retriesLeft <= 0) {
      throw lastError || new Error('Max retries exceeded');
    }

    try {
      return await fn();
    } catch (error) {
      this.logger.warn(
        {
          retriesLeft: retriesLeft - 1,
          error,
        },
        `Agent ${this.name} attempt failed, retrying...`,
      );

      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * (this.maxRetries - retriesLeft + 1)),
      );

      return this.executeWithRetry(fn, retriesLeft - 1, error);
    }
  }

  getName(): string {
    return this.name;
  }

  getInstructions(): string {
    return this.instructions;
  }

  getSchema() {
    return this.outputSchema;
  }
}
