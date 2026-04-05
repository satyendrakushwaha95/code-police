import {
  ChatProvider,
  ProviderConfig,
  ProviderModel,
  ChatMessage,
  ChatOptions,
  ChatStreamChunk,
} from './provider-types';

const ANTHROPIC_MODELS: Array<{ id: string; name: string; contextLength: number }> = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextLength: 200000 },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextLength: 200000 },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextLength: 200000 },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextLength: 200000 },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextLength: 200000 },
];

const ANTHROPIC_API_VERSION = '2023-06-01';

export class AnthropicProvider implements ChatProvider {
  readonly id: string;
  readonly name: string;
  readonly type = 'anthropic' as const;
  readonly config: ProviderConfig;

  private endpoint: string;
  private apiKey: string | null;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.config = config;
    this.endpoint = config.endpoint.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_API_VERSION,
    };
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }
    return headers;
  }

  async checkConnection(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      // Anthropic has no lightweight health endpoint, so we send a minimal request
      const res = await fetch(`${this.endpoint}/v1/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ProviderModel[]> {
    // Anthropic does not have a model-listing endpoint;
    // return the well-known model catalogue
    return ANTHROPIC_MODELS.map(m => ({
      id: m.id,
      name: m.name,
      providerId: this.id,
      providerName: this.name,
      contextLength: m.contextLength,
    }));
  }

  async *chatStream(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions,
    signal?: AbortSignal
  ): AsyncGenerator<ChatStreamChunk> {
    // Anthropic requires system prompt as a top-level param, not in messages
    let systemPrompt: string | undefined;
    const filteredMessages: Array<{ role: string; content: string }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = (systemPrompt ? systemPrompt + '\n\n' : '') + msg.content;
      } else {
        filteredMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // Anthropic requires messages to start with 'user'
    if (filteredMessages.length > 0 && filteredMessages[0].role !== 'user') {
      filteredMessages.unshift({ role: 'user', content: '.' });
    }

    const body: Record<string, unknown> = {
      model,
      messages: filteredMessages,
      max_tokens: options?.max_tokens || 4096,
      stream: true,
    };

    if (systemPrompt) body.system = systemPrompt;
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.top_p !== undefined) body.top_p = options.top_p;

    const res = await fetch(`${this.endpoint}/v1/messages`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic error ${res.status}: ${text}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith('event:')) continue;

          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload) continue;

          try {
            const parsed = JSON.parse(payload);

            switch (parsed.type) {
              case 'message_start':
                inputTokens = parsed.message?.usage?.input_tokens || 0;
                break;

              case 'content_block_delta':
                yield {
                  content: parsed.delta?.text || '',
                  done: false,
                  model,
                };
                break;

              case 'message_delta':
                outputTokens = parsed.usage?.output_tokens || 0;
                if (parsed.delta?.stop_reason) {
                  yield {
                    content: '',
                    done: true,
                    model,
                    usage: {
                      prompt_tokens: inputTokens,
                      completion_tokens: outputTokens,
                      total_tokens: inputTokens + outputTokens,
                    },
                  };
                }
                break;

              case 'message_stop':
                // Final signal; yield done if not already yielded
                yield {
                  content: '',
                  done: true,
                  model,
                  usage: {
                    prompt_tokens: inputTokens,
                    completion_tokens: outputTokens,
                    total_tokens: inputTokens + outputTokens,
                  },
                };
                return;

              // content_block_start, ping — ignored
              default:
                break;
            }
          } catch {
            // skip malformed SSE data
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
