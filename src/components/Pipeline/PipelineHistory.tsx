import { useEffect, useState, type MouseEvent } from 'react';
import { usePipeline, type PipelineRun, type ReviewResult } from '../../hooks/usePipeline';
import StageCard from './StageCard';

interface PipelineHistoryProps {
  onRerun?: (taskDescription: string) => void;
}

export default function PipelineHistory({ onRerun }: PipelineHistoryProps) {
  const { history, refreshHistory, getStageOutput, deleteRun, retryFix } = usePipeline();
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [stageOutputs, setStageOutputs] = useState<Record<string, any>>({});
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const handleExpand = async (runId: string) => {
    if (expandedRun === runId) {
      setExpandedRun(null);
      return;
    }

    setExpandedRun(runId);

    const run = history.find(r => r.id === runId);
    const stageOrder = run?.stage_order || ['plan', 'action', 'review', 'validate', 'execute'];
    const outputs: Record<string, any> = {};
    for (const stage of stageOrder) {
      outputs[stage] = await getStageOutput(runId, stage);
    }

    setStageOutputs(prev => ({
      ...prev,
      [runId]: { _stageOrder: stageOrder, ...outputs }
    }));
  };

  const handleDelete = async (e: MouseEvent, runId: string) => {
    e.stopPropagation();
    if (confirm('Delete this pipeline run?')) {
      await deleteRun(runId);
    }
  };

  const handleRerun = (e: MouseEvent, taskDescription: string) => {
    e.stopPropagation();
    onRerun?.(taskDescription);
  };

  const handleRetryFix = async (e: MouseEvent, run: PipelineRun) => {
    e.stopPropagation();
    
    const reviewOutput = run.stages?.review?.output as ReviewResult | undefined;
    const suggestions = reviewOutput?.suggestions || [];
    
    if (suggestions.length === 0) {
      alert('No suggestions available from review. Cannot retry fix.');
      return;
    }

    const confirmMsg = `Retry with ${suggestions.length} suggestion(s)?\n\n${suggestions.slice(0, 3).join('\n')}${suggestions.length > 3 ? '\n...' : ''}`;
    
    if (confirm(confirmMsg)) {
      setRetryingRunId(run.id);
      try {
        await retryFix(run.id, suggestions);
        await refreshHistory();
      } catch (err) {
        alert(`Retry failed: ${err}`);
      } finally {
        setRetryingRunId(null);
      }
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  const getDuration = (run: PipelineRun) => {
    if (!run.completed_at) return '-';
    const duration = run.completed_at - run.created_at;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  const showRetryFix = (run: PipelineRun) => {
    return run.status === 'failed' || run.final_verdict === 'FAIL';
  };

  if (history.length === 0) {
    return (
      <div className="pipeline-history-empty">
        <p>No pipeline runs yet</p>
      </div>
    );
  }

  return (
    <div className="pipeline-history">
      {history.map(run => (
        <div 
          key={run.id} 
          className={`history-item ${run.status}`}
        >
          <div 
            className="history-item-header"
            onClick={() => handleExpand(run.id)}
          >
            <div className="history-item-info">
              <span className="task-desc">
                {run.task_description.length > 80 
                  ? run.task_description.substring(0, 80) + '...' 
                  : run.task_description}
              </span>
              <span className="timestamp">{formatTimestamp(run.created_at)}</span>
              {run.retry_count > 0 && (
                <span className="retry-badge">Retry #{run.retry_count}</span>
              )}
            </div>
            <div className="history-item-meta">
              <span className={`status-badge ${run.status}`}>{run.status}</span>
              {run.final_verdict && (
                <span className={`verdict-badge ${run.final_verdict.toLowerCase()}`}>
                  {run.final_verdict}
                </span>
              )}
              <span className="duration">{getDuration(run)}</span>
              {showRetryFix(run) && (
                <button 
                  className="retry-fix-btn" 
                  onClick={(e) => handleRetryFix(e, run)}
                  disabled={retryingRunId === run.id}
                  title="Retry Fix - Apply review suggestions and re-review"
                >
                  {retryingRunId === run.id ? '⏳' : '🔧'}
                </button>
              )}
              <button 
                className="rerun-btn" 
                onClick={(e) => handleRerun(e, run.task_description)}
                title="Re-run as new task"
              >
                🔄
              </button>
              <button 
                className="delete-btn" 
                onClick={(e) => handleDelete(e, run.id)}
                title="Delete"
              >
                🗑️
              </button>
              <button className="expand-btn">
                {expandedRun === run.id ? '▼' : '▶'}
              </button>
            </div>
          </div>

          {expandedRun === run.id && stageOutputs[run.id] && (
            <div className="history-stages">
              {(stageOutputs[run.id]._stageOrder || ['plan', 'action', 'review', 'validate', 'execute']).map((stage: string) => {
                const stageResult = stageOutputs[run.id][stage];
                if (!stageResult || stageResult.status === 'pending') return null;
                return <StageCard key={stage} stage={stage} result={stageResult} />;
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
