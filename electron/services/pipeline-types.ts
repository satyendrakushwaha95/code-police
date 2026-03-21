export interface TaskPlan {
  task_description: string;
  subtasks: { id: string; description: string; files: string[] }[];
  acceptance_criteria: string[];
  required_files: string[];
  approach_notes: string;
  estimated_complexity: 'low' | 'medium' | 'high';
}

export interface FileChange {
  file_path: string;
  operation: 'create' | 'modify' | 'delete';
  content: string;
  explanation: string;
}

export interface CodeOutput {
  file_changes: FileChange[];
  summary: string;
}

export interface ReviewResult {
  verdict: 'PASS' | 'FAIL';
  issues: {
    severity: 'error' | 'warning' | 'info';
    description: string;
    file?: string;
  }[];
  suggestions: string[];
  confidence_score: number;
}

export interface ValidationResult {
  passed: boolean;
  gaps: {
    type: 'missing' | 'incomplete' | 'regressed' | 'incorrect';
    description: string;
    related_to?: string;
  }[];
  coverage_score: number;
  summary: string;
}

export interface ExecuteResult {
  executed_files: string[];
  failed_files: string[];
  command_results: { command: string; output: string; success: boolean }[];
  summary: string;
}

export type StageStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped';

export interface StageResult<T> {
  status: StageStatus;
  model_used: string;
  duration_ms?: number;
  output?: T;
  error?: string;
  real_time?: RealTimeProgress;
}

export interface PipelineRun {
  id: string;
  task_description: string;
  project_root?: string;
  status: 'running' | 'complete' | 'failed' | 'cancelled';
  created_at: number;
  completed_at?: number;
  retry_count: number;
  final_verdict?: 'PASS' | 'FAIL';
  current_stage?: PipelineStage;
  stages: {
    plan: StageResult<TaskPlan>;
    action: StageResult<CodeOutput>;
    review: StageResult<ReviewResult>;
    validate: StageResult<ValidationResult>;
    execute: StageResult<ExecuteResult>;
  };
}

export interface PipelineOptions {
  maxRetries: number;
  timeoutMs: number;
  autoExecute: boolean;
}

export type PipelineStage = 'plan' | 'action' | 'review' | 'validate' | 'execute';

export type RealTimeStatus = 'idle' | 'sending' | 'processing' | 'waiting' | 'complete' | 'failed';

export interface ActivityLogEntry {
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'progress';
}

export interface RealTimeProgress {
  sub_status: RealTimeStatus;
  activity_logs: ActivityLogEntry[];
  started_at: number;
  last_updated: number;
  model_used?: string;
  input_preview?: string;
  output_preview?: string;
}
