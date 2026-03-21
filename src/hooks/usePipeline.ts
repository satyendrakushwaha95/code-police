import { useState, useEffect, useCallback, useRef } from 'react';

export type TaskCategory =
  | 'code_generation'
  | 'code_refactor'
  | 'documentation'
  | 'planning'
  | 'review'
  | 'chat_general';

export interface RouteConfig {
  model: string;
  enabled: boolean;
  fallbackToDefault: boolean;
}

export interface RoutingConfig {
  version: number;
  defaultModel: string;
  routes: Record<TaskCategory, RouteConfig>;
}

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

export interface ExecuteResult {
  executed_files: string[];
  failed_files: string[];
  command_results: { command: string; output: string; success: boolean }[];
  summary: string;
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

export type StageStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped';

export interface StageResult<T> {
  status: StageStatus;
  model_used: string;
  duration_ms?: number;
  output?: T;
  error?: string;
}

export interface PipelineRun {
  id: string;
  task_description: string;
  status: 'running' | 'complete' | 'failed' | 'cancelled';
  created_at: number;
  completed_at?: number;
  retry_count: number;
  final_verdict?: 'PASS' | 'FAIL';
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

const ipcRenderer = (window as any).ipcRenderer;

interface UsePipelineReturn {
  run: (task: string, options: PipelineOptions, projectRoot?: string, agentId?: string) => Promise<{ runId: string }>;
  retryFix: (runId: string, suggestions: string[]) => Promise<{ runId: string }>;
  cancel: (runId?: string) => Promise<void>;
  deleteRun: (runId: string) => Promise<void>;
  analyzeAndRetry: (runId: string, userPrompt: string) => Promise<{ runId: string; action: string; stage?: string; task?: string; feedback?: string; reason?: string }>;
  activeRun: PipelineRun | null;
  history: PipelineRun[];
  isRunning: boolean;
  getStageOutput: (runId: string, stage: PipelineStage) => Promise<StageResult<any> | null>;
  refreshHistory: () => Promise<void>;
}

export function usePipeline(): UsePipelineReturn {
  const [activeRun, setActiveRun] = useState<PipelineRun | null>(null);
  const [history, setHistory] = useState<PipelineRun[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const currentRunId = useRef<string | null>(null);
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const runs = await ipcRenderer.invoke('pipeline:getHistory');
      setHistory(runs);
    } catch (err) {
      console.error('Failed to load pipeline history:', err);
    }
  }, []);

  const fetchCurrentRun = useCallback(async (runId: string) => {
    try {
      const run = await ipcRenderer.invoke('pipeline:getRun', { runId });
      if (run) {
        setActiveRun(run);
        if (run.status !== 'running') {
          setIsRunning(false);
          if (pollInterval.current) {
            clearInterval(pollInterval.current);
            pollInterval.current = null;
          }
          refreshHistory();
        }
      }
    } catch (err) {
      console.error('Failed to fetch run:', err);
    }
  }, [refreshHistory]);

  const startPolling = useCallback((runId: string) => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
    }
    pollInterval.current = setInterval(() => {
      fetchCurrentRun(runId);
    }, 500);
  }, [fetchCurrentRun]);

  const stopPolling = useCallback(() => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const run = useCallback(async (task: string, options: PipelineOptions, projectRoot?: string, agentId?: string) => {
    setIsRunning(true);
    const tempRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const newRun: PipelineRun = {
      id: tempRunId,
      task_description: task,
      status: 'running',
      created_at: Date.now(),
      retry_count: 0,
      stages: {
        plan: { status: 'pending', model_used: '' },
        action: { status: 'pending', model_used: '' },
        review: { status: 'pending', model_used: '' },
        validate: { status: 'pending', model_used: '' },
        execute: { status: 'pending', model_used: '' }
      }
    };
    
    setActiveRun(newRun);
    currentRunId.current = tempRunId;
    startPolling(tempRunId);

    try {
      await ipcRenderer.invoke('pipeline:run', {
        task,
        options,
        projectRoot,
        runId: tempRunId,
        agentId,
      });
      return { runId: tempRunId };
    } catch (err) {
      setIsRunning(false);
      stopPolling();
      throw err;
    }
  }, [startPolling, stopPolling]);

  const cancel = useCallback(async (runId?: string) => {
    const targetRunId = runId || currentRunId.current;
    if (targetRunId) {
      await ipcRenderer.invoke('pipeline:cancel', { runId: targetRunId });
      setIsRunning(false);
      stopPolling();
      setActiveRun(null);
      refreshHistory();
    }
  }, [stopPolling, refreshHistory]);

  const deleteRun = useCallback(async (runId: string) => {
    await ipcRenderer.invoke('pipeline:deleteRun', { runId });
    refreshHistory();
  }, [refreshHistory]);

  const retryFix = useCallback(async (runId: string, suggestions: string[]) => {
    setIsRunning(true);
    currentRunId.current = runId;
    startPolling(runId);
    try {
      const result = await ipcRenderer.invoke('pipeline:retryFix', { runId, suggestions });
      return result;
    } catch (err) {
      setIsRunning(false);
      stopPolling();
      throw err;
    }
  }, [startPolling, stopPolling]);

  const getStageOutput = useCallback(async (runId: string, stage: PipelineStage) => {
    return ipcRenderer.invoke('pipeline:getStageOutput', { runId, stage });
  }, []);

  const analyzeAndRetry = useCallback(async (runId: string, userPrompt: string) => {
    setIsRunning(true);
    try {
      const result = await ipcRenderer.invoke('pipeline:analyzeAndRetry', { runId, userPrompt });
      
      if (result.action === 'restart_required' || result.action === 'replan_required') {
        setIsRunning(false);
        refreshHistory();
        return result;
      }
      
      if (result.action === 'retry_with_feedback') {
        const suggestions = [result.feedback || userPrompt];
        await ipcRenderer.invoke('pipeline:retryFix', { runId, suggestions });
        currentRunId.current = runId;
        startPolling(runId);
        return result;
      }
      
      if (result.action === 'cancelled') {
        setIsRunning(false);
        refreshHistory();
        return result;
      }
      
      return result;
    } catch (err) {
      setIsRunning(false);
      stopPolling();
      throw err;
    }
  }, [startPolling, stopPolling, refreshHistory]);

  return {
    run,
    retryFix,
    cancel,
    deleteRun,
    analyzeAndRetry,
    activeRun,
    history,
    isRunning,
    getStageOutput,
    refreshHistory
  };
}
