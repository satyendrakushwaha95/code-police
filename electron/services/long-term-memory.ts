import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import { OllamaEmbeddingsService } from './embeddings';

export type MemoryCategory = 'preference' | 'decision' | 'pattern' | 'project' | 'correction' | 'general' | 'core';

export interface MemoryFact {
  id?: number;
  category: MemoryCategory;
  content: string;
  source: string;
  confidence: number;
  importance: number;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

export type PersonalityMode = 'professional' | 'casual' | 'concise' | 'mentor' | 'creative';

export interface UserProfile {
  name: string;
  role: string;
  timezone: string;
  expertiseAreas: string[];
  preferredLanguages: string[];
  personalityMode: PersonalityMode;
  customTraits: string;
}

const DEFAULT_PROFILE: UserProfile = {
  name: '',
  role: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  expertiseAreas: [],
  preferredLanguages: [],
  personalityMode: 'professional',
  customTraits: '',
};

const PERSONALITY_TEMPLATES: Record<PersonalityMode, string> = {
  professional: `You are a precise, knowledgeable engineering assistant. Be direct, thorough, and technically accurate. Use proper terminology. Avoid filler words and unnecessary pleasantries. Focus on correctness and best practices.`,
  casual: `You are a friendly, approachable coding buddy. Be conversational and relaxed while still being helpful. Use simple language, occasional humor, and feel free to use analogies. Keep things light but accurate.`,
  concise: `You are an ultra-efficient assistant. Give the shortest possible correct answer. Use bullet points. Skip explanations unless asked. Code-first, minimal prose. No greetings or sign-offs.`,
  mentor: `You are a patient, educational mentor. Explain the "why" behind everything. Point out learning opportunities. Suggest best practices with reasoning. Ask guiding questions when the user might benefit from thinking through a problem.`,
  creative: `You are an inventive problem-solver. Suggest unconventional approaches. Think outside the box. Propose multiple alternatives. Be enthusiastic about elegant solutions and creative patterns.`,
};

const DECAY_HALF_LIFE_DAYS = 90;
const IMPORTANCE_BOOST_PER_ACCESS = 0.05;
const MAX_IMPORTANCE = 10.0;

export class LongTermMemory {
  private db: ReturnType<typeof Database>;
  private embeddings: OllamaEmbeddingsService;
  private embeddingModel: string = 'nomic-embed-text:latest';

  constructor(userDataPath?: string) {
    const dbPath = path.join(userDataPath || app.getPath('userData'), 'localmind.db');
    this.db = Database(dbPath);
    this.embeddings = new OllamaEmbeddingsService();
    this.init();
  }

  setEmbeddingModel(model: string) {
    this.embeddingModel = model;
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS long_term_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'user',
        confidence REAL NOT NULL DEFAULT 1.0,
        importance REAL NOT NULL DEFAULT 1.0,
        embedding TEXT,
        createdAt INTEGER NOT NULL,
        lastAccessedAt INTEGER NOT NULL,
        accessCount INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS user_profile (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ltm_category ON long_term_memory(category);
      CREATE INDEX IF NOT EXISTS idx_ltm_accessed ON long_term_memory(lastAccessedAt);
      CREATE INDEX IF NOT EXISTS idx_ltm_importance ON long_term_memory(importance);
    `);

    // Add importance column if upgrading from older schema
    try {
      this.db.prepare("SELECT importance FROM long_term_memory LIMIT 1").get();
    } catch {
      try { this.db.exec("ALTER TABLE long_term_memory ADD COLUMN importance REAL NOT NULL DEFAULT 1.0"); } catch { /* already exists */ }
    }
  }

  // ── Memory CRUD ──────────────────────────────────────────────────────────

  async addFact(fact: Omit<MemoryFact, 'id' | 'lastAccessedAt' | 'accessCount'>): Promise<MemoryFact> {
    let embeddingJson: string | null = null;
    try {
      const vector = await this.embeddings.generateEmbedding(this.embeddingModel, fact.content);
      embeddingJson = JSON.stringify(vector);
    } catch { /* embeddings unavailable */ }

    const now = Date.now();
    const importance = fact.importance ?? (fact.category === 'core' ? 5.0 : 1.0);
    const stmt = this.db.prepare(`
      INSERT INTO long_term_memory (category, content, source, confidence, importance, embedding, createdAt, lastAccessedAt, accessCount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);
    const result = stmt.run(fact.category, fact.content, fact.source, fact.confidence, importance, embeddingJson, fact.createdAt || now, now);

    return { id: result.lastInsertRowid as number, ...fact, importance, createdAt: fact.createdAt || now, lastAccessedAt: now, accessCount: 0 };
  }

  // ── Recall with composite scoring ────────────────────────────────────────

  async recall(query: string, limit: number = 5): Promise<MemoryFact[]> {
    const now = Date.now();
    let results: Array<MemoryFact & { score: number }> = [];

    try {
      const queryVector = await this.embeddings.generateEmbedding(this.embeddingModel, query);
      const rows = this.db.prepare(
        'SELECT id, category, content, source, confidence, importance, embedding, createdAt, lastAccessedAt, accessCount FROM long_term_memory WHERE embedding IS NOT NULL'
      ).all() as any[];

      results = rows.map(row => {
        const storedVector = JSON.parse(row.embedding) as number[];
        const similarity = cosineSimilarity(queryVector, storedVector);
        const recencyScore = computeDecay(row.lastAccessedAt, now);
        const importanceNorm = Math.min(row.importance / MAX_IMPORTANCE, 1.0);
        // Composite: 50% semantic, 20% recency, 30% importance
        const score = (similarity * 0.5) + (recencyScore * 0.2) + (importanceNorm * 0.3);
        return { ...row, score };
      }).filter(r => r.score > 0.15).sort((a, b) => b.score - a.score).slice(0, limit);
    } catch {
      const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      if (keywords.length > 0) {
        const conditions = keywords.map(() => 'LOWER(content) LIKE ?').join(' OR ');
        const params = keywords.map(k => `%${k}%`);
        const rows = this.db.prepare(`SELECT * FROM long_term_memory WHERE ${conditions} ORDER BY importance DESC, lastAccessedAt DESC LIMIT ?`).all(...params, limit) as any[];
        results = rows.map(r => ({ ...r, score: 1 }));
      }
    }

    // Update access stats + boost importance on recall
    if (results.length > 0) {
      const updateStmt = this.db.prepare(
        'UPDATE long_term_memory SET lastAccessedAt = ?, accessCount = accessCount + 1, importance = MIN(importance + ?, ?) WHERE id = ?'
      );
      for (const fact of results) {
        if (fact.id) updateStmt.run(now, IMPORTANCE_BOOST_PER_ACCESS, MAX_IMPORTANCE, fact.id);
      }
    }

    return results;
  }

  // ── Memory decay ─────────────────────────────────────────────────────────

  applyDecay(): { decayed: number; deleted: number } {
    const now = Date.now();
    const rows = this.db.prepare(
      "SELECT id, importance, lastAccessedAt, category FROM long_term_memory WHERE category != 'core'"
    ).all() as any[];

    let decayed = 0;
    let deleted = 0;
    const updateStmt = this.db.prepare('UPDATE long_term_memory SET importance = ? WHERE id = ?');
    const deleteStmt = this.db.prepare('DELETE FROM long_term_memory WHERE id = ?');

    for (const row of rows) {
      const decay = computeDecay(row.lastAccessedAt, now);
      const newImportance = row.importance * decay;
      if (newImportance < 0.1) {
        deleteStmt.run(row.id);
        deleted++;
      } else if (newImportance < row.importance - 0.01) {
        updateStmt.run(Math.round(newImportance * 1000) / 1000, row.id);
        decayed++;
      }
    }

    return { decayed, deleted };
  }

  // ── Memory consolidation ─────────────────────────────────────────────────

  getConsolidationCandidates(maxAge: number = 30 * 24 * 60 * 60 * 1000): MemoryFact[] {
    const cutoff = Date.now() - maxAge;
    return this.db.prepare(
      "SELECT * FROM long_term_memory WHERE createdAt < ? AND category != 'core' AND importance < 3.0 ORDER BY importance ASC LIMIT 20"
    ).all(cutoff) as MemoryFact[];
  }

  replaceWithConsolidated(oldIds: number[], newContent: string, category: MemoryCategory = 'general'): void {
    const deleteStmt = this.db.prepare('DELETE FROM long_term_memory WHERE id = ?');
    for (const id of oldIds) deleteStmt.run(id);

    this.addFact({
      category,
      content: newContent,
      source: 'consolidation',
      confidence: 0.8,
      importance: 2.0,
      createdAt: Date.now(),
    });
  }

  // ── Auto-extraction helpers ──────────────────────────────────────────────

  getExtractionPrompt(conversationText: string): string {
    return `Analyze this conversation and extract important facts to remember about the user, their preferences, their project, and any decisions made. 

Return ONLY a JSON array of objects with this structure:
[
  { "category": "preference|decision|pattern|project|correction|core", "content": "the fact to remember", "importance": 1-5 }
]

Rules:
- "core" = fundamental facts about the user (name, role, tech stack)
- "preference" = likes/dislikes, coding style preferences
- "decision" = architectural or technical decisions made
- "pattern" = recurring patterns or conventions observed
- "project" = project-specific facts (framework, structure, APIs)
- "correction" = mistakes the AI made that should be avoided
- importance 1 = minor detail, 5 = critical fact
- Only extract genuinely useful facts, not conversation noise
- If nothing important, return an empty array []

Conversation:
${conversationText}`;
  }

  // ── User Profile ─────────────────────────────────────────────────────────

  getProfile(): UserProfile {
    const rows = this.db.prepare('SELECT key, value FROM user_profile').all() as { key: string; value: string }[];
    const data: Record<string, string> = {};
    for (const row of rows) data[row.key] = row.value;

    return {
      name: data.name || DEFAULT_PROFILE.name,
      role: data.role || DEFAULT_PROFILE.role,
      timezone: data.timezone || DEFAULT_PROFILE.timezone,
      expertiseAreas: data.expertiseAreas ? JSON.parse(data.expertiseAreas) : DEFAULT_PROFILE.expertiseAreas,
      preferredLanguages: data.preferredLanguages ? JSON.parse(data.preferredLanguages) : DEFAULT_PROFILE.preferredLanguages,
      personalityMode: (data.personalityMode as PersonalityMode) || DEFAULT_PROFILE.personalityMode,
      customTraits: data.customTraits || DEFAULT_PROFILE.customTraits,
    };
  }

  updateProfile(updates: Partial<UserProfile>): void {
    const upsert = this.db.prepare('INSERT OR REPLACE INTO user_profile (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        upsert.run(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    }
  }

  // ── Personality prompt builder ───────────────────────────────────────────

  buildPersonalityPrompt(): string {
    const profile = this.getProfile();
    const parts: string[] = [];

    const baseTemplate = PERSONALITY_TEMPLATES[profile.personalityMode] || PERSONALITY_TEMPLATES.professional;
    parts.push(baseTemplate);

    if (profile.customTraits) {
      parts.push(`Additional traits: ${profile.customTraits}`);
    }

    if (profile.name) {
      parts.push(`The user's name is ${profile.name}.`);
    }
    if (profile.role) {
      parts.push(`They work as a ${profile.role}.`);
    }
    if (profile.expertiseAreas.length > 0) {
      parts.push(`Their expertise areas: ${profile.expertiseAreas.join(', ')}.`);
    }
    if (profile.preferredLanguages.length > 0) {
      parts.push(`Preferred programming languages: ${profile.preferredLanguages.join(', ')}.`);
    }

    return parts.join('\n');
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  getAll(): MemoryFact[] {
    return this.db.prepare(
      'SELECT id, category, content, source, confidence, importance, createdAt, lastAccessedAt, accessCount FROM long_term_memory ORDER BY importance DESC, lastAccessedAt DESC'
    ).all() as MemoryFact[];
  }

  getByCategory(category: string): MemoryFact[] {
    return this.db.prepare(
      'SELECT id, category, content, source, confidence, importance, createdAt, lastAccessedAt, accessCount FROM long_term_memory WHERE category = ? ORDER BY importance DESC'
    ).all(category) as MemoryFact[];
  }

  deleteFact(id: number): void {
    this.db.prepare('DELETE FROM long_term_memory WHERE id = ?').run(id);
  }

  updateFact(id: number, updates: { content?: string; category?: string; importance?: number }): void {
    const sets: string[] = [];
    const params: any[] = [];
    if (updates.content !== undefined) { sets.push('content = ?'); params.push(updates.content); }
    if (updates.category !== undefined) { sets.push('category = ?'); params.push(updates.category); }
    if (updates.importance !== undefined) { sets.push('importance = ?'); params.push(updates.importance); }
    sets.push('lastAccessedAt = ?');
    params.push(Date.now());
    params.push(id);
    this.db.prepare(`UPDATE long_term_memory SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  getCount(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM long_term_memory').get() as { count: number }).count;
  }

  exportAll(): string {
    const memories = this.getAll();
    const profile = this.getProfile();
    return JSON.stringify({ version: 1, profile, memories }, null, 2);
  }

  importData(json: string): { memoriesImported: number } {
    const data = JSON.parse(json);
    let count = 0;
    if (data.profile) this.updateProfile(data.profile);
    if (Array.isArray(data.memories)) {
      for (const m of data.memories) {
        this.addFact({ category: m.category, content: m.content, source: m.source || 'import', confidence: m.confidence || 1, importance: m.importance || 1, createdAt: m.createdAt || Date.now() });
        count++;
      }
    }
    return { memoriesImported: count };
  }

  buildContextBlock(facts: MemoryFact[]): string {
    if (facts.length === 0) return '';
    const lines = facts.map(f => `- [${f.category}] ${f.content}`);
    return `\n\n[MEMORY — What I know about you and your projects]\n${lines.join('\n')}\n[END MEMORY]`;
  }

  getPersonalityModes(): Array<{ id: PersonalityMode; label: string; description: string }> {
    return [
      { id: 'professional', label: 'Professional', description: 'Precise, thorough, technically accurate' },
      { id: 'casual', label: 'Casual', description: 'Friendly, conversational, approachable' },
      { id: 'concise', label: 'Concise', description: 'Ultra-short answers, bullet points, code-first' },
      { id: 'mentor', label: 'Mentor', description: 'Patient, educational, explains the "why"' },
      { id: 'creative', label: 'Creative', description: 'Inventive, unconventional, multiple alternatives' },
    ];
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function computeDecay(lastAccessedAt: number, now: number): number {
  const daysSinceAccess = (now - lastAccessedAt) / (24 * 60 * 60 * 1000);
  return Math.pow(0.5, daysSinceAccess / DECAY_HALF_LIFE_DAYS);
}

let instance: LongTermMemory | null = null;

export function getLongTermMemory(userDataPath?: string): LongTermMemory {
  if (!instance) {
    instance = new LongTermMemory(userDataPath);
  }
  return instance;
}
