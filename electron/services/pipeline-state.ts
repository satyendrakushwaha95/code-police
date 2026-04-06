import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import { PipelineRun, StageResult, PipelineStage, PipelineTemplate, TaskPlan, CodeOutput, ReviewResult, ValidationResult, ExecuteResult } from './pipeline-types';
import { getTemplateById, getDefaultTemplate } from './pipeline-templates';

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

      CREATE TABLE IF NOT EXISTS pipeline_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        template TEXT,
        total_duration_ms INTEGER,
        total_tokens INTEGER DEFAULT 0,
        total_cost_usd REAL DEFAULT 0,
        stages_completed INTEGER DEFAULT 0,
        stages_skipped INTEGER DEFAULT 0,
        stages_failed INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        final_verdict TEXT,
        bottleneck_stage TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pipeline_stage_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        duration_ms INTEGER,
        tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        model TEXT,
        status TEXT,
        attempt INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pipeline_analytics_created ON pipeline_analytics(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_pipeline_stage_analytics_run ON pipeline_stage_analytics(run_id);
      CREATE INDEX IF NOT EXISTS idx_pipeline_stage_analytics_stage ON pipeline_stage_analytics(stage);
    `);

    // Migrations for existing tables
    const migrations = [
      `ALTER TABLE pipeline_runs ADD COLUMN project_root TEXT`,
      `ALTER TABLE pipeline_runs ADD COLUMN template TEXT`,
      `ALTER TABLE pipeline_runs ADD COLUMN stage_order TEXT`,
    ];
    for (const sql of migrations) {
      try { this.db.exec(sql); } catch (e) { /* Column already exists */ }
    }
  }

  async createRun(
    taskDescription: string,
    idOverride?: string,
    projectRoot?: string,
    template?: PipelineTemplate
  ): Promise<PipelineRun> {
    const id = idOverride || `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = Date.now();
    const templateConfig = template
      ? getTemplateById(template) || getDefaultTemplate()
      : getDefaultTemplate();
    const stageOrder = templateConfig.stages;
    const effectiveTemplate = template || 'standard';

    const stmt = this.db.prepare(`
      INSERT INTO pipeline_runs (id, task_description, project_root, status, created_at, retry_count, template, stage_order)
      VALUES (?, ?, ?, 'running', ?, 0, ?, ?)
    `);
    stmt.run(id, taskDescription, projectRoot || null, createdAt, effectiveTemplate, JSON.stringify(stageOrder));

    const stages: Record<string, StageResult<any>> = {};
    for (const stage of stageOrder) {
      stages[stage] = { status: 'pending', model_used: '' };
    }

    return {
      id,
      task_description: taskDescription,
      project_root: projectRoot,
      status: 'running',
      created_at: createdAt,
      retry_count: 0,
      template: effectiveTemplate,
      stage_order: stageOrder,
      stages,
    };
  }

  async saveStageResult(
    runId: string,
    stage: string,
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

      const stageOrder: PipelineStage[] = run.stage_order
        ? JSON.parse(run.stage_order)
        : ['plan', 'action', 'review', 'validate', 'execute'];

      const stages: Record<string, StageResult<any>> = {};
      for (const stage of stageOrder) {
        stages[stage] = this.buildStageResult(stageResults, stage);
      }

      result.push({
        id: run.id,
        task_description: run.task_description,
        project_root: run.project_root,
        status: run.status,
        created_at: run.created_at,
        completed_at: run.completed_at,
        retry_count: run.retry_count,
        final_verdict: run.final_verdict,
        template: run.template,
        stage_order: stageOrder,
        stages
      });
    }

    return result;
  }

  private buildStageResult(results: any[], stage: string): StageResult<any> {
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

  async getStageOutput(runId: string, stage: string): Promise<StageResult<any> | null> {
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
    this.db.prepare('DELETE FROM pipeline_analytics WHERE run_id = ?').run(runId);
    this.db.prepare('DELETE FROM pipeline_stage_analytics WHERE run_id = ?').run(runId);
    this.db.prepare('DELETE FROM pipeline_runs WHERE id = ?').run(runId);
  }

  async getRun(runId: string): Promise<PipelineRun | null> {
    const runs = this.db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').all(runId) as any[];
    if (runs.length === 0) return null;

    const run = runs[0];
    const stageResults = this.db.prepare(`
      SELECT * FROM pipeline_stage_results WHERE run_id = ? ORDER BY stage, attempt
    `).all(runId) as any[];

    const stageOrder: PipelineStage[] = run.stage_order
      ? JSON.parse(run.stage_order)
      : ['plan', 'action', 'review', 'validate', 'execute'];

    const stages: Record<string, StageResult<any>> = {};
    for (const stage of stageOrder) {
      stages[stage] = this.buildStageResult(stageResults, stage);
    }

    return {
      id: run.id,
      task_description: run.task_description,
      project_root: run.project_root,
      status: run.status,
      created_at: run.created_at,
      completed_at: run.completed_at,
      retry_count: run.retry_count,
      final_verdict: run.final_verdict,
      template: run.template,
      stage_order: stageOrder,
      stages
    };
  }

  async prepareForRetry(runId: string): Promise<void> {
    this.db.prepare('UPDATE pipeline_runs SET status = ?, retry_count = retry_count + 1 WHERE id = ?').run('running', runId);
  }

  // --- Analytics Methods ---

  getAnalyticsSummary(fromTimestamp?: number, toTimestamp?: number) {
    const from = fromTimestamp || 0;
    const to = toTimestamp || Date.now();

    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total_runs,
        SUM(CASE WHEN final_verdict = 'PASS' THEN 1 ELSE 0 END) as passed_runs,
        AVG(total_duration_ms) as avg_duration_ms,
        SUM(total_tokens) as total_tokens,
        SUM(total_cost_usd) as total_cost_usd,
        AVG(retry_count) as avg_retries
      FROM pipeline_analytics
      WHERE created_at BETWEEN ? AND ?
    `).get(from, to) as any;

    return {
      totalRuns: row.total_runs || 0,
      successRate: row.total_runs > 0 ? Math.round((row.passed_runs / row.total_runs) * 100) : 0,
      avgDurationMs: Math.round(row.avg_duration_ms || 0),
      totalTokens: row.total_tokens || 0,
      totalCostUsd: Math.round((row.total_cost_usd || 0) * 100) / 100,
      avgRetries: Math.round((row.avg_retries || 0) * 10) / 10,
    };
  }

  getAnalyticsByTemplate(fromTimestamp?: number, toTimestamp?: number) {
    const from = fromTimestamp || 0;
    const to = toTimestamp || Date.now();

    return this.db.prepare(`
      SELECT
        template,
        COUNT(*) as count,
        SUM(CASE WHEN final_verdict = 'PASS' THEN 1 ELSE 0 END) as passed,
        AVG(total_duration_ms) as avg_duration_ms,
        AVG(total_cost_usd) as avg_cost_usd
      FROM pipeline_analytics
      WHERE created_at BETWEEN ? AND ? AND template IS NOT NULL
      GROUP BY template
      ORDER BY count DESC
    `).all(from, to) as any[];
  }

  getBottleneckStages(fromTimestamp?: number, toTimestamp?: number) {
    const from = fromTimestamp || 0;
    const to = toTimestamp || Date.now();

    return this.db.prepare(`
      SELECT
        stage,
        COUNT(*) as executions,
        AVG(duration_ms) as avg_duration_ms,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failures,
        AVG(cost_usd) as avg_cost_usd
      FROM pipeline_stage_analytics
      WHERE created_at BETWEEN ? AND ?
      GROUP BY stage
      ORDER BY avg_duration_ms DESC
    `).all(from, to) as any[];
  }

  getModelPerformance(fromTimestamp?: number, toTimestamp?: number) {
    const from = fromTimestamp || 0;
    const to = toTimestamp || Date.now();

    return this.db.prepare(`
      SELECT
        model,
        COUNT(*) as executions,
        SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as successes,
        AVG(duration_ms) as avg_duration_ms,
        AVG(cost_usd) as avg_cost_usd
      FROM pipeline_stage_analytics
      WHERE created_at BETWEEN ? AND ? AND model IS NOT NULL AND model != 'local-execution'
      GROUP BY model
      ORDER BY executions DESC
    `).all(from, to) as any[];
  }

  recordAnalytics(runId: string, template?: string): void {
    const run = this.db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId) as any;
    if (!run) return;

    const stages = this.db.prepare(`
      SELECT * FROM pipeline_stage_results WHERE run_id = ? ORDER BY attempt
    `).all(runId) as any[];

    const totalDuration = stages.reduce((sum: number, s: any) => sum + (s.duration_ms || 0), 0);
    const completedStages = stages.filter((s: any) => s.status === 'complete').length;
    const skippedStages = stages.filter((s: any) => s.status === 'skipped').length;
    const failedStages = stages.filter((s: any) => s.status === 'failed').length;

    const longestStage = stages.length > 0
      ? stages.reduce((max: any, s: any) =>
          (s.duration_ms || 0) > (max?.duration_ms || 0) ? s : max
        , stages[0])
      : { stage: 'unknown', duration_ms: 0 };

    let totalTokens = 0;
    let totalCost = 0;
    try {
      const usageRow = this.db.prepare(`
        SELECT COALESCE(SUM(totalTokens), 0) as tokens, COALESCE(SUM(costUsd), 0) as cost
        FROM token_usage WHERE conversationId = ?
      `).get(`pipeline:${runId}`) as any;
      if (usageRow) {
        totalTokens = usageRow.tokens || 0;
        totalCost = usageRow.cost || 0;
      }
    } catch { /* token_usage table may not exist yet */ }

    this.db.prepare(`
      INSERT INTO pipeline_analytics
        (run_id, template, total_duration_ms, total_tokens, total_cost_usd, stages_completed, stages_skipped, stages_failed, retry_count, final_verdict, bottleneck_stage, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId, template || null, totalDuration, totalTokens, totalCost,
      completedStages, skippedStages, failedStages,
      run.retry_count, run.final_verdict, longestStage?.stage, run.created_at
    );

    for (const stage of stages) {
      this.db.prepare(`
        INSERT INTO pipeline_stage_analytics
          (run_id, stage, duration_ms, model, status, attempt, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(runId, stage.stage, stage.duration_ms, stage.model_used, stage.status, stage.attempt, run.created_at);
    }
  }
}

let instance: PipelineStateStore | null = null;

export function getPipelineStateStore(userDataPath?: string): PipelineStateStore {
  if (!instance) {
    instance = new PipelineStateStore(userDataPath);
  }
  return instance;
}
