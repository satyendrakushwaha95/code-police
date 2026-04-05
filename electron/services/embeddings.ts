const OLLAMA_ENDPOINT = 'http://localhost:11434';

export interface OllamaChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OllamaChatOptions {
  temperature?: number;
  top_p?: number;
  num_ctx?: number;
}

export interface ChatUsageData {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalDurationNs?: number;
}

export class OllamaEmbeddingsService {
  private endpoint: string;
  public lastUsage: ChatUsageData | null = null;

  constructor(endpoint: string = OLLAMA_ENDPOINT) {
    this.endpoint = endpoint;
  }

  /**
   * Generates a vector embedding for a given text prompt using Ollama's /api/embeddings endpoint.
   */
  async generateEmbedding(model: string, prompt: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.endpoint}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.embedding) {
        throw new Error('No embedding returned from Ollama');
      }

      return data.embedding;
    } catch (err: any) {
      console.error('Failed to generate embedding with Ollama:', err);
      throw err;
    }
  }

  async *chat(
    model: string,
    messages: OllamaChatMessage[],
    options?: OllamaChatOptions,
    signal?: AbortSignal
  ): AsyncGenerator<{ done: boolean; message?: { role: string; content: string }; error?: string; prompt_eval_count?: number; eval_count?: number; total_duration?: number }> {
    this.lastUsage = null;

    const res = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: options ? {
          temperature: options.temperature,
          top_p: options.top_p,
          num_ctx: options.num_ctx,
        } : undefined,
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
            if (chunk.done && (chunk.prompt_eval_count || chunk.eval_count)) {
              this.lastUsage = {
                promptTokens: chunk.prompt_eval_count || 0,
                completionTokens: chunk.eval_count || 0,
                totalTokens: (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0),
                totalDurationNs: chunk.total_duration,
              };
            }
            yield chunk;
          } catch {
            // skip malformed JSON
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer.trim());
          if (chunk.done && (chunk.prompt_eval_count || chunk.eval_count)) {
            this.lastUsage = {
              promptTokens: chunk.prompt_eval_count || 0,
              completionTokens: chunk.eval_count || 0,
              totalTokens: (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0),
              totalDurationNs: chunk.total_duration,
            };
          }
          yield chunk;
        } catch {
          // skip
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
