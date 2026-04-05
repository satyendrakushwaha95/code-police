import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';

export interface UsageRecord {
  id?: number;
  messageId: string;
  conversationId: string;
  providerId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
  timestamp: number;
}

export interface UsageSummary {
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  requestCount: number;
}

export interface UsageByModel {
  providerId: string;
  model: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  requestCount: number;
}

export interface UsageByDay {
  date: string;
  totalTokens: number;
  costUsd: number;
  requestCount: number;
}

export interface ModelPricing {
  providerId: string;
  model: string;
  inputPricePerMToken: number;
  outputPricePerMToken: number;
}

// Per-million-token pricing for well-known models (USD)
const BUILTIN_PRICING: ModelPricing[] = [
  // OpenAI
  { providerId: '*', model: 'gpt-4o', inputPricePerMToken: 2.50, outputPricePerMToken: 10.00 },
  { providerId: '*', model: 'gpt-4o-mini', inputPricePerMToken: 0.15, outputPricePerMToken: 0.60 },
  { providerId: '*', model: 'gpt-4-turbo', inputPricePerMToken: 10.00, outputPricePerMToken: 30.00 },
  { providerId: '*', model: 'gpt-4', inputPricePerMToken: 30.00, outputPricePerMToken: 60.00 },
  { providerId: '*', model: 'gpt-3.5-turbo', inputPricePerMToken: 0.50, outputPricePerMToken: 1.50 },
  { providerId: '*', model: 'o1', inputPricePerMToken: 15.00, outputPricePerMToken: 60.00 },
  { providerId: '*', model: 'o1-mini', inputPricePerMToken: 3.00, outputPricePerMToken: 12.00 },
  { providerId: '*', model: 'o3-mini', inputPricePerMToken: 1.10, outputPricePerMToken: 4.40 },
  // Anthropic
  { providerId: '*', model: 'claude-sonnet-4-20250514', inputPricePerMToken: 3.00, outputPricePerMToken: 15.00 },
  { providerId: '*', model: 'claude-3-5-sonnet-20241022', inputPricePerMToken: 3.00, outputPricePerMToken: 15.00 },
  { providerId: '*', model: 'claude-3-5-haiku-20241022', inputPricePerMToken: 0.80, outputPricePerMToken: 4.00 },
  { providerId: '*', model: 'claude-3-opus-20240229', inputPricePerMToken: 15.00, outputPricePerMToken: 75.00 },
  { providerId: '*', model: 'claude-3-haiku-20240307', inputPricePerMToken: 0.25, outputPricePerMToken: 1.25 },
  // Groq
  { providerId: '*', model: 'llama-3.3-70b-versatile', inputPricePerMToken: 0.59, outputPricePerMToken: 0.79 },
  { providerId: '*', model: 'llama-3.1-8b-instant', inputPricePerMToken: 0.05, outputPricePerMToken: 0.08 },
  { providerId: '*', model: 'mixtral-8x7b-32768', inputPricePerMToken: 0.24, outputPricePerMToken: 0.24 },
  { providerId: '*', model: 'gemma2-9b-it', inputPricePerMToken: 0.20, outputPricePerMToken: 0.20 },
  // DeepSeek
  { providerId: '*', model: 'deepseek-chat', inputPricePerMToken: 0.14, outputPricePerMToken: 0.28 },
  { providerId: '*', model: 'deepseek-coder', inputPricePerMToken: 0.14, outputPricePerMToken: 0.28 },
];

export class UsageTracker {
  private db: ReturnType<typeof Database>;
  private customPricing: ModelPricing[] = [];

  constructor(userDataPath?: string) {
    const dbPath = path.join(userDataPath || app.getPath('userData'), 'localmind.db');
    this.db = Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        messageId TEXT NOT NULL,
        conversationId TEXT NOT NULL,
        providerId TEXT NOT NULL,
        model TEXT NOT NULL,
        promptTokens INTEGER NOT NULL DEFAULT 0,
        completionTokens INTEGER NOT NULL DEFAULT 0,
        totalTokens INTEGER NOT NULL DEFAULT 0,
        costUsd REAL NOT NULL DEFAULT 0,
        durationMs INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS custom_pricing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        providerId TEXT NOT NULL,
        model TEXT NOT NULL,
        inputPricePerMToken REAL NOT NULL,
        outputPricePerMToken REAL NOT NULL,
        UNIQUE(providerId, model)
      );

      CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON token_usage(timestamp);
      CREATE INDEX IF NOT EXISTS idx_usage_conv ON token_usage(conversationId);
      CREATE INDEX IF NOT EXISTS idx_usage_model ON token_usage(model);
    `);

    this.loadCustomPricing();
  }

  private loadCustomPricing() {
    const stmt = this.db.prepare('SELECT * FROM custom_pricing');
    this.customPricing = stmt.all() as ModelPricing[];
  }

  calculateCost(providerId: string, model: string, promptTokens: number, completionTokens: number): number {
    // Check custom pricing first, then built-in
    const pricing = this.customPricing.find(p =>
      (p.providerId === providerId || p.providerId === '*') && p.model === model
    ) || BUILTIN_PRICING.find(p =>
      (p.providerId === providerId || p.providerId === '*') &&
      model.startsWith(p.model)
    );

    if (!pricing) return 0; // Local models (Ollama) = free

    const inputCost = (promptTokens / 1_000_000) * pricing.inputPricePerMToken;
    const outputCost = (completionTokens / 1_000_000) * pricing.outputPricePerMToken;
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal places
  }

  record(entry: Omit<UsageRecord, 'id' | 'costUsd'>): UsageRecord {
    const costUsd = this.calculateCost(entry.providerId, entry.model, entry.promptTokens, entry.completionTokens);
    const stmt = this.db.prepare(`
      INSERT INTO token_usage (messageId, conversationId, providerId, model, promptTokens, completionTokens, totalTokens, costUsd, durationMs, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(entry.messageId, entry.conversationId, entry.providerId, entry.model, entry.promptTokens, entry.completionTokens, entry.totalTokens, costUsd, entry.durationMs, entry.timestamp);
    return { ...entry, costUsd };
  }

  getByMessage(messageId: string): UsageRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM token_usage WHERE messageId = ?');
    return stmt.get(messageId) as UsageRecord | undefined;
  }

  getSummary(fromTimestamp?: number, toTimestamp?: number): UsageSummary {
    const from = fromTimestamp || 0;
    const to = toTimestamp || Date.now();
    const stmt = this.db.prepare(`
      SELECT 
        COALESCE(SUM(totalTokens), 0) as totalTokens,
        COALESCE(SUM(promptTokens), 0) as totalPromptTokens,
        COALESCE(SUM(completionTokens), 0) as totalCompletionTokens,
        COALESCE(SUM(costUsd), 0) as totalCostUsd,
        COUNT(*) as requestCount
      FROM token_usage
      WHERE timestamp >= ? AND timestamp <= ?
    `);
    return stmt.get(from, to) as UsageSummary;
  }

  getByModel(fromTimestamp?: number, toTimestamp?: number): UsageByModel[] {
    const from = fromTimestamp || 0;
    const to = toTimestamp || Date.now();
    const stmt = this.db.prepare(`
      SELECT 
        providerId, model,
        COALESCE(SUM(totalTokens), 0) as totalTokens,
        COALESCE(SUM(promptTokens), 0) as promptTokens,
        COALESCE(SUM(completionTokens), 0) as completionTokens,
        COALESCE(SUM(costUsd), 0) as costUsd,
        COUNT(*) as requestCount
      FROM token_usage
      WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY providerId, model
      ORDER BY costUsd DESC
    `);
    return stmt.all(from, to) as UsageByModel[];
  }

  getByDay(days: number = 30): UsageByDay[] {
    const from = Date.now() - days * 24 * 60 * 60 * 1000;
    const stmt = this.db.prepare(`
      SELECT
        date(timestamp / 1000, 'unixepoch', 'localtime') as date,
        COALESCE(SUM(totalTokens), 0) as totalTokens,
        COALESCE(SUM(costUsd), 0) as costUsd,
        COUNT(*) as requestCount
      FROM token_usage
      WHERE timestamp >= ?
      GROUP BY date(timestamp / 1000, 'unixepoch', 'localtime')
      ORDER BY date ASC
    `);
    return stmt.all(from) as UsageByDay[];
  }

  getRecentUsage(limit: number = 50): UsageRecord[] {
    const stmt = this.db.prepare('SELECT * FROM token_usage ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(limit) as UsageRecord[];
  }

  setCustomPricing(pricing: ModelPricing): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO custom_pricing (providerId, model, inputPricePerMToken, outputPricePerMToken)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(pricing.providerId, pricing.model, pricing.inputPricePerMToken, pricing.outputPricePerMToken);
    this.loadCustomPricing();
  }

  getCustomPricing(): ModelPricing[] {
    return this.customPricing;
  }

  getBuiltinPricing(): ModelPricing[] {
    return [...BUILTIN_PRICING];
  }

  deleteCustomPricing(providerId: string, model: string): void {
    const stmt = this.db.prepare('DELETE FROM custom_pricing WHERE providerId = ? AND model = ?');
    stmt.run(providerId, model);
    this.loadCustomPricing();
  }
}

let instance: UsageTracker | null = null;

export function getUsageTracker(userDataPath?: string): UsageTracker {
  if (!instance) {
    instance = new UsageTracker(userDataPath);
  }
  return instance;
}
