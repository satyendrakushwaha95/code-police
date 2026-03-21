import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import { PipelineRun, StageResult, PipelineStage, TaskPlan, CodeOutput, ReviewResult, ValidationResult, ExecuteResult } from './pipeline-types';

export class PipelineStateStore {
  private db: ReturnType<typeof Database>;

  constructor(userDataPath?: string) {
    const dbPath = path.join(userDataPath || app.getPath('userData'), 'localmind.db');
    this.db = Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pipeline_runs (
        id TEXT PRIMARY KEY,
        task_description TEXT NOT NULL,
        project_root TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        retry_count INTEGER NOT NULL DEFAULT 0,
        final_verdict TEXT
      );
      
      CREATE TABLE IF NOT EXISTS pipeline_stage_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        status TEXT NOT NULL,
        model_used TEXT NOT NULL,
        duration_ms INTEGER,
        output TEXT,
        error TEXT,
        FOREIGN KEY (run_id) REFERENCES pipeline_runs(id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_pipeline_runs_created ON pipeline_runs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_pipeline_stage_results_run ON pipeline_stage_results(run_id);
    `);
    
    try {
      this.db.exec(`ALTER TABLE pipeline_runs ADD COLUMN project_root TEXT`);
    } catch (e) {
      // Column already exists
    }
  }

  async createRun(taskDescription: string, idOverride?: string, projectRoot?: string): Promise<PipelineRun> {
    const id = idOverride || `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO pipeline_runs (id, task_description, project_root, status, created_at, retry_count)
      VALUES (?, ?, ?, 'running', ?, 0)
    `);
    stmt.run(id, taskDescription, projectRoot || null, createdAt);

    return {
      id,
      task_description: taskDescription,
      project_root: projectRoot,
      status: 'running',
      created_at: createdAt,
      retry_count: 0,
      stages: {
        plan: { status: 'pending', model_used: '' },
        action: { status: 'pending', model_used: '' },
        review: { status: 'pending', model_used: '' },
        validate: { status: 'pending', model_used: '' },
        execute: { status: 'pending', model_used: '' }
      }
    };
  }

  async saveStageResult(
    runId: string,
    stage: PipelineStage,
    attempt: number,
    result: StageResult<any>
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO pipeline_stage_results (run_id, stage, attempt, status, model_used, duration_ms, output, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      runId,
      stage,
      attempt,
      result.status,
      result.model_used,
      result.duration_ms || null,
      result.output ? JSON.stringify(result.output) : null,
      result.error || null
    );
  }

  async updateRunStatus(
    runId: string,
    status: 'running' | 'complete' | 'failed' | 'cancelled',
    verdict?: 'PASS' | 'FAIL'
  ): Promise<void> {
    const completedAt = (status === 'complete' || status === 'failed' || status === 'cancelled')
      ? Date.now()
      : null;

    const stmt = this.db.prepare(`
      UPDATE pipeline_runs
      SET status = ?, completed_at = ?, final_verdict = ?
      WHERE id = ?
    `);
    stmt.run(status, completedAt, verdict || null, runId);
  }

  async incrementRetryCount(runId: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE pipeline_runs SET retry_count = retry_count + 1 WHERE id = ?
    `);
    stmt.run(runId);
  }

  async getRunHistory(): Promise<PipelineRun[]> {
    const runs = this.db.prepare(`
      SELECT * FROM pipeline_runs ORDER BY created_at DESC LIMIT 50
    `).all() as any[];

    const result: PipelineRun[] = [];

    for (const run of runs) {
      const stageResults = this.db.prepare(`
        SELECT * FROM pipeline_stage_results WHERE run_id = ? ORDER BY stage, attempt
      `).all(run.id) as any[];

      const stages = {
        plan: this.buildStageResult(stageResults, 'plan'),
        action: this.buildStageResult(stageResults, 'action'),
        review: this.buildStageResult(stageResults, 'review'),
        validate: this.buildStageResult(stageResults, 'validate'),
        execute: this.buildStageResult(stageResults, 'execute')
      };

      result.push({
        id: run.id,
        task_description: run.task_description,
        project_root: run.project_root,
        status: run.status,
        created_at: run.created_at,
        completed_at: run.completed_at,
        retry_count: run.retry_count,
        final_verdict: run.final_verdict,
        stages
      });
    }

    return result;
  }

  private buildStageResult(results: any[], stage: PipelineStage): StageResult<any> {
    const stageResults = results.filter(r => r.stage === stage);
    if (stageResults.length === 0) {
      return { status: 'pending', model_used: '' };
    }

    const latest = stageResults[stageResults.length - 1];
    let output: any;

    try {
      output = latest.output ? JSON.parse(latest.output) : undefined;
    } catch {
      output = undefined;
    }

    return {
      status: latest.status,
      model_used: latest.model_used,
      duration_ms: latest.duration_ms,
      output,
      error: latest.error
    };
  }

  async getStageOutput(runId: string, stage: PipelineStage): Promise<StageResult<any> | null> {
    const results = this.db.prepare(`
      SELECT * FROM pipeline_stage_results WHERE run_id = ? AND stage = ? ORDER BY attempt DESC LIMIT 1
    `).all(runId, stage) as any[];

    if (results.length === 0) return null;

    const latest = results[0];
    let output: any;

    try {
      output = latest.output ? JSON.parse(latest.output) : undefined;
    } catch {
      output = undefined;
    }

    return {
      status: latest.status,
      model_used: latest.model_used,
      duration_ms: latest.duration_ms,
      output,
      error: latest.error
    };
  }

  async finalizeRun(runId: string, verdict: 'PASS' | 'FAIL'): Promise<void> {
    await this.updateRunStatus(runId, verdict === 'PASS' ? 'complete' : 'failed', verdict);
  }

  async deleteRun(runId: string): Promise<void> {
    this.db.prepare('DELETE FROM pipeline_stage_results WHERE run_id = ?').run(runId);
    this.db.prepare('DELETE FROM pipeline_runs WHERE id = ?').run(runId);
  }

  async getRun(runId: string): Promise<PipelineRun | null> {
    const runs = this.db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').all(runId) as any[];
    if (runs.length === 0) return null;

    const run = runs[0];
    const stageResults = this.db.prepare(`
      SELECT * FROM pipeline_stage_results WHERE run_id = ? ORDER BY stage, attempt
    `).all(runId) as any[];

    const stages = {
      plan: this.buildStageResult(stageResults, 'plan'),
      action: this.buildStageResult(stageResults, 'action'),
      review: this.buildStageResult(stageResults, 'review'),
      validate: this.buildStageResult(stageResults, 'validate'),
      execute: this.buildStageResult(stageResults, 'execute')
    };

    return {
      id: run.id,
      task_description: run.task_description,
      project_root: run.project_root,
      status: run.status,
      created_at: run.created_at,
      completed_at: run.completed_at,
      retry_count: run.retry_count,
      final_verdict: run.final_verdict,
      stages
    };
  }

  async prepareForRetry(runId: string): Promise<void> {
    this.db.prepare('UPDATE pipeline_runs SET status = ?, retry_count = retry_count + 1 WHERE id = ?').run('running', runId);
  }
}

let instance: PipelineStateStore | null = null;

export function getPipelineStateStore(userDataPath?: string): PipelineStateStore {
  if (!instance) {
    instance = new PipelineStateStore(userDataPath);
  }
  return instance;
}
