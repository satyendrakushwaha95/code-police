import type { OllamaModel, OllamaChatMessage, OllamaChatOptions, OllamaChatChunk } from '../types/chat';

const ipcRenderer = (window as any).ipcRenderer;

export interface RoutingResponse {
  resolvedModel: string;
  category: string;
  usedFallback: boolean;
}

export class OllamaService {
  private endpoint: string;

  constructor(endpoint: string = 'http://localhost:11434') {
    this.endpoint = endpoint.replace(/\/$/, '');
  }

  setEndpoint(endpoint: string) {
    this.endpoint = endpoint.replace(/\/$/, '');
  }

  async resolveModel(
    messages: OllamaChatMessage[],
    options?: OllamaChatOptions,
    taskCategory?: string
  ): Promise<RoutingResponse> {
    return ipcRenderer.invoke('ollama:chat', {
      messages,
      options,
      taskCategory
    });
  }

  async listModels(): Promise<OllamaModel[]> {
    try {
      const res = await fetch(`${this.endpoint}/api/tags`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.models || [];
    } catch (err) {
      console.error('Failed to list models:', err);
      throw err;
    }
  }

  async showModel(name: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.endpoint}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async checkConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async *chatStream(
    model: string,
    messages: OllamaChatMessage[],
    options?: OllamaChatOptions,
    signal?: AbortSignal
  ): AsyncGenerator<OllamaChatChunk> {
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
            const chunk: OllamaChatChunk = JSON.parse(trimmed);
            yield chunk;
          } catch {
            // skip malformed JSON
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          yield JSON.parse(buffer.trim());
        } catch {
          // skip
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export const ollamaService = new OllamaService();
