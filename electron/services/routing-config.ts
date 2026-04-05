import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import * as chokidar from 'chokidar';

export type TaskCategory =
  | 'code_generation'
  | 'code_refactor'
  | 'documentation'
  | 'planning'
  | 'review'
  | 'chat_general';

export interface RouteConfig {
  model: string;
  providerId: string;
  enabled: boolean;
  fallbackToDefault: boolean;
}

export interface RoutingConfig {
  version: number;
  defaultModel: string;
  defaultProviderId: string;
  routes: Record<TaskCategory, RouteConfig>;
}

const REQUIRED_CATEGORIES: TaskCategory[] = [
  'code_generation',
  'code_refactor',
  'documentation',
  'planning',
  'review',
  'chat_general'
];

const DEFAULT_CONFIG: RoutingConfig = {
  version: 2,
  defaultModel: 'qwen3-coder:30b',
  defaultProviderId: 'ollama-default',
  routes: {
    code_generation: { model: 'qwen3-coder:480b-cloud', providerId: 'ollama-default', enabled: true, fallbackToDefault: true },
    code_refactor: { model: 'qwen3-coder:480b-cloud', providerId: 'ollama-default', enabled: true, fallbackToDefault: true },
    documentation: { model: 'minimax-m2.5:cloud', providerId: 'ollama-default', enabled: true, fallbackToDefault: true },
    planning: { model: 'deepseek-v3.1:671b-cloud', providerId: 'ollama-default', enabled: true, fallbackToDefault: true },
    review: { model: 'deepseek-v3.1:671b-cloud', providerId: 'ollama-default', enabled: true, fallbackToDefault: true },
    chat_general: { model: 'minimax-m2.5:cloud', providerId: 'ollama-default', enabled: true, fallbackToDefault: true }
  }
};

export class RoutingConfigStore {
  private configPath: string;
  private config: RoutingConfig;
  private watcher: chokidar.FSWatcher | null = null;
  private onUpdateCallback: (() => void) | null = null;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, 'routing-config.json');
    this.config = this.load();
  }

  load(): RoutingConfig {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.save(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
      }

      const data = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(data);
      
      if (!this.validateSchema(parsed)) {
        console.warn('[RoutingConfigStore] Invalid config schema, using defaults');
        return { ...DEFAULT_CONFIG };
      }

      return parsed;
    } catch (error) {
      console.error('[RoutingConfigStore] Error loading config:', error);
      return { ...DEFAULT_CONFIG };
    }
  }

  save(config: RoutingConfig): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tempPath = this.configPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.configPath);
      
      this.config = config;
    } catch (error) {
      console.error('[RoutingConfigStore] Error saving config:', error);
      throw error;
    }
  }

  get(): RoutingConfig {
    return this.config;
  }

  validateSchema(config: unknown): config is RoutingConfig {
    if (!config || typeof config !== 'object') return false;
    
    const cfg = config as Record<string, unknown>;
    
    if (typeof cfg.version !== 'number') return false;
    if (typeof cfg.defaultModel !== 'string' || !cfg.defaultModel) return false;
    if (!cfg.routes || typeof cfg.routes !== 'object') return false;

    // Auto-fill defaultProviderId for legacy configs
    if (!cfg.defaultProviderId) {
      (cfg as any).defaultProviderId = 'ollama-default';
    }

    for (const category of REQUIRED_CATEGORIES) {
      if (!(category in cfg.routes)) {
        console.warn(`[RoutingConfigStore] Missing category: ${category}`);
        return false;
      }

      const route = cfg.routes[category] as Record<string, unknown>;
      if (typeof route.model !== 'string') return false;
      if (typeof route.enabled !== 'boolean') return false;
      if (typeof route.fallbackToDefault !== 'boolean') return false;

      // Auto-fill providerId for legacy route entries
      if (!route.providerId) {
        route.providerId = 'ollama-default';
      }
    }

    const extraKeys = Object.keys(cfg.routes).filter(k => !REQUIRED_CATEGORIES.includes(k as TaskCategory));
    if (extraKeys.length > 0) {
      console.warn(`[RoutingConfigStore] Unknown categories: ${extraKeys.join(', ')}`);
    }

    return true;
  }

  watchFile(onUpdate: () => void): void {
    this.onUpdateCallback = onUpdate;
    
    if (this.watcher) {
      this.watcher.close();
    }

    this.watcher = chokidar.watch(this.configPath, {
      persistent: true,
      ignoreInitial: true
    });

    this.watcher.on('change', () => {
      console.log('[RoutingConfigStore] Config file changed externally, reloading...');
      this.config = this.load();
      if (this.onUpdateCallback) {
        this.onUpdateCallback();
      }
    });
  }

  unwatchFile(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

let instance: RoutingConfigStore | null = null;

export function getRoutingConfigStore(): RoutingConfigStore {
  if (!instance) {
    instance = new RoutingConfigStore();
  }
  return instance;
}
