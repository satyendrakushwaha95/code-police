import * as lancedb from '@lancedb/lancedb';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

export interface ChunkDocument {
  id: string;
  filePath: string;
  relativeFilePath: string;
  content: string;
  startLine: number;
  endLine: number;
  vector: number[];
}

export class VectorDBService {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private dbPath: string;
  private dim: number | null = null;
  private tableInitialized: boolean = false;

  constructor(appDataPath: string) {
    this.dbPath = path.join(appDataPath, 'lancedb');
  }

  async initialize() {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });
      this.db = await lancedb.connect(this.dbPath);

      const tableNames = await this.db.tableNames();
      if (tableNames.includes('code_chunks')) {
        this.table = await this.db.openTable('code_chunks');
        this.tableInitialized = true;
        console.log('LanceDB initialized at', this.dbPath, '(existing table)');
      } else {
        // Table will be created on first insert with correct dimensions
        console.log('LanceDB initialized at', this.dbPath, '(table will be created on first insert)');
      }
    } catch (err) {
      console.error('Failed to initialize LanceDB:', err);
      throw err;
    }
  }

  private async ensureTableExists(vectorDimension: number) {
    if (this.tableInitialized) return;
    if (!this.db) throw new Error('DB not initialized');

    this.dim = vectorDimension;

    // Create table with correct dimensions based on first embedding
    const dummyData = [{
      id: 'dummy',
      filePath: '',
      relativeFilePath: '',
      content: '',
      startLine: 0,
      endLine: 0,
      vector: Array(this.dim).fill(0)
    }];

    this.table = await this.db.createTable('code_chunks', dummyData);
    await this.table.delete('id = "dummy"');
    this.tableInitialized = true;
    console.log(`Created LanceDB table with ${this.dim} dimensions`);
  }

  async insertChunks(chunks: Omit<ChunkDocument, 'id'>[]) {
    if (!this.db) throw new Error('DB not initialized');
    if (chunks.length === 0) return;

    // Ensure table exists with correct dimensions from first chunk
    const firstVector = chunks[0].vector;
    await this.ensureTableExists(firstVector.length);

    const records = chunks.map(chunk => ({
      ...chunk,
      id: crypto.randomUUID()
    }));

    if (records.length > 0 && this.table) {
      await this.table.add(records);
    }
  }

  async searchSimilar(queryVector: number[], limit: number = 5) {
    if (!this.table) throw new Error('DB not initialized');
    
    const results = await this.table.vectorSearch(queryVector)
      .limit(limit)
      .toArray();
      
    return results as unknown as ChunkDocument[];
  }
  
  async deleteByFilePath(relativeFilePath: string) {
    // If table doesn't exist yet, nothing to delete
    if (!this.table || !this.tableInitialized) return;
    // LanceDB supports SQL-like deletion
    await this.table.delete(`relativeFilePath = '${relativeFilePath}'`);
  }
}
