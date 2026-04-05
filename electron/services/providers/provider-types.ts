export type ProviderType = 'ollama' | 'openai_compatible' | 'anthropic';

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  enabled: boolean;
  endpoint: string;
  apiKey: string | null;
  headers?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface ProviderModel {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  size?: number;
  contextLength?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  num_ctx?: number;
}

export interface ChatStreamChunk {
  content: string;
  done: boolean;
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatProvider {
  readonly id: string;
  readonly name: string;
  readonly type: ProviderType;
  readonly config: ProviderConfig;

  checkConnection(): Promise<boolean>;
  listModels(): Promise<ProviderModel[]>;
  chatStream(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions,
    signal?: AbortSignal
  ): AsyncGenerator<ChatStreamChunk>;
}

export interface ProvidersStoreData {
  version: number;
  providers: ProviderConfig[];
}

export const PROVIDER_PRESETS: Record<string, Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>> = {
  ollama: {
    type: 'ollama',
    name: 'Ollama (Local)',
    enabled: true,
    endpoint: 'http://localhost:11434',
    apiKey: null,
  },
  openai: {
    type: 'openai_compatible',
    name: 'OpenAI',
    enabled: false,
    endpoint: 'https://api.openai.com/v1',
    apiKey: null,
  },
  anthropic: {
    type: 'anthropic',
    name: 'Anthropic',
    enabled: false,
    endpoint: 'https://api.anthropic.com',
    apiKey: null,
  },
  groq: {
    type: 'openai_compatible',
    name: 'Groq',
    enabled: false,
    endpoint: 'https://api.groq.com/openai/v1',
    apiKey: null,
  },
  openrouter: {
    type: 'openai_compatible',
    name: 'OpenRouter',
    enabled: false,
    endpoint: 'https://openrouter.ai/api/v1',
    apiKey: null,
  },
  together: {
    type: 'openai_compatible',
    name: 'Together AI',
    enabled: false,
    endpoint: 'https://api.together.xyz/v1',
    apiKey: null,
  },
  fireworks: {
    type: 'openai_compatible',
    name: 'Fireworks AI',
    enabled: false,
    endpoint: 'https://api.fireworks.ai/inference/v1',
    apiKey: null,
  },
  lmstudio: {
    type: 'openai_compatible',
    name: 'LM Studio (Local)',
    enabled: false,
    endpoint: 'http://localhost:1234/v1',
    apiKey: null,
  },
};
