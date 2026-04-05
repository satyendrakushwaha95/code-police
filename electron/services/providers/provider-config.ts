import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import { ProviderConfig, ProvidersStoreData, PROVIDER_PRESETS } from './provider-types';

const CONFIG_FILENAME = 'providers-config.json';

function encryptKey(plaintext: string): string {
  if (!safeStorage.isEncryptionAvailable()) return plaintext;
  const encrypted = safeStorage.encryptString(plaintext);
  return `enc:${encrypted.toString('base64')}`;
}

function decryptKey(stored: string): string {
  if (!stored.startsWith('enc:')) return stored;
  if (!safeStorage.isEncryptionAvailable()) return stored;
  const buf = Buffer.from(stored.slice(4), 'base64');
  return safeStorage.decryptString(buf);
}

function getDefaultConfig(): ProvidersStoreData {
  const ollamaPreset = PROVIDER_PRESETS.ollama;
  return {
    version: 1,
    providers: [
      {
        ...ollamaPreset,
        id: 'ollama-default',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  };
}

export class ProviderConfigStore {
  private configPath: string;
  private data: ProvidersStoreData;

  constructor(userDataPath?: string) {
    const base = userDataPath || app.getPath('userData');
    this.configPath = path.join(base, CONFIG_FILENAME);
    this.data = this.load();
  }

  private load(): ProvidersStoreData {
    try {
      if (!fs.existsSync(this.configPath)) {
        const defaults = getDefaultConfig();
        this.saveToDisk(defaults);
        return defaults;
      }
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw) as ProvidersStoreData;
      if (!parsed.providers || !Array.isArray(parsed.providers)) {
        return getDefaultConfig();
      }
      return parsed;
    } catch (err) {
      console.error('[ProviderConfigStore] Error loading config:', err);
      return getDefaultConfig();
    }
  }

  private saveToDisk(data: ProvidersStoreData): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // Encrypt API keys before writing
      const toWrite: ProvidersStoreData = {
        ...data,
        providers: data.providers.map(p => ({
          ...p,
          apiKey: p.apiKey ? encryptKey(p.apiKey) : null,
        })),
      };
      const tmp = this.configPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(toWrite, null, 2), 'utf-8');
      fs.renameSync(tmp, this.configPath);
    } catch (err) {
      console.error('[ProviderConfigStore] Error saving config:', err);
      throw err;
    }
  }

  getAll(): ProviderConfig[] {
    return this.data.providers.map(p => ({
      ...p,
      apiKey: p.apiKey ? decryptKey(p.apiKey) : null,
    }));
  }

  /** Returns configs with API keys masked for renderer display */
  getAllMasked(): ProviderConfig[] {
    return this.data.providers.map(p => ({
      ...p,
      apiKey: p.apiKey ? '••••••••' : null,
    }));
  }

  getById(id: string): ProviderConfig | undefined {
    const p = this.data.providers.find(p => p.id === id);
    if (!p) return undefined;
    return { ...p, apiKey: p.apiKey ? decryptKey(p.apiKey) : null };
  }

  add(config: ProviderConfig): ProviderConfig {
    if (this.data.providers.some(p => p.id === config.id)) {
      throw new Error(`Provider with id '${config.id}' already exists`);
    }
    const entry: ProviderConfig = {
      ...config,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.data.providers.push(entry);
    this.saveToDisk(this.data);
    return entry;
  }

  update(id: string, updates: Partial<Omit<ProviderConfig, 'id' | 'createdAt'>>): ProviderConfig {
    const idx = this.data.providers.findIndex(p => p.id === id);
    if (idx === -1) throw new Error(`Provider '${id}' not found`);

    this.data.providers[idx] = {
      ...this.data.providers[idx],
      ...updates,
      id,
      createdAt: this.data.providers[idx].createdAt,
      updatedAt: Date.now(),
    };
    this.saveToDisk(this.data);
    return this.data.providers[idx];
  }

  remove(id: string): void {
    const idx = this.data.providers.findIndex(p => p.id === id);
    if (idx === -1) throw new Error(`Provider '${id}' not found`);
    this.data.providers.splice(idx, 1);
    this.saveToDisk(this.data);
  }

  reload(): void {
    this.data = this.load();
  }
}

let instance: ProviderConfigStore | null = null;

export function getProviderConfigStore(): ProviderConfigStore {
  if (!instance) {
    instance = new ProviderConfigStore();
  }
  return instance;
}
