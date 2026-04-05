import type { OllamaModel, OllamaChatMessage, OllamaChatOptions, OllamaChatChunk } from '../types/chat';

const ipcRenderer = (window as any).ipcRenderer;

export interface RoutingResponse {
  resolvedModel: string;
  providerId: string;
  category: string;
  usedFallback: boolean;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  model?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface ProviderModel {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  size?: number;
  contextLength?: number;
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

  /** List models from all configured providers via IPC */
  async listAllProviderModels(): Promise<ProviderModel[]> {
    try {
      return await ipcRenderer.invoke('provider:listAllModels');
    } catch (err) {
      console.error('Failed to list provider models:', err);
      return [];
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

  /**
   * Stream chat via IPC → main process handles the provider-specific logic.
   * Returns a streamId that can be used to abort.
   */
  startIPCStream(
    streamId: string,
    providerId: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: { temperature?: number; top_p?: number; max_tokens?: number; num_ctx?: number },
    messageId?: string,
    conversationId?: string
  ): Promise<{ streamId: string }> {
    return ipcRenderer.invoke('chat:stream', {
      streamId,
      providerId,
      model,
      messages,
      options,
      messageId,
      conversationId,
    });
  }

  abortIPCStream(streamId: string): void {
    ipcRenderer.send('chat:abort', streamId);
  }

  onStreamChunk(callback: (data: { streamId: string } & StreamChunk) => void): () => void {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('chat:chunk', handler);
    return () => ipcRenderer.off('chat:chunk', handler);
  }

  onStreamError(callback: (data: { streamId: string; error: string }) => void): () => void {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('chat:error', handler);
    return () => ipcRenderer.off('chat:error', handler);
  }

  /**
   * Non-streaming chat via IPC. Used by code gen, refactor, design doc, prompt enhancer, etc.
   * Routes through the provider registry and records usage automatically.
   */
  async chatComplete(
    providerId: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: { temperature?: number; top_p?: number; max_tokens?: number; num_ctx?: number },
    feature?: string
  ): Promise<{ content: string; model: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }; durationMs: number }> {
    return ipcRenderer.invoke('chat:complete', {
      providerId,
      model,
      messages,
      options,
      feature,
    });
  }

  // Legacy direct streaming — kept for backwards compatibility
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
