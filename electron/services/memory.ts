import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';

export interface MemoryEntry {
  id?: number;
  taskId: string;
  step: number;
  type: 'thought' | 'action' | 'result' | 'reflection';
  content: string;
  timestamp: number;
}

export interface ConversationRow {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  timestamp: number;
  isStreaming?: number;
}

export interface AttachmentRow {
  id: string;
  conversationId: string;
  name: string;
  type: string;
  content: string;
  size: number;
}

export interface AuditLogEntry {
  id?: number;
  timestamp: number;
  action: string;
  toolName?: string;
  parameters?: string;
  result?: string;
  userConfirmed: boolean;
}

export class AgentMemoryService {
  private db: ReturnType<typeof Database>;

  constructor(userDataPath?: string) {
    const dbPath = path.join(userDataPath || app.getPath('userData'), 'codepolice.db');
    this.db = Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        taskId TEXT NOT NULL,
        step INTEGER NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        model TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversationId TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        isStreaming INTEGER DEFAULT 0,
        FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        conversationId TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        size INTEGER NOT NULL,
        FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        action TEXT NOT NULL,
        toolName TEXT,
        parameters TEXT,
        result TEXT,
        userConfirmed INTEGER NOT NULL DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_taskId ON memory(taskId);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON memory(timestamp);
      CREATE INDEX IF NOT EXISTS idx_convId ON messages(conversationId);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
    `);
  }

  // Memory methods
  addEntry(entry: Omit<MemoryEntry, 'id'>) {
    const stmt = this.db.prepare(`
      INSERT INTO memory (taskId, step, type, content, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(entry.taskId, entry.step, entry.type, entry.content, entry.timestamp);
  }

  getEntries(taskId: string): MemoryEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM memory WHERE taskId = ? ORDER BY step ASC, timestamp ASC
    `);
    return stmt.all(taskId) as MemoryEntry[];
  }

  getLatestEntry(taskId: string): MemoryEntry | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM memory WHERE taskId = ? ORDER BY step DESC LIMIT 1
    `);
    return stmt.get(taskId) as MemoryEntry | undefined;
  }

  clearTaskMemory(taskId: string) {
    const stmt = this.db.prepare(`DELETE FROM memory WHERE taskId = ?`);
    return stmt.run(taskId);
  }

  getAllTasks(): string[] {
    const stmt = this.db.prepare(`SELECT DISTINCT taskId FROM memory ORDER BY timestamp DESC`);
    return (stmt.all() as { taskId: string }[]).map(r => r.taskId);
  }

  // Conversation methods
  saveConversation(conv: ConversationRow) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO conversations (id, title, model, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(conv.id, conv.title, conv.model, conv.createdAt, conv.updatedAt);
  }

  getConversation(id: string): ConversationRow | undefined {
    const stmt = this.db.prepare(`SELECT * FROM conversations WHERE id = ?`);
    return stmt.get(id) as ConversationRow | undefined;
  }

  getAllConversations(): ConversationRow[] {
    const stmt = this.db.prepare(`SELECT * FROM conversations ORDER BY updatedAt DESC`);
    return stmt.all() as ConversationRow[];
  }

  deleteConversation(id: string) {
    const stmt = this.db.prepare(`DELETE FROM conversations WHERE id = ?`);
    return stmt.run(id);
  }

  // Message methods
  saveMessage(msg: MessageRow) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (id, conversationId, role, content, timestamp, isStreaming)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(msg.id, msg.conversationId, msg.role, msg.content, msg.timestamp, msg.isStreaming ? 1 : 0);
  }

  getMessages(conversationId: string): MessageRow[] {
    const stmt = this.db.prepare(`SELECT * FROM messages WHERE conversationId = ? ORDER BY timestamp ASC`);
    return stmt.all(conversationId) as MessageRow[];
  }

  deleteMessage(id: string) {
    const stmt = this.db.prepare(`DELETE FROM messages WHERE id = ?`);
    return stmt.run(id);
  }

  deleteMessagesAfter(conversationId: string, timestamp: number) {
    const stmt = this.db.prepare(`DELETE FROM messages WHERE conversationId = ? AND timestamp > ?`);
    return stmt.run(conversationId, timestamp);
  }

  // Attachment methods
  saveAttachment(att: AttachmentRow) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO attachments (id, conversationId, name, type, content, size)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(att.id, att.conversationId, att.name, att.type, att.content, att.size);
  }

  getAttachments(conversationId: string): AttachmentRow[] {
    const stmt = this.db.prepare(`SELECT * FROM attachments WHERE conversationId = ?`);
    return stmt.all(conversationId) as AttachmentRow[];
  }

  // Audit log methods
  addAuditLog(entry: Omit<AuditLogEntry, 'id'>) {
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (timestamp, action, toolName, parameters, result, userConfirmed)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      entry.timestamp,
      entry.action,
      entry.toolName || null,
      entry.parameters || null,
      entry.result || null,
      entry.userConfirmed ? 1 : 0
    );
  }

  getAuditLogs(limit = 100): AuditLogEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?
    `);
    return stmt.all(limit) as AuditLogEntry[];
  }

  getAuditLogsByAction(action: string, limit = 50): AuditLogEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM audit_logs WHERE action = ? ORDER BY timestamp DESC LIMIT ?
    `);
    return stmt.all(action, limit) as AuditLogEntry[];
  }

  getFullState(): { conversations: ConversationRow[]; messages: Record<string, MessageRow[]>; attachments: Record<string, AttachmentRow[]> } {
    const conversations = this.getAllConversations();
    const messages: Record<string, MessageRow[]> = {};
    const attachments: Record<string, AttachmentRow[]> = {};

    for (const conv of conversations) {
      messages[conv.id] = this.getMessages(conv.id);
      attachments[conv.id] = this.getAttachments(conv.id);
    }

    return { conversations, messages, attachments };
  }

  close() {
    this.db.close();
  }
}
