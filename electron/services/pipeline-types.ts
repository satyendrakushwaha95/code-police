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

export interface ResearchResult {
  files_examined: string[];
  key_findings: string[];
  relevant_patterns: string[];
  existing_implementation: Array<{
    file: string;
    code: string;
    relevance: string;
  }>;
  summary: string;
}

export interface SecurityResult {
  verdict: 'PASS' | 'FAIL';
  vulnerabilities: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    type: string;
    description: string;
    file: string;
    line?: number;
    recommendation: string;
  }>;
  dependency_issues: Array<{
    package: string;
    issue: string;
    severity: string;
  }>;
  summary: string;
  score: number;
}

export interface DecompositionResult {
  subtasks: Array<{
    id: string;
    description: string;
    template: PipelineTemplate;
    estimated_complexity: 'low' | 'medium' | 'high';
    dependencies: string[];
    agentId?: string;
    agentReason?: string;
  }>;
  strategy: string;
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

export type PipelineStage = 'plan' | 'action' | 'review' | 'validate' | 'execute' | 'research' | 'security' | 'decompose';

export type PipelineTemplate =
  | 'quick-fix'
  | 'standard'
  | 'deep-review'
  | 'docs-only'
  | 'refactor'
  | 'complex';

export interface PipelineTemplateConfig {
  id: PipelineTemplate;
  name: string;
  description: string;
  stages: PipelineStage[];
  icon: string;
}

export interface PipelineRun {
  id: string;
  task_description: string;
  project_root?: string;
  status: 'running' | 'complete' | 'failed' | 'cancelled' | 'resumable' | 'awaiting_approval';
  created_at: number;
  completed_at?: number;
  retry_count: number;
  final_verdict?: 'PASS' | 'FAIL';
  current_stage?: PipelineStage;
  template?: PipelineTemplate;
  stage_order: PipelineStage[];
  stages: Record<string, StageResult<any>>;
  parent_run_id?: string;
  subtask_index?: number;
  agent_id?: string;
  last_completed_stage?: string;
  children?: PipelineRun[];
}

export interface ApprovalRequest {
  runId: string;
  stage: string;
  stageResult: any;
  message: string;
  options: ('approve' | 'reject')[];
}

export interface PipelineOptions {
  maxRetries: number;
  timeoutMs: number;
  autoExecute: boolean;
  smartSkip?: boolean;
  enableAgentLoop?: boolean;
  maxToolIterations?: number;
  approvalStages?: PipelineStage[];
}

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

export interface StageStreamChunk {
  runId: string;
  stage: string;
  content: string;
  accumulated: string;
  done: boolean;
}

export interface ToolCall {
  tool: string;
  params: Record<string, any>;
}

export interface ToolResult {
  tool: string;
  output: string;
  success: boolean;
}

export type StreamCallback = (content: string, accumulated: string) => void;
