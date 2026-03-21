import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { usePipeline } from '../../hooks/usePipeline';
import { useToast } from '../../hooks/useToast';
import StageCard from './StageCard';
import './Pipeline.css';

interface PipelinePanelProps {
  onClose: () => void;
}

function ExecutionSummary({ run }: { run: any }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (run.status !== 'running') {
      setElapsed((run.completed_at || Date.now()) - run.created_at);
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Date.now() - run.created_at);
    }, 1000);

    return () => clearInterval(interval);
  }, [run.created_at, run.status, run.completed_at]);

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  const getCurrentStage = () => {
    const stages = ['plan', 'action', 'review', 'validate', 'execute'];
    for (const stage of stages) {
      if (run.stages?.[stage]?.status === 'running') {
        return stage;
      }
    }
    return null;
  };

  const stageNames = ['plan', 'action', 'review', 'validate', 'execute'];
  const stageLabels = ['Plan', 'Action', 'Review', 'Validate', 'Execute'];
  const currentStage = getCurrentStage();

  const getStageStatus = (stage: string) => {
    return run.stages?.[stage]?.status || 'pending';
  };

  // Debug: log stage statuses
  const stageStatuses = stageNames.map(s => ({ stage: s, status: getStageStatus(s) }));
  const completedCount = stageStatuses.filter(s => s.status === 'complete').length;
  const hasRunning = stageStatuses.some(s => s.status === 'running');
  const totalStages = stageNames.length;
  let progressPercent = Math.round((completedCount / totalStages) * 100);
  if (hasRunning && completedCount < totalStages) {
    progressPercent = Math.round((completedCount / totalStages) * 100) + 10;
  }
  if (completedCount === totalStages) {
    progressPercent = 100;
  }
  if (run.status === 'complete' || run.status === 'failed') {
    progressPercent = 100;
  }

  return (
    <div className="execution-summary">
      <div className="summary-row">
        <span className="elapsed-label">Elapsed:</span>
        <span className="elapsed-time">
          {formatTime(elapsed)}
        </span>
        {currentStage && (
          <span className="current-stage-badge">
            <span className="spinner-mini">⟳</span>
            {stageLabels[stageNames.indexOf(currentStage)]}
          </span>
        )}
      </div>
      <div className="execution-progress-bar">
        <div className="execution-progress-track">
          <div 
            className="execution-progress-fill" 
            style={{ 
              width: `${progressPercent}%` 
            }}
          />
        </div>
        <div className="execution-stage-pills">
          {stageNames.map((stage, idx) => {
            const status = getStageStatus(stage);
            const isComplete = status === 'complete';
            const isRunning = status === 'running';
            const isFailed = status === 'failed';
            
            return (
              <React.Fragment key={stage}>
                <div className={`execution-stage-pill ${status}`}>
                  <div className="execution-pill-content">
                    {isRunning ? (
                      <span className="execution-pill-spinner">⟳</span>
                    ) : isComplete ? (
                      <span className="execution-pill-check">✓</span>
                    ) : isFailed ? (
                      <span className="execution-pill-fail">✗</span>
                    ) : (
                      <span className="execution-pill-num">{idx + 1}</span>
                    )}
                    <span className="execution-pill-label">{stageLabels[idx]}</span>
                  </div>
                </div>
                {idx < stageNames.length - 1 && (
                  <div className={`execution-pill-connector ${isComplete ? 'filled' : ''}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function PipelinePanel({ onClose }: PipelinePanelProps) {
  const [panelWidth, setPanelWidth] = useState(600);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState<Record<string, string>>({});
  const [stopModalData, setStopModalData] = useState<{ runId: string } | null>(null);
  const [stopPrompt, setStopPrompt] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  
  const { cancel, activeRun, history, deleteRun, retryFix, analyzeAndRetry, refreshHistory } = usePipeline();

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshHistory();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshHistory]);

  useEffect(() => {
    if (history.length > 0 && history[0].status === 'running') {
      // Auto-expand the first running pipeline
      setExpandedItems(prev => new Set([...prev, history[0].id]));
    }
  }, [history]);

  const toggleExpand = (runId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    
    const panelElement = panelRef.current;
    if (!panelElement) return;
    
    const panelRect = panelElement.getBoundingClientRect();
    const startWidth = panelRect.width;
    const startX = e.clientX;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const deltaX = startX - moveEvent.clientX;
      const newWidth = startWidth + deltaX;
      setPanelWidth(Math.min(Math.max(newWidth, 400), 900));
    };
    
    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);
  const { showToast } = useToast();

  const allPipelines = useMemo(() => {
    const pipelines: any[] = [];
    
    if (activeRun) {
      pipelines.push(activeRun);
    }
    
    history.forEach(run => {
      if (!activeRun || run.id !== activeRun.id) {
        pipelines.push(run);
      }
    });
    
    return pipelines;
  }, [history, activeRun]);

  const handleCancel = async (runId?: string) => {
    await cancel();
    if (runId) {
      setStopModalData({ runId });
      setStopPrompt('');
    } else {
      showToast('Pipeline cancelled', 'info');
    }
  };

  const handleStopWithPrompt = async () => {
    if (!stopModalData || !stopPrompt.trim()) return;
    
    const runId = stopModalData.runId;
    setStopModalData(null);
    setStopPrompt('');
    
    try {
      const result = await analyzeAndRetry(runId, stopPrompt);
      
      switch (result.action) {
        case 'restart_required':
          showToast('Pipeline cleared. Start a new pipeline from chat.', 'info');
          break;
        case 'replan_required':
          showToast('Starting from planning stage. Create a new pipeline from chat with the same task.', 'info');
          break;
        case 'retry_with_feedback':
          showToast(`Retrying from ${result.stage || 'action'} with your feedback...`, 'info');
          break;
        case 'cancelled':
          if (result.reason) {
            showToast(`Pipeline cancelled: ${result.reason}`, 'info');
          } else {
            showToast('Pipeline cancelled.', 'info');
          }
          break;
        default:
          showToast(`Action: ${result.action}`, 'info');
      }
    } catch (err) {
      showToast(`Analysis failed: ${err}`, 'error');
    }
  };

  const handleApplyChanges = async (run: any) => {
    if (!run?.stages?.action?.output) return;

    const codeOutput = run.stages.action.output;
    
    for (const change of codeOutput.file_changes) {
      try {
        const confirmed = await (window as any).ipcRenderer.invoke('dialog:confirmAction', {
          title: 'Apply Change',
          message: `Apply changes to ${change.file_path}?`,
          detail: change.explanation
        });

        if (confirmed) {
          await (window as any).ipcRenderer.invoke('tools:execute', 'write_file', {
            file_path: change.file_path,
            content: change.content
          });
          showToast(`Applied: ${change.file_path}`, 'success');
        }
      } catch (err) {
        showToast(`Failed to apply ${change.file_path}: ${err}`, 'error');
      }
    }
  };

  const handleDelete = async (runId: string) => {
    await deleteRun(runId);
    showToast('Pipeline deleted', 'info');
  };

  const handleRetryWithSuggestions = async (run: any) => {
    const reviewOutput = run.stages?.review?.output;
    const suggestions = reviewOutput?.suggestions || [];
    const userInput = manualInput[run.id] || '';
    
    // Include previous action error if it exists
    const actionError = run.stages?.action?.error;
    
    const allSuggestions = [...suggestions];
    if (actionError) {
      allSuggestions.push(`Previous error that needs to be fixed: ${actionError}`);
    }
    if (userInput.trim()) {
      allSuggestions.push(`User feedback: ${userInput.trim()}`);
    }
    
    if (allSuggestions.length === 0) {
      showToast('No suggestions or manual input provided', 'info');
      return;
    }

    setRetryingRunId(run.id);
    try {
      await retryFix(run.id, allSuggestions);
      showToast('Retrying with suggestions...', 'info');
      setManualInput(prev => ({ ...prev, [run.id]: '' }));
    } catch (err) {
      showToast(`Retry failed: ${err}`, 'error');
    } finally {
      setRetryingRunId(null);
    }
  };

  const renderPipelineItem = (run: any) => {
    const isActive = run.status === 'running';
    const isExpanded = expandedItems.has(run.id);
    const isFailed = run.status === 'failed' || run.final_verdict === 'FAIL';
    
    const getStageProgress = (run: any) => {
      const stages = ['plan', 'action', 'review', 'validate', 'execute'];
      const completed = stages.filter(s => 
        run.stages?.[s]?.status === 'complete'
      ).length;
      const total = stages.filter(s => 
        run.stages?.[s]?.status !== 'pending'
      ).length;
      return { completed, total };
    };
    
    const progress = getStageProgress(run);

    return (
      <div key={run.id} className={`pipeline-item ${isExpanded ? 'expanded' : ''} ${isActive ? 'active-item' : ''} ${isFailed ? 'failed-item' : ''}`}>
        <div 
          className="pipeline-item-header accordion-trigger"
          onClick={() => toggleExpand(run.id)}
        >
          <div className="pipeline-item-info">
            <span className={`status-badge ${run.status}`}>{run.status}</span>
            <span className="pipeline-task">{run.task_description.slice(0, 60)}{run.task_description.length > 60 ? '...' : ''}</span>
          </div>
          <div className="pipeline-item-meta">
            <span className="pipeline-id">{run.id.slice(0, 8)}</span>
            <span className="pipeline-progress">{progress.completed}/{progress.total}</span>
            {isFailed && (
              <button 
                className="btn btn-primary btn-xs"
                onClick={(e) => { e.stopPropagation(); handleRetryWithSuggestions(run); }}
                disabled={retryingRunId === run.id}
              >
                {retryingRunId === run.id ? 'Retrying...' : 'Retry'}
              </button>
            )}
            <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </div>
        </div>
        
        {isExpanded && (
          <div className="pipeline-item-content">
            <ExecutionSummary run={run} />
            
            <div className="pipeline-item-stages">
              <StageCard stage="plan" result={run.stages?.plan} />
              <StageCard stage="action" result={run.stages?.action} attempt={run.retry_count + 1} />
              <StageCard stage="review" result={run.stages?.review} attempt={run.retry_count + 1} />
              {run.stages?.validate?.status !== 'pending' && (
                <StageCard stage="validate" result={run.stages?.validate} />
              )}
              {run.stages?.execute?.status !== 'pending' && (
                <StageCard stage="execute" result={run.stages?.execute} />
              )}
            </div>

            <div className="pipeline-item-footer">
              {run.status === 'complete' && run.final_verdict === 'PASS' && (
                <button 
                  className="btn btn-success btn-sm"
                  onClick={(e) => { e.stopPropagation(); handleApplyChanges(run); }}
                >
                  Apply Changes
                </button>
              )}

              {run.status === 'complete' && run.final_verdict && (
                <div className={`final-verdict ${run.final_verdict?.toLowerCase()}`}>
                  Final Verdict: {run.final_verdict}
                </div>
              )}
            </div>

            {(run.status === 'failed' || run.final_verdict === 'FAIL') && (
              <div className="retry-section">
                {run.stages?.review?.output?.suggestions?.length > 0 && (
                  <div className="retry-suggestions">
                    <h4>Suggestions from Review:</h4>
                    <ul>
                      {run.stages.review.output.suggestions.map((s: string, idx: number) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="retry-manual-input">
                  <h4>Add Your Feedback:</h4>
                  <textarea
                    className="retry-textarea"
                    placeholder="Enter additional instructions or feedback for retry..."
                    value={manualInput[run.id] || ''}
                    onChange={(e) => setManualInput(prev => ({ ...prev, [run.id]: e.target.value }))}
                    onClick={(e) => e.stopPropagation()}
                    rows={3}
                  />
                </div>
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={(e) => { e.stopPropagation(); handleRetryWithSuggestions(run); }}
                  disabled={retryingRunId === run.id}
                >
                  {retryingRunId === run.id ? 'Retrying...' : 'Retry'}
                </button>
              </div>
            )}

            <div className="pipeline-item-actions">
              {isActive && (
                <button 
                  className="btn btn-danger btn-sm" 
                  onClick={(e) => { e.stopPropagation(); handleCancel(run.id); }}
                >
                  Stop
                </button>
              )}
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={(e) => { e.stopPropagation(); handleDelete(run.id); }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {stopModalData && (
        <div className="modal-overlay">
          <div className="modal-content stop-prompt-modal">
            <h3>Pipeline Stopped</h3>
            <p>What would you like to do next?</p>
            <textarea
              className="stop-prompt-input"
              value={stopPrompt}
              onChange={(e) => setStopPrompt(e.target.value)}
              placeholder="e.g., 'continue from where it left off', 'restart from the beginning', 'abort and cancel', 'retry the action stage'"
              rows={4}
            />
            <div className="modal-actions">
              <button 
                className="btn btn-secondary"
                onClick={() => setStopModalData(null)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleStopWithPrompt}
                disabled={!stopPrompt.trim()}
              >
                Execute
              </button>
            </div>
          </div>
        </div>
      )}
    
      <div className="pipeline-panel" ref={panelRef} style={{ width: `${panelWidth}px` }}>
      <div className="pipeline-resize-handle" onMouseDown={startResize} />
      <div className="panel-header">
        <h2>
          Pipeline Dashboard
          <span className="pipeline-help-tip" data-tip="The Pipeline executes tasks through 5 stages: Plan (analyze requirements), Action (generate code), Review (check quality), Validate (test correctness), and Execute (apply changes).">?</span>
        </h2>
        <span className="pipeline-count">{allPipelines.length} total</span>
        <button className="btn-icon refresh-btn" onClick={() => refreshHistory()} title="Refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6"/>
            <path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
        <button className="btn-icon" onClick={onClose} title="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="panel-content">
        {allPipelines.length === 0 ? (
          <div className="empty-queue">
            <div className="empty-icon">📋</div>
            <p>No pipelines</p>
            <p className="empty-hint">Start a pipeline from Chat using "Send to Agent"</p>
          </div>
        ) : (
          allPipelines.map(run => renderPipelineItem(run))
        )}
      </div>
    </div>
    </>
  );
}
