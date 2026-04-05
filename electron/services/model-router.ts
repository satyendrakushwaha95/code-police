import { TaskCategory, RoutingConfigStore, getRoutingConfigStore } from './routing-config';
import { AgentMemoryService } from './memory';

export interface RoutingDecision {
  category: TaskCategory;
  resolvedModel: string;
  providerId: string;
  usedFallback: boolean;
  reason?: string;
}

interface CacheEntry {
  models: string[];
  timestamp: number;
}

const CACHE_TTL_MS = 30000;

export class ModelRouter {
  private configStore: RoutingConfigStore;
  private modelCache: CacheEntry | null = null;
  private memoryService: AgentMemoryService | null = null;

  constructor(configStore?: RoutingConfigStore, memoryService?: AgentMemoryService) {
    this.configStore = configStore || getRoutingConfigStore();
    this.memoryService = memoryService || null;
  }

  setMemoryService(service: AgentMemoryService): void {
    this.memoryService = service;
  }

  async getAvailableModels(): Promise<string[]> {
    if (this.modelCache && (Date.now() - this.modelCache.timestamp) < CACHE_TTL_MS) {
      return this.modelCache.models;
    }

    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) {
        console.warn('[ModelRouter] Failed to fetch models from Ollama:', response.status);
        return [];
      }

      const data = await response.json();
      const models = (data.models || []).map((m: { name: string }) => m.name);
      
      this.modelCache = {
        models,
        timestamp: Date.now()
      };

      return models;
    } catch (error) {
      console.error('[ModelRouter] Error fetching models:', error);
      return [];
    }
  }

  async refreshModelCache(): Promise<void> {
    this.modelCache = null;
    await this.getAvailableModels();
  }

  async validate(model: string): Promise<boolean> {
    const models = await this.getAvailableModels();
    return models.includes(model);
  }

  async resolve(category: TaskCategory): Promise<RoutingDecision> {
    const config = this.configStore.get();
    const route = config.routes[category];
    const defaultModel = config.defaultModel;
    const defaultProviderId = config.defaultProviderId || 'ollama-default';

    if (!route.enabled) {
      const decision: RoutingDecision = {
        category,
        resolvedModel: defaultModel,
        providerId: defaultProviderId,
        usedFallback: false,
        reason: 'category disabled'
      };
      this.logRoutingDecision(decision);
      return decision;
    }

    const routeProviderId = route.providerId || defaultProviderId;
    const isAvailable = await this.validate(route.model);

    if (!isAvailable && route.fallbackToDefault) {
      const defaultAvailable = await this.validate(defaultModel);
      
      if (!defaultAvailable) {
        throw new Error(`No models available. Primary: ${route.model}, Fallback: ${defaultModel}`);
      }

      const decision: RoutingDecision = {
        category,
        resolvedModel: defaultModel,
        providerId: defaultProviderId,
        usedFallback: true,
        reason: 'model unavailable'
      };
      this.logRoutingDecision(decision);
      return decision;
    }

    if (!isAvailable && !route.fallbackToDefault) {
      throw new Error(`Model ${route.model} is not available`);
    }

    const decision: RoutingDecision = {
      category,
      resolvedModel: route.model,
      providerId: routeProviderId,
      usedFallback: false
    };
    this.logRoutingDecision(decision);
    return decision;
  }

  private async logRoutingDecision(decision: RoutingDecision): Promise<void> {
    if (!this.memoryService) return;
    
    try {
      this.memoryService.addAuditLog({
        timestamp: Date.now(),
        action: 'model_routed',
        result: JSON.stringify({
          category: decision.category,
          resolvedModel: decision.resolvedModel,
          usedFallback: decision.usedFallback,
          reason: decision.reason
        }),
        userConfirmed: true
      });
    } catch (error) {
      console.error('[ModelRouter] Failed to write audit log:', error);
    }
  }

  fallback(): RoutingDecision {
    const config = this.configStore.get();
    return {
      category: 'chat_general',
      resolvedModel: config.defaultModel,
      providerId: config.defaultProviderId || 'ollama-default',
      usedFallback: true,
      reason: 'model unavailable'
    };
  }
}

let instance: ModelRouter | null = null;

export function getModelRouter(): ModelRouter {
  if (!instance) {
    instance = new ModelRouter();
  }
  return instance;
}
