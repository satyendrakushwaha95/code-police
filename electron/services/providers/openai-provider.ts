import {
  ChatProvider,
  ProviderConfig,
  ProviderModel,
  ChatMessage,
  ChatOptions,
  ChatStreamChunk,
} from './provider-types';

/**
 * Handles any OpenAI-compatible API:
 * OpenAI, Groq, OpenRouter, Together, Fireworks, LM Studio, vLLM, etc.
 */
export class OpenAIProvider implements ChatProvider {
  readonly id: string;
  readonly name: string;
  readonly type = 'openai_compatible' as const;
  readonly config: ProviderConfig;

  private endpoint: string;
  private apiKey: string | null;
  private extraHeaders: Record<string, string>;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.config = config;
    this.endpoint = config.endpoint.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.extraHeaders = config.headers || {};
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.extraHeaders,
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async checkConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}/models`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ProviderModel[]> {
    try {
      const res = await fetch(`${this.endpoint}/models`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.data || []).map((m: any) => ({
        id: m.id,
        name: m.id,
        providerId: this.id,
        providerName: this.name,
        contextLength: m.context_length,
      }));
    } catch {
      return [];
    }
  }

  async *chatStream(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions,
    signal?: AbortSignal
  ): AsyncGenerator<ChatStreamChunk> {
    const body: Record<string, unknown> = {
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
    };

    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.top_p !== undefined) body.top_p = options.top_p;
    if (options?.max_tokens !== undefined) body.max_tokens = options.max_tokens;

    const res = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${this.name} error ${res.status}: ${text}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            yield { content: '', done: true, model };
            return;
          }

          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta;
            const finishReason = parsed.choices?.[0]?.finish_reason;
            const usage = parsed.usage;

            yield {
              content: delta?.content || '',
              done: finishReason != null,
              model: parsed.model || model,
              usage: usage
                ? {
                    prompt_tokens: usage.prompt_tokens || 0,
                    completion_tokens: usage.completion_tokens || 0,
                    total_tokens: usage.total_tokens || 0,
                  }
                : undefined,
            };
          } catch {
            // skip malformed SSE data
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data:')) {
          const payload = trimmed.slice(5).trim();
          if (payload !== '[DONE]') {
            try {
              const parsed = JSON.parse(payload);
              const delta = parsed.choices?.[0]?.delta;
              yield {
                content: delta?.content || '',
                done: true,
                model: parsed.model || model,
              };
            } catch {
              // skip
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
