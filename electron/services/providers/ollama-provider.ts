import {
  ChatProvider,
  ProviderConfig,
  ProviderModel,
  ChatMessage,
  ChatOptions,
  ChatStreamChunk,
} from './provider-types';

export class OllamaProvider implements ChatProvider {
  readonly id: string;
  readonly name: string;
  readonly type = 'ollama' as const;
  readonly config: ProviderConfig;

  private endpoint: string;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.config = config;
    this.endpoint = config.endpoint.replace(/\/$/, '');
  }

  async checkConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ProviderModel[]> {
    try {
      const res = await fetch(`${this.endpoint}/api/tags`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []).map((m: any) => ({
        id: m.name,
        name: m.name,
        providerId: this.id,
        providerName: this.name,
        size: m.size,
        contextLength: undefined,
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
    const res = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        options: options
          ? {
              temperature: options.temperature,
              top_p: options.top_p,
              num_ctx: options.num_ctx ?? options.max_tokens,
            }
          : undefined,
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama error ${res.status}: ${text}`);
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
          if (!trimmed) continue;
          try {
            const chunk = JSON.parse(trimmed);
            yield {
              content: chunk.message?.content || '',
              done: chunk.done || false,
              model: chunk.model,
              usage: chunk.done
                ? {
                    prompt_tokens: chunk.prompt_eval_count || 0,
                    completion_tokens: chunk.eval_count || 0,
                    total_tokens:
                      (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0),
                  }
                : undefined,
            };
          } catch {
            // skip malformed JSON lines
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer.trim());
          yield {
            content: chunk.message?.content || '',
            done: chunk.done || false,
            model: chunk.model,
            usage: chunk.done
              ? {
                  prompt_tokens: chunk.prompt_eval_count || 0,
                  completion_tokens: chunk.eval_count || 0,
                  total_tokens:
                    (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0),
                }
              : undefined,
          };
        } catch {
          // skip
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
