import { ChatProvider, ProviderConfig, ProviderModel, ChatMessage, ChatOptions, ChatStreamChunk } from './provider-types';
import { ProviderConfigStore, getProviderConfigStore } from './provider-config';
import { OllamaProvider } from './ollama-provider';
import { OpenAIProvider } from './openai-provider';
import { AnthropicProvider } from './anthropic-provider';

function createProvider(config: ProviderConfig): ChatProvider {
  switch (config.type) {
    case 'ollama':
      return new OllamaProvider(config);
    case 'openai_compatible':
      return new OpenAIProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}

export class ProviderRegistry {
  private providers = new Map<string, ChatProvider>();
  private configStore: ProviderConfigStore;

  constructor(configStore?: ProviderConfigStore) {
    this.configStore = configStore || getProviderConfigStore();
    this.initializeProviders();
  }

  private initializeProviders(): void {
    const configs = this.configStore.getAll();
    for (const config of configs) {
      if (config.enabled) {
        try {
          this.providers.set(config.id, createProvider(config));
        } catch (err) {
          console.error(`[ProviderRegistry] Failed to create provider '${config.id}':`, err);
        }
      }
    }
  }

  /** Refresh a single provider instance (e.g. after config update) */
  refreshProvider(id: string): void {
    this.providers.delete(id);
    const config = this.configStore.getById(id);
    if (config && config.enabled) {
      try {
        this.providers.set(id, createProvider(config));
      } catch (err) {
        console.error(`[ProviderRegistry] Failed to refresh provider '${id}':`, err);
      }
    }
  }

  /** Rebuild all provider instances from current config */
  refreshAll(): void {
    this.providers.clear();
    this.configStore.reload();
    this.initializeProviders();
  }

  getProvider(id: string): ChatProvider | undefined {
    return this.providers.get(id);
  }

  getAllProviders(): ChatProvider[] {
    return Array.from(this.providers.values());
  }

  getEnabledProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  async checkConnection(id: string): Promise<boolean> {
    const provider = this.providers.get(id);
    if (!provider) return false;
    return provider.checkConnection();
  }

  async listModels(id: string): Promise<ProviderModel[]> {
    const provider = this.providers.get(id);
    if (!provider) return [];
    return provider.listModels();
  }

  async listAllModels(): Promise<ProviderModel[]> {
    const results: ProviderModel[] = [];
    const promises = Array.from(this.providers.entries()).map(
      async ([_, provider]) => {
        try {
          const models = await provider.listModels();
          results.push(...models);
        } catch (err) {
          console.warn(`[ProviderRegistry] Failed to list models for '${provider.id}':`, err);
        }
      }
    );
    await Promise.allSettled(promises);
    return results;
  }

  async *chatStream(
    providerId: string,
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions,
    signal?: AbortSignal
  ): AsyncGenerator<ChatStreamChunk> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider '${providerId}' not found or disabled`);
    }
    yield* provider.chatStream(model, messages, options, signal);
  }

  // -- Config pass-through (for IPC handlers) --

  addProvider(config: ProviderConfig): ProviderConfig {
    const saved = this.configStore.add(config);
    if (saved.enabled) {
      this.providers.set(saved.id, createProvider(saved));
    }
    return saved;
  }

  updateProvider(id: string, updates: Partial<Omit<ProviderConfig, 'id' | 'createdAt'>>): ProviderConfig {
    const updated = this.configStore.update(id, updates);
    this.refreshProvider(id);
    return updated;
  }

  removeProvider(id: string): void {
    this.providers.delete(id);
    this.configStore.remove(id);
  }

  getConfigs(): ProviderConfig[] {
    return this.configStore.getAll();
  }

  getMaskedConfigs(): ProviderConfig[] {
    return this.configStore.getAllMasked();
  }
}

let instance: ProviderRegistry | null = null;

export function getProviderRegistry(): ProviderRegistry {
  if (!instance) {
    instance = new ProviderRegistry();
  }
  return instance;
}
